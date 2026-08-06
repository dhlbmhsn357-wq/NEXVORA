import { createServiceClient } from "@/lib/supabase/service";
import { PerformanceReviewEngine } from "./generation-service";
import type { StageRunContext, StageRunResult } from "@/lib/engineering-qa/stage-registry";
import type { PerformanceReview, PerformanceReviewFinding } from "@/lib/types/database";

const IN_PROGRESS_SUMMARY =
  "مراجعة Performance شغّالة في الخلفية — محاورها الستة (Query Performance, Bundle Size, Caching, Render Performance, N+1 Patterns, Async Patterns) بتتحلل بالتسلسل. افتح تفاصيل هذه المرحلة لمتابعة التقدم أو لتشغيل المحاور يدويًا.";

/**
 * الجسر الوحيد بين Engineering QA Engine (Phase 12.1) وPerformance
 * Audit Engine (EngQA-Merge) — نفس نمط lib/database-review/eqa-bridge.ts بالظبط.
 */
export async function runPerformanceAuditStage(context: StageRunContext): Promise<StageRunResult> {
  const supabase = createServiceClient();

  const { data: existing } = await supabase
    .from("performance_reviews")
    .select("*")
    .eq("engineering_stage_id", context.stageId)
    .maybeSingle();

  if (!existing) {
    const result = await PerformanceReviewEngine.startReview(
      context.projectId,
      context.repositoryUrl,
      context.repositoryBranch,
      undefined,
      { engineeringReviewId: context.reviewId, engineeringStageId: context.stageId }
    );
    if (result.status === "started") {
      await PerformanceReviewEngine.runInitCore(result.reviewId);
    }
    return { score: null, summary: IN_PROGRESS_SUMMARY, findingsJson: [], recommendationsJson: [], inProgress: true };
  }

  const review = existing as PerformanceReview;

  if (review.status === "generating") {
    return { score: null, summary: IN_PROGRESS_SUMMARY, findingsJson: [], recommendationsJson: [], inProgress: true };
  }

  if (review.status === "failed") {
    throw new Error(review.last_error ?? "فشلت مراجعة Performance لسبب غير معروف.");
  }

  const { data: findings } = await supabase
    .from("performance_review_findings")
    .select("*")
    .eq("performance_review_id", review.id);
  const topFindings = ((findings ?? []) as PerformanceReviewFinding[])
    .filter((f) => f.severity === "critical" || f.severity === "high")
    .slice(0, 20);

  return {
    score: review.score_summary?.overall_performance_score ?? null,
    summary: `مراجعة Performance اكتملت — ${(findings ?? []).length} Finding عبر 6 محاور. الدرجة الكلية: ${review.score_summary?.overall_performance_score ?? "-"}/100.`,
    findingsJson: topFindings,
    recommendationsJson: [],
    inProgress: false,
  };
}
