"use server";

import { revalidatePath } from "next/cache";
import { after } from "next/server";
import { ArchitectureReviewEngine } from "@/lib/architecture-review/generation-service";
import { comparePhaseAuditFindings } from "@/lib/phase-audit-compare";
import { requireRetryStage, requireStartReview, requireViewQAReports } from "@/lib/engineering-qa/permissions";
import type { ArchitectureReviewCategoryKey } from "@/lib/types/database";
import { requireExtendedTechnical } from "@/lib/feature-flags/guards";

export type RunArchitectureCategoryResult = { status: "started" } | { status: "already_generating" };

export async function runArchitectureReviewCategory(
  projectId: string,
  reviewId: string,
  categoryKey: ArchitectureReviewCategoryKey,
  isRetry: boolean
): Promise<RunArchitectureCategoryResult> {
  await requireExtendedTechnical();
  const auth = isRetry ? await requireRetryStage() : await requireStartReview();
  if (!auth.ok) {
    revalidatePath(`/dashboard/projects/${projectId}`);
    return { status: "already_generating" };
  }

  const claimed = await ArchitectureReviewEngine.tryClaimCategoryLock(reviewId, categoryKey);
  if (!claimed) {
    revalidatePath(`/dashboard/projects/${projectId}`);
    return { status: "already_generating" };
  }

  after(async () => {
    try {
      await ArchitectureReviewEngine.runCategoryCore(reviewId, categoryKey);
    } catch (err) {
      console.error("[ArchitectureReview category background] failed:", err);
    }
  });

  revalidatePath(`/dashboard/projects/${projectId}`);
  return { status: "started" };
}

export async function getArchitectureReviewState(projectId: string) {
  await requireExtendedTechnical();
  const auth = await requireViewQAReports();
  if (!auth.ok) return { ok: false as const, message: auth.message ?? "غير مسموح." };
  const state = await ArchitectureReviewEngine.getState(projectId);
  return { ok: true as const, ...state };
}

export async function compareArchitectureReviewVersions(oldReviewId: string, newReviewId: string) {
  await requireExtendedTechnical();
  const auth = await requireViewQAReports();
  if (!auth.ok) return { ok: false as const, message: auth.message ?? "غير مسموح." };

  const [oldData, newData] = await Promise.all([
    ArchitectureReviewEngine.getReviewWithFindings(oldReviewId),
    ArchitectureReviewEngine.getReviewWithFindings(newReviewId),
  ]);
  if (!oldData || !newData) return { ok: false as const, message: "لم يتم العثور على إحدى المراجعتين." };

  const oldScore = oldData.review.score_summary?.overall_architecture_score ?? 0;
  const newScore = newData.review.score_summary?.overall_architecture_score ?? 0;
  const comparison = comparePhaseAuditFindings(oldData.findings, newData.findings, oldScore, newScore);

  return { ok: true as const, comparison, oldScore, newScore };
}
