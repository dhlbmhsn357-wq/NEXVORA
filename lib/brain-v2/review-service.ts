import type { SupabaseClient } from "@supabase/supabase-js";
import { createServiceClient } from "@/lib/supabase/service";
import { computeBrainCompleteness } from "./completeness";
import { recomputeReadiness } from "./service";
import { syncReviewObjectsForDocument } from "./review-objects-service";
import type { BrainContent, BrainSectionKey } from "./types";
import type {
  AssumptionDisposition,
  AssumptionDispositionsMap,
  BrainSettings,
  MissingInfoDisposition,
  MissingInfoDispositionsMap,
  SectionReviewState,
  SectionReviewsMap,
} from "./review-types";

// ============================================================
// Phase 4C — Review Workflow
// ============================================================

async function nextVersion(supabase: SupabaseClient, projectId: string): Promise<number> {
  const { data } = await supabase
    .from("project_brain_documents")
    .select("version")
    .eq("project_id", projectId)
    .order("version", { ascending: false })
    .limit(1)
    .maybeSingle();
  return ((data?.version as number | undefined) ?? 0) + 1;
}

/**
 * تحويل Draft إلى "In Review". لا يعمل لأي حالة غير draft.
 */
export async function startBrainReview(
  documentId: string,
  actorId: string | null
): Promise<{ ok: boolean; message?: string }> {
  const supabase = createServiceClient();
  const { data: doc } = await supabase
    .from("project_brain_documents")
    .select("project_id, content, status")
    .eq("id", documentId)
    .maybeSingle();
  if (!doc) return { ok: false, message: "الوثيقة غير موجودة." };
  if (doc.status !== "draft") {
    return { ok: false, message: "بدء المراجعة مسموح على draft فقط." };
  }
  const { error } = await supabase
    .from("project_brain_documents")
    .update({
      status: "in_review",
      review_started_at: new Date().toISOString(),
      review_started_by: actorId,
    })
    .eq("id", documentId);
  if (error) return { ok: false, message: error.message };

  // Phase 5 — يزامن عناصر المراجعة الفردية (pending_review) لكل عنصر معرفة جديد.
  await syncReviewObjectsForDocument(supabase, documentId, doc.project_id, doc.content as BrainContent);
  return { ok: true };
}

/**
 * تعليم قسم بحالة review (approved/needs_review/rejected).
 */
export async function reviewSection(input: {
  documentId: string;
  sectionKey: BrainSectionKey;
  state: SectionReviewState;
  reason: string | null;
  actorId: string | null;
}): Promise<{ ok: boolean; message?: string }> {
  const supabase = createServiceClient();
  const { data: doc } = await supabase
    .from("project_brain_documents")
    .select("section_reviews, status")
    .eq("id", input.documentId)
    .maybeSingle();
  if (!doc) return { ok: false, message: "الوثيقة غير موجودة." };
  if (doc.status !== "draft" && doc.status !== "in_review") {
    return { ok: false, message: "المراجعة مسموحة على draft/in_review فقط." };
  }
  const current = (doc.section_reviews as SectionReviewsMap) ?? {};
  const next: SectionReviewsMap = {
    ...current,
    [input.sectionKey]: {
      state: input.state,
      reason: input.reason,
      reviewer_id: input.actorId,
      reviewed_at: new Date().toISOString(),
    },
  };
  const { error } = await supabase
    .from("project_brain_documents")
    .update({ section_reviews: next })
    .eq("id", input.documentId);
  if (error) return { ok: false, message: error.message };
  await recomputeReadiness(supabase, input.documentId);
  return { ok: true };
}

export async function setMissingInfoDisposition(input: {
  documentId: string;
  index: number;
  disposition: MissingInfoDisposition;
}): Promise<{ ok: boolean; message?: string }> {
  const supabase = createServiceClient();
  const { data: doc } = await supabase
    .from("project_brain_documents")
    .select("missing_info_dispositions, status")
    .eq("id", input.documentId)
    .maybeSingle();
  if (!doc) return { ok: false, message: "الوثيقة غير موجودة." };
  if (doc.status !== "draft" && doc.status !== "in_review") {
    return { ok: false, message: "التعديل مسموح على draft/in_review فقط." };
  }
  const map = (doc.missing_info_dispositions as MissingInfoDispositionsMap) ?? {};
  const next = { ...map, [String(input.index)]: input.disposition };
  const { error } = await supabase
    .from("project_brain_documents")
    .update({ missing_info_dispositions: next })
    .eq("id", input.documentId);
  if (error) return { ok: false, message: error.message };
  await recomputeReadiness(supabase, input.documentId);
  return { ok: true };
}

export async function setAssumptionDisposition(input: {
  documentId: string;
  index: number;
  disposition: AssumptionDisposition;
}): Promise<{ ok: boolean; message?: string }> {
  const supabase = createServiceClient();
  const { data: doc } = await supabase
    .from("project_brain_documents")
    .select("assumption_dispositions, status")
    .eq("id", input.documentId)
    .maybeSingle();
  if (!doc) return { ok: false, message: "الوثيقة غير موجودة." };
  if (doc.status !== "draft" && doc.status !== "in_review") {
    return { ok: false, message: "التعديل مسموح على draft/in_review فقط." };
  }
  const map = (doc.assumption_dispositions as AssumptionDispositionsMap) ?? {};
  const next = { ...map, [String(input.index)]: input.disposition };
  const { error } = await supabase
    .from("project_brain_documents")
    .update({ assumption_dispositions: next })
    .eq("id", input.documentId);
  if (error) return { ok: false, message: error.message };
  await recomputeReadiness(supabase, input.documentId);
  return { ok: true };
}

/**
 * Request Changes — يعلّم الوثيقة الحالية بالسبب، وينشئ Draft جديد
 * (Version أعلى) نسخة من محتوى الوثيقة الحالية عشان الـ PM يعدّل عليها.
 */
export async function requestBrainChanges(input: {
  documentId: string;
  reason: string;
  actorId: string | null;
}): Promise<
  | { ok: true; newDocumentId: string; newVersion: number }
  | { ok: false; message: string }
> {
  if (!input.reason.trim()) return { ok: false, message: "سبب طلب التعديل مطلوب." };
  const supabase = createServiceClient();
  const { data: doc } = await supabase
    .from("project_brain_documents")
    .select("project_id, content, status, version")
    .eq("id", input.documentId)
    .maybeSingle();
  if (!doc) return { ok: false, message: "الوثيقة غير موجودة." };
  if (doc.status !== "in_review") {
    return { ok: false, message: "طلب التعديل مسموح على in_review فقط." };
  }

  const nowIso = new Date().toISOString();
  await supabase
    .from("project_brain_documents")
    .update({
      changes_requested_at: nowIso,
      changes_requested_by: input.actorId,
      changes_requested_reason: input.reason.trim(),
    })
    .eq("id", input.documentId);

  const v = await nextVersion(supabase, doc.project_id);
  const content = doc.content as BrainContent;
  const completeness = computeBrainCompleteness(content);
  const { data: created, error } = await supabase
    .from("project_brain_documents")
    .insert({
      project_id: doc.project_id,
      version: v,
      status: "draft",
      content,
      completeness_score: completeness,
      previous_version: doc.version,
      change_summary: `طلب تعديل من المراجعة السابقة: ${input.reason.trim()}`,
      created_by: input.actorId,
    })
    .select("id")
    .single();
  if (error || !created) {
    return { ok: false, message: error?.message ?? "فشل إنشاء Draft للتعديل." };
  }
  return { ok: true, newDocumentId: created.id, newVersion: v };
}

// ============================================================
// Brain settings (confidence_threshold)
// ============================================================

export async function getBrainSettings(supabase?: SupabaseClient): Promise<BrainSettings> {
  const sb = supabase ?? createServiceClient();
  const { data } = await sb
    .from("brain_settings")
    .select("*")
    .eq("scope", "global")
    .maybeSingle();
  if (!data) {
    return {
      scope: "global",
      confidence_threshold_percent: 70,
      auto_resync_downstream: false,
      updated_at: new Date().toISOString(),
      updated_by: null,
    };
  }
  return data as BrainSettings;
}

export async function updateBrainSettings(input: {
  confidence_threshold_percent: number;
  auto_resync_downstream?: boolean;
  actorId: string | null;
}): Promise<{ ok: boolean; message?: string }> {
  const supabase = createServiceClient();
  const v = Math.max(0, Math.min(100, Math.round(input.confidence_threshold_percent)));
  const update: Record<string, unknown> = {
    confidence_threshold_percent: v,
    updated_by: input.actorId,
  };
  if (input.auto_resync_downstream !== undefined) {
    update.auto_resync_downstream = input.auto_resync_downstream;
  }
  const { error } = await supabase.from("brain_settings").update(update).eq("scope", "global");
  if (error) return { ok: false, message: error.message };
  return { ok: true };
}
