import type { SupabaseClient } from "@supabase/supabase-js";
import { truncateForLog } from "@/lib/observability/safe-log";
import { createServiceClient } from "@/lib/supabase/service";
import { AIService } from "@/lib/ai/service";
import { AITaskType } from "@/lib/ai/types";
import { friendlyAiErrorMessage } from "@/lib/ai/error-messages";
import {
  buildClientPresentationPrompt,
  buildClientPresentationSlideRegenerationPrompt,
} from "@/lib/ai/prompts/client-presentation";
import {
  validateClientPresentation,
  validateClientPresentationSlide,
} from "@/lib/ai/validation/client-presentation";
import {
  applyFullGeneration,
  applySlideRegeneration,
  getOrCreatePresentation,
} from "./versioning";
import { generatePptxBuffer } from "./pptx-generator";
import { uploadPresentationPptx } from "@/lib/storage/presentation-storage";
import { getBrainForDownstreamGeneration } from "@/lib/brain-v2/downstream-context";
import { executeAIWithRateLimitWait } from "@/lib/ai/execute-with-rate-limit-wait";
import type {
  ClientPresentationSlideKey,
  ClientPresentationVersionReason,
  DecisionMemoryEntry,
  PRD,
  PresentationLanguage,
  ProjectRecommendation,
  PrototypeReview,
} from "@/lib/types/database";
import type { ClientPresentationExtraContext } from "@/lib/ai/prompts/client-presentation";

export type PresentationGenerationResult =
  | { status: "success"; pptxFailed: boolean }
  | { status: "started" }
  | { status: "missing_data"; message: string }
  | { status: "already_generating" }
  | { status: "error"; message: string; code: string };

/** أي Lock بحالة "generating" أقدم من كده يُعتبر معلّق (Job مات) ويُعاد المحاولة فوقه. */
const STALE_LOCK_MS = 6 * 60_000;

async function claimLock(supabase: SupabaseClient, projectId: string): Promise<boolean> {
  await supabase
    .from("client_presentations")
    .upsert({ project_id: projectId }, { onConflict: "project_id", ignoreDuplicates: true });

  const staleCutoff = new Date(Date.now() - STALE_LOCK_MS).toISOString();
  const { data, error } = await supabase
    .from("client_presentations")
    .update({ status: "generating", last_error: null })
    .eq("project_id", projectId)
    .or(`status.neq.generating,updated_at.lt.${staleCutoff}`)
    .select("project_id");

  if (error) return false;
  return (data?.length ?? 0) > 0;
}

async function releaseLockAsFailed(supabase: SupabaseClient, projectId: string, message: string) {
  await supabase
    .from("client_presentations")
    .update({ status: "failed", last_error: message })
    .eq("project_id", projectId);
}

async function getPrdOrNull(supabase: SupabaseClient, projectId: string): Promise<PRD | null> {
  const { data } = await supabase.from("prd").select("*").eq("project_id", projectId).maybeSingle();
  return data as PRD | null;
}

async function getReviewOrNull(
  supabase: SupabaseClient,
  projectId: string
): Promise<PrototypeReview | null> {
  const { data } = await supabase
    .from("prototype_review")
    .select("*")
    .eq("project_id", projectId)
    .maybeSingle();
  return data as PrototypeReview | null;
}

/**
 * تجميع سياق الأعمال الإضافي تلقائيًّا من مراحل سابقة — بدون سؤال
 * المستخدم: التوصيات المقبولة رسميًّا + ذاكرة القرارات الموثّقة. كله
 * best-effort؛ لو أي مصدر فشل بنكمّل من غيره (مصفوفة فاضية).
 */
async function gatherExtraContext(
  supabase: SupabaseClient,
  projectId: string
): Promise<ClientPresentationExtraContext> {
  const [recsRes, decisionsRes] = await Promise.all([
    supabase.from("project_recommendations").select("*").eq("project_id", projectId).eq("status", "accepted"),
    supabase.from("decision_memory").select("*").eq("project_id", projectId).order("created_at", { ascending: false }).limit(12),
  ]);
  return {
    recommendations: (recsRes.data as ProjectRecommendation[] | null) ?? [],
    decisions: (decisionsRes.data as DecisionMemoryEntry[] | null) ?? [],
  };
}

async function tryGeneratePptx(
  supabase: SupabaseClient,
  projectId: string,
  projectName: string,
  version: number,
  slides: import("@/lib/types/database").ClientPresentationSlides
): Promise<boolean> {
  try {
    const buffer = await generatePptxBuffer(slides, projectName);
    const path = await uploadPresentationPptx(supabase, projectId, version, buffer);
    await supabase
      .from("client_presentations")
      .update({ pptx_storage_path: path })
      .eq("project_id", projectId);
    return true;
  } catch (err) {
    console.error(`[ClientPresentation] PPTX generation failed for project ${projectId}:`, err);
    return false;
  }
}

/**
 * Client Presentation Generation Engine — المدخل الوحيد للتوليد. يقرأ
 * Project Brain وPRD وProtoype Review فقط (بدون تعديلهم)، يستدعي
 * AIService (task_type = CLIENT_PRESENTATION_GENERATION)، يتحقق من
 * الرد، يطبّقه عبر Versioning، ثم يولّد ملف PPTX من نفس المحتوى.
 */
export class ClientPresentationGenerationEngine {
  /** يحجز الـ Lock (أو يستعيده لو معلّق من Job مات) — بدون تنفيذ التوليد نفسه. */
  static async tryClaimLock(projectId: string): Promise<boolean> {
    const supabase = createServiceClient();
    return claimLock(supabase, projectId);
  }

  /**
   * جوهر التوليد الكامل — بيفترض إن الـ Lock محجوز بالفعل. بيتشغّل داخل
   * after() في الخلفية فبيقدر ينتظر على Rate Limit براحته.
   */
  static async runFullGenerationCore(
    projectId: string,
    projectName: string,
    actorId?: string,
    reason: ClientPresentationVersionReason = "full_generation",
    language: PresentationLanguage = "ar"
  ): Promise<void> {
    const supabase = createServiceClient();

    try {
      // نثبّت لغة العرض المطلوبة على الصفّ قبل التوليد — الواجهات
      // (Share/PDF) بتقرا منها اتجاه النص (RTL/LTR).
      await supabase.from("client_presentations").update({ language }).eq("project_id", projectId);

      const brain = await getBrainForDownstreamGeneration(supabase, projectId);
      if (!brain || !brain.content.executive_summary.content.trim()) {
        await releaseLockAsFailed(supabase, projectId, "Project Brain غير مكتمل — أنشئ الملخص التنفيذي أولاً.");
        return;
      }

      const prd = await getPrdOrNull(supabase, projectId);
      if (!prd || !prd.overview.trim()) {
        await releaseLockAsFailed(supabase, projectId, "لا يوجد PRD معتمد لهذا المشروع — أنشئه أولاً.");
        return;
      }

      const review = await getReviewOrNull(supabase, projectId);
      const extra = await gatherExtraContext(supabase, projectId);

      const prompt = buildClientPresentationPrompt(projectName, brain.content, prd, review, extra, language);
      const response = await executeAIWithRateLimitWait(AITaskType.CLIENT_PRESENTATION_GENERATION, prompt, {
        actorId,
        projectId,
      });

      if (!response.success) {
        const friendly =
          response.error?.code === "RATE_LIMIT"
            ? friendlyAiErrorMessage("RATE_LIMIT", response.error?.message ?? "")
            : response.error?.message ?? "فشل توليد العرض.";
        await releaseLockAsFailed(supabase, projectId, friendly);
        return;
      }

      const validation = validateClientPresentation(response.output);
      if (!validation.ok) {
        console.error(`[ClientPresentation] Validation failed for project ${projectId}: ${truncateForLog(validation.reason)}`);
        await releaseLockAsFailed(supabase, projectId, "لم نتمكن من فهم نتيجة التوليد.");
        return;
      }

      const updated = await applyFullGeneration(
        supabase,
        projectId,
        validation.data,
        brain.version,
        prd.version,
        review?.version ?? null,
        actorId,
        reason
      );

      const pptxOk = await tryGeneratePptx(supabase, projectId, projectName, updated.version, validation.data);
      if (!pptxOk) {
        // المحتوى نجح — بس ملف PPTX فشل. نسيب status=idle (مش فشل حقيقي)
        // ونحطّ ملاحظة بس عشان الواجهة تعرضها.
        await supabase
          .from("client_presentations")
          .update({ last_error: "تم توليد محتوى العرض بنجاح، لكن فشل إنشاء ملف PPTX. جرّب Regenerate تاني." })
          .eq("project_id", projectId);
      }
    } catch (err) {
      console.error(`[ClientPresentation] Unexpected failure for project ${projectId}:`, err);
      await releaseLockAsFailed(supabase, projectId, err instanceof Error ? err.message : "حدث خطأ غير متوقع أثناء التوليد.");
    }
  }

  static async regenerateSlide(
    projectId: string,
    projectName: string,
    slideKey: ClientPresentationSlideKey,
    actorId?: string
  ): Promise<PresentationGenerationResult> {
    const supabase = createServiceClient();

    const locked = await claimLock(supabase, projectId);
    if (!locked) return { status: "already_generating" };

    try {
      const brain = await getBrainForDownstreamGeneration(supabase, projectId);
      const prd = await getPrdOrNull(supabase, projectId);
      if (!brain || !brain.content.executive_summary.content.trim() || !prd || !prd.overview.trim()) {
        await supabase.from("client_presentations").update({ status: "idle" }).eq("project_id", projectId);
        return { status: "missing_data", message: "Project Brain أو PRD غير مكتملين." };
      }
      const review = await getReviewOrNull(supabase, projectId);
      const extra = await gatherExtraContext(supabase, projectId);

      const current = await getOrCreatePresentation(supabase, projectId);
      const prompt = buildClientPresentationSlideRegenerationPrompt(
        projectName,
        brain.content,
        prd,
        review,
        slideKey,
        current.slides_content as unknown as Record<string, unknown>,
        extra,
        current.language ?? "ar"
      );

      const response = await AIService.execute(AITaskType.CLIENT_PRESENTATION_GENERATION, prompt, {
        actorId,
        projectId,
      });

      if (!response.success) {
        await releaseLockAsFailed(supabase, projectId, response.error?.message ?? "خطأ غير معروف");
        return {
          status: "error",
          message: response.error?.message ?? "فشلت إعادة توليد الشريحة.",
          code: response.error?.code ?? "UNKNOWN",
        };
      }

      const validation = validateClientPresentationSlide(response.output, slideKey);
      if (!validation.ok) {
        await releaseLockAsFailed(supabase, projectId, validation.reason);
        return { status: "error", message: "لم نتمكن من فهم نتيجة إعادة التوليد.", code: "INVALID_RESPONSE" };
      }

      const updated = await applySlideRegeneration(
        supabase,
        projectId,
        slideKey,
        validation.value,
        brain.version,
        prd.version,
        review?.version ?? null,
        actorId
      );

      const pptxOk = await tryGeneratePptx(
        supabase,
        projectId,
        projectName,
        updated.version,
        updated.slides_content
      );

      return { status: "success", pptxFailed: !pptxOk };
    } catch (err) {
      console.error(`[ClientPresentation] Unexpected failure regenerating slide for project ${projectId}:`, err);
      await releaseLockAsFailed(supabase, projectId, err instanceof Error ? err.message : "خطأ غير متوقع");
      return { status: "error", message: "حدث خطأ غير متوقع.", code: "UNEXPECTED" };
    }
  }
}
