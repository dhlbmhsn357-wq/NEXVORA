import type { SupabaseClient } from "@supabase/supabase-js";
import { createServiceClient } from "@/lib/supabase/service";
import { resolveNotificationTarget } from "@/lib/navigation/targets";
import type { NotificationSeverity } from "@/lib/types/database";

function projectNameOf(rel: unknown): string | null {
  if (Array.isArray(rel)) return (rel[0] as { name?: string } | undefined)?.name ?? null;
  return (rel as { name?: string } | null)?.name ?? null;
}

export interface NotificationCandidate {
  dedupeKey: string;
  type: string;
  category: string;
  severity: NotificationSeverity;
  projectId: string | null;
  recordId: string | null;
  title: string;
  message: string;
}

/**
 * نفس منطق اكتشاف الإشعارات الأصلي بالضبط (9 مصادر حقيقية، نفس
 * الشروط) — منقول من notifications-actions.ts القديم بدون أي تغيير في
 * قواعد الاكتشاف نفسها، الفرق الوحيد إننا بنبني مرشحين لجدول حقيقي
 * دلوقتي بدل حساب حي في كل تحميل صفحة.
 */
export async function gatherNotificationCandidates(supabase: SupabaseClient): Promise<NotificationCandidate[]> {
  const [
    { data: blockedReviews },
    { data: pendingSupport },
    { data: discoveryLinks },
    { data: waFailed },
    { data: analysisRows },
    { data: brainDocs },
    { data: qaReviews },
    { data: criticalIncidents },
    { data: pendingKnowledge },
  ] = await Promise.all([
    supabase.from("prototype_review").select("project_id, projects(name)").eq("overall_status", "blocked").limit(10),
    supabase
      .from("support_requests")
      .select("id, project_id, projects(name)")
      .in("resolution_status", ["escalated", "in_progress"])
      .limit(10),
    supabase
      .from("discovery_form_links")
      .select("id, project_id, status, projects(name)")
      .in("status", ["opened", "in_progress", "submitted", "expired"])
      .limit(20),
    supabase
      .from("whatsapp_messages")
      .select("id, project_id, purpose, projects(name)")
      .eq("status", "failed")
      .is("acknowledged_at", null)
      .limit(10),
    supabase
      .from("discovery_analyses")
      .select("id, project_id, status, finished_at, acknowledged_at, projects(name)")
      .in("status", ["completed", "failed"])
      .is("acknowledged_at", null)
      .order("finished_at", { ascending: false })
      .limit(20),
    supabase
      .from("project_brain_documents")
      .select("id, project_id, status, version, created_at, approved_at, rejected_at, changes_requested_at, review_started_at, projects(name)")
      .in("status", ["draft", "in_review", "approved", "rejected"])
      .order("updated_at", { ascending: false })
      .limit(30),
    supabase
      .from("engineering_reviews")
      .select("id, project_id, review_number, review_status, projects(name)")
      .in("review_status", ["failed", "needs_review"])
      .is("acknowledged_at", null)
      .limit(10),
    supabase
      .from("monitoring_incidents")
      .select("id, project_id, title, projects(name)")
      .eq("severity", "critical")
      .eq("status", "open")
      .limit(20),
    supabase.from("organizational_knowledge").select("id, title").eq("status", "validated").limit(10),
  ]);

  // معرفة معلّقة من Project Brain Synchronization Engine — إشعار واحد
  // مجمّع لكل مشروع (مش واحد لكل تغيير) عشان ما نغرقش المستخدم.
  const { data: pendingBrainChanges } = await supabase
    .from("brain_pending_changes")
    .select("id, project_id, projects(name)")
    .eq("status", "pending")
    .limit(200);

  // أحداث دورة حياة الاجتماع (Meeting Presentation) — إشعار لكل مرحلة
  // مهمة (بدء/انتهاء/رفع تسجيل/اكتمال تحليل/تحديث Brain). "التعارض" في
  // البيانات مغطّى أصلًا عبر brain_pending_change (conflict=true ضمنها).
  const NOTIFIABLE_LIFECYCLE_EVENTS = ["started", "finished", "transcript_uploaded", "analysis_completed", "brain_updated"] as const;
  const { data: lifecycleEvents } = await supabase
    .from("meeting_lifecycle_events")
    .select("id, meeting_id, project_id, event_type, detail, created_at, projects(name), meetings(title)")
    .in("event_type", NOTIFIABLE_LIFECYCLE_EVENTS)
    .order("created_at", { ascending: false })
    .limit(100);

  const candidates: NotificationCandidate[] = [];

  for (const r of (blockedReviews ?? []) as Array<{ project_id: string; projects: unknown }>) {
    const projectName = projectNameOf(r.projects);
    if (!projectName) continue;
    candidates.push({
      dedupeKey: `blocked-${r.project_id}`,
      type: "blocked_review",
      category: "review",
      severity: "critical",
      projectId: r.project_id,
      recordId: null,
      title: "مراجعة Prototype محظورة",
      message: `مراجعة Prototype لمشروع "${projectName}" في حالة Blocked`,
    });
  }

  for (const s of (pendingSupport ?? []) as Array<{ id: string; project_id: string; projects: unknown }>) {
    const projectName = projectNameOf(s.projects);
    if (!projectName) continue;
    candidates.push({
      dedupeKey: `support-${s.id}`,
      type: "pending_support",
      category: "support",
      severity: "warning",
      projectId: s.project_id,
      recordId: s.id,
      title: "طلب دعم بانتظار المتابعة",
      message: `طلب دعم بانتظار المتابعة في "${projectName}"`,
    });
  }

  for (const w of (waFailed ?? []) as Array<{ id: string; project_id: string; purpose: string; projects: unknown }>) {
    const projectName = projectNameOf(w.projects);
    if (!projectName) continue;
    candidates.push({
      dedupeKey: `wa-failed-${w.id}`,
      type: "whatsapp_send_failed",
      category: "communication",
      severity: "warning",
      projectId: w.project_id,
      recordId: w.id,
      title: "فشل إرسال رسالة واتساب",
      message: `فشل إرسال رسالة واتساب لمشروع "${projectName}"`,
    });
  }

  for (const d of (brainDocs ?? []) as Array<{
    id: string;
    project_id: string;
    status: string;
    version: number;
    changes_requested_at: string | null;
    projects: unknown;
  }>) {
    const projectName = projectNameOf(d.projects);
    if (!projectName) continue;
    if (d.changes_requested_at) {
      candidates.push({
        dedupeKey: `brain-changes-${d.id}`,
        type: "brain_changes_requested",
        category: "brain",
        severity: "warning",
        projectId: d.project_id,
        recordId: d.id,
        title: "طُلبت تعديلات على Brain",
        message: `طُلبت تعديلات على Brain v${d.version} لمشروع "${projectName}"`,
      });
    }
    if (d.status === "draft") {
      candidates.push({
        dedupeKey: `brain-draft-${d.id}`,
        type: "brain_draft_created",
        category: "brain",
        severity: "info",
        projectId: d.project_id,
        recordId: d.id,
        title: "Draft جديد لـ Project Brain",
        message: `Draft جديد لـ Project Brain (v${d.version}) لمشروع "${projectName}" — بانتظار المراجعة`,
      });
    } else if (d.status === "in_review") {
      candidates.push({
        dedupeKey: `brain-review-${d.id}`,
        type: "brain_in_review",
        category: "brain",
        severity: "info",
        projectId: d.project_id,
        recordId: d.id,
        title: "Brain قيد المراجعة",
        message: `Brain v${d.version} لمشروع "${projectName}" قيد المراجعة`,
      });
    } else if (d.status === "approved") {
      candidates.push({
        dedupeKey: `brain-approved-${d.id}`,
        type: "brain_approved",
        category: "brain",
        severity: "info",
        projectId: d.project_id,
        recordId: d.id,
        title: "تم اعتماد Project Brain",
        message: `تم اعتماد Project Brain v${d.version} لمشروع "${projectName}"`,
      });
    } else {
      candidates.push({
        dedupeKey: `brain-rejected-${d.id}`,
        type: "brain_rejected",
        category: "brain",
        severity: "warning",
        projectId: d.project_id,
        recordId: d.id,
        title: "تم رفض Brain",
        message: `تم رفض Brain v${d.version} لمشروع "${projectName}"`,
      });
    }
  }

  for (const a of (analysisRows ?? []) as Array<{ id: string; project_id: string; status: string; projects: unknown }>) {
    const projectName = projectNameOf(a.projects);
    if (!projectName) continue;
    if (a.status === "completed") {
      candidates.push({
        dedupeKey: `analysis-completed-${a.id}`,
        type: "discovery_analysis_completed",
        category: "discovery",
        severity: "info",
        projectId: a.project_id,
        recordId: a.id,
        title: "تحليل الاكتشاف جاهز",
        message: `تم تحليل مشروع "${projectName}" — النتيجة جاهزة`,
      });
    } else {
      candidates.push({
        dedupeKey: `analysis-failed-${a.id}`,
        type: "discovery_analysis_failed",
        category: "discovery",
        severity: "warning",
        projectId: a.project_id,
        recordId: a.id,
        title: "فشل تحليل الاكتشاف",
        message: `فشل تحليل مشروع "${projectName}"`,
      });
    }
  }

  for (const l of (discoveryLinks ?? []) as Array<{ id: string; project_id: string; status: string; projects: unknown }>) {
    const projectName = projectNameOf(l.projects);
    if (!projectName) continue;
    if (l.status === "submitted") {
      candidates.push({
        dedupeKey: `discovery-submitted-${l.id}`,
        type: "discovery_submitted",
        category: "discovery",
        severity: "info",
        projectId: l.project_id,
        recordId: l.id,
        title: "نموذج اكتشاف مُرسَل",
        message: `العميل أرسل نموذج الاكتشاف لمشروع "${projectName}"`,
      });
    } else if (l.status === "expired") {
      candidates.push({
        dedupeKey: `discovery-expired-${l.id}`,
        type: "discovery_expired",
        category: "discovery",
        severity: "warning",
        projectId: l.project_id,
        recordId: l.id,
        title: "رابط اكتشاف منتهي",
        message: `انتهت صلاحية رابط الاكتشاف لمشروع "${projectName}"`,
      });
    } else {
      candidates.push({
        dedupeKey: `discovery-activity-${l.id}`,
        type: "discovery_activity",
        category: "discovery",
        severity: "info",
        projectId: l.project_id,
        recordId: l.id,
        title: "نشاط على نموذج اكتشاف",
        message: `العميل بدأ تعبئة نموذج الاكتشاف لمشروع "${projectName}"`,
      });
    }
  }

  for (const r of (qaReviews ?? []) as Array<{ id: string; project_id: string; review_number: number; review_status: string; projects: unknown }>) {
    const projectName = projectNameOf(r.projects);
    if (!projectName) continue;
    if (r.review_status === "failed") {
      candidates.push({
        dedupeKey: `qa-review-failed-${r.id}`,
        type: "engineering_review_failed",
        category: "qa",
        severity: "critical",
        projectId: r.project_id,
        recordId: r.id,
        title: "مراجعة Engineering QA فشلت",
        message: `مراجعة Engineering QA رقم ${r.review_number} لمشروع "${projectName}" فشلت`,
      });
    } else {
      candidates.push({
        dedupeKey: `qa-review-needs-review-${r.id}`,
        type: "engineering_review_needs_review",
        category: "qa",
        severity: "warning",
        projectId: r.project_id,
        recordId: r.id,
        title: "مراجعة Engineering QA محتاجة مراجعة",
        message: `مراجعة Engineering QA رقم ${r.review_number} لمشروع "${projectName}" محتاجة مراجعة`,
      });
    }
  }

  for (const inc of (criticalIncidents ?? []) as Array<{ id: string; project_id: string; title: string; projects: unknown }>) {
    const projectName = projectNameOf(inc.projects);
    if (!projectName) continue;
    candidates.push({
      dedupeKey: `monitoring-critical-${inc.id}`,
      type: "monitoring_critical_incident",
      category: "monitoring",
      severity: "critical",
      projectId: inc.project_id,
      recordId: inc.id,
      title: "حادثة Critical في مراقبة الإنتاج",
      message: `حادثة Critical في مراقبة الإنتاج لمشروع "${projectName}": ${inc.title}`,
    });
  }

  for (const k of (pendingKnowledge ?? []) as Array<{ id: string; title: string }>) {
    candidates.push({
      dedupeKey: `knowledge-approval-${k.id}`,
      type: "knowledge_needs_approval",
      category: "organizational_intelligence",
      severity: "info",
      projectId: null,
      recordId: k.id,
      title: "معرفة تنظيمية جاهزة للاعتماد",
      message: `معرفة تنظيمية تكرّرت وجاهزة للاعتماد: "${k.title}"`,
    });
  }

  const pendingByProject = new Map<string, { count: number; projectName: string }>();
  for (const c of (pendingBrainChanges ?? []) as Array<{ id: string; project_id: string; projects: unknown }>) {
    const projectName = projectNameOf(c.projects);
    if (!projectName) continue;
    const existing = pendingByProject.get(c.project_id);
    if (existing) existing.count++;
    else pendingByProject.set(c.project_id, { count: 1, projectName });
  }
  for (const [projectId, { count, projectName }] of pendingByProject) {
    candidates.push({
      dedupeKey: `brain-pending-${projectId}`,
      type: "brain_pending_change",
      category: "brain",
      severity: "info",
      projectId,
      recordId: null,
      title: "معرفة معلّقة بانتظار مراجعة Brain",
      message: `${count} تغيير معلّق بانتظار مراجعتك في Project Brain لمشروع "${projectName}"`,
    });
  }

  const lifecycleLabels: Record<(typeof NOTIFIABLE_LIFECYCLE_EVENTS)[number], string> = {
    started: "بدأ الاجتماع",
    finished: "انتهى الاجتماع",
    transcript_uploaded: "تم رفع تسجيل الاجتماع",
    analysis_completed: "اكتمل تحليل الاجتماع",
    brain_updated: "تحديث على Project Brain من الاجتماع",
  };
  for (const e of (lifecycleEvents ?? []) as Array<{
    id: string;
    meeting_id: string;
    project_id: string;
    event_type: (typeof NOTIFIABLE_LIFECYCLE_EVENTS)[number];
    detail: string | null;
    projects: unknown;
    meetings: unknown;
  }>) {
    const projectName = projectNameOf(e.projects);
    if (!projectName) continue;
    const meetingRel = Array.isArray(e.meetings) ? e.meetings[0] : e.meetings;
    const meetingTitle = (meetingRel as { title?: string } | null)?.title || "اجتماع";
    candidates.push({
      dedupeKey: `meeting-lifecycle-${e.id}`,
      type: "meeting_lifecycle",
      category: "meeting_presentation",
      severity: "info",
      projectId: e.project_id,
      recordId: e.meeting_id,
      title: lifecycleLabels[e.event_type],
      message: e.detail ?? `${lifecycleLabels[e.event_type]} — "${meetingTitle}" في مشروع "${projectName}"`,
    });
  }

  // ===== Work Management (Phase 3): milestones due + overdue critical tasks =====
  // Phase 4 — تذكير مبكّر بمراحل التسليم (حتى 7 أيام قبل الموعد).
  const soon = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString().slice(0, 10);
  const todayStr = new Date().toISOString().slice(0, 10);
  const [{ data: dueMilestones }, { data: overdueTasks }] = await Promise.all([
    supabase
      .from("milestones")
      .select("id, project_id, title, planned_date, projects(name)")
      .neq("approval_status", "approved")
      .not("planned_date", "is", null)
      .lte("planned_date", soon)
      .limit(30),
    supabase
      .from("tasks")
      .select("id, project_id, title, due_date, projects(name)")
      .eq("priority", "critical")
      .not("status", "in", "(completed,cancelled,archived)")
      .not("due_date", "is", null)
      .lt("due_date", todayStr)
      .limit(30),
  ]);

  for (const m of (dueMilestones ?? []) as Array<{ id: string; project_id: string; title: string; planned_date: string; projects: unknown }>) {
    const projectName = projectNameOf(m.projects);
    if (!projectName) continue;
    candidates.push({
      dedupeKey: `milestone-due-${m.id}`,
      type: "milestone_due",
      category: "delivery",
      severity: "warning",
      projectId: m.project_id,
      recordId: m.id,
      title: "مرحلة تسليم قربت",
      message: `مرحلة "${m.title}" في "${projectName}" مخطّطة ${m.planned_date}`,
    });
  }
  for (const t of (overdueTasks ?? []) as Array<{ id: string; project_id: string; title: string; due_date: string; projects: unknown }>) {
    const projectName = projectNameOf(t.projects);
    if (!projectName) continue;
    candidates.push({
      dedupeKey: `task-overdue-${t.id}`,
      type: "task_overdue",
      category: "work",
      severity: "critical",
      projectId: t.project_id,
      recordId: t.id,
      title: "مهمة حرجة متأخرة",
      message: `مهمة "${t.title}" في "${projectName}" فات موعدها (${t.due_date})`,
    });
  }

  // --- إشعارات مركز المعرفة (الجزء السابع) ---
  // مجمّعة لكل مشروع بدل إشعار لكل عنصر — «٥ رؤى حرجة» لا خمسة إشعارات.
  // الجداول قد تكون غير مطبَّقة (٠٠٧١/٠٠٧٩) فالفشل يُبتلَع بلا إسقاط.
  await appendKnowledgeCandidates(supabase, candidates);

  return candidates;
}

/**
 * يضيف مرشّحي إشعارات المعرفة: الرؤى الحرجة، التعارضات المفتوحة،
 * الفجوات عالية الأولوية — كلٌّ مجمّع لكل مشروع.
 */
async function appendKnowledgeCandidates(
  supabase: SupabaseClient,
  candidates: NotificationCandidate[]
): Promise<void> {
  try {
    const [insights, conflicts, gaps] = await Promise.all([
      supabase
        .from("knowledge_insights")
        .select("project_id, projects(name)")
        .eq("status", "open")
        .eq("severity", "critical")
        .limit(500),
      supabase
        .from("knowledge_conflicts")
        .select("project_id, projects(name)")
        .eq("status", "open")
        .limit(500),
      supabase
        .from("knowledge_gaps")
        .select("project_id, projects(name)")
        .eq("status", "open")
        .eq("priority", "high")
        .limit(500),
    ]);

    const tally = (
      rows: Array<{ project_id: string; projects: unknown }> | null,
      type: string,
      category: string,
      severity: NotificationSeverity,
      label: (n: number) => { title: string; message: string }
    ) => {
      const byProject = new Map<string, { name: string; count: number }>();
      for (const r of rows ?? []) {
        const name = projectNameOf(r.projects);
        if (!name || !r.project_id) continue;
        const entry = byProject.get(r.project_id) ?? { name, count: 0 };
        entry.count += 1;
        byProject.set(r.project_id, entry);
      }
      for (const [projectId, { count }] of byProject) {
        const { title, message } = label(count);
        candidates.push({
          dedupeKey: `${type}-${projectId}`,
          type,
          category,
          severity,
          projectId,
          recordId: null,
          title,
          message,
        });
      }
    };

    tally(insights.error ? null : insights.data, "knowledge_critical_insight", "knowledge", "warning",
      (n) => ({ title: "رؤى حرجة في المعرفة", message: `${n} رأي حرج مفتوح يحتاج مراجعة` }));
    tally(conflicts.error ? null : conflicts.data, "knowledge_conflict", "knowledge", "warning",
      (n) => ({ title: "تعارضات في المعرفة", message: `${n} تعارض مفتوح يحتاج حسمًا` }));
    tally(gaps.error ? null : gaps.data, "knowledge_gap", "knowledge", "info",
      (n) => ({ title: "فجوات معرفية", message: `${n} فجوة عالية الأولوية بلا إجابة` }));
  } catch (err) {
    console.error("[notifications] تعذّر جمع مرشّحي المعرفة:", err);
  }
}

/** حد أدنى بين كتابتين متتاليتين على نفس الإشعار (heartbeat) — يمنع كتابة last_seen_at في كل Cron Tick حتى لو مفيش تغيير حقيقي. */
const HEARTBEAT_MIN_INTERVAL_MS = 4 * 60 * 1000;

/**
 * `.in()` بتتحوّل لـ query string في الرابط، والروابط الطويلة أوي
 * بترجّع 500 من البوّابة. التقطيع هنا مش تحسين — هو شرط لصحة العملية
 * أول ما عدد المرشّحين يكبر.
 */
const DEDUPE_KEY_CHUNK_SIZE = 50;
const INSERT_CHUNK_SIZE = 100;

interface ExistingNotification {
  id: string;
  dedupe_key: string;
  source_resolved: boolean | null;
  last_seen_at: string | null;
}

function chunk<T>(items: T[], size: number): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < items.length; i += size) out.push(items.slice(i, i + size));
  return out;
}

/**
 * يوفّق حالة جدول notifications مع الأدلة الحقيقية الحالية — إشعار
 * جديد يتسجّل (Created event)، إشعار موجود بيتلمس (last_seen_at)،
 * وإشعار "source_resolved" (الشرط اللي ولّده اختفى) بيتعلّم كده بدون
 * ما يتحذف (زي ما المواصفة بتطلب صراحة: بدون حذف نهائي من قاعدة
 * البيانات).
 *
 * بيتنادى **حصريًا** من Cron مستقل (app/api/cron/notifications-reconcile)
 * — مش من أي مسار قراءة (جرس/صفحة تاريخ) عشان منمنعش Feedback Loop مع
 * اشتراك Realtime في الجرس (كل كتابة هنا بتطلق postgres_changes، ولو
 * القراءة هي اللي بتستدعي التوفيق، الحدث ده بيرجّع يشغّل نفس القراءة
 * تاني بلا نهاية). كل إشعار موجود ومستقر مبيتكتبش تاني إلا لو فعليًا
 * اتحل (source_resolved اتقلب) أو عدّى HEARTBEAT_MIN_INTERVAL_MS من
 * آخر لمسة — عشان نقلّل عدد الكتابات/الأحداث لأقل حد ممكن.
 */
export async function reconcileNotifications(): Promise<{ created: number; resolved: number }> {
  const supabase = createServiceClient();
  const candidates = await gatherNotificationCandidates(supabase);
  const activeKeys = new Set(candidates.map((c) => c.dedupeKey));

  // بحث واحد مُجمَّع بدل استعلام لكل مرشّح. النسخة السابقة كانت بتعمل
  // رحلة شبكة كاملة لكل مرشّح جوّه الحلقة — مع ~100 مرشّح و Cron كل
  // دقيقتين، ده وحده مئات الطلبات في الساعة وكمية بيانات صادرة ضخمة من
  // قاعدة بيانات حجمها أقل من نصف جيجا.
  const existingByKey = new Map<string, ExistingNotification>();
  for (const keys of chunk([...activeKeys], DEDUPE_KEY_CHUNK_SIZE)) {
    const { data } = await supabase
      .from("notifications")
      .select("id, dedupe_key, source_resolved, last_seen_at")
      .in("dedupe_key", keys);
    for (const row of (data ?? []) as ExistingNotification[]) {
      existingByKey.set(row.dedupe_key, row);
    }
  }

  const nowIso = new Date().toISOString();
  const toTouch: string[] = [];
  const toInsert: Record<string, unknown>[] = [];

  for (const c of candidates) {
    const existing = existingByKey.get(c.dedupeKey);
    if (existing) {
      const needsResolvedFlip = existing.source_resolved === true;
      const lastSeenAgeMs = existing.last_seen_at ? Date.now() - new Date(existing.last_seen_at).getTime() : Infinity;
      if (needsResolvedFlip || lastSeenAgeMs > HEARTBEAT_MIN_INTERVAL_MS) toTouch.push(existing.id);
      continue;
    }
    const target = resolveNotificationTarget({ type: c.type, projectId: c.projectId, recordId: c.recordId });
    toInsert.push({
      dedupe_key: c.dedupeKey,
      type: c.type,
      category: c.category,
      severity: c.severity,
      project_id: c.projectId,
      title: c.title,
      message: c.message,
      target_url: target.url,
      target_module: target.tab,
      target_record_id: c.recordId,
    });
  }

  for (const ids of chunk(toTouch, DEDUPE_KEY_CHUNK_SIZE)) {
    await supabase
      .from("notifications")
      .update({ last_seen_at: nowIso, source_resolved: false })
      .in("id", ids);
  }

  let created = 0;
  for (const batch of chunk(toInsert, INSERT_CHUNK_SIZE)) {
    const { data: inserted, error } = await supabase.from("notifications").insert(batch).select("id");
    if (error || !inserted) continue;
    created += inserted.length;
    await supabase
      .from("notification_events")
      .insert(inserted.map((row) => ({ notification_id: row.id, event_type: "created" })));
  }

  // الأعمدة المطلوبة بس: الحلقة دي بتقارن مفاتيح، فجلب صفوف كاملة هنا
  // كان بيبعت بيانات مالهاش لازمة في كل دورة.
  const { data: staleRows } = await supabase
    .from("notifications")
    .select("id, dedupe_key")
    .eq("status", "active")
    .eq("source_resolved", false);

  const staleIds = ((staleRows ?? []) as Array<{ id: string; dedupe_key: string }>)
    .filter((row) => !activeKeys.has(row.dedupe_key))
    .map((row) => row.id);

  for (const ids of chunk(staleIds, DEDUPE_KEY_CHUNK_SIZE)) {
    await supabase.from("notifications").update({ source_resolved: true }).in("id", ids);
  }

  return { created, resolved: staleIds.length };
}
