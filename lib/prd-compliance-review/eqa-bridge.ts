import { createServiceClient } from "@/lib/supabase/service";
import { PrdComplianceReviewEngine } from "./generation-service";
import type { StageRunContext, StageRunResult } from "@/lib/engineering-qa/stage-registry";
import type { PrdComplianceReview, PrdComplianceReviewFinding } from "@/lib/types/database";

const IN_PROGRESS_SUMMARY =
  "مراجعة PRD Compliance شغّالة في الخلفية — محاورها الأربعة (Functional Requirements Coverage, Non-Functional Requirements, Scope Adherence, Acceptance Criteria) بتتحلل بالتسلسل. افتح تفاصيل هذه المرحلة لمتابعة التقدم أو لتشغيل المحاور يدويًا.";

/**
 * الجسر الوحيد بين Engineering QA Engine (Phase 12.1) وPRD Compliance
 * Audit Engine (EngQA-Merge) — نفس نمط lib/database-review/eqa-bridge.ts بالظبط.
 */
export async function runPrdComplianceAuditStage(context: StageRunContext): Promise<StageRunResult> {
  const supabase = createServiceClient();

  const { data: existing } = await supabase
    .from("prd_compliance_reviews")
    .select("*")
    .eq("engineering_stage_id", context.stageId)
    .maybeSingle();

  if (!existing) {
    const result = await PrdComplianceReviewEngine.startReview(
      context.projectId,
      context.repositoryUrl,
      context.repositoryBranch,
      undefined,
      { engineeringReviewId: context.reviewId, engineeringStageId: context.stageId }
    );
    if (result.status === "started") {
      await PrdComplianceReviewEngine.runInitCore(result.reviewId);
    }
    return { score: null, summary: IN_PROGRESS_SUMMARY, findingsJson: [], recommendationsJson: [], inProgress: true };
  }

  const review = existing as PrdComplianceReview;

  if (review.status === "generating") {
    return { score: null, summary: IN_PROGRESS_SUMMARY, findingsJson: [], recommendationsJson: [], inProgress: true };
  }

  if (review.status === "failed") {
    throw new Error(review.last_error ?? "فشلت مراجعة PRD Compliance لسبب غير معروف.");
  }

  const { data: findings } = await supabase
    .from("prd_compliance_review_findings")
    .select("*")
    .eq("prd_compliance_review_id", review.id);
  const topFindings = ((findings ?? []) as PrdComplianceReviewFinding[])
    .filter((f) => f.severity === "critical" || f.severity === "high")
    .slice(0, 20);

  return {
    score: review.score_summary?.overall_prd_compliance_score ?? null,
    summary: `مراجعة PRD Compliance اكتملت — ${(findings ?? []).length} Finding عبر 4 محاور. الدرجة الكلية: ${review.score_summary?.overall_prd_compliance_score ?? "-"}/100.`,
    findingsJson: topFindings,
    recommendationsJson: [],
    inProgress: false,
  };
}
