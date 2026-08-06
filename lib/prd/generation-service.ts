import type { SupabaseClient } from "@supabase/supabase-js";
import { truncateForLog } from "@/lib/observability/safe-log";
import { createServiceClient } from "@/lib/supabase/service";
import { AIService } from "@/lib/ai/service";
import { AITaskType } from "@/lib/ai/types";
import { friendlyAiErrorMessage } from "@/lib/ai/error-messages";
import { buildPRDGenerationPrompt, buildPRDSectionRegenerationPrompt } from "@/lib/ai/prompts/prd-generation";
import { validatePRDGeneration, validatePRDSectionRegeneration } from "@/lib/ai/validation/prd-generation";
import { applyFullGeneration, applySectionRegeneration, getOrCreatePrd } from "./versioning";
import { getBrainForDownstreamGeneration } from "@/lib/brain-v2/downstream-context";
import { buildFusedKnowledgeBlock } from "@/lib/domain-library/fusion/fusion-service";
import { executeAIWithRateLimitWait } from "@/lib/ai/execute-with-rate-limit-wait";
import {
  buildContextResult,
  computePromptReadiness,
  getProfile,
  persistPromptGeneration,
} from "@/lib/ai/prompt-framework";
import type { PRDSectionKey, ProjectRecommendation } from "@/lib/types/database";

/**
 * Unified Prompt Framework (pilot — PRD): يسجّل Prompt Readiness Score +
 * إصدار البرومبت في prompt_generations، بدون تغيير نص البرومبت المُرسَل
 * (منخفض المخاطرة على مخرَج PRD المُثبَت). profile=prd، target=gemini.
 */
async function recordPrdPromptGeneration(
  supabase: SupabaseClient,
  projectId: string,
  promptText: string,
  brainVersion: number | null,
  recommendationsCount: number,
  actorId?: string
): Promise<void> {
  try {
    const profile = getProfile("prd");
    const ctx = buildContextResult([
      { key: "brain", title: "Project Brain", content: "معتمد", source: { type: "brain", version: brainVersion } },
      { key: "recommendations", title: "توصيات مقبولة", content: recommendationsCount > 0 ? String(recommendationsCount) : "" },
      { key: "project_context", title: "سياق المشروع", content: "متوفّر" },
    ]);
    const readiness = computePromptReadiness(profile, ctx.presentKeys);
    await persistPromptGeneration(supabase, {
      projectId,
      stage: "prd_generation",
      assembled: {
        text: promptText,
        metadata: { profile: "prd", target: "gemini", ruleKeys: profile.ruleKeys, claudeCodeWorkflowInjected: false, contextBlockTitles: ctx.blocks.map((b) => b.title) },
      },
      sources: ctx.sources,
      readiness,
      actorId,
    });
  } catch (err) {
    console.error(`[PromptFramework] PRD prompt record failed for project ${projectId}:`, err instanceof Error ? err.message : err);
  }
}

async function getAcceptedRecommendations(supabase: SupabaseClient, projectId: string): Promise<ProjectRecommendation[]> {
  const { data } = await supabase
    .from("project_recommendations")
    .select("*")
    .eq("project_id", projectId)
    .eq("status", "accepted");
  return (data as ProjectRecommendation[] | null) ?? [];
}

export type GenerationResult =
  | { status: "success" }
  | { status: "started" }
  | { status: "insufficient_brain"; message: string }
  | { status: "already_generating" }
  | { status: "error"; message: string; code: string };

/** أي Lock بحالة "generating" أقدم من كده يُعتبر معلّق (Job مات) ويُعاد المحاولة فوقه. */
const STALE_LOCK_MS = 6 * 60_000;

async function claimGenerationLock(supabase: SupabaseClient, projectId: string): Promise<boolean> {
  await supabase.from("prd").upsert({ project_id: projectId }, { onConflict: "project_id", ignoreDuplicates: true });

  const staleCutoff = new Date(Date.now() - STALE_LOCK_MS).toISOString();
  const { data, error } = await supabase
    .from("prd")
    .update({ sync_status: "generating", last_error: null })
    .eq("project_id", projectId)
    .or(`sync_status.neq.generating,updated_at.lt.${staleCutoff}`)
    .select("project_id");

  if (error) return false;
  return (data?.length ?? 0) > 0;
}

async function releaseLockAsFailed(supabase: SupabaseClient, projectId: string, message: string) {
  await supabase.from("prd").update({ sync_status: "failed", last_error: message }).eq("project_id", projectId);
}

/**
 * PRD Generation Engine — المدخل الوحيد لتوليد/إعادة توليد PRD. يقرأ
 * Project Brain فقط (بدون تعديله)، يستدعي AIService (task_type =
 * PRD_GENERATION)، يتحقق من الرد، ويطبّقه عبر طبقة الـ Versioning.
 * قفل ذري على مستوى الـ DB يمنع أكتر من توليد للمشروع نفسه في نفس الوقت.
 */
export class PRDGenerationEngine {
  /** يحجز الـ Lock (أو يستعيده لو معلّق من Job مات) — بدون تنفيذ التوليد نفسه. */
  static async tryClaimLock(projectId: string): Promise<boolean> {
    const supabase = createServiceClient();
    return claimGenerationLock(supabase, projectId);
  }

  /**
   * جوهر التوليد الكامل — بيفترض إن الـ Lock محجوز بالفعل. بيتشغّل داخل
   * after() في الخلفية فبيقدر ينتظر على Rate Limit براحته. الحالة كلها
   * بتتحفظ في الـ DB (sync_status/last_error) والواجهة بتقرأها بالـ Polling.
   */
  static async runFullGenerationCore(
    projectId: string,
    reason: "full_generation" | "conflict_replace" | "auto_resync",
    actorId?: string
  ): Promise<void> {
    const supabase = createServiceClient();

    try {
      const brain = await getBrainForDownstreamGeneration(supabase, projectId);
      if (!brain || !brain.content.executive_summary.content.trim()) {
        await releaseLockAsFailed(
          supabase,
          projectId,
          "Project Brain غير مكتمل — أنشئ الملخص التنفيذي أولاً من تبويب Project Brain."
        );
        return;
      }
      // Phase 5 — "الـ PRD ممنوع يتولّد من معرفة خام" — لازم Brain Review يكون معتمد فعليًا.
      if (!brain.isApproved) {
        await releaseLockAsFailed(
          supabase,
          projectId,
          "لا يمكن توليد PRD — Project Brain لسه مش معتمد رسميًا. أكمل مراجعة Brain Review (اعتماد كل الأقسام/العناصر + حل المشاكل الحرجة) قبل التوليد."
        );
        return;
      }

      const acceptedRecommendations = await getAcceptedRecommendations(supabase, projectId);
      const fused = await buildFusedKnowledgeBlock(projectId, supabase);
      const prompt = buildPRDGenerationPrompt(brain.content, acceptedRecommendations, fused.text);
      await recordPrdPromptGeneration(supabase, projectId, prompt, brain.version ?? null, acceptedRecommendations.length, actorId);
      const response = await executeAIWithRateLimitWait(AITaskType.PRD_GENERATION, prompt, {
        actorId,
        projectId,
      });

      if (!response.success) {
        const friendly =
          response.error?.code === "RATE_LIMIT"
            ? friendlyAiErrorMessage("RATE_LIMIT", response.error?.message ?? "")
            : response.error?.message ?? "فشل توليد PRD.";
        await releaseLockAsFailed(supabase, projectId, friendly);
        return;
      }

      const validation = validatePRDGeneration(response.output);
      if (!validation.ok) {
        console.error(`[PRDGeneration] Validation failed for project ${projectId}: ${truncateForLog(validation.reason)}`);
        await releaseLockAsFailed(supabase, projectId, "لم نتمكن من فهم نتيجة التوليد.");
        return;
      }

      await applyFullGeneration(supabase, projectId, validation.data, brain.version, reason, actorId);
    } catch (err) {
      console.error(`[PRDGeneration] Unexpected failure for project ${projectId}:`, err);
      await releaseLockAsFailed(supabase, projectId, err instanceof Error ? err.message : "حدث خطأ غير متوقع أثناء التوليد.");
    }
  }

  static async regenerateSection(
    projectId: string,
    sectionKey: PRDSectionKey,
    actorId?: string
  ): Promise<GenerationResult> {
    const supabase = createServiceClient();

    const locked = await claimGenerationLock(supabase, projectId);
    if (!locked) return { status: "already_generating" };

    try {
      const brain = await getBrainForDownstreamGeneration(supabase, projectId);
      if (!brain || !brain.content.executive_summary.content.trim()) {
        await supabase.from("prd").update({ sync_status: "idle" }).eq("project_id", projectId);
        return {
          status: "insufficient_brain",
          message: "Project Brain غير مكتمل — أنشئ الملخص التنفيذي أولاً من تبويب Project Brain.",
        };
      }
      if (!brain.isApproved) {
        await supabase.from("prd").update({ sync_status: "idle" }).eq("project_id", projectId);
        return {
          status: "insufficient_brain",
          message: "لا يمكن توليد PRD — Project Brain لسه مش معتمد رسميًا. أكمل مراجعة Brain Review قبل التوليد.",
        };
      }

      const currentPrd = await getOrCreatePrd(supabase, projectId);
      const { id, project_id, version, sync_status, last_error, created_by, created_at, updated_at, ...context } =
        currentPrd;
      void id;
      void project_id;
      void version;
      void sync_status;
      void last_error;
      void created_by;
      void created_at;
      void updated_at;

      const acceptedRecommendations = await getAcceptedRecommendations(supabase, projectId);
      const fused = await buildFusedKnowledgeBlock(projectId, supabase);
      const prompt = buildPRDSectionRegenerationPrompt(brain.content, sectionKey, context, acceptedRecommendations, fused.text);
      const response = await AIService.execute(AITaskType.PRD_GENERATION, prompt, {
        actorId,
        projectId,
      });

      if (!response.success) {
        await releaseLockAsFailed(supabase, projectId, response.error?.message ?? "خطأ غير معروف");
        return {
          status: "error",
          message: response.error?.message ?? "فشلت إعادة توليد القسم.",
          code: response.error?.code ?? "UNKNOWN",
        };
      }

      const validation = validatePRDSectionRegeneration(response.output, sectionKey);
      if (!validation.ok) {
        console.error(
          `[PRDGeneration] Section validation failed for project ${projectId}/${sectionKey}: ${truncateForLog(validation.reason)}`
        );
        await releaseLockAsFailed(supabase, projectId, validation.reason);
        return { status: "error", message: "لم نتمكن من فهم نتيجة إعادة التوليد.", code: "INVALID_RESPONSE" };
      }

      await applySectionRegeneration(supabase, projectId, sectionKey, validation.value, brain.version, actorId);
      return { status: "success" };
    } catch (err) {
      console.error(`[PRDGeneration] Unexpected failure regenerating ${sectionKey} for project ${projectId}:`, err);
      await releaseLockAsFailed(
        supabase,
        projectId,
        err instanceof Error ? err.message : "خطأ غير متوقع"
      );
      return { status: "error", message: "حدث خطأ غير متوقع أثناء إعادة التوليد.", code: "UNEXPECTED" };
    }
  }
}
