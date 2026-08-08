"use server";

import { revalidatePath } from "next/cache";
import { after } from "next/server";
import { EngineeringQAEngine, type CreateReviewResult } from "@/lib/engineering-qa/engine";
import {
  requireCancelReview,
  requireRetryStage,
  requireStartReview,
  requireViewQAReports,
} from "@/lib/engineering-qa/permissions";
import type {
  EngineeringCertificate,
  EngineeringReview,
  EngineeringReviewEvent,
  EngineeringReviewStage,
  EngineeringStageResult,
} from "@/lib/types/database";
import { requireExtendedTechnical } from "@/lib/feature-flags/guards";

export type StartStageResult = { status: "started" } | { status: "already_running" };

/** إنشاء مراجعة جديدة + تشغيلها فورًا كـ Background Job. */
export async function createAndStartEngineeringReview(
  projectId: string,
  repoUrl: string,
  repoRef: string
): Promise<CreateReviewResult> {
  await requireExtendedTechnical();
  const auth = await requireStartReview();
  if (!auth.ok) return { ok: false, message: auth.message ?? "غير مسموح." };

  const result = await EngineeringQAEngine.createReview(projectId, repoUrl, repoRef, auth.userId);
  if (!result.ok) {
    revalidatePath(`/dashboard/projects/${projectId}`);
    return result;
  }

  const claimed = await EngineeringQAEngine.tryClaimStartLock(result.review.id);
  if (claimed) {
    after(async () => {
      try {
        await EngineeringQAEngine.runStartCore(result.review.id, auth.userId);
      } catch (err) {
        console.error("[EngineeringQA start background] failed:", err);
      }
    });
  }

  revalidatePath(`/dashboard/projects/${projectId}`);
  return result;
}

/**
 * "Cancel & Supersede" — يبدأ مراجعة جديدة فورًا حتى لو فيه واحدة جارية:
 * يلغي الجارية (cancelling → cancelled)، يربطها بالأحدث للتتبّع، ثم ينشئ
 * مراجعة جديدة ويشغّلها من Stage 1. المستخدم مبيستناش القديمة تخلص، وأي
 * Callback متأخر من القديمة يُتجاهل (حارس execution_id/status في الـ Engine).
 */
export async function supersedeAndStartEngineeringReview(
  projectId: string,
  repoUrl: string,
  repoRef: string
): Promise<CreateReviewResult> {
  await requireExtendedTechnical();
  const auth = await requireStartReview();
  if (!auth.ok) return { ok: false, message: auth.message ?? "غير مسموح." };

  // 1) ألغِ المراجعة النشطة (لو وجدت) — بيحرّر الـ Partial Unique Index
  const supersededId = await EngineeringQAEngine.supersedeActiveReview(projectId, auth.userId);

  // 2) أنشئ المراجعة الجديدة
  const result = await EngineeringQAEngine.createReview(projectId, repoUrl, repoRef, auth.userId);
  if (!result.ok) {
    revalidatePath(`/dashboard/projects/${projectId}`);
    return result;
  }

  // 3) اربط القديمة بالجديدة للتتبّع في History
  if (supersededId) {
    await EngineeringQAEngine.linkSuperseded(supersededId, result.review.id);
  }

  // 4) شغّل الجديدة
  const claimed = await EngineeringQAEngine.tryClaimStartLock(result.review.id);
  if (claimed) {
    after(async () => {
      try {
        await EngineeringQAEngine.runStartCore(result.review.id, auth.userId);
      } catch (err) {
        console.error("[EngineeringQA supersede start background] failed:", err);
      }
    });
  }

  revalidatePath(`/dashboard/projects/${projectId}`);
  return result;
}

/** تشغيل مرحلة واحدة — بيستخدمها الـ Client تلقائيًا (Auto-chain) وكمان لإعادة محاولة مرحلة فشلت. */
export async function runEngineeringQAStage(
  projectId: string,
  reviewId: string,
  stageKey: string,
  isRetry: boolean
): Promise<StartStageResult> {
  await requireExtendedTechnical();
  const auth = isRetry ? await requireRetryStage() : await requireStartReview();
  if (!auth.ok) {
    revalidatePath(`/dashboard/projects/${projectId}`);
    return { status: "already_running" };
  }

  const claimed = await EngineeringQAEngine.tryClaimStageLock(reviewId, stageKey);
  if (!claimed) {
    revalidatePath(`/dashboard/projects/${projectId}`);
    return { status: "already_running" };
  }

  after(async () => {
    try {
      await EngineeringQAEngine.runStageCore(reviewId, stageKey, auth.userId, isRetry);
    } catch (err) {
      console.error("[EngineeringQA stage background] failed:", err);
    }
  });

  revalidatePath(`/dashboard/projects/${projectId}`);
  return { status: "started" };
}

export async function cancelEngineeringReview(projectId: string, reviewId: string): Promise<{
  ok: boolean; message?: string }> {
  await requireExtendedTechnical();
  const auth = await requireCancelReview();
  if (!auth.ok) return { ok: false, message: auth.message ?? "غير مسموح." };

  await EngineeringQAEngine.cancelReview(reviewId, auth.userId);
  revalidatePath(`/dashboard/projects/${projectId}`);
  return { ok: true };
}

export async function getEngineeringQAState(projectId: string): Promise<{
  ok: boolean;
  message?: string;
  reviews: EngineeringReview[];
  currentReview: EngineeringReview | null;
  stages: EngineeringReviewStage[];
  results: EngineeringStageResult[];
  certificate: EngineeringCertificate | null;
  events: EngineeringReviewEvent[];
}> {
  await requireExtendedTechnical();
  const auth = await requireViewQAReports();
  if (!auth.ok) {
    return {
      ok: false,
      message: auth.message ?? "غير مسموح.",
      reviews: [],
      currentReview: null,
      stages: [],
      results: [],
      certificate: null,
      events: [],
    };
  }

  const state = await EngineeringQAEngine.getState(projectId);
  return { ok: true, ...state };
}
