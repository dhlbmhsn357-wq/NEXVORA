import type { SupabaseClient } from "@supabase/supabase-js";
import type { GapReport, PrototypeReview, PrototypeReviewOverallStatus } from "@/lib/types/database";

/**
 * طبقة Review Versioning — كل مراجعة جديدة أو تعديل يدوي (PM Override)
 * بينشئ نسخة جديدة في prototype_review_versions. مفيش حذف لأي مراجعة سابقة.
 */

export async function getOrCreateReview(
  supabase: SupabaseClient,
  projectId: string
): Promise<PrototypeReview> {
  const { data: existing } = await supabase
    .from("prototype_review")
    .select("*")
    .eq("project_id", projectId)
    .maybeSingle();

  if (existing) return existing as PrototypeReview;

  const { data: created, error } = await supabase
    .from("prototype_review")
    .insert({ project_id: projectId, repo_url: "", repo_ref: "" })
    .select("*")
    .single();

  if (error || !created) {
    throw new Error(`فشل إنشاء المراجعة: ${error?.message ?? "سبب غير معروف"}`);
  }
  return created as PrototypeReview;
}

async function insertVersion(
  supabase: SupabaseClient,
  review: PrototypeReview,
  version: number,
  reason: "review_run" | "manual_override",
  createdBy?: string
): Promise<void> {
  await supabase.from("prototype_review_versions").insert({
    review_id: review.id,
    project_id: review.project_id,
    version,
    repo_url: review.repo_url,
    repo_ref: review.repo_ref,
    reviewed_prd_version: review.reviewed_prd_version,
    reviewed_prompt_version: review.reviewed_prompt_version,
    gap_report: review.gap_report,
    completion_percentage: review.completion_percentage,
    overall_status: review.overall_status,
    reason,
    created_by: createdBy ?? null,
  });
}

export async function applyReviewRun(
  supabase: SupabaseClient,
  projectId: string,
  data: {
    repoUrl: string;
    repoRef: string;
    reviewedPrdVersion: number;
    reviewedPromptVersion: number | null;
    gapReport: GapReport;
    completionPercentage: number;
    overallStatus: PrototypeReviewOverallStatus;
  },
  createdBy?: string
): Promise<void> {
  const review = await getOrCreateReview(supabase, projectId);
  const newVersion = review.version + 1;

  const { data: updated } = await supabase
    .from("prototype_review")
    .update({
      repo_url: data.repoUrl,
      repo_ref: data.repoRef,
      reviewed_prd_version: data.reviewedPrdVersion,
      reviewed_prompt_version: data.reviewedPromptVersion,
      gap_report: data.gapReport,
      completion_percentage: data.completionPercentage,
      overall_status: data.overallStatus,
      version: newVersion,
      sync_status: "idle",
      last_error: null,
    })
    .eq("project_id", projectId)
    .select("*")
    .single();

  await insertVersion(
    supabase,
    (updated as PrototypeReview) ?? { ...review, ...data, version: newVersion },
    newVersion,
    "review_run",
    createdBy
  );
}

/**
 * يطبّق تعديل يدوي (PM Override) على عنصر واحد — User Story أو
 * Acceptance Criterion — من غير ما يمسح تقييم AI الأصلي أبدًا.
 */
export async function applyManualOverride(
  supabase: SupabaseClient,
  projectId: string,
  updatedGapReport: GapReport,
  createdBy?: string
): Promise<void> {
  const review = await getOrCreateReview(supabase, projectId);
  const newVersion = review.version + 1;

  const { calculateCompletionPercentage, calculateOverallStatus } = await import("./gap-analyzer");
  const completionPercentage = calculateCompletionPercentage(updatedGapReport);
  const overallStatus = calculateOverallStatus(updatedGapReport, completionPercentage);

  const { data: updated } = await supabase
    .from("prototype_review")
    .update({
      gap_report: updatedGapReport,
      completion_percentage: completionPercentage,
      overall_status: overallStatus,
      version: newVersion,
    })
    .eq("project_id", projectId)
    .select("*")
    .single();

  await insertVersion(
    supabase,
    (updated as PrototypeReview) ?? {
      ...review,
      gap_report: updatedGapReport,
      completion_percentage: completionPercentage,
      overall_status: overallStatus,
      version: newVersion,
    },
    newVersion,
    "manual_override",
    createdBy
  );
}
