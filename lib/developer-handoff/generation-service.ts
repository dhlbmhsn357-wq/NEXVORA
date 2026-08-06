import type { SupabaseClient } from "@supabase/supabase-js";
import { truncateForLog } from "@/lib/observability/safe-log";
import { createServiceClient } from "@/lib/supabase/service";
import { AITaskType } from "@/lib/ai/types";
import { friendlyAiErrorMessage } from "@/lib/ai/error-messages";
import { buildDeveloperHandoffGenerationPrompt } from "@/lib/ai/prompts/developer-handoff";
import { validateDeveloperHandoffGeneration } from "@/lib/ai/validation/developer-handoff";
import { buildExpectedBehavior, buildKnownState } from "./deterministic";
import { buildBugReportingFormat } from "./fixed-sections";
import { applyFullGeneration } from "./versioning";
import { getBrainForDownstreamGeneration } from "@/lib/brain-v2/downstream-context";
import { executeAIWithRateLimitWait } from "@/lib/ai/execute-with-rate-limit-wait";
import type {
  DeveloperHandoffPackageContent,
  DeveloperHandoffVersionReason,
  PRD,
  PrototypeReview,
} from "@/lib/types/database";

export type DeveloperHandoffGenerationResult =
  | { status: "success" }
  | { status: "started" }
  | { status: "no_review"; message: string }
  | { status: "missing_prd_or_brain"; message: string }
  | { status: "major_gaps_warning"; message: string }
  | { status: "already_generating" }
  | { status: "error"; message: string; code: string };

/** أي Lock بحالة "generating" أقدم من كده يُعتبر معلّق (Job مات) ويُعاد المحاولة فوقه. */
const STALE_LOCK_MS = 6 * 60_000;

async function claimLock(supabase: SupabaseClient, projectId: string): Promise<boolean> {
  await supabase
    .from("developer_handoff")
    .upsert({ project_id: projectId }, { onConflict: "project_id", ignoreDuplicates: true });

  const staleCutoff = new Date(Date.now() - STALE_LOCK_MS).toISOString();
  const { data, error } = await supabase
    .from("developer_handoff")
    .update({ sync_status: "generating", last_error: null })
    .eq("project_id", projectId)
    .or(`sync_status.neq.generating,updated_at.lt.${staleCutoff}`)
    .select("project_id");

  if (error) return false;
  return (data?.length ?? 0) > 0;
}

async function releaseLockAsIdle(supabase: SupabaseClient, projectId: string) {
  await supabase.from("developer_handoff").update({ sync_status: "idle" }).eq("project_id", projectId);
}

async function releaseLockAsFailed(supabase: SupabaseClient, projectId: string, message: string) {
  await supabase
    .from("developer_handoff")
    .update({ sync_status: "failed", last_error: message })
    .eq("project_id", projectId);
}

async function getReviewOrNull(supabase: SupabaseClient, projectId: string): Promise<PrototypeReview | null> {
  const { data } = await supabase
    .from("prototype_review")
    .select("*")
    .eq("project_id", projectId)
    .maybeSingle();
  return data as PrototypeReview | null;
}

async function getPrdOrNull(supabase: SupabaseClient, projectId: string): Promise<PRD | null> {
  const { data } = await supabase.from("prd").select("*").eq("project_id", projectId).maybeSingle();
  return data as PRD | null;
}

/**
 * Developer Handoff Generation Engine — المدخل الوحيد لتوليد حزمة
 * المراجعة. يقرأ فقط Project Brain + PRD + آخر Prototype Review (بدون
 * تعديل أي منهم)، يمنع التنفيذ كليًا لو مفيش Review، يحذّر (مع إمكانية
 * الاستمرار) لو آخر Review حالته Blocked، ويبني الأقسام السبعة: 4 منها
 * AI-generated (مبني على AIService)، و3 حتمية بالكامل في الكود
 * (Expected Behavior, Known State, Bug Reporting Format).
 */
export class DeveloperHandoffGenerationEngine {
  /**
   * فحوصات ما قبل الحجز (لازم Review موجود، وتأكيد لو فيه فجوات جوهرية)
   * — بتفضل Synchronous عشان الواجهة تقدر تعرض تأكيد للمستخدم قبل ما أي
   * حجز/توليد يبدأ.
   */
  static async precheck(
    projectId: string,
    options: { confirmContinueWithGaps?: boolean } = {}
  ): Promise<
    | { ok: true }
    | { ok: false; result: DeveloperHandoffGenerationResult }
  > {
    const supabase = createServiceClient();

    const review = await getReviewOrNull(supabase, projectId);
    if (!review || review.version === 0) {
      return {
        ok: false,
        result: {
          status: "no_review",
          message: "لازم يوجد Prototype Review معتمد لهذا المشروع أولاً (تبويب Prototype Review).",
        },
      };
    }

    if (review.overall_status === "blocked" && !options.confirmContinueWithGaps) {
      return {
        ok: false,
        result: {
          status: "major_gaps_warning",
          message:
            "آخر Prototype Review فيه فجوات جوهرية (Blocked) — فيه Missing Features أو نسبة إنجاز أقل من 50%. تقدر تكمل التوليد رغم كده، لكن حزمة المراجعة هتعكس هذه الفجوات كما هي.",
        },
      };
    }

    return { ok: true };
  }

  /** يحجز الـ Lock (أو يستعيده لو معلّق من Job مات) — بدون تنفيذ التوليد نفسه. */
  static async tryClaimLock(projectId: string): Promise<boolean> {
    const supabase = createServiceClient();
    return claimLock(supabase, projectId);
  }

  /**
   * جوهر التوليد الكامل — بيفترض إن precheck نجح والـ Lock محجوز
   * بالفعل. بيتشغّل داخل after() في الخلفية فبيقدر ينتظر على Rate Limit
   * براحته.
   */
  static async runFullGenerationCore(
    projectId: string,
    actorId?: string,
    reason: DeveloperHandoffVersionReason = "full_generation"
  ): Promise<void> {
    const supabase = createServiceClient();

    try {
      const review = await getReviewOrNull(supabase, projectId);
      if (!review || review.version === 0) {
        // نظريًا مستحيل يحصل هنا (precheck اتنفّذ قبل الحجز) — لكن حماية إضافية.
        await releaseLockAsIdle(supabase, projectId);
        return;
      }

      const prd = await getPrdOrNull(supabase, projectId);
      const brain = await getBrainForDownstreamGeneration(supabase, projectId);

      if (
        !prd ||
        !prd.overview.trim() ||
        prd.user_stories.length === 0 ||
        !brain ||
        !brain.content.executive_summary.content.trim()
      ) {
        await releaseLockAsFailed(supabase, projectId, "محتاج PRD معتمد وProject Brain مكتمل لهذا المشروع أولاً.");
        return;
      }

      const prompt = buildDeveloperHandoffGenerationPrompt(brain.content, prd, review);
      const response = await executeAIWithRateLimitWait(AITaskType.DEVELOPER_HANDOFF_GENERATION, prompt, {
        actorId,
        projectId,
      });

      if (!response.success) {
        const friendly =
          response.error?.code === "RATE_LIMIT"
            ? friendlyAiErrorMessage("RATE_LIMIT", response.error?.message ?? "")
            : response.error?.message ?? "فشل توليد حزمة المراجعة.";
        await releaseLockAsFailed(supabase, projectId, friendly);
        return;
      }

      const validation = validateDeveloperHandoffGeneration(response.output);
      if (!validation.ok) {
        console.error(`[DeveloperHandoff] Validation failed for project ${projectId}: ${truncateForLog(validation.reason)}`);
        await releaseLockAsFailed(supabase, projectId, "لم نتمكن من فهم نتيجة التوليد.");
        return;
      }

      const packageContent: DeveloperHandoffPackageContent = {
        project_overview: { summary: validation.data.project_overview },
        repository_environment: {
          repo_url: review.repo_url,
          repo_ref: review.repo_ref,
          setup_steps: validation.data.setup_steps,
        },
        expected_behavior: buildExpectedBehavior(prd),
        known_state: buildKnownState(review),
        review_focus_areas: { items: validation.data.review_focus_areas },
        bug_reporting_format: buildBugReportingFormat(),
        review_acceptance_criteria: { items: validation.data.review_acceptance_criteria },
      };

      await applyFullGeneration(
        supabase,
        projectId,
        {
          packageContent,
          repoUrl: review.repo_url,
          repoRef: review.repo_ref,
          generatedFromPrdVersion: prd.version,
          generatedFromReviewVersion: review.version,
          generatedFromBrainVersion: brain.version,
        },
        actorId,
        reason
      );
    } catch (err) {
      console.error(`[DeveloperHandoff] Unexpected failure for project ${projectId}:`, err);
      await releaseLockAsFailed(supabase, projectId, err instanceof Error ? err.message : "حدث خطأ غير متوقع أثناء التوليد.");
    }
  }
}
