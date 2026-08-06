import type { SupabaseClient } from "@supabase/supabase-js";
import type {
  PrototypePrompt,
  PrototypePromptSectionKey,
  PrototypePromptVersionReason,
} from "@/lib/types/database";
import { PROTOTYPE_PROMPT_SECTION_KEYS } from "@/lib/types/database";
import type { PrototypePromptSections } from "@/lib/types/database";

/**
 * طبقة Prompt Versioning — كل تعديل فعلي (توليد كامل، توليد جزئي،
 * تعديل يدوي) بيتسجّل هنا كنسخة جديدة. مفيش حذف لأي نسخة سابقة.
 */

export async function getOrCreatePrototypePrompt(
  supabase: SupabaseClient,
  projectId: string
): Promise<PrototypePrompt> {
  const { data: existing } = await supabase
    .from("prototype_prompt")
    .select("*")
    .eq("project_id", projectId)
    .maybeSingle();

  if (existing) return existing as PrototypePrompt;

  const { data: created, error } = await supabase
    .from("prototype_prompt")
    .insert({ project_id: projectId })
    .select("*")
    .single();

  if (error || !created) {
    throw new Error(`فشل إنشاء Prototype Prompt: ${error?.message ?? "سبب غير معروف"}`);
  }
  return created as PrototypePrompt;
}

function snapshotOf(prompt: PrototypePrompt) {
  const sections: Record<string, string> = {};
  for (const key of PROTOTYPE_PROMPT_SECTION_KEYS) {
    sections[key] = prompt[key];
  }
  return {
    ...sections,
    target_tool: prompt.target_tool,
    status: prompt.status,
    generated_from_prd_version: prompt.generated_from_prd_version,
    generated_from_brain_version: prompt.generated_from_brain_version,
  };
}

async function insertVersion(
  supabase: SupabaseClient,
  prompt: PrototypePrompt,
  version: number,
  reason: PrototypePromptVersionReason,
  sectionRegenerated: PrototypePromptSectionKey | null,
  createdBy?: string
): Promise<void> {
  await supabase.from("prototype_prompt_versions").insert({
    prompt_id: prompt.id,
    project_id: prompt.project_id,
    version,
    ...snapshotOf(prompt),
    reason,
    section_regenerated: sectionRegenerated,
    created_by: createdBy ?? null,
  });
}

export async function applyFullGeneration(
  supabase: SupabaseClient,
  projectId: string,
  targetTool: string,
  data: PrototypePromptSections,
  prdVersion: number,
  brainVersion: number,
  reason: Extract<PrototypePromptVersionReason, "full_generation" | "conflict_replace" | "auto_resync">,
  createdBy?: string
): Promise<void> {
  const prompt = await getOrCreatePrototypePrompt(supabase, projectId);
  const newVersion = prompt.version + 1;

  const { data: updated } = await supabase
    .from("prototype_prompt")
    .update({
      ...data,
      target_tool: targetTool,
      generated_from_prd_version: prdVersion,
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
    (updated as PrototypePrompt) ?? { ...prompt, ...data, target_tool: targetTool, version: newVersion },
    newVersion,
    reason,
    null,
    createdBy
  );
}

export async function applySectionRegeneration(
  supabase: SupabaseClient,
  projectId: string,
  sectionKey: PrototypePromptSectionKey,
  value: string,
  prdVersion: number,
  brainVersion: number,
  createdBy?: string
): Promise<void> {
  const prompt = await getOrCreatePrototypePrompt(supabase, projectId);
  const newVersion = prompt.version + 1;

  const { data: updated } = await supabase
    .from("prototype_prompt")
    .update({
      [sectionKey]: value,
      generated_from_prd_version: prdVersion,
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
    (updated as PrototypePrompt) ?? { ...prompt, [sectionKey]: value, version: newVersion },
    newVersion,
    "partial_regeneration",
    sectionKey,
    createdBy
  );
}

export async function applyManualSectionEdit(
  supabase: SupabaseClient,
  projectId: string,
  sectionKey: PrototypePromptSectionKey,
  value: string,
  createdBy?: string
): Promise<void> {
  const prompt = await getOrCreatePrototypePrompt(supabase, projectId);
  const newVersion = prompt.version + 1;

  const { data: updated } = await supabase
    .from("prototype_prompt")
    .update({ [sectionKey]: value, version: newVersion })
    .eq("project_id", projectId)
    .select("*")
    .single();

  await insertVersion(
    supabase,
    (updated as PrototypePrompt) ?? { ...prompt, [sectionKey]: value, version: newVersion },
    newVersion,
    "manual_edit",
    sectionKey,
    createdBy
  );
}
