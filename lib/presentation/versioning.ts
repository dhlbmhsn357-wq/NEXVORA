import type { SupabaseClient } from "@supabase/supabase-js";
import type {
  ClientPresentation,
  ClientPresentationSlideKey,
  ClientPresentationSlides,
  ClientPresentationVersionReason,
} from "@/lib/types/database";

/**
 * طبقة Versioning — نفس نمط PRD/Prototype Prompt الناجح. كل توليد
 * كامل/جزئي/تعديل يدوي ينشئ نسخة جديدة، بدون حذف أي نسخة سابقة.
 */

export async function getOrCreatePresentation(
  supabase: SupabaseClient,
  projectId: string
): Promise<ClientPresentation> {
  const { data: existing } = await supabase
    .from("client_presentations")
    .select("*")
    .eq("project_id", projectId)
    .maybeSingle();

  if (existing) return existing as ClientPresentation;

  const { data: created, error } = await supabase
    .from("client_presentations")
    .insert({ project_id: projectId })
    .select("*")
    .single();

  if (error || !created) {
    throw new Error(`فشل إنشاء عرض العميل: ${error?.message ?? "سبب غير معروف"}`);
  }
  return created as ClientPresentation;
}

async function insertVersion(
  supabase: SupabaseClient,
  presentation: ClientPresentation,
  version: number,
  reason: ClientPresentationVersionReason,
  slideRegenerated: ClientPresentationSlideKey | null,
  createdBy?: string
): Promise<void> {
  await supabase.from("client_presentation_versions").insert({
    presentation_id: presentation.id,
    project_id: presentation.project_id,
    version,
    slides_content: presentation.slides_content,
    generated_from_brain_version: presentation.generated_from_brain_version,
    generated_from_prd_version: presentation.generated_from_prd_version,
    generated_from_review_version: presentation.generated_from_review_version,
    reason,
    slide_regenerated: slideRegenerated,
    created_by: createdBy ?? null,
  });
}

export async function applyFullGeneration(
  supabase: SupabaseClient,
  projectId: string,
  slides: ClientPresentationSlides,
  brainVersion: number,
  prdVersion: number,
  reviewVersion: number | null,
  createdBy?: string,
  reason: ClientPresentationVersionReason = "full_generation"
): Promise<ClientPresentation> {
  const presentation = await getOrCreatePresentation(supabase, projectId);
  const newVersion = presentation.version + 1;

  const { data: updated } = await supabase
    .from("client_presentations")
    .update({
      slides_content: slides,
      generated_from_brain_version: brainVersion,
      generated_from_prd_version: prdVersion,
      generated_from_review_version: reviewVersion,
      version: newVersion,
      status: "idle",
      last_error: null,
    })
    .eq("project_id", projectId)
    .select("*")
    .single();

  const finalPresentation =
    (updated as ClientPresentation) ??
    { ...presentation, slides_content: slides, version: newVersion };

  await insertVersion(supabase, finalPresentation, newVersion, reason, null, createdBy);
  return finalPresentation;
}

export async function applySlideRegeneration(
  supabase: SupabaseClient,
  projectId: string,
  slideKey: ClientPresentationSlideKey,
  value: unknown,
  brainVersion: number,
  prdVersion: number,
  reviewVersion: number | null,
  createdBy?: string
): Promise<ClientPresentation> {
  const presentation = await getOrCreatePresentation(supabase, projectId);
  const newVersion = presentation.version + 1;
  const newSlides = { ...presentation.slides_content, [slideKey]: value };

  const { data: updated } = await supabase
    .from("client_presentations")
    .update({
      slides_content: newSlides,
      generated_from_brain_version: brainVersion,
      generated_from_prd_version: prdVersion,
      generated_from_review_version: reviewVersion,
      version: newVersion,
      status: "idle",
      last_error: null,
    })
    .eq("project_id", projectId)
    .select("*")
    .single();

  const finalPresentation =
    (updated as ClientPresentation) ?? { ...presentation, slides_content: newSlides, version: newVersion };

  await insertVersion(supabase, finalPresentation, newVersion, "partial_regeneration", slideKey, createdBy);
  return finalPresentation;
}

export async function applyManualSlideEdit(
  supabase: SupabaseClient,
  projectId: string,
  slideKey: ClientPresentationSlideKey,
  value: unknown,
  createdBy?: string
): Promise<ClientPresentation> {
  const presentation = await getOrCreatePresentation(supabase, projectId);
  const newVersion = presentation.version + 1;
  const newSlides = { ...presentation.slides_content, [slideKey]: value };

  const { data: updated } = await supabase
    .from("client_presentations")
    .update({ slides_content: newSlides, version: newVersion })
    .eq("project_id", projectId)
    .select("*")
    .single();

  const finalPresentation =
    (updated as ClientPresentation) ?? { ...presentation, slides_content: newSlides, version: newVersion };

  await insertVersion(supabase, finalPresentation, newVersion, "manual_edit", slideKey, createdBy);
  return finalPresentation;
}
