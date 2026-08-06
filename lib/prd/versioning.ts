import type { SupabaseClient } from "@supabase/supabase-js";
import type { PRD, PRDSectionKey, PRDVersionReason } from "@/lib/types/database";
import { PRD_SECTION_KEYS } from "@/lib/types/database";
import type { PRDGeneratedData } from "@/lib/ai/validation/prd-generation";

/**
 * طبقة PRD Versioning — كل تعديل فعلي (توليد كامل، توليد جزئي، تعديل
 * يدوي) بيتسجّل هنا كنسخة جديدة، ورقم version بيزيد. مفيش نسخة عند
 * القراءة العادية، ومفيش نسخة سابقة بتتمسح أبدًا.
 */

export async function getOrCreatePrd(
  supabase: SupabaseClient,
  projectId: string
): Promise<PRD> {
  const { data: existing } = await supabase
    .from("prd")
    .select("*")
    .eq("project_id", projectId)
    .maybeSingle();

  if (existing) return existing as PRD;

  const { data: created, error } = await supabase
    .from("prd")
    .insert({ project_id: projectId })
    .select("*")
    .single();

  if (error || !created) {
    throw new Error(`فشل إنشاء PRD: ${error?.message ?? "سبب غير معروف"}`);
  }
  return created as PRD;
}

function snapshotOf(prd: PRD) {
  return {
    overview: prd.overview,
    problem_statement: prd.problem_statement,
    goals: prd.goals,
    out_of_scope: prd.out_of_scope,
    target_users: prd.target_users,
    user_stories: prd.user_stories,
    acceptance_criteria: prd.acceptance_criteria,
    functional_requirements: prd.functional_requirements,
    non_functional_requirements: prd.non_functional_requirements,
    risks_assumptions: prd.risks_assumptions,
    success_metrics: prd.success_metrics,
    status: prd.status,
    generated_from_brain_version: prd.generated_from_brain_version,
  };
}

async function insertVersion(
  supabase: SupabaseClient,
  prd: PRD,
  version: number,
  reason: PRDVersionReason,
  sectionRegenerated: PRDSectionKey | null,
  createdBy?: string
): Promise<void> {
  const snapshot = snapshotOf(prd);
  await supabase.from("prd_versions").insert({
    prd_id: prd.id,
    project_id: prd.project_id,
    version,
    ...snapshot,
    reason,
    section_regenerated: sectionRegenerated,
    created_by: createdBy ?? null,
  });
}

/**
 * يطبّق توليد كامل جديد (11 قسم) — يستبدل كل الأقسام دفعة واحدة.
 */
export async function applyFullGeneration(
  supabase: SupabaseClient,
  projectId: string,
  data: PRDGeneratedData,
  brainVersion: number,
  reason: Extract<PRDVersionReason, "full_generation" | "conflict_replace" | "auto_resync">,
  createdBy?: string
): Promise<void> {
  const prd = await getOrCreatePrd(supabase, projectId);
  const newVersion = prd.version + 1;

  const { data: updated } = await supabase
    .from("prd")
    .update({
      ...data,
      generated_from_brain_version: brainVersion,
      version: newVersion,
      sync_status: "idle",
      last_error: null,
    })
    .eq("project_id", projectId)
    .select("*")
    .single();

  await insertVersion(supabase, (updated as PRD) ?? { ...prd, ...data, version: newVersion, generated_from_brain_version: brainVersion }, newVersion, reason, null, createdBy);
}

/**
 * يطبّق إعادة توليد قسم واحد بس — باقي الأقسام تفضل زي ما هي.
 */
export async function applySectionRegeneration(
  supabase: SupabaseClient,
  projectId: string,
  sectionKey: PRDSectionKey,
  value: unknown,
  brainVersion: number,
  createdBy?: string
): Promise<void> {
  const prd = await getOrCreatePrd(supabase, projectId);
  const newVersion = prd.version + 1;

  const { data: updated } = await supabase
    .from("prd")
    .update({
      [sectionKey]: value,
      generated_from_brain_version: brainVersion,
      version: newVersion,
      sync_status: "idle",
      last_error: null,
    })
    .eq("project_id", projectId)
    .select("*")
    .single();

  await insertVersion(
    supabase,
    (updated as PRD) ?? { ...prd, [sectionKey]: value, version: newVersion },
    newVersion,
    "partial_regeneration",
    sectionKey,
    createdBy
  );
}

/**
 * يطبّق تعديل يدوي على قسم واحد من المستخدم مباشرة.
 */
export async function applyManualSectionEdit(
  supabase: SupabaseClient,
  projectId: string,
  sectionKey: PRDSectionKey,
  value: unknown,
  createdBy?: string
): Promise<void> {
  const prd = await getOrCreatePrd(supabase, projectId);
  const newVersion = prd.version + 1;

  const { data: updated } = await supabase
    .from("prd")
    .update({ [sectionKey]: value, version: newVersion })
    .eq("project_id", projectId)
    .select("*")
    .single();

  await insertVersion(
    supabase,
    (updated as PRD) ?? { ...prd, [sectionKey]: value, version: newVersion },
    newVersion,
    "manual_edit",
    sectionKey,
    createdBy
  );
}

export function isPRDSectionKey(key: string): key is PRDSectionKey {
  return (PRD_SECTION_KEYS as readonly string[]).includes(key);
}
