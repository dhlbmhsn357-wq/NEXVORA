"use server";

import { revalidatePath } from "next/cache";
import { after } from "next/server";
import { PrdComplianceReviewEngine } from "@/lib/prd-compliance-review/generation-service";
import { comparePhaseAuditFindings } from "@/lib/phase-audit-compare";
import { requireRetryStage, requireStartReview, requireViewQAReports } from "@/lib/engineering-qa/permissions";
import type { PrdComplianceReviewCategoryKey } from "@/lib/types/database";
import { requireExtendedTechnical } from "@/lib/feature-flags/guards";

export type RunPrdComplianceCategoryResult = { status: "started" } | { status: "already_generating" };

export async function runPrdComplianceReviewCategory(
  projectId: string,
  reviewId: string,
  categoryKey: PrdComplianceReviewCategoryKey,
  isRetry: boolean
): Promise<RunPrdComplianceCategoryResult> {
  await requireExtendedTechnical();
  const auth = isRetry ? await requireRetryStage() : await requireStartReview();
  if (!auth.ok) {
    revalidatePath(`/dashboard/projects/${projectId}`);
    return { status: "already_generating" };
  }

  const claimed = await PrdComplianceReviewEngine.tryClaimCategoryLock(reviewId, categoryKey);
  if (!claimed) {
    revalidatePath(`/dashboard/projects/${projectId}`);
    return { status: "already_generating" };
  }

  after(async () => {
    try {
      await PrdComplianceReviewEngine.runCategoryCore(reviewId, categoryKey);
    } catch (err) {
      console.error("[PrdComplianceReview category background] failed:", err);
    }
  });

  revalidatePath(`/dashboard/projects/${projectId}`);
  return { status: "started" };
}

export async function getPrdComplianceReviewState(projectId: string) {
  await requireExtendedTechnical();
  const auth = await requireViewQAReports();
  if (!auth.ok) return { ok: false as const, message: auth.message ?? "غير مسموح." };
  const state = await PrdComplianceReviewEngine.getState(projectId);
  return { ok: true as const, ...state };
}

export async function comparePrdComplianceReviewVersions(oldReviewId: string, newReviewId: string) {
  await requireExtendedTechnical();
  const auth = await requireViewQAReports();
  if (!auth.ok) return { ok: false as const, message: auth.message ?? "غير مسموح." };

  const [oldData, newData] = await Promise.all([
    PrdComplianceReviewEngine.getReviewWithFindings(oldReviewId),
    PrdComplianceReviewEngine.getReviewWithFindings(newReviewId),
  ]);
  if (!oldData || !newData) return { ok: false as const, message: "لم يتم العثور على إحدى المراجعتين." };

  const oldScore = oldData.review.score_summary?.overall_prd_compliance_score ?? 0;
  const newScore = newData.review.score_summary?.overall_prd_compliance_score ?? 0;
  const comparison = comparePhaseAuditFindings(oldData.findings, newData.findings, oldScore, newScore);

  return { ok: true as const, comparison, oldScore, newScore };
}
