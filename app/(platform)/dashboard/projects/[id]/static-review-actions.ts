"use server";

import { revalidatePath } from "next/cache";
import { after } from "next/server";
import { StaticReviewEngine } from "@/lib/static-review/generation-service";
import { compareStaticReviews, type StaticReviewComparison } from "@/lib/static-review/compare-reviews";
import { requireRetryStage, requireStartReview, requireViewQAReports } from "@/lib/engineering-qa/permissions";
import type { StaticReviewCategoryKey } from "@/lib/types/database";

export type RunCategoryResult = { status: "started" } | { status: "already_generating" };

/**
 * تشغيل/إعادة محاولة محور واحد من محاور Static Architecture Review —
 * بيستخدمها الـ Client تلقائيًا (Auto-chain جوّه StaticReviewPanel) وكمان
 * يدويًا لإعادة محاولة محور فشل أو علق. نفس صلاحيات Engineering QA
 * بالظبط (Start Review / Retry Stage) — صفر نظام صلاحيات جديد.
 */
export async function runStaticReviewCategory(
  projectId: string,
  reviewId: string,
  categoryKey: StaticReviewCategoryKey,
  isRetry: boolean
): Promise<RunCategoryResult> {
  const auth = isRetry ? await requireRetryStage() : await requireStartReview();
  if (!auth.ok) {
    revalidatePath(`/dashboard/projects/${projectId}`);
    return { status: "already_generating" };
  }

  const claimed = await StaticReviewEngine.tryClaimCategoryLock(reviewId, categoryKey);
  if (!claimed) {
    revalidatePath(`/dashboard/projects/${projectId}`);
    return { status: "already_generating" };
  }

  after(async () => {
    try {
      await StaticReviewEngine.runCategoryCore(reviewId, categoryKey);
    } catch (err) {
      console.error("[StaticReview category background] failed:", err);
    }
  });

  revalidatePath(`/dashboard/projects/${projectId}`);
  return { status: "started" };
}

export async function getStaticReviewState(projectId: string) {
  const auth = await requireViewQAReports();
  if (!auth.ok) {
    return { ok: false as const, message: auth.message ?? "غير مسموح." };
  }
  const state = await StaticReviewEngine.getState(projectId);
  return { ok: true as const, ...state };
}

export type CompareReviewsResult =
  | { ok: true; comparison: StaticReviewComparison; oldScore: number; newScore: number }
  | { ok: false; message: string };

/** يقارن مراجعتين (Versioning) — Issues Added/Fixed/Remaining + فرق الدرجة. */
export async function compareStaticReviewVersions(oldReviewId: string, newReviewId: string): Promise<CompareReviewsResult> {
  const auth = await requireViewQAReports();
  if (!auth.ok) return { ok: false, message: auth.message ?? "غير مسموح." };

  const [oldData, newData] = await Promise.all([
    StaticReviewEngine.getReviewWithFindings(oldReviewId),
    StaticReviewEngine.getReviewWithFindings(newReviewId),
  ]);
  if (!oldData || !newData) return { ok: false, message: "لم يتم العثور على إحدى المراجعتين." };

  const oldScore = oldData.review.score_summary?.overall_static_score ?? 0;
  const newScore = newData.review.score_summary?.overall_static_score ?? 0;
  const comparison = compareStaticReviews(oldData.findings, newData.findings, oldScore, newScore);

  return { ok: true, comparison, oldScore, newScore };
}
