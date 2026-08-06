import { createServiceClient } from "@/lib/supabase/service";
import { DatabaseReviewEngine } from "./generation-service";
import type { StageRunContext, StageRunResult } from "@/lib/engineering-qa/stage-registry";
import type { DatabaseReview, DatabaseReviewFinding } from "@/lib/types/database";

const IN_PROGRESS_SUMMARY =
  "مراجعة Database Integrity شغّالة في الخلفية — محاورها الستة (Database Structure, Query, Migration, Data Integrity, Storage, Logging) بتتحلل بالتسلسل. افتح تفاصيل هذه المرحلة لمتابعة التقدم أو لتشغيل المحاور يدويًا.";

/**
 * الجسر الوحيد بين Engineering QA Engine (Phase 12.1) وDatabase
 * Integrity Engine (Phase 12.3) — نفس نمط lib/static-review/eqa-bridge.ts
 * ولib/security-review/eqa-bridge.ts بالظبط.
 */
export async function runDatabaseAuditStage(context: StageRunContext): Promise<StageRunResult> {
  const supabase = createServiceClient();

  const { data: existing } = await supabase
    .from("database_reviews")
    .select("*")
    .eq("engineering_stage_id", context.stageId)
    .maybeSingle();

  if (!existing) {
    const result = await DatabaseReviewEngine.startReview(
      context.projectId,
      context.repositoryUrl,
      context.repositoryBranch,
      undefined,
      { engineeringReviewId: context.reviewId, engineeringStageId: context.stageId }
    );
    if (result.status === "started") {
      await DatabaseReviewEngine.runInitCore(result.reviewId);
    }
    return { score: null, summary: IN_PROGRESS_SUMMARY, findingsJson: [], recommendationsJson: [], inProgress: true };
  }

  const review = existing as DatabaseReview;

  if (review.status === "generating") {
    return { score: null, summary: IN_PROGRESS_SUMMARY, findingsJson: [], recommendationsJson: [], inProgress: true };
  }

  if (review.status === "failed") {
    throw new Error(review.last_error ?? "فشلت مراجعة Database Integrity لسبب غير معروف.");
  }

  const { data: findings } = await supabase
    .from("database_review_findings")
    .select("*")
    .eq("database_review_id", review.id);
  const topFindings = ((findings ?? []) as DatabaseReviewFinding[])
    .filter((f) => f.severity === "critical" || f.severity === "high")
    .slice(0, 20);

  return {
    score: review.score_summary?.overall_database_score ?? null,
    summary: `مراجعة Database Integrity اكتملت — ${(findings ?? []).length} Finding عبر 6 محاور. الدرجة الكلية: ${review.score_summary?.overall_database_score ?? "-"}/100.`,
    findingsJson: topFindings,
    recommendationsJson: [],
    inProgress: false,
  };
}
