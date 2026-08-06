import type { SupabaseClient } from "@supabase/supabase-js";
import { truncateForLog } from "@/lib/observability/safe-log";
import { createServiceClient } from "@/lib/supabase/service";
import { AITaskType } from "@/lib/ai/types";
import { friendlyAiErrorMessage } from "@/lib/ai/error-messages";
import { executeAIWithRateLimitWait } from "@/lib/ai/execute-with-rate-limit-wait";
import { readRepository } from "@/lib/github/repo-reader";
import { buildPrototypeReviewPrompt } from "@/lib/ai/prompts/prototype-review";
import { validatePrototypeReview } from "@/lib/ai/validation/prototype-review";
import { calculateCompletionPercentage, calculateOverallStatus } from "./gap-analyzer";
import { applyReviewRun, getOrCreateReview } from "./versioning";
import { proposePrototypeReviewChanges } from "@/lib/brain-v2/prototype-review-integration";
import type { PRD, PrototypePrompt } from "@/lib/types/database";

export type ReviewRunResult =
  | { status: "started" }
  | { status: "already_reviewing" };

/** أي Lock بحالة "reviewing" أقدم من كده يُعتبر معلّق (Job مات) ويُعاد المحاولة فوقه. */
const STALE_LOCK_MS = 6 * 60_000;

async function claimLock(supabase: SupabaseClient, projectId: string): Promise<boolean> {
  await supabase
    .from("prototype_review")
    .upsert(
      { project_id: projectId, repo_url: "", repo_ref: "" },
      { onConflict: "project_id", ignoreDuplicates: true }
    );

  const staleCutoff = new Date(Date.now() - STALE_LOCK_MS).toISOString();
  const { data, error } = await supabase
    .from("prototype_review")
    .update({ sync_status: "reviewing", last_error: null })
    .eq("project_id", projectId)
    .or(`sync_status.neq.reviewing,updated_at.lt.${staleCutoff}`)
    .select("project_id");

  if (error) return false;
  return (data?.length ?? 0) > 0;
}

async function releaseLockAsFailed(supabase: SupabaseClient, projectId: string, message: string) {
  await supabase
    .from("prototype_review")
    .update({ sync_status: "failed", last_error: message })
    .eq("project_id", projectId);
}

async function getPrdOrNull(supabase: SupabaseClient, projectId: string): Promise<PRD | null> {
  const { data } = await supabase.from("prd").select("*").eq("project_id", projectId).maybeSingle();
  return data as PRD | null;
}

async function getPromptOrNull(
  supabase: SupabaseClient,
  projectId: string
): Promise<PrototypePrompt | null> {
  const { data } = await supabase
    .from("prototype_prompt")
    .select("*")
    .eq("project_id", projectId)
    .maybeSingle();
  return data as PrototypePrompt | null;
}

/**
 * Prototype Review Engine — المدخل الوحيد لتشغيل مراجعة. يقرأ الكود
 * الفعلي من GitHub (Repository Reader)، يقرأ PRD فقط كمرجع للمتطلبات
 * (بدون تعديله)، يستدعي AIService (task_type = PROTOTYPE_REVIEW)،
 * يتحقق من الرد، يحسب النسبة والحالة (Gap Analyzer)، ويطبّق عبر Versioning.
 */
export class PrototypeReviewEngine {
  /** يحجز الـ Lock (أو يستعيده لو معلّق من Job مات) — بدون تنفيذ المراجعة نفسها. */
  static async tryClaimLock(projectId: string): Promise<boolean> {
    const supabase = createServiceClient();
    return claimLock(supabase, projectId);
  }

  /**
   * جوهر المراجعة الكامل — بيفترض إن الـ Lock محجوز بالفعل. بيتشغّل
   * داخل after() في الخلفية فبيقدر يقرا Repository كامل وينتظر على
   * Rate Limit براحته، من غير ما يضرب حد وقت تنفيذ الطلب نفسه.
   */
  static async runReviewCore(
    projectId: string,
    repoUrl: string,
    repoRef: string,
    actorId?: string
  ): Promise<void> {
    const supabase = createServiceClient();

    try {
      const prd = await getPrdOrNull(supabase, projectId);
      if (!prd || !prd.overview.trim() || prd.user_stories.length === 0) {
        await releaseLockAsFailed(supabase, projectId, "لا يوجد PRD معتمد بمتطلبات كافية لهذا المشروع — أكمّل PRD أولاً.");
        return;
      }

      const githubToken = process.env.GITHUB_TOKEN;
      if (!githubToken) {
        await releaseLockAsFailed(supabase, projectId, "خدمة GitHub غير مُعدّة حاليًا.");
        return;
      }

      let repoResult;
      try {
        repoResult = await readRepository(repoUrl, repoRef, githubToken);
      } catch (err) {
        const message = err instanceof Error ? err.message : "تعذّر قراءة الـ Repository.";
        await releaseLockAsFailed(supabase, projectId, message);
        return;
      }

      if (repoResult.files.length === 0) {
        await releaseLockAsFailed(supabase, projectId, "مفيش ملفات كود مصدري مقروءة في هذا الـ Repository أو الـ Branch.");
        return;
      }

      const prompt = buildPrototypeReviewPrompt(prd, repoResult.files);
      // ميزانية انتظار أقل من الافتراضي (4 دقايق): قراءة الـ Repository
      // فوق بالفعل استهلكت جزء من حد وقت التنفيذ الكلي (260 ثانية) قبل
      // ما نوصل هنا، فمحتاجين نسيب هامش كافي بدل ما ناخد الميزانية
      // الكاملة ونخاطر إن الـ Job يتقفل من غير ما يخلّص أو يسجّل فشل واضح.
      const response = await executeAIWithRateLimitWait(
        AITaskType.PROTOTYPE_REVIEW,
        prompt,
        { actorId, projectId },
        150_000
      );

      if (!response.success) {
        const friendly =
          response.error?.code === "RATE_LIMIT"
            ? friendlyAiErrorMessage("RATE_LIMIT", response.error?.message ?? "")
            : response.error?.message ?? "فشلت المراجعة.";
        await releaseLockAsFailed(supabase, projectId, friendly);
        return;
      }

      const validation = validatePrototypeReview(response.output);
      if (!validation.ok) {
        console.error(`[PrototypeReview] Validation failed for project ${projectId}: ${truncateForLog(validation.reason)}`);
        await releaseLockAsFailed(supabase, projectId, "لم نتمكن من فهم نتيجة المراجعة.");
        return;
      }

      const completionPercentage = calculateCompletionPercentage(validation.data);
      const overallStatus = calculateOverallStatus(validation.data, completionPercentage);
      const prototypePrompt = await getPromptOrNull(supabase, projectId);

      await applyReviewRun(
        supabase,
        projectId,
        {
          repoUrl,
          repoRef: repoResult.resolvedSha,
          reviewedPrdVersion: prd.version,
          reviewedPromptVersion: prototypePrompt?.version ?? null,
          gapReport: validation.data,
          completionPercentage,
          overallStatus,
        },
        actorId
      );

      // فجوات المراجعة (مزايا ناقصة/مخاطر/توسّع نطاق) بتتحوّل لمرشحي
      // معرفة لـ Project Brain — طبقة مستقلة، فشلها لا يمنع نجاح المراجعة.
      try {
        await proposePrototypeReviewChanges(projectId, projectId, validation.data);
      } catch (err) {
        console.error(`[PrototypeReview] proposePrototypeReviewChanges threw for project ${projectId}:`, err);
      }
    } catch (err) {
      console.error(`[PrototypeReview] Unexpected failure for project ${projectId}:`, err);
      await releaseLockAsFailed(supabase, projectId, err instanceof Error ? err.message : "حدث خطأ غير متوقع أثناء المراجعة.");
    }
  }

  static async getCurrent(projectId: string) {
    const supabase = createServiceClient();
    return getOrCreateReview(supabase, projectId);
  }
}
