import type { SupabaseClient } from "@supabase/supabase-js";
import { KNOWLEDGE_SOURCE_LABELS } from "@/lib/brain-v2/knowledge-sources";
import type { BrainKnowledgeSourceType } from "@/lib/types/database";

export type TimelineSource =
  | "project_brain"
  | "prd"
  | "prototype_prompt"
  | "prototype_review"
  | "client_presentation"
  | "developer_handoff"
  | "whatsapp_message"
  | "discovery_link"
  | "brain_v2"
  | "engineering_qa"
  | "meeting_presentation";

export interface TimelineEntry {
  source: TimelineSource;
  sourceLabel: string;
  version: number;
  reason: string;
  detail: string | null;
  createdBy: string | null;
  createdByName: string | null;
  createdAt: string;
}

const sourceLabels: Record<TimelineSource, string> = {
  project_brain: "Project Brain (Legacy)",
  prd: "PRD",
  prototype_prompt: "Prototype Prompt",
  prototype_review: "Prototype Review",
  client_presentation: "Client Presentation",
  developer_handoff: "Developer Handoff",
  whatsapp_message: "WhatsApp",
  discovery_link: "Discovery Link",
  brain_v2: "Project Brain",
  engineering_qa: "Engineering QA",
  meeting_presentation: "Meeting Presentation",
};

const qaEventLabels: Record<string, string> = {
  review_created: "تم إنشاء المراجعة",
  review_started: "بدأ تنفيذ المراجعة",
  stage_started: "بدأت مرحلة",
  stage_finished: "انتهت مرحلة",
  stage_failed: "فشلت مرحلة",
  stage_retried: "أُعيدت محاولة مرحلة",
  stage_cancelled: "أُلغيت مرحلة",
  review_completed: "اكتملت المراجعة",
  review_cancelled: "أُلغيت المراجعة",
  certificate_generated: "تم إصدار شهادة",
};

const meetingLifecycleLabels: Record<string, string> = {
  planned: "تم تجهيز الاجتماع من العرض التقديمي",
  started: "بدأ الاجتماع (Live Meeting Mode)",
  finished: "انتهى الاجتماع",
  transcript_uploaded: "تم رفع تسجيل الاجتماع",
  analysis_completed: "اكتمل تحليل الاجتماع (Meeting Review)",
  brain_updated: "تحديث على Project Brain من الاجتماع",
  presentation_updated: "اكتملت مراجعة العرض التقديمي بعد الاجتماع",
};

const whatsappPurposeLabels: Record<string, string> = {
  discovery_invitation: "دعوة اكتشاف",
  reminder_before_open: "تذكير قبل الفتح",
  reminder_before_completion: "تذكير قبل الإكمال",
  thank_you: "شكر بعد التسليم",
  manual: "رسالة يدوية",
};

const whatsappStatusLabels: Record<string, string> = {
  queued: "في الانتظار",
  sent: "تم الإرسال",
  delivered: "تم التسليم",
  read: "تمّت القراءة",
  failed: "فشل",
  received: "وارد",
};

const linkEventLabels: Record<string, string> = {
  generated: "تم إنشاء رابط اكتشاف",
  generated_for_whatsapp: "تم إنشاء رابط للإرسال على واتساب",
  regenerated_for_whatsapp: "تم توليد رابط جديد للواتساب",
  opened: "العميل فتح الرابط",
  submitted: "العميل أرسل النموذج",
  reopened: "أعيد فتح النموذج",
  cancelled: "تم إيقاف الرابط",
};

/**
 * طبقة Audit Trail موحّدة — قراءة فقط، بتجمع من جداول الـ *_versions
 * الموجودة بالفعل (كل واحد فيها Snapshot كامل، مش سطر نص) وترتّبها
 * في خط زمني واحد. صفر جدول جديد للبيانات نفسها — العرض بس اللي جديد.
 */
export async function getProjectTimeline(
  supabase: SupabaseClient,
  projectId: string
): Promise<TimelineEntry[]> {
  const [
    brain,
    prd,
    prompt,
    review,
    presentation,
    handoff,
    profiles,
    waMessages,
    linkAudit,
    brainV2Docs,
    brainV2Edits,
    brainRejectedChanges,
    qaEvents,
    meetingLifecycleEvents,
  ] = await Promise.all([
    supabase
      .from("project_brain_versions")
      .select("version, reason, is_manual, created_by, created_at")
      .eq("project_id", projectId),
    supabase
      .from("prd_versions")
      .select("version, reason, section_regenerated, created_by, created_at")
      .eq("project_id", projectId),
    supabase
      .from("prototype_prompt_versions")
      .select("version, reason, section_regenerated, created_by, created_at")
      .eq("project_id", projectId),
    supabase
      .from("prototype_review_versions")
      .select("version, reason, created_by, created_at")
      .eq("project_id", projectId),
    supabase
      .from("client_presentation_versions")
      .select("version, reason, slide_regenerated, created_by, created_at")
      .eq("project_id", projectId),
    supabase
      .from("developer_handoff_versions")
      .select("version, reason, section_regenerated, created_by, created_at")
      .eq("project_id", projectId),
    supabase.from("profiles").select("id, full_name, email"),
    supabase
      .from("whatsapp_messages")
      .select("id, purpose, status, reminder_index, created_by, created_at, phone")
      .eq("project_id", projectId),
    supabase
      .from("audit_log")
      .select("actor_id, changes, created_at")
      .eq("entity_type", "discovery_link")
      .contains("changes", { project_id: projectId }),
    supabase
      .from("project_brain_documents")
      .select(
        "id, version, status, created_at, created_by, approved_at, approved_by, rejected_at, rejected_by, review_started_at, review_started_by, changes_requested_at, changes_requested_by, changes_requested_reason, rejection_reason, change_summary"
      )
      .eq("project_id", projectId),
    supabase
      .from("project_brain_edits")
      .select("section_key, reason, edited_by, edited_at")
      .eq("project_id", projectId)
      .order("edited_at", { ascending: false })
      .limit(50),
    supabase
      .from("brain_pending_changes")
      .select("id, section_key, source_type, status, conflict, rationale, resolved_at, resolved_by")
      .eq("project_id", projectId)
      .not("resolved_at", "is", null)
      .order("resolved_at", { ascending: false })
      .limit(50),
    supabase
      .from("engineering_review_events")
      .select("event_type, stage_key, detail, actor_id, created_at, engineering_reviews(review_number)")
      .eq("project_id", projectId)
      .order("created_at", { ascending: false })
      .limit(100),
    supabase
      .from("meeting_lifecycle_events")
      .select("event_type, detail, actor_id, created_at")
      .eq("project_id", projectId)
      .order("created_at", { ascending: false })
      .limit(100),
  ]);

  const nameById = new Map<string, string>();
  for (const p of profiles.data ?? []) {
    nameById.set(p.id, p.full_name || p.email || p.id);
  }

  const entries: TimelineEntry[] = [];

  for (const v of brain.data ?? []) {
    entries.push({
      source: "project_brain",
      sourceLabel: sourceLabels.project_brain,
      version: v.version,
      reason: v.reason,
      detail: v.is_manual ? "تعديل يدوي" : null,
      createdBy: v.created_by,
      createdByName: v.created_by ? (nameById.get(v.created_by) ?? null) : null,
      createdAt: v.created_at,
    });
  }

  for (const v of prd.data ?? []) {
    entries.push({
      source: "prd",
      sourceLabel: sourceLabels.prd,
      version: v.version,
      reason: v.reason,
      detail: v.section_regenerated,
      createdBy: v.created_by,
      createdByName: v.created_by ? (nameById.get(v.created_by) ?? null) : null,
      createdAt: v.created_at,
    });
  }

  for (const v of prompt.data ?? []) {
    entries.push({
      source: "prototype_prompt",
      sourceLabel: sourceLabels.prototype_prompt,
      version: v.version,
      reason: v.reason,
      detail: v.section_regenerated,
      createdBy: v.created_by,
      createdByName: v.created_by ? (nameById.get(v.created_by) ?? null) : null,
      createdAt: v.created_at,
    });
  }

  for (const v of review.data ?? []) {
    entries.push({
      source: "prototype_review",
      sourceLabel: sourceLabels.prototype_review,
      version: v.version,
      reason: v.reason,
      detail: null,
      createdBy: v.created_by,
      createdByName: v.created_by ? (nameById.get(v.created_by) ?? null) : null,
      createdAt: v.created_at,
    });
  }

  for (const v of presentation.data ?? []) {
    entries.push({
      source: "client_presentation",
      sourceLabel: sourceLabels.client_presentation,
      version: v.version,
      reason: v.reason,
      detail: v.slide_regenerated,
      createdBy: v.created_by,
      createdByName: v.created_by ? (nameById.get(v.created_by) ?? null) : null,
      createdAt: v.created_at,
    });
  }

  for (const v of handoff.data ?? []) {
    entries.push({
      source: "developer_handoff",
      sourceLabel: sourceLabels.developer_handoff,
      version: v.version,
      reason: v.reason,
      detail: v.section_regenerated,
      createdBy: v.created_by,
      createdByName: v.created_by ? (nameById.get(v.created_by) ?? null) : null,
      createdAt: v.created_at,
    });
  }

  for (const m of waMessages.data ?? []) {
    const purposeLabel = whatsappPurposeLabels[m.purpose as string] ?? m.purpose;
    const statusLabel = whatsappStatusLabels[m.status as string] ?? m.status;
    const reason =
      (m.reminder_index ?? 0) > 0
        ? `تذكير رقم ${m.reminder_index} — ${purposeLabel}`
        : purposeLabel;
    entries.push({
      source: "whatsapp_message",
      sourceLabel: sourceLabels.whatsapp_message,
      version: 1,
      reason,
      detail: `${statusLabel} · ${m.phone}`,
      createdBy: m.created_by,
      createdByName: m.created_by ? (nameById.get(m.created_by) ?? null) : null,
      createdAt: m.created_at,
    });
  }

  for (const row of linkAudit.data ?? []) {
    const changes = (row.changes ?? {}) as { event?: string };
    const label = changes.event ? (linkEventLabels[changes.event] ?? changes.event) : "حدث";
    entries.push({
      source: "discovery_link",
      sourceLabel: sourceLabels.discovery_link,
      version: 1,
      reason: label,
      detail: null,
      createdBy: row.actor_id,
      createdByName: row.actor_id ? (nameById.get(row.actor_id) ?? null) : null,
      createdAt: row.created_at,
    });
  }

  // Brain v2 — كل حدث في دورة حياة الوثيقة (Created / Review Started /
  // Approved / Rejected / Changes Requested). Manual edits تُدرَج من
  // project_brain_edits.
  for (const d of (brainV2Docs.data ?? []) as Array<{
    id: string;
    version: number;
    status: string;
    created_at: string;
    created_by: string | null;
    approved_at: string | null;
    approved_by: string | null;
    rejected_at: string | null;
    rejected_by: string | null;
    review_started_at: string | null;
    review_started_by: string | null;
    changes_requested_at: string | null;
    changes_requested_by: string | null;
    changes_requested_reason: string | null;
    rejection_reason: string | null;
    change_summary: string | null;
  }>) {
    entries.push({
      source: "brain_v2",
      sourceLabel: sourceLabels.brain_v2,
      version: d.version,
      reason: "أُنشئ Draft",
      detail: d.change_summary,
      createdBy: d.created_by,
      createdByName: d.created_by ? (nameById.get(d.created_by) ?? null) : null,
      createdAt: d.created_at,
    });
    if (d.review_started_at) {
      entries.push({
        source: "brain_v2",
        sourceLabel: sourceLabels.brain_v2,
        version: d.version,
        reason: "بدأت المراجعة",
        detail: null,
        createdBy: d.review_started_by,
        createdByName: d.review_started_by ? (nameById.get(d.review_started_by) ?? null) : null,
        createdAt: d.review_started_at,
      });
    }
    if (d.approved_at) {
      entries.push({
        source: "brain_v2",
        sourceLabel: sourceLabels.brain_v2,
        version: d.version,
        reason: "تم الاعتماد",
        detail: null,
        createdBy: d.approved_by,
        createdByName: d.approved_by ? (nameById.get(d.approved_by) ?? null) : null,
        createdAt: d.approved_at,
      });
    }
    if (d.rejected_at) {
      entries.push({
        source: "brain_v2",
        sourceLabel: sourceLabels.brain_v2,
        version: d.version,
        reason: "تم الرفض",
        detail: d.rejection_reason,
        createdBy: d.rejected_by,
        createdByName: d.rejected_by ? (nameById.get(d.rejected_by) ?? null) : null,
        createdAt: d.rejected_at,
      });
    }
    if (d.changes_requested_at) {
      entries.push({
        source: "brain_v2",
        sourceLabel: sourceLabels.brain_v2,
        version: d.version,
        reason: "طلب تعديل",
        detail: d.changes_requested_reason,
        createdBy: d.changes_requested_by,
        createdByName: d.changes_requested_by ? (nameById.get(d.changes_requested_by) ?? null) : null,
        createdAt: d.changes_requested_at,
      });
    }
  }

  for (const e of (brainV2Edits.data ?? []) as Array<{
    section_key: string;
    reason: string | null;
    edited_by: string | null;
    edited_at: string;
  }>) {
    entries.push({
      source: "brain_v2",
      sourceLabel: sourceLabels.brain_v2,
      version: 0,
      reason: `تعديل يدوي: ${e.section_key}`,
      detail: e.reason,
      createdBy: e.edited_by,
      createdByName: e.edited_by ? (nameById.get(e.edited_by) ?? null) : null,
      createdAt: e.edited_at,
    });
  }

  for (const c of (brainRejectedChanges.data ?? []) as Array<{
    id: string;
    section_key: string;
    source_type: BrainKnowledgeSourceType;
    status: string;
    conflict: boolean;
    rationale: string | null;
    resolved_at: string;
    resolved_by: string | null;
  }>) {
    const sourceLabel = KNOWLEDGE_SOURCE_LABELS[c.source_type] ?? c.source_type;
    const reason =
      c.status === "rejected"
        ? c.conflict
          ? `رُفض تغيير معلّق (تعارض) — ${c.section_key}`
          : `رُفض تغيير معلّق — ${c.section_key}`
        : c.status === "merged"
          ? `تم دمج تغيير معلّق — ${c.section_key}`
          : `تم قبول تغيير معلّق — ${c.section_key}`;
    entries.push({
      source: "brain_v2",
      sourceLabel: sourceLabels.brain_v2,
      version: 0,
      reason,
      detail: c.rationale ? `المصدر: ${sourceLabel} — ${c.rationale}` : `المصدر: ${sourceLabel}`,
      createdBy: c.resolved_by,
      createdByName: c.resolved_by ? (nameById.get(c.resolved_by) ?? null) : null,
      createdAt: c.resolved_at,
    });
  }

  for (const e of (qaEvents.data ?? []) as Array<{
    event_type: string;
    stage_key: string | null;
    detail: string | null;
    actor_id: string | null;
    created_at: string;
    engineering_reviews: unknown;
  }>) {
    const reviewRel = Array.isArray(e.engineering_reviews) ? e.engineering_reviews[0] : e.engineering_reviews;
    const reviewNumber = (reviewRel as { review_number?: number } | null)?.review_number ?? 0;
    const label = qaEventLabels[e.event_type] ?? e.event_type;
    entries.push({
      source: "engineering_qa",
      sourceLabel: sourceLabels.engineering_qa,
      version: reviewNumber,
      reason: e.stage_key ? `${label} — ${e.stage_key}` : label,
      detail: e.detail,
      createdBy: e.actor_id,
      createdByName: e.actor_id ? (nameById.get(e.actor_id) ?? null) : null,
      createdAt: e.created_at,
    });
  }

  for (const e of (meetingLifecycleEvents.data ?? []) as Array<{
    event_type: string;
    detail: string | null;
    actor_id: string | null;
    created_at: string;
  }>) {
    entries.push({
      source: "meeting_presentation",
      sourceLabel: sourceLabels.meeting_presentation,
      version: 0,
      reason: meetingLifecycleLabels[e.event_type] ?? e.event_type,
      detail: e.detail,
      createdBy: e.actor_id,
      createdByName: e.actor_id ? (nameById.get(e.actor_id) ?? null) : null,
      createdAt: e.created_at,
    });
  }

  entries.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
  return entries;
}
