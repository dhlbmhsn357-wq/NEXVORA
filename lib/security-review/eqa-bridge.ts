import { createServiceClient } from "@/lib/supabase/service";
import { SecurityReviewEngine } from "./generation-service";
import type { StageRunContext, StageRunResult } from "@/lib/engineering-qa/stage-registry";
import type { SecurityReview, SecurityReviewFinding } from "@/lib/types/database";

const IN_PROGRESS_SUMMARY =
  "مراجعة Security Audit شغّالة في الخلفية — محاورها السبعة (Authentication, Authorization, RLS, API Security, Input Validation, Secrets, Environment) بتتحلل بالتسلسل. افتح تفاصيل هذه المرحلة لمتابعة التقدم أو لتشغيل المحاور يدويًا.";

/**
 * الجسر الوحيد بين Engineering QA Engine (Phase 12.1) وSecurity Audit
 * Engine (Phase 12.3) — نفس نمط lib/static-review/eqa-bridge.ts
 * بالظبط. الفحص الفعلي بيتشغّل بالكامل من جوّه لوحة Security Review
 * المدمجة (Client-driven auto-chain) — مش من هنا.
 */
export async function runSecurityAuditStage(context: StageRunContext): Promise<StageRunResult> {
  const supabase = createServiceClient();

  const { data: existing } = await supabase
    .from("security_reviews")
    .select("*")
    .eq("engineering_stage_id", context.stageId)
    .maybeSingle();

  if (!existing) {
    const result = await SecurityReviewEngine.startReview(
      context.projectId,
      context.repositoryUrl,
      context.repositoryBranch,
      undefined,
      { engineeringReviewId: context.reviewId, engineeringStageId: context.stageId }
    );
    if (result.status === "started") {
      await SecurityReviewEngine.runInitCore(result.reviewId);
    }
    return { score: null, summary: IN_PROGRESS_SUMMARY, findingsJson: [], recommendationsJson: [], inProgress: true };
  }

  const review = existing as SecurityReview;

  if (review.status === "generating") {
    return { score: null, summary: IN_PROGRESS_SUMMARY, findingsJson: [], recommendationsJson: [], inProgress: true };
  }

  if (review.status === "failed") {
    throw new Error(review.last_error ?? "فشلت مراجعة Security Audit لسبب غير معروف.");
  }

  const { data: findings } = await supabase
    .from("security_review_findings")
    .select("*")
    .eq("security_review_id", review.id);
  const topFindings = ((findings ?? []) as SecurityReviewFinding[])
    .filter((f) => f.severity === "critical" || f.severity === "high")
    .slice(0, 20);

  return {
    score: review.score_summary?.overall_security_score ?? null,
    summary: `مراجعة Security Audit اكتملت — ${(findings ?? []).length} Finding عبر 7 محاور. الدرجة الكلية: ${review.score_summary?.overall_security_score ?? "-"}/100.`,
    findingsJson: topFindings,
    recommendationsJson: [],
    inProgress: false,
  };
}
