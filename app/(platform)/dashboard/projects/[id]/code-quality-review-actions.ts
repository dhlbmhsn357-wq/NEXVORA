"use server";

import { revalidatePath } from "next/cache";
import { after } from "next/server";
import { CodeQualityReviewEngine } from "@/lib/code-quality-review/generation-service";
import { comparePhaseAuditFindings } from "@/lib/phase-audit-compare";
import { requireRetryStage, requireStartReview, requireViewQAReports } from "@/lib/engineering-qa/permissions";
import type { CodeQualityReviewCategoryKey } from "@/lib/types/database";

export type RunCodeQualityCategoryResult = { status: "started" } | { status: "already_generating" };

export async function runCodeQualityReviewCategory(
  projectId: string,
  reviewId: string,
  categoryKey: CodeQualityReviewCategoryKey,
  isRetry: boolean
): Promise<RunCodeQualityCategoryResult> {
  const auth = isRetry ? await requireRetryStage() : await requireStartReview();
  if (!auth.ok) {
    revalidatePath(`/dashboard/projects/${projectId}`);
    return { status: "already_generating" };
  }

  const claimed = await CodeQualityReviewEngine.tryClaimCategoryLock(reviewId, categoryKey);
  if (!claimed) {
    revalidatePath(`/dashboard/projects/${projectId}`);
    return { status: "already_generating" };
  }

  after(async () => {
    try {
      await CodeQualityReviewEngine.runCategoryCore(reviewId, categoryKey);
    } catch (err) {
      console.error("[CodeQualityReview category background] failed:", err);
    }
  });

  revalidatePath(`/dashboard/projects/${projectId}`);
  return { status: "started" };
}

export async function getCodeQualityReviewState(projectId: string) {
  const auth = await requireViewQAReports();
  if (!auth.ok) return { ok: false as const, message: auth.message ?? "غير مسموح." };
  const state = await CodeQualityReviewEngine.getState(projectId);
  return { ok: true as const, ...state };
}

export async function compareCodeQualityReviewVersions(oldReviewId: string, newReviewId: string) {
  const auth = await requireViewQAReports();
  if (!auth.ok) return { ok: false as const, message: auth.message ?? "غير مسموح." };

  const [oldData, newData] = await Promise.all([
    CodeQualityReviewEngine.getReviewWithFindings(oldReviewId),
    CodeQualityReviewEngine.getReviewWithFindings(newReviewId),
  ]);
  if (!oldData || !newData) return { ok: false as const, message: "لم يتم العثور على إحدى المراجعتين." };

  const oldScore = oldData.review.score_summary?.overall_code_quality_score ?? 0;
  const newScore = newData.review.score_summary?.overall_code_quality_score ?? 0;
  const comparison = comparePhaseAuditFindings(oldData.findings, newData.findings, oldScore, newScore);

  return { ok: true as const, comparison, oldScore, newScore };
}
