import type { SupabaseClient } from "@supabase/supabase-js";
import type {
  DeveloperHandoff,
  DeveloperHandoffPackageContent,
  DeveloperHandoffSectionKey,
  DeveloperHandoffStatus,
  DeveloperHandoffVersionReason,
} from "@/lib/types/database";

/**
 * طبقة Developer Handoff Versioning — نفس فلسفة prd/prototype_review:
 * كل تعديل فعلي (توليد كامل، تعديل يدوي لقسم، تغيير حالة) بينشئ نسخة
 * جديدة في developer_handoff_versions. مفيش نسخة سابقة بتتمسح أبدًا.
 */

export async function getOrCreateHandoff(
  supabase: SupabaseClient,
  projectId: string
): Promise<DeveloperHandoff> {
  const { data: existing } = await supabase
    .from("developer_handoff")
    .select("*")
    .eq("project_id", projectId)
    .maybeSingle();

  if (existing) return existing as DeveloperHandoff;

  const { data: created, error } = await supabase
    .from("developer_handoff")
    .insert({ project_id: projectId })
    .select("*")
    .single();

  if (error || !created) {
    throw new Error(`فشل إنشاء Developer Handoff: ${error?.message ?? "سبب غير معروف"}`);
  }
  return created as DeveloperHandoff;
}

async function insertVersion(
  supabase: SupabaseClient,
  handoff: DeveloperHandoff,
  version: number,
  reason: DeveloperHandoffVersionReason,
  sectionRegenerated: DeveloperHandoffSectionKey | null,
  createdBy?: string
): Promise<void> {
  await supabase.from("developer_handoff_versions").insert({
    handoff_id: handoff.id,
    project_id: handoff.project_id,
    version,
    package_content: handoff.package_content,
    repo_url: handoff.repo_url,
    repo_ref: handoff.repo_ref,
    generated_from_prd_version: handoff.generated_from_prd_version,
    generated_from_review_version: handoff.generated_from_review_version,
    generated_from_brain_version: handoff.generated_from_brain_version,
    handoff_status: handoff.handoff_status,
    reason,
    section_regenerated: sectionRegenerated,
    created_by: createdBy ?? null,
  });
}

export async function applyFullGeneration(
  supabase: SupabaseClient,
  projectId: string,
  data: {
    packageContent: DeveloperHandoffPackageContent;
    repoUrl: string;
    repoRef: string;
    generatedFromPrdVersion: number;
    generatedFromReviewVersion: number;
    generatedFromBrainVersion: number;
  },
  createdBy?: string,
  reason: DeveloperHandoffVersionReason = "full_generation"
): Promise<void> {
  const handoff = await getOrCreateHandoff(supabase, projectId);
  const newVersion = handoff.version + 1;

  const { data: updated } = await supabase
    .from("developer_handoff")
    .update({
      package_content: data.packageContent,
      repo_url: data.repoUrl,
      repo_ref: data.repoRef,
      generated_from_prd_version: data.generatedFromPrdVersion,
      generated_from_review_version: data.generatedFromReviewVersion,
      generated_from_brain_version: data.generatedFromBrainVersion,
      version: newVersion,
      sync_status: "idle",
      last_error: null,
    })
    .eq("project_id", projectId)
    .select("*")
    .single();

  await insertVersion(
    supabase,
    (updated as DeveloperHandoff) ?? {
      ...handoff,
      package_content: data.packageContent,
      repo_url: data.repoUrl,
      repo_ref: data.repoRef,
      generated_from_prd_version: data.generatedFromPrdVersion,
      generated_from_review_version: data.generatedFromReviewVersion,
      generated_from_brain_version: data.generatedFromBrainVersion,
      version: newVersion,
    },
    newVersion,
    reason,
    null,
    createdBy
  );
}

export async function applyManualSectionEdit(
  supabase: SupabaseClient,
  projectId: string,
  sectionKey: DeveloperHandoffSectionKey,
  value: unknown,
  createdBy?: string
): Promise<void> {
  const handoff = await getOrCreateHandoff(supabase, projectId);
  const newVersion = handoff.version + 1;
  const updatedPackageContent = { ...handoff.package_content, [sectionKey]: value };

  const { data: updated } = await supabase
    .from("developer_handoff")
    .update({ package_content: updatedPackageContent, version: newVersion })
    .eq("project_id", projectId)
    .select("*")
    .single();

  await insertVersion(
    supabase,
    (updated as DeveloperHandoff) ?? { ...handoff, package_content: updatedPackageContent, version: newVersion },
    newVersion,
    "manual_edit",
    sectionKey,
    createdBy
  );
}

export async function applyStatusChange(
  supabase: SupabaseClient,
  projectId: string,
  status: DeveloperHandoffStatus,
  createdBy?: string
): Promise<void> {
  const handoff = await getOrCreateHandoff(supabase, projectId);
  const newVersion = handoff.version + 1;

  const { data: updated } = await supabase
    .from("developer_handoff")
    .update({ handoff_status: status, version: newVersion })
    .eq("project_id", projectId)
    .select("*")
    .single();

  await insertVersion(
    supabase,
    (updated as DeveloperHandoff) ?? { ...handoff, handoff_status: status, version: newVersion },
    newVersion,
    "status_change",
    null,
    createdBy
  );
}
