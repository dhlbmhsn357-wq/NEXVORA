"use server";

import { revalidatePath } from "next/cache";
import { after } from "next/server";
import { SecurityReviewEngine } from "@/lib/security-review/generation-service";
import { comparePhaseAuditFindings } from "@/lib/phase-audit-compare";
import { requireRetryStage, requireStartReview, requireViewQAReports } from "@/lib/engineering-qa/permissions";
import type { SecurityReviewCategoryKey } from "@/lib/types/database";

export type RunSecurityCategoryResult = { status: "started" } | { status: "already_generating" };

export async function runSecurityReviewCategory(
  projectId: string,
  reviewId: string,
  categoryKey: SecurityReviewCategoryKey,
  isRetry: boolean
): Promise<RunSecurityCategoryResult> {
  const auth = isRetry ? await requireRetryStage() : await requireStartReview();
  if (!auth.ok) {
    revalidatePath(`/dashboard/projects/${projectId}`);
    return { status: "already_generating" };
  }

  const claimed = await SecurityReviewEngine.tryClaimCategoryLock(reviewId, categoryKey);
  if (!claimed) {
    revalidatePath(`/dashboard/projects/${projectId}`);
    return { status: "already_generating" };
  }

  after(async () => {
    try {
      await SecurityReviewEngine.runCategoryCore(reviewId, categoryKey);
    } catch (err) {
      console.error("[SecurityReview category background] failed:", err);
    }
  });

  revalidatePath(`/dashboard/projects/${projectId}`);
  return { status: "started" };
}

export async function getSecurityReviewState(projectId: string) {
  const auth = await requireViewQAReports();
  if (!auth.ok) return { ok: false as const, message: auth.message ?? "غير مسموح." };
  const state = await SecurityReviewEngine.getState(projectId);
  return { ok: true as const, ...state };
}

export async function compareSecurityReviewVersions(oldReviewId: string, newReviewId: string) {
  const auth = await requireViewQAReports();
  if (!auth.ok) return { ok: false as const, message: auth.message ?? "غير مسموح." };

  const [oldData, newData] = await Promise.all([
    SecurityReviewEngine.getReviewWithFindings(oldReviewId),
    SecurityReviewEngine.getReviewWithFindings(newReviewId),
  ]);
  if (!oldData || !newData) return { ok: false as const, message: "لم يتم العثور على إحدى المراجعتين." };

  const oldScore = oldData.review.score_summary?.overall_security_score ?? 0;
  const newScore = newData.review.score_summary?.overall_security_score ?? 0;
  const comparison = comparePhaseAuditFindings(oldData.findings, newData.findings, oldScore, newScore);

  return { ok: true as const, comparison, oldScore, newScore };
}
