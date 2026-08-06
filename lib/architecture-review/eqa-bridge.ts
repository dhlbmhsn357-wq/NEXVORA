import { createServiceClient } from "@/lib/supabase/service";
import { ArchitectureReviewEngine } from "./generation-service";
import type { StageRunContext, StageRunResult } from "@/lib/engineering-qa/stage-registry";
import type { ArchitectureReview, ArchitectureReviewFinding } from "@/lib/types/database";

const IN_PROGRESS_SUMMARY =
  "مراجعة Architecture شغّالة في الخلفية — محاورها الستة (Layering, Coupling, Scalability, Module Boundaries, Dependency Management, API Design) بتتحلل بالتسلسل. افتح تفاصيل هذه المرحلة لمتابعة التقدم أو لتشغيل المحاور يدويًا.";

/**
 * الجسر الوحيد بين Engineering QA Engine (Phase 12.1) وArchitecture
 * Audit Engine (EngQA-Merge) — نفس نمط lib/database-review/eqa-bridge.ts بالظبط.
 */
export async function runArchitectureAuditStage(context: StageRunContext): Promise<StageRunResult> {
  const supabase = createServiceClient();

  const { data: existing } = await supabase
    .from("architecture_reviews")
    .select("*")
    .eq("engineering_stage_id", context.stageId)
    .maybeSingle();

  if (!existing) {
    const result = await ArchitectureReviewEngine.startReview(
      context.projectId,
      context.repositoryUrl,
      context.repositoryBranch,
      undefined,
      { engineeringReviewId: context.reviewId, engineeringStageId: context.stageId }
    );
    if (result.status === "started") {
      await ArchitectureReviewEngine.runInitCore(result.reviewId);
    }
    return { score: null, summary: IN_PROGRESS_SUMMARY, findingsJson: [], recommendationsJson: [], inProgress: true };
  }

  const review = existing as ArchitectureReview;

  if (review.status === "generating") {
    return { score: null, summary: IN_PROGRESS_SUMMARY, findingsJson: [], recommendationsJson: [], inProgress: true };
  }

  if (review.status === "failed") {
    throw new Error(review.last_error ?? "فشلت مراجعة Architecture لسبب غير معروف.");
  }

  const { data: findings } = await supabase
    .from("architecture_review_findings")
    .select("*")
    .eq("architecture_review_id", review.id);
  const topFindings = ((findings ?? []) as ArchitectureReviewFinding[])
    .filter((f) => f.severity === "critical" || f.severity === "high")
    .slice(0, 20);

  return {
    score: review.score_summary?.overall_architecture_score ?? null,
    summary: `مراجعة Architecture اكتملت — ${(findings ?? []).length} Finding عبر 6 محاور. الدرجة الكلية: ${review.score_summary?.overall_architecture_score ?? "-"}/100.`,
    findingsJson: topFindings,
    recommendationsJson: [],
    inProgress: false,
  };
}
