import type { SupabaseClient } from "@supabase/supabase-js";
import { truncateForLog } from "@/lib/observability/safe-log";
import { createServiceClient } from "@/lib/supabase/service";
import { AIService } from "@/lib/ai/service";
import { AITaskType } from "@/lib/ai/types";
import { friendlyAiErrorMessage } from "@/lib/ai/error-messages";
import {
  buildPrototypePromptGenerationPrompt,
  buildPrototypePromptSectionRegenerationPrompt,
} from "@/lib/ai/prompts/prototype-prompt-generation";
import {
  validatePrototypePromptGeneration,
  validatePrototypePromptSectionRegeneration,
} from "@/lib/ai/validation/prototype-prompt-generation";
import { getTemplate } from "@/lib/prototype-prompt/templates/registry";
import {
  applyFullGeneration,
  applySectionRegeneration,
  getOrCreatePrototypePrompt,
} from "./versioning";
import { getBrainForDownstreamGeneration } from "@/lib/brain-v2/downstream-context";
import { executeAIWithRateLimitWait } from "@/lib/ai/execute-with-rate-limit-wait";
import type { PRD, PrototypePromptSectionKey } from "@/lib/types/database";
import { PROTOTYPE_PROMPT_SECTION_KEYS } from "@/lib/types/database";

export type PromptGenerationResult =
  | { status: "success" }
  | { status: "started" }
  | { status: "missing_prd"; message: string }
  | { status: "already_generating" }
  | { status: "error"; message: string; code: string };

/** أي Lock بحالة "generating" أقدم من كده يُعتبر معلّق (Job مات) ويُعاد المحاولة فوقه. */
const STALE_LOCK_MS = 6 * 60_000;

async function claimLock(supabase: SupabaseClient, projectId: string): Promise<boolean> {
  await supabase
    .from("prototype_prompt")
    .upsert({ project_id: projectId }, { onConflict: "project_id", ignoreDuplicates: true });

  const { data, error } = await supabase
    .from("prototype_prompt")
    .update({ sync_status: "generating" })
    .eq("project_id", projectId)
    .neq("sync_status", "generating")
    .select("project_id");

  if (error) return false;
  return (data?.length ?? 0) > 0;
}

async function releaseLockAsFailed(supabase: SupabaseClient, projectId: string, message: string) {
  await supabase
    .from("prototype_prompt")
    .update({ sync_status: "failed", last_error: message })
    .eq("project_id", projectId);
}

async function getPrdOrNull(supabase: SupabaseClient, projectId: string): Promise<PRD | null> {
  const { data } = await supabase.from("prd").select("*").eq("project_id", projectId).maybeSingle();
  return data as PRD | null;
}

/**
 * Prototype Prompt Generation Engine — المدخل الوحيد للتوليد/إعادة
 * التوليد. يقرأ PRD وProject Brain فقط (بدون تعديلهم)، يختار Template
 * الأداة المناسبة، يستدعي AIService (task_type =
 * PROTOTYPE_PROMPT_GENERATION)، يتحقق من الرد، ويطبّقه عبر Versioning.
 */
export class PrototypePromptGenerationEngine {
  /**
   * يحجز الـ Lock (sync_status='generating') لو مش محجوز — أو لو محجوز
   * بس بقاله أكتر من STALE_LOCK_MS (يعني الـ Job السابق مات، خصوصًا لو
   * الـ Platform قتله). بيرجّع true لو نجح الحجز. الحجز هنا (قبل after())
   * عشان الواجهة تشوف "جاري التوليد" فورًا وتفضل شايفاه حتى بعد Refresh.
   */
  static async tryClaimLock(projectId: string): Promise<boolean> {
    const supabase = createServiceClient();
    await supabase
      .from("prototype_prompt")
      .upsert({ project_id: projectId }, { onConflict: "project_id", ignoreDuplicates: true });

    const staleCutoff = new Date(Date.now() - STALE_LOCK_MS).toISOString();
    const { data, error } = await supabase
      .from("prototype_prompt")
      .update({ sync_status: "generating", last_error: null })
      .eq("project_id", projectId)
      .or(`sync_status.neq.generating,updated_at.lt.${staleCutoff}`)
      .select("project_id");

    if (error) return false;
    return (data?.length ?? 0) > 0;
  }

  /**
   * جوهر التوليد الكامل — بيفترض إن الـ Lock محجوز بالفعل (من tryClaimLock).
   * بيتشغّل داخل after() في الخلفية، فبيقدر ينتظر على Rate Limit براحته.
   * مبيرجّعش نتيجة — الحالة كلها بتتحفظ في الـ DB (sync_status/last_error)
   * والواجهة بتقرأها بالـ Polling.
   */
  static async runFullGenerationCore(
    projectId: string,
    targetTool: string,
    reason: "full_generation" | "conflict_replace" | "auto_resync",
    actorId?: string
  ): Promise<void> {
    const supabase = createServiceClient();

    try {
      const prd = await getPrdOrNull(supabase, projectId);
      if (!prd || !prd.overview.trim()) {
        await releaseLockAsFailed(
          supabase,
          projectId,
          "لا يوجد PRD جاهز لهذا المشروع — أنشئ PRD أولاً من تبويب PRD."
        );
        return;
      }

      const brain = await getBrainForDownstreamGeneration(supabase, projectId);
      if (!brain || !brain.content.executive_summary.content.trim()) {
        await releaseLockAsFailed(
          supabase,
          projectId,
          "Project Brain غير مكتمل — أنشئ الملخص التنفيذي أولاً من تبويب Project Brain."
        );
        return;
      }

      const template = getTemplate(targetTool);
      const prompt = buildPrototypePromptGenerationPrompt(prd, brain.content, template);
      const response = await executeAIWithRateLimitWait(AITaskType.PROTOTYPE_PROMPT_GENERATION, prompt, {
        actorId,
        projectId,
      });

      if (!response.success) {
        const friendly =
          response.error?.code === "RATE_LIMIT"
            ? friendlyAiErrorMessage("RATE_LIMIT", response.error?.message ?? "")
            : response.error?.message ?? "فشل توليد الـ Prompt.";
        await releaseLockAsFailed(supabase, projectId, friendly);
        return;
      }

      const validation = validatePrototypePromptGeneration(response.output);
      if (!validation.ok) {
        console.error(`[PrototypePrompt] Validation failed for project ${projectId}: ${truncateForLog(validation.reason)}`);
        await releaseLockAsFailed(supabase, projectId, "لم نتمكن من فهم نتيجة التوليد.");
        return;
      }

      await applyFullGeneration(
        supabase,
        projectId,
        targetTool,
        validation.data,
        prd.version,
        brain.version,
        reason,
        actorId
      );
    } catch (err) {
      console.error(`[PrototypePrompt] Unexpected failure for project ${projectId}:`, err);
      await releaseLockAsFailed(supabase, projectId, err instanceof Error ? err.message : "حدث خطأ غير متوقع أثناء التوليد.");
    }
  }

  static async regenerateSection(
    projectId: string,
    sectionKey: PrototypePromptSectionKey,
    actorId?: string
  ): Promise<PromptGenerationResult> {
    const supabase = createServiceClient();

    const locked = await claimLock(supabase, projectId);
    if (!locked) return { status: "already_generating" };

    try {
      const prd = await getPrdOrNull(supabase, projectId);
      const brain = await getBrainForDownstreamGeneration(supabase, projectId);
      if (!prd || !prd.overview.trim() || !brain || !brain.content.executive_summary.content.trim()) {
        await supabase.from("prototype_prompt").update({ sync_status: "idle" }).eq("project_id", projectId);
        return {
          status: "missing_prd",
          message: "PRD أو Project Brain غير مكتملين — أكمّلهم أولاً.",
        };
      }

      const currentPrompt = await getOrCreatePrototypePrompt(supabase, projectId);
      const currentSections: Record<string, string> = {};
      for (const key of PROTOTYPE_PROMPT_SECTION_KEYS) {
        currentSections[key] = currentPrompt[key];
      }

      const template = getTemplate(currentPrompt.target_tool);
      const prompt = buildPrototypePromptSectionRegenerationPrompt(
        prd,
        brain.content,
        template,
        sectionKey,
        currentSections
      );

      const response = await AIService.execute(AITaskType.PROTOTYPE_PROMPT_GENERATION, prompt, {
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

      const validation = validatePrototypePromptSectionRegeneration(response.output, sectionKey);
      if (!validation.ok) {
        console.error(
          `[PrototypePrompt] Section validation failed for project ${projectId}/${sectionKey}: ${truncateForLog(validation.reason)}`
        );
        await releaseLockAsFailed(supabase, projectId, validation.reason);
        return { status: "error", message: "لم نتمكن من فهم نتيجة إعادة التوليد.", code: "INVALID_RESPONSE" };
      }

      await applySectionRegeneration(
        supabase,
        projectId,
        sectionKey,
        validation.value,
        prd.version,
        brain.version,
        actorId
      );
      return { status: "success" };
    } catch (err) {
      console.error(
        `[PrototypePrompt] Unexpected failure regenerating ${sectionKey} for project ${projectId}:`,
        err
      );
      await releaseLockAsFailed(supabase, projectId, err instanceof Error ? err.message : "خطأ غير متوقع");
      return { status: "error", message: "حدث خطأ غير متوقع أثناء إعادة التوليد.", code: "UNEXPECTED" };
    }
  }
}
