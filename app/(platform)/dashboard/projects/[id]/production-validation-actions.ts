"use server";

import { revalidatePath } from "next/cache";
import { after } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { ProductionValidationEngine } from "@/lib/production-validation/generation-service";
import { getValidationScreenshotUrl } from "@/lib/storage/validation-screenshots";
import { requireManageQA, requireRetryStage, requireStartReview, requireViewQAReports } from "@/lib/engineering-qa/permissions";
import type { ValidationCategoryKey } from "@/lib/types/database";

export type RunTaskResult = { status: "started" } | { status: "already_generating" };

/** تحديث رابط Staging/Preview للمشروع — لازم قبل أي جلسة Production Validation. Manage QA فقط (نفس مستوى صلاحيات الإعدادات الحساسة). */
export async function updateProjectStagingUrl(projectId: string, stagingUrl: string): Promise<{ ok: boolean; message?: string }> {
  const auth = await requireManageQA();
  if (!auth.ok) return { ok: false, message: auth.message ?? "غير مسموح." };

  const supabase = await createClient();
  const { error } = await supabase.from("projects").update({ staging_url: stagingUrl.trim() }).eq("id", projectId);
  if (error) return { ok: false, message: error.message };

  revalidatePath(`/dashboard/projects/${projectId}`);
  return { ok: true };
}

export async function runValidationJourney(projectId: string, sessionId: string, journeyKey: string, isRetry: boolean): Promise<RunTaskResult> {
  const auth = isRetry ? await requireRetryStage() : await requireStartReview();
  if (!auth.ok) {
    revalidatePath(`/dashboard/projects/${projectId}`);
    return { status: "already_generating" };
  }

  const claimed = await ProductionValidationEngine.tryClaimJourneyLock(sessionId, journeyKey);
  if (!claimed) {
    revalidatePath(`/dashboard/projects/${projectId}`);
    return { status: "already_generating" };
  }

  after(async () => {
    try {
      await ProductionValidationEngine.runJourneyCore(sessionId, journeyKey);
    } catch (err) {
      console.error("[ProductionValidation journey background] failed:", err);
    }
  });

  revalidatePath(`/dashboard/projects/${projectId}`);
  return { status: "started" };
}

export async function runValidationCategory(projectId: string, sessionId: string, categoryKey: ValidationCategoryKey, isRetry: boolean): Promise<RunTaskResult> {
  const auth = isRetry ? await requireRetryStage() : await requireStartReview();
  if (!auth.ok) {
    revalidatePath(`/dashboard/projects/${projectId}`);
    return { status: "already_generating" };
  }

  const claimed = await ProductionValidationEngine.tryClaimCategoryLock(sessionId, categoryKey);
  if (!claimed) {
    revalidatePath(`/dashboard/projects/${projectId}`);
    return { status: "already_generating" };
  }

  after(async () => {
    try {
      await ProductionValidationEngine.runCategoryCore(sessionId, categoryKey);
    } catch (err) {
      console.error("[ProductionValidation category background] failed:", err);
    }
  });

  revalidatePath(`/dashboard/projects/${projectId}`);
  return { status: "started" };
}

export async function getProductionValidationState(projectId: string) {
  const auth = await requireViewQAReports();
  if (!auth.ok) return { ok: false as const, message: auth.message ?? "غير مسموح." };
  const state = await ProductionValidationEngine.getState(projectId);
  return { ok: true as const, ...state };
}

export async function getValidationScreenshotSignedUrl(path: string): Promise<string | null> {
  const auth = await requireViewQAReports();
  if (!auth.ok) return null;
  const supabase = await createClient();
  return getValidationScreenshotUrl(supabase, path);
}
