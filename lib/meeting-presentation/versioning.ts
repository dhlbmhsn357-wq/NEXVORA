import type { SupabaseClient } from "@supabase/supabase-js";
import type { MeetingPresentation, MeetingPresentationSlideKey, MeetingPresentationSlides } from "@/lib/types/database";

/**
 * Versioning — نفس نمط Client Presentation/PRD الناجح، بفرق واحد: كل
 * مشروع ممكن يكون عنده أكتر من عرض اجتماع عبر الزمن (عرض لكل اجتماع)،
 * مش صف واحد ثابت. الـ "Draft الحالي" هو آخر عرض لسه معندوش meeting_id
 * (لسه محضّر لاجتماع جاي، مش بدأ). أول ما "ابدأ الاجتماع" يتضغط،
 * meeting_id بيتحط، وأي Generate جديد بعد كده بيعمل صف جديد تلقائيًا.
 */

export async function getOrCreateDraftPresentation(
  supabase: SupabaseClient,
  projectId: string
): Promise<MeetingPresentation> {
  const { data: existing } = await supabase
    .from("meeting_presentations")
    .select("*")
    .eq("project_id", projectId)
    .is("meeting_id", null)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (existing) return existing as MeetingPresentation;

  const { data: created, error } = await supabase
    .from("meeting_presentations")
    .insert({ project_id: projectId })
    .select("*")
    .single();

  if (error || !created) {
    throw new Error(`فشل إنشاء عرض اجتماع جديد: ${error?.message ?? "سبب غير معروف"}`);
  }
  return created as MeetingPresentation;
}

export async function getPresentationById(
  supabase: SupabaseClient,
  presentationId: string
): Promise<MeetingPresentation | null> {
  const { data } = await supabase.from("meeting_presentations").select("*").eq("id", presentationId).maybeSingle();
  return (data as MeetingPresentation | null) ?? null;
}

async function insertVersion(
  supabase: SupabaseClient,
  presentation: MeetingPresentation,
  reason: string,
  slideRegenerated: MeetingPresentationSlideKey | null,
  createdBy?: string | null
): Promise<void> {
  await supabase.from("meeting_presentation_versions").insert({
    presentation_id: presentation.id,
    project_id: presentation.project_id,
    version: presentation.version,
    reason,
    slide_regenerated: slideRegenerated,
    created_by: createdBy ?? null,
  });
}

export async function applyFullGeneration(
  supabase: SupabaseClient,
  presentationId: string,
  slides: MeetingPresentationSlides,
  overallConfidence: number | null,
  createdBy?: string | null,
  reason = "full_generation"
): Promise<MeetingPresentation> {
  const { data: current } = await supabase.from("meeting_presentations").select("version").eq("id", presentationId).single();
  const newVersion = (current?.version ?? 0) + 1;

  const { data: updated, error } = await supabase
    .from("meeting_presentations")
    .update({
      slides,
      overall_confidence: overallConfidence,
      version: newVersion,
      status: "ready",
      last_error: null,
      generation_claimed_at: null,
      updated_at: new Date().toISOString(),
    })
    .eq("id", presentationId)
    .select("*")
    .single();

  if (error || !updated) throw new Error(`فشل حفظ العرض: ${error?.message ?? "سبب غير معروف"}`);
  const finalPresentation = updated as MeetingPresentation;
  await insertVersion(supabase, finalPresentation, reason, null, createdBy);
  return finalPresentation;
}

export async function applySlideRegeneration(
  supabase: SupabaseClient,
  presentationId: string,
  slideKey: MeetingPresentationSlideKey,
  value: unknown,
  createdBy?: string | null
): Promise<MeetingPresentation> {
  const { data: current } = await supabase.from("meeting_presentations").select("version, slides").eq("id", presentationId).single();
  const newVersion = (current?.version ?? 0) + 1;
  const newSlides = { ...(current?.slides as MeetingPresentationSlides), [slideKey]: value };

  const { data: updated, error } = await supabase
    .from("meeting_presentations")
    .update({ slides: newSlides, version: newVersion, status: "ready", last_error: null, generation_claimed_at: null, updated_at: new Date().toISOString() })
    .eq("id", presentationId)
    .select("*")
    .single();

  if (error || !updated) throw new Error(`فشل حفظ الشريحة: ${error?.message ?? "سبب غير معروف"}`);
  const finalPresentation = updated as MeetingPresentation;
  await insertVersion(supabase, finalPresentation, "partial_regeneration", slideKey, createdBy);
  return finalPresentation;
}

export async function applyManualSlideEdit(
  supabase: SupabaseClient,
  presentationId: string,
  slideKey: MeetingPresentationSlideKey,
  value: unknown,
  createdBy?: string | null
): Promise<MeetingPresentation> {
  const { data: current } = await supabase.from("meeting_presentations").select("version, slides").eq("id", presentationId).single();
  const newVersion = (current?.version ?? 0) + 1;
  const newSlides = { ...(current?.slides as MeetingPresentationSlides), [slideKey]: value };

  const { data: updated, error } = await supabase
    .from("meeting_presentations")
    .update({ slides: newSlides, version: newVersion, updated_at: new Date().toISOString() })
    .eq("id", presentationId)
    .select("*")
    .single();

  if (error || !updated) throw new Error(`فشل حفظ التعديل: ${error?.message ?? "سبب غير معروف"}`);
  const finalPresentation = updated as MeetingPresentation;
  await insertVersion(supabase, finalPresentation, "manual_edit", slideKey, createdBy);
  return finalPresentation;
}
