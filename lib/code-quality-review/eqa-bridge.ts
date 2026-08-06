import { createServiceClient } from "@/lib/supabase/service";
import { CodeQualityReviewEngine } from "./generation-service";
import type { StageRunContext, StageRunResult } from "@/lib/engineering-qa/stage-registry";
import type { CodeQualityReview, CodeQualityReviewFinding } from "@/lib/types/database";

const IN_PROGRESS_SUMMARY =
  "مراجعة Code Quality شغّالة في الخلفية — محاورها الستة (Readability, Duplication, Error Handling, Testing Coverage, Naming Consistency, Complexity) بتتحلل بالتسلسل. افتح تفاصيل هذه المرحلة لمتابعة التقدم أو لتشغيل المحاور يدويًا.";

/**
 * الجسر الوحيد بين Engineering QA Engine (Phase 12.1) وCode Quality
 * Audit Engine (EngQA-Merge) — نفس نمط lib/database-review/eqa-bridge.ts بالظبط.
 */
export async function runCodeQualityAuditStage(context: StageRunContext): Promise<StageRunResult> {
  const supabase = createServiceClient();

  const { data: existing } = await supabase
    .from("code_quality_reviews")
    .select("*")
    .eq("engineering_stage_id", context.stageId)
    .maybeSingle();

  if (!existing) {
    const result = await CodeQualityReviewEngine.startReview(
      context.projectId,
      context.repositoryUrl,
      context.repositoryBranch,
      undefined,
      { engineeringReviewId: context.reviewId, engineeringStageId: context.stageId }
    );
    if (result.status === "started") {
      await CodeQualityReviewEngine.runInitCore(result.reviewId);
    }
    return { score: null, summary: IN_PROGRESS_SUMMARY, findingsJson: [], recommendationsJson: [], inProgress: true };
  }

  const review = existing as CodeQualityReview;

  if (review.status === "generating") {
    return { score: null, summary: IN_PROGRESS_SUMMARY, findingsJson: [], recommendationsJson: [], inProgress: true };
  }

  if (review.status === "failed") {
    throw new Error(review.last_error ?? "فشلت مراجعة Code Quality لسبب غير معروف.");
  }

  const { data: findings } = await supabase
    .from("code_quality_review_findings")
    .select("*")
    .eq("code_quality_review_id", review.id);
  const topFindings = ((findings ?? []) as CodeQualityReviewFinding[])
    .filter((f) => f.severity === "critical" || f.severity === "high")
    .slice(0, 20);

  return {
    score: review.score_summary?.overall_code_quality_score ?? null,
    summary: `مراجعة Code Quality اكتملت — ${(findings ?? []).length} Finding عبر 6 محاور. الدرجة الكلية: ${review.score_summary?.overall_code_quality_score ?? "-"}/100.`,
    findingsJson: topFindings,
    recommendationsJson: [],
    inProgress: false,
  };
}
