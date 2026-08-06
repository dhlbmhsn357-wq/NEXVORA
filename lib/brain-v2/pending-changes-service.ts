import type { SupabaseClient } from "@supabase/supabase-js";
import { createServiceClient } from "@/lib/supabase/service";
import { getLatestApprovedBrain, getLatestBrainDocument, recomputeReadiness } from "./service";
import { computeBrainCompleteness } from "./completeness";
import { resolveChangeAgainstSection } from "./conflict-engine";
import { keyOfItem } from "./diff";
import { CONFIDENCE_BY_SOURCE } from "./knowledge-sources";
import { notifyBrainChanged } from "@/lib/knowledge-sync/resync-engine";
import type { BrainContent, BrainSectionKey } from "./types";
import type { BrainKnowledgeSourceType, BrainPendingChange } from "@/lib/types/database";

export interface KnowledgeCandidate {
  sectionKey: BrainSectionKey;
  newValue: unknown;
  rationale: string;
}

export interface ProposeChangesResult {
  batchId: string | null;
  proposedCount: number;
  duplicateCount: number;
  skippedNoBrain: boolean;
}

/**
 * يحوّل مرشحي معرفة خام (من اجتماع/ملاحظة يدوية/Prototype Review/دعم)
 * إلى Pending Changes حقيقية — بيقارن بآخر نسخة *معتمدة* من Brain (مش
 * أي Draft قائم، عشان المقارنة تكون ضد الحقيقة الرسمية الحالية). لو
 * المشروع لسه ماعندوش Brain معتمد أصلًا (لسه في مرحلة Discovery)، بيتم
 * التجاهل بهدوء — نفس فلسفة mergeMeetingIntoBrain القديمة، الـ Pipeline
 * الجديدة دي مخصّصة للتحديثات بعد وجود Brain، مش لتأسيسه لأول مرة.
 */
export async function proposeChanges(
  projectId: string,
  sourceType: BrainKnowledgeSourceType,
  sourceReference: string,
  summary: string,
  candidates: KnowledgeCandidate[]
): Promise<ProposeChangesResult> {
  const supabase = createServiceClient();

  if (candidates.length === 0) return { batchId: null, proposedCount: 0, duplicateCount: 0, skippedNoBrain: false };

  const approved = await getLatestApprovedBrain(supabase, projectId);
  if (!approved) return { batchId: null, proposedCount: 0, duplicateCount: 0, skippedNoBrain: true };

  const content = approved.content as BrainContent;
  const confidence = CONFIDENCE_BY_SOURCE[sourceType];

  const rows: Array<{
    section_key: string;
    change_type: "add" | "modify";
    new_value: unknown;
    old_value: unknown;
    item_label: string;
    conflict: boolean;
    rationale: string;
  }> = [];
  let duplicateCount = 0;

  for (const candidate of candidates) {
    const section = content[candidate.sectionKey];
    const existingItems = Array.isArray(section?.content) ? (section.content as unknown[]) : [];
    const resolved = resolveChangeAgainstSection(existingItems, candidate.newValue);
    if (resolved.isDuplicate) {
      duplicateCount++;
      continue;
    }
    rows.push({
      section_key: candidate.sectionKey,
      change_type: resolved.changeType,
      new_value: candidate.newValue,
      old_value: resolved.oldValue,
      item_label: resolved.itemLabel,
      conflict: resolved.conflict,
      rationale: candidate.rationale,
    });
  }

  if (rows.length === 0) return { batchId: null, proposedCount: 0, duplicateCount, skippedNoBrain: false };

  const { data: batch, error: batchError } = await supabase
    .from("brain_change_batches")
    .insert({ project_id: projectId, source_type: sourceType, source_reference: sourceReference, summary })
    .select("id")
    .single();
  if (batchError || !batch) return { batchId: null, proposedCount: 0, duplicateCount, skippedNoBrain: false };

  await supabase.from("brain_pending_changes").insert(
    rows.map((r) => ({
      batch_id: batch.id,
      project_id: projectId,
      section_key: r.section_key,
      change_type: r.change_type,
      source_type: sourceType,
      source_reference: sourceReference,
      confidence_score: confidence,
      old_value: r.old_value,
      new_value: r.new_value,
      item_label: r.item_label,
      conflict: r.conflict,
      rationale: r.rationale,
    }))
  );

  return { batchId: batch.id, proposedCount: rows.length, duplicateCount, skippedNoBrain: false };
}

/**
 * يطبّق تغيير واحد مُعتمد على Brain — بنفس منطق mergeMeetingIntoBrain
 * بالظبط (تعديل الـ Draft الحالي في مكانه لو موجود، وإلا إنشاء Draft
 * جديد فوق آخر نسخة معتمدة) — إعادة استخدام، مش تكرار.
 */
async function applyChangeToBrain(
  supabase: SupabaseClient,
  projectId: string,
  sectionKey: BrainSectionKey,
  changeType: "add" | "modify",
  newValue: unknown,
  actorId: string | null,
  reason: string
): Promise<{ ok: boolean; message?: string }> {
  const latest = await getLatestBrainDocument(supabase, projectId);
  if (!latest) return { ok: false, message: "لا يوجد Project Brain لهذا المشروع بعد." };

  const content = latest.content as BrainContent;
  const section = content[sectionKey];
  const existingItems = Array.isArray(section?.content) ? (section.content as unknown[]) : [];

  const finalItems =
    changeType === "add"
      ? [...existingItems, newValue]
      : existingItems.map((it) => (keyOfItem(it) === keyOfItem(newValue) ? newValue : it));

  const nextSection = { ...section, content: finalItems, meta: { ...section.meta, last_updated: new Date().toISOString() } };
  const nextContent = { ...content, [sectionKey]: nextSection };
  const completeness = computeBrainCompleteness(nextContent);
  const editable = latest.status === "draft" || latest.status === "in_review";

  let documentId: string;
  if (editable) {
    const { error } = await supabase
      .from("project_brain_documents")
      .update({ content: nextContent, completeness_score: completeness })
      .eq("id", latest.id);
    if (error) return { ok: false, message: error.message };
    documentId = latest.id;
  } else {
    const { data: created, error } = await supabase
      .from("project_brain_documents")
      .insert({
        project_id: projectId,
        version: latest.version + 1,
        status: "draft",
        content: nextContent,
        completeness_score: completeness,
        based_on_analysis_id: latest.based_on_analysis_id,
        previous_version: latest.version,
        change_summary: reason,
        created_by: actorId,
      })
      .select("id")
      .single();
    if (error || !created) return { ok: false, message: error?.message ?? "تعذّر إنشاء Draft." };
    documentId = created.id;
  }

  await recomputeReadiness(supabase, documentId);
  await supabase.from("project_brain_edits").insert({
    document_id: documentId,
    project_id: projectId,
    section_key: sectionKey,
    before_value: existingItems,
    after_value: finalItems,
    reason,
    edited_by: actorId,
  });

  return { ok: true };
}

async function resolvePendingChange(
  changeId: string,
  actorId: string | null,
  status: "accepted" | "rejected" | "merged",
  overrideValue?: unknown
): Promise<{ ok: boolean; message?: string }> {
  const supabase = createServiceClient();
  const { data: change } = await supabase.from("brain_pending_changes").select("*").eq("id", changeId).maybeSingle();
  if (!change) return { ok: false, message: "التغيير غير موجود." };
  const row = change as BrainPendingChange;
  if (row.status !== "pending") return { ok: false, message: "تم البت في هذا التغيير بالفعل." };

  if (status === "rejected") {
    await supabase.from("brain_pending_changes").update({ status: "rejected", resolved_at: new Date().toISOString(), resolved_by: actorId }).eq("id", changeId);
    return { ok: true };
  }

  const valueToApply = status === "merged" ? overrideValue ?? row.new_value : row.new_value;
  const reasonLabel = status === "merged" ? `دمج معدَّل من ${row.source_type} (${row.source_reference})` : `اعتماد من ${row.source_type} (${row.source_reference})`;

  const result = await applyChangeToBrain(
    supabase,
    row.project_id,
    row.section_key as BrainSectionKey,
    row.change_type === "remove" ? "modify" : row.change_type,
    valueToApply,
    actorId,
    reasonLabel
  );
  if (!result.ok) return result;

  await supabase
    .from("brain_pending_changes")
    .update({ status, resolved_at: new Date().toISOString(), resolved_by: actorId, new_value: valueToApply })
    .eq("id", changeId);

  // Knowledge Graph خفيف — كل معرفة اتقبلت فعليًا بتسجّل حافة "المصدر
  // الحقيقي (اجتماع/ملاحظة/Prototype Review/دعم) → عنصر Brain الناتج"،
  // فوق IDs حقيقية موجودة أصلًا، مش قاعدة Graph منفصلة.
  await supabase.from("brain_knowledge_graph_edges").insert({
    project_id: row.project_id,
    from_type: row.source_type,
    from_id: row.source_reference,
    to_type: row.section_key,
    to_id: row.id,
    relation_type: "produced",
  });

  try {
    await notifyBrainChanged(row.project_id, actorId);
  } catch (err) {
    console.error(`[BrainSync] notifyBrainChanged threw after pending change ${changeId}:`, err);
  }

  return { ok: true };
}

export const acceptPendingChange = (changeId: string, actorId: string | null) => resolvePendingChange(changeId, actorId, "accepted");
export const rejectPendingChange = (changeId: string, actorId: string | null) => resolvePendingChange(changeId, actorId, "rejected");
export const mergePendingChange = (changeId: string, actorId: string | null, mergedValue: unknown) =>
  resolvePendingChange(changeId, actorId, "merged", mergedValue);

export async function listPendingChanges(projectId: string): Promise<BrainPendingChange[]> {
  const supabase = createServiceClient();
  const { data } = await supabase
    .from("brain_pending_changes")
    .select("*")
    .eq("project_id", projectId)
    .eq("status", "pending")
    .order("created_at", { ascending: false });
  return (data as BrainPendingChange[] | null) ?? [];
}
