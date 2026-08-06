import type { SupabaseClient } from "@supabase/supabase-js";
import { truncateForLog } from "@/lib/observability/safe-log";
import { createServiceClient } from "@/lib/supabase/service";
import { AITaskType } from "@/lib/ai/types";
import { friendlyAiErrorMessage } from "@/lib/ai/error-messages";
import { executeAIWithRateLimitWait } from "@/lib/ai/execute-with-rate-limit-wait";
import { getBrainForDownstreamGeneration } from "@/lib/brain-v2/downstream-context";
import { getMeetingPreparation } from "@/lib/meeting-prep/service";
import {
  buildMeetingPresentationPrompt,
  buildMeetingPresentationSlideRegenerationPrompt,
} from "@/lib/ai/prompts/meeting-presentation";
import {
  validateMeetingPresentation,
  validateMeetingPresentationSlide,
} from "@/lib/ai/validation/meeting-presentation";
import { applyFullGeneration, applySlideRegeneration, getOrCreateDraftPresentation, getPresentationById } from "./versioning";
import type { MeetingPresentation, MeetingPresentationSlideKey, PRD } from "@/lib/types/database";

function bulletList(items: string[]): string {
  return items.length > 0 ? items.map((i) => `- ${i}`).join("\n") : "(لا يوجد)";
}

/** ملخص قصير لمسودة/نسخة PRD الحالية — يُدرَج كسياق إضافي في عرض الاجتماع (تفاصيل وحدات/شاشات/متطلبات دقيقة مش موجودة بالضرورة في Brain نفسه). */
function formatPrdSummary(prd: PRD): string {
  return `## نظرة عامة
${prd.overview || "(غير محدد)"}

## المشكلة
${prd.problem_statement || "(غير محدد)"}

## الأهداف
${bulletList(prd.goals)}

## المتطلبات الوظيفية
${bulletList(prd.functional_requirements)}

## المتطلبات غير الوظيفية
${bulletList(prd.non_functional_requirements)}

## خارج النطاق
${bulletList(prd.out_of_scope)}`;
}

async function getLatestPrdSummary(supabase: SupabaseClient, projectId: string): Promise<string | null> {
  const { data } = await supabase.from("prd").select("*").eq("project_id", projectId).maybeSingle();
  if (!data || (data as PRD).version === 0) return null;
  return formatPrdSummary(data as PRD);
}

export type PresentationGenerationResult =
  | { status: "started" }
  | { status: "success" }
  | { status: "missing_data"; message: string }
  | { status: "already_generating" }
  | { status: "error"; message: string };

/** أي Lock بحالة "generating" أقدم من كده يُعتبر معلّق (Job مات) ويُعاد المحاولة فوقه. */
const STALE_LOCK_MS = 6 * 60_000;

async function claimLock(supabase: SupabaseClient, presentationId: string): Promise<boolean> {
  const staleCutoff = new Date(Date.now() - STALE_LOCK_MS).toISOString();
  const { data, error } = await supabase
    .from("meeting_presentations")
    .update({ status: "generating", last_error: null, generation_claimed_at: new Date().toISOString() })
    .eq("id", presentationId)
    .or(`status.neq.generating,generation_claimed_at.lt.${staleCutoff}`)
    .select("id");

  if (error) return false;
  return (data?.length ?? 0) > 0;
}

async function releaseLockAsFailed(supabase: SupabaseClient, presentationId: string, message: string) {
  await supabase
    .from("meeting_presentations")
    .update({ status: "failed", last_error: message, generation_claimed_at: null })
    .eq("id", presentationId);
}

function averageConfidence(): number {
  // كل شرائح الاجتماع بتُبنى من نفس مصدر الحقيقة (Project Brain المعتمد)،
  // فمفيش تقييم ثقة منفصل لكل شريحة زي Discovery Analysis — بنعرض ثقة
  // ثابتة معقولة تعكس اعتمادها الكامل على بيانات حقيقية موثّقة.
  return 90;
}

/**
 * Meeting Presentation Generation Engine — المدخل الوحيد للتوليد. يقرأ
 * Project Brain (المصدر الرسمي، مجمّع أصلًا من كل مصادر المعرفة عبر
 * Knowledge Aggregation Layer) وMeeting Preparation الخاص بهذا الاجتماع،
 * يستدعي AIService، يتحقق من الرد، ثم يطبّقه عبر Versioning.
 */
export class MeetingPresentationGenerationEngine {
  static async tryClaimLock(presentationId: string): Promise<boolean> {
    const supabase = createServiceClient();
    return claimLock(supabase, presentationId);
  }

  static async ensureDraftPresentation(projectId: string): Promise<MeetingPresentation> {
    const supabase = createServiceClient();
    return getOrCreateDraftPresentation(supabase, projectId);
  }

  /**
   * جوهر التوليد الكامل — بيفترض إن الـ Lock محجوز بالفعل. بيتشغّل داخل
   * after() في الخلفية فبيقدر ينتظر على Rate Limit براحته.
   */
  static async runFullGenerationCore(presentationId: string, projectId: string, actorId?: string): Promise<void> {
    const supabase = createServiceClient();

    try {
      const brain = await getBrainForDownstreamGeneration(supabase, projectId);
      if (!brain || !brain.content.executive_summary.content.trim()) {
        await releaseLockAsFailed(supabase, presentationId, "Project Brain غير مكتمل — أنشئ الملخص التنفيذي أولاً.");
        return;
      }

      const prep = await getMeetingPreparation(supabase, projectId);
      const prdSummary = await getLatestPrdSummary(supabase, projectId);

      const presentation = await getPresentationById(supabase, presentationId);
      const title = presentation?.title?.trim() || "اجتماع العميل القادم";

      const prompt = buildMeetingPresentationPrompt(brain.content, prep?.sections ?? null, title, prdSummary);
      const response = await executeAIWithRateLimitWait(AITaskType.MEETING_PRESENTATION_GENERATION, prompt, {
        actorId,
        projectId,
      });

      if (!response.success) {
        const friendly =
          response.error?.code === "RATE_LIMIT"
            ? friendlyAiErrorMessage("RATE_LIMIT", response.error?.message ?? "")
            : response.error?.message ?? "فشل توليد العرض.";
        await releaseLockAsFailed(supabase, presentationId, friendly);
        return;
      }

      const validation = validateMeetingPresentation(response.output);
      if (!validation.ok) {
        console.error(`[MeetingPresentation] Validation failed for presentation ${presentationId}: ${truncateForLog(validation.reason)}`);
        await releaseLockAsFailed(supabase, presentationId, "لم نتمكن من فهم نتيجة التوليد.");
        return;
      }

      await applyFullGeneration(supabase, presentationId, validation.data, averageConfidence(), actorId);
    } catch (err) {
      console.error(`[MeetingPresentation] Unexpected failure for presentation ${presentationId}:`, err);
      await releaseLockAsFailed(supabase, presentationId, err instanceof Error ? err.message : "حدث خطأ غير متوقع أثناء التوليد.");
    }
  }

  static async regenerateSlide(
    presentationId: string,
    projectId: string,
    slideKey: MeetingPresentationSlideKey,
    actorId?: string
  ): Promise<PresentationGenerationResult> {
    const supabase = createServiceClient();

    const locked = await claimLock(supabase, presentationId);
    if (!locked) return { status: "already_generating" };

    try {
      const brain = await getBrainForDownstreamGeneration(supabase, projectId);
      if (!brain || !brain.content.executive_summary.content.trim()) {
        await supabase.from("meeting_presentations").update({ status: "ready", generation_claimed_at: null }).eq("id", presentationId);
        return { status: "missing_data", message: "Project Brain غير مكتمل." };
      }

      const prep = await getMeetingPreparation(supabase, projectId);
      const prdSummary = await getLatestPrdSummary(supabase, projectId);
      const current = await getPresentationById(supabase, presentationId);
      if (!current) return { status: "error", message: "العرض غير موجود." };

      const title = current.title?.trim() || "اجتماع العميل القادم";
      const prompt = buildMeetingPresentationSlideRegenerationPrompt(
        brain.content,
        prep?.sections ?? null,
        title,
        slideKey,
        current.slides as unknown as Record<string, unknown>,
        prdSummary
      );

      const response = await executeAIWithRateLimitWait(AITaskType.MEETING_PRESENTATION_GENERATION, prompt, {
        actorId,
        projectId,
      });

      if (!response.success) {
        const friendly =
          response.error?.code === "RATE_LIMIT"
            ? friendlyAiErrorMessage("RATE_LIMIT", response.error?.message ?? "")
            : response.error?.message ?? "فشل التوليد.";
        await releaseLockAsFailed(supabase, presentationId, friendly);
        return { status: "error", message: friendly };
      }

      const validation = validateMeetingPresentationSlide(response.output, slideKey);
      if (!validation.ok) {
        await releaseLockAsFailed(supabase, presentationId, "لم نتمكن من فهم نتيجة التوليد.");
        return { status: "error", message: validation.reason };
      }

      await applySlideRegeneration(supabase, presentationId, slideKey, validation.value, actorId);
      return { status: "success" };
    } catch (err) {
      const message = err instanceof Error ? err.message : "حدث خطأ غير متوقع.";
      await releaseLockAsFailed(supabase, presentationId, message);
      return { status: "error", message };
    }
  }
}
