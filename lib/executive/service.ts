import "server-only";
import { createServiceClient } from "@/lib/supabase/service";
import { AIService } from "@/lib/ai/service";
import { AITaskType } from "@/lib/ai/types";
import { computeProjectHealth } from "@/lib/portfolio/health";
import { computeUserWorkload } from "@/lib/portfolio/capacity";
import { isDoneStatus } from "@/lib/work/statuses";
import { isOverdue } from "@/lib/work/task-logic";
import { computeCompanyHealth, pct, type CompanyHealthResult } from "./health";
import { deriveExecutiveAlerts, type ExecutiveAlert } from "./alerts";
import type {
  Task, CompanyMetricSnapshot, ExecutiveReport, ExecutiveReportPeriod, ExecutiveInsight,
} from "@/lib/types/database";

/**
 * خدمة العقل التنفيذي (COO) — بتجمّع كل المنصة على مستوى الشركة كلها:
 * تحسب صحة الشركة + KPIs من بيانات حقيقية عبر كل المشاريع (بإعادة استخدام
 * computeProjectHealth / computeUserWorkload)، تخزّن لقطات زمنية للاتجاه،
 * تشتق تنبيهات تنفيذية، وتشغّل مساعد AI وتقارير تنفيذية عبر AI Provider
 * Layer فقط. لا اختلاق — أي رقم مصدره صف حقيقي.
 */

export interface CompanySnapshot {
  activeProjects: number;
  projectSuccessRatePct: number;
  redProjects: number;
  yellowProjects: number;
  greenProjects: number;
  delayedProjectsPct: number;
  avgQaScore: number;
  qaFailRatePct: number;
  openCriticalIncidents: number;
  supportBacklog: number;
  supportSatisfactionPct: number;
  automationEfficiencyPct: number;
  automationFailRatePct: number;
  overloadedEmployees: number;
  totalEmployees: number;
  totalKnowledge: number;
  scores: Record<string, number>;
  health: CompanyHealthResult;
  kpis: Record<string, number>;
}

function normStability(openCritical: number): number {
  return Math.max(0, 100 - openCritical * 20);
}

/** يجمّع لقطة الشركة كاملة من بيانات حقيقية عبر كل المشاريع النشطة. */
export async function gatherCompanySnapshot(): Promise<CompanySnapshot> {
  const supabase = createServiceClient();
  const nowMs = Date.now();
  const today = new Date().toISOString().slice(0, 10);

  const [
    { data: projects },
    { data: tasks },
    { data: milestones },
    { data: incidents },
    { data: reviews },
    { data: certificates },
    { data: support },
    { data: workflowRuns },
    { data: knowledge },
    { data: profiles },
    { data: assignees },
  ] = await Promise.all([
    supabase.from("projects").select("id").is("archived_at", null),
    supabase.from("tasks").select("project_id, status, priority, due_date, parent_task_id, estimated_hours"),
    supabase.from("milestones").select("project_id, planned_date, approval_status"),
    supabase.from("monitoring_incidents").select("project_id, severity, status"),
    supabase.from("engineering_reviews").select("project_id, review_status, created_at").order("created_at", { ascending: false }),
    supabase.from("engineering_certificates").select("overall_score"),
    supabase.from("support_requests").select("resolution_status, satisfaction_rating"),
    supabase.from("workflow_executions").select("status").limit(3000),
    supabase.from("organizational_knowledge").select("id"),
    supabase.from("profiles").select("id, status"),
    supabase.from("task_assignees").select("user_id, task_id"),
  ]);

  const activeProjectIds = new Set(((projects ?? []) as { id: string }[]).map((p) => p.id));
  const activeProjects = activeProjectIds.size;

  // مهام مجمّعة حسب المشروع (النشطة فقط)
  type MiniTask = Pick<Task, "status" | "priority" | "due_date" | "parent_task_id">;
  const tasksByProject = new Map<string, MiniTask[]>();
  for (const t of (tasks ?? []) as (MiniTask & { project_id: string })[]) {
    if (!activeProjectIds.has(t.project_id)) continue;
    tasksByProject.set(t.project_id, [...(tasksByProject.get(t.project_id) ?? []), t]);
  }
  const milestonesByProject = new Map<string, { planned_date: string | null; approval_status: string }[]>();
  for (const m of (milestones ?? []) as { project_id: string; planned_date: string | null; approval_status: string }[]) {
    if (!activeProjectIds.has(m.project_id)) continue;
    milestonesByProject.set(m.project_id, [...(milestonesByProject.get(m.project_id) ?? []), m]);
  }
  const incidentsByProject = new Map<string, { severity: string; status: string }[]>();
  for (const inc of (incidents ?? []) as { project_id: string; severity: string; status: string }[]) {
    if (!activeProjectIds.has(inc.project_id)) continue;
    incidentsByProject.set(inc.project_id, [...(incidentsByProject.get(inc.project_id) ?? []), inc]);
  }
  const latestReviewByProject = new Map<string, string>();
  for (const r of (reviews ?? []) as { project_id: string; review_status: string }[]) {
    if (!activeProjectIds.has(r.project_id)) continue;
    if (!latestReviewByProject.has(r.project_id)) latestReviewByProject.set(r.project_id, r.review_status);
  }

  // صحة كل مشروع (نعيد استخدام computeProjectHealth بالضبط)
  let green = 0, yellow = 0, red = 0, delayedProjects = 0;
  for (const pid of activeProjectIds) {
    const pTasks = tasksByProject.get(pid) ?? [];
    const topLevel = pTasks.filter((t) => !t.parent_task_id);
    const done = topLevel.filter((t) => isDoneStatus(t.status)).length;
    const overallProgress = topLevel.length ? Math.round((done / topLevel.length) * 100) : 0;
    const overdue = pTasks.filter((t) => isOverdue(t, nowMs));
    const pMilestones = milestonesByProject.get(pid) ?? [];
    const delayedMilestones = pMilestones.filter(
      (m) => m.planned_date && m.planned_date < today && m.approval_status !== "approved" && m.approval_status !== "client_approved"
    ).length;
    if (delayedMilestones > 0) delayedProjects++;
    const pIncidents = incidentsByProject.get(pid) ?? [];
    const openCritical = pIncidents.filter((i) => i.severity === "critical" && i.status !== "resolved").length;

    const h = computeProjectHealth({
      overallProgress,
      blockedTasks: pTasks.filter((t) => t.status === "blocked").length,
      overdueTasks: overdue.length,
      criticalOverdueTasks: overdue.filter((t) => t.priority === "critical").length,
      delayedMilestones,
      openCriticalIncidents: openCritical,
      engineeringQaFailing: latestReviewByProject.get(pid) === "failed",
      totalTasks: pTasks.length,
    });
    if (h.color === "green") green++;
    else if (h.color === "yellow") yellow++;
    else red++;
  }

  const projectSuccessRatePct = pct(green + yellow, activeProjects);
  const delayedProjectsPct = pct(delayedProjects, activeProjects);

  // الجودة الهندسية
  const certScores = ((certificates ?? []) as { overall_score: number | null }[]).map((c) => c.overall_score).filter((s): s is number => typeof s === "number");
  const avgQaScore = certScores.length ? Math.round(certScores.reduce((a, b) => a + b, 0) / certScores.length) : 60;
  const failedReviews = [...latestReviewByProject.values()].filter((s) => s === "failed").length;
  const qaFailRatePct = pct(failedReviews, latestReviewByProject.size);

  // استقرار الإنتاج
  const openCriticalIncidents = [...incidentsByProject.values()].flat().filter((i) => i.severity === "critical" && i.status !== "resolved").length;

  // الدعم
  const supportRows = (support ?? []) as { resolution_status: string; satisfaction_rating: number | null }[];
  const supportBacklog = supportRows.filter((s) => s.resolution_status === "open" || s.resolution_status === "escalated" || s.resolution_status === "in_progress").length;
  const rated = supportRows.filter((s) => s.satisfaction_rating === 1 || s.satisfaction_rating === -1);
  const supportSatisfactionPct = rated.length ? pct(rated.filter((s) => s.satisfaction_rating === 1).length, rated.length) : 60;

  // الأتمتة
  const wf = (workflowRuns ?? []) as { status: string }[];
  const wfDecisive = wf.filter((w) => w.status === "completed" || w.status === "failed").length;
  const wfCompleted = wf.filter((w) => w.status === "completed").length;
  const automationEfficiencyPct = wfDecisive ? pct(wfCompleted, wfDecisive) : 60;
  const automationFailRatePct = wfDecisive ? pct(wf.filter((w) => w.status === "failed").length, wfDecisive) : 0;

  // الفريق
  const activeProfiles = ((profiles ?? []) as { id: string; status: string }[]).filter((p) => p.status === "active");
  const totalEmployees = activeProfiles.length;
  // أحمال الأعضاء: لكل مستخدم مهامه (status + estimated_hours) عبر task_assignees
  const tasksById = new Map<string, Pick<Task, "status" | "estimated_hours">>();
  {
    const { data: taskRows } = await supabase.from("tasks").select("id, status, estimated_hours");
    for (const t of (taskRows ?? []) as (Pick<Task, "status" | "estimated_hours"> & { id: string })[]) tasksById.set(t.id, { status: t.status, estimated_hours: t.estimated_hours });
  }
  const tasksByUser = new Map<string, Pick<Task, "status" | "estimated_hours">[]>();
  for (const a of (assignees ?? []) as { user_id: string; task_id: string }[]) {
    const t = tasksById.get(a.task_id);
    if (!t) continue;
    tasksByUser.set(a.user_id, [...(tasksByUser.get(a.user_id) ?? []), t]);
  }
  let overloadedEmployees = 0;
  for (const p of activeProfiles) {
    const w = computeUserWorkload(tasksByUser.get(p.id) ?? []);
    if (w.overloaded) overloadedEmployees++;
  }

  const totalKnowledge = ((knowledge ?? []) as { id: string }[]).length;

  const scores: Record<string, number> = {
    projectSuccess: projectSuccessRatePct,
    deliveryAccuracy: Math.max(0, 100 - delayedProjectsPct),
    engineeringQuality: avgQaScore,
    productionStability: normStability(openCriticalIncidents),
    supportQuality: Math.max(0, supportSatisfactionPct - Math.min(30, supportBacklog * 5)),
    teamCapacity: totalEmployees ? Math.max(0, 100 - pct(overloadedEmployees, totalEmployees)) : 60,
    automationEfficiency: automationEfficiencyPct,
    knowledgeGrowth: Math.min(100, 40 + totalKnowledge * 3),
    riskControl: Math.max(0, 100 - (red * 15 + openCriticalIncidents * 10)),
  };
  const health = computeCompanyHealth(scores);

  const kpis: Record<string, number> = {
    activeProjects,
    projectSuccessRatePct,
    delayedProjectsPct,
    avgQaScore,
    qaFailRatePct,
    openCriticalIncidents,
    supportBacklog,
    supportSatisfactionPct,
    automationEfficiencyPct,
    overloadedEmployees,
    totalEmployees,
    totalKnowledge,
  };

  return {
    activeProjects, projectSuccessRatePct, redProjects: red, yellowProjects: yellow, greenProjects: green,
    delayedProjectsPct, avgQaScore, qaFailRatePct, openCriticalIncidents, supportBacklog, supportSatisfactionPct,
    automationEfficiencyPct, automationFailRatePct, overloadedEmployees, totalEmployees, totalKnowledge,
    scores, health, kpis,
  };
}

/** يحسب اللقطة ويخزّنها في السلسلة الزمنية (company_metrics). */
export async function computeAndStoreSnapshot(): Promise<CompanySnapshot> {
  const snapshot = await gatherCompanySnapshot();
  const supabase = createServiceClient();
  await supabase.from("company_metrics").insert({
    health_score: snapshot.health.score,
    health_band: snapshot.health.band,
    kpis: snapshot.kpis,
    breakdown: snapshot.health.breakdown,
    signals: snapshot.scores,
  });
  return snapshot;
}

export async function getMetricHistory(limit = 30): Promise<CompanyMetricSnapshot[]> {
  const supabase = createServiceClient();
  const { data } = await supabase.from("company_metrics").select("*").order("snapshot_at", { ascending: false }).limit(limit);
  return (data ?? []) as CompanyMetricSnapshot[];
}

// ===== Executive alerts (idempotent، فئة executive) =====
export async function refreshExecutiveAlerts(snapshot: CompanySnapshot): Promise<number> {
  const supabase = createServiceClient();
  const alerts: ExecutiveAlert[] = deriveExecutiveAlerts(snapshot.health, {
    healthScore: snapshot.health.score,
    qaFailRatePct: snapshot.qaFailRatePct,
    supportBacklog: snapshot.supportBacklog,
    overloadedEmployees: snapshot.overloadedEmployees,
    openCriticalIncidents: snapshot.openCriticalIncidents,
    delayedProjectsPct: snapshot.delayedProjectsPct,
    automationFailRatePct: snapshot.automationFailRatePct,
  });

  let created = 0;
  for (const a of alerts) {
    const dedupeKey = `executive-${a.key}`;
    const { data: existing } = await supabase.from("notifications").select("id").eq("dedupe_key", dedupeKey).maybeSingle();
    if (existing) {
      await supabase.from("notifications").update({ last_seen_at: new Date().toISOString(), source_resolved: false, message: a.message }).eq("id", existing.id);
      continue;
    }
    const { data: inserted } = await supabase
      .from("notifications")
      .insert({
        dedupe_key: dedupeKey, type: "executive_alert", category: "executive", severity: a.severity,
        project_id: null, title: a.title, message: a.message,
        target_url: "/dashboard/executive", target_module: null, target_record_id: null,
      })
      .select("id")
      .maybeSingle();
    if (inserted) { created++; await supabase.from("notification_events").insert({ notification_id: inserted.id, event_type: "created" }); }
  }
  return created;
}

// ===== Executive AI Assistant =====
function snapshotContext(s: CompanySnapshot): string {
  return `صحة الشركة: ${s.health.score}% (${s.health.band}). المشاريع النشطة: ${s.activeProjects} (خضراء ${s.greenProjects}، صفراء ${s.yellowProjects}، حمراء ${s.redProjects}).
معدّل نجاح المشاريع: ${s.projectSuccessRatePct}% | مشاريع بها تأخّر تسليم: ${s.delayedProjectsPct}%.
متوسط جودة الهندسة: ${s.avgQaScore} | معدّل إخفاق الجودة: ${s.qaFailRatePct}%.
حوادث إنتاج حرجة مفتوحة: ${s.openCriticalIncidents} | تراكم الدعم: ${s.supportBacklog} | رضا الدعم: ${s.supportSatisfactionPct}%.
كفاءة الأتمتة: ${s.automationEfficiencyPct}% | موظّفون فوق الطاقة: ${s.overloadedEmployees}/${s.totalEmployees} | عناصر معرفة: ${s.totalKnowledge}.
أضعف الأبعاد: ${s.health.weakest.map((w) => `${w.label} (${w.score}%)`).join("، ") || "لا يوجد"}.`;
}

export async function askExecutiveAssistant(question: string, actorId: string | null): Promise<{ ok: boolean; answer?: string; message?: string }> {
  const snapshot = await gatherCompanySnapshot();
  const prompt = `أنت مدير العمليات التنفيذي (COO) للشركة. جاوب سؤال الإدارة بالاعتماد **حصريًا** على البيانات المجمّعة التالية — ممنوع اختلاق أي رقم غير موجود. لو البيانات لا تكفي قل ذلك صراحةً واقترح ما يلزم لمعرفته.

لقطة حالة الشركة الآن:
${snapshotContext(snapshot)}

سؤال الإدارة: ${question}

أجب بالعربي بإيجاز تنفيذي: (1) إجابة مباشرة مبنية على الأرقام، (2) السبب/التحليل، (3) توصية عملية واحدة أو اثنتان.`;

  const res = await AIService.execute(AITaskType.EXECUTIVE_INTELLIGENCE, prompt, { actorId: actorId ?? undefined });
  if (!res.success || !res.output) return { ok: false, message: res.error?.message ?? "تعذّر الحصول على إجابة." };

  const supabase = createServiceClient();
  await supabase.from("executive_insights").insert({ kind: "assistant", question, answer: res.output, evidence: snapshot.kpis, created_by: actorId });
  return { ok: true, answer: res.output };
}

export async function listExecutiveInsights(limit = 20): Promise<ExecutiveInsight[]> {
  const supabase = createServiceClient();
  const { data } = await supabase.from("executive_insights").select("*").order("created_at", { ascending: false }).limit(limit);
  return (data ?? []) as ExecutiveInsight[];
}

// ===== Executive Reports =====
const PERIOD_LABELS: Record<ExecutiveReportPeriod, string> = {
  weekly: "تقرير أسبوعي", monthly: "تقرير شهري", quarterly: "تقرير ربع سنوي", annual: "تقرير سنوي",
  portfolio: "تقرير محفظة المشاريع", engineering: "تقرير الهندسة", support: "تقرير الدعم",
  delivery: "تقرير التسليم", risk: "تقرير المخاطر",
};

export async function generateExecutiveReport(period: ExecutiveReportPeriod, actorId: string | null): Promise<{ ok: boolean; report?: ExecutiveReport; message?: string }> {
  const snapshot = await gatherCompanySnapshot();
  const prompt = `أنت COO. اكتب ${PERIOD_LABELS[period]} تنفيذيًا للشركة من البيانات المجمّعة التالية فقط (لا تختلق):

${snapshotContext(snapshot)}

أعد **JSON فقط**:
{
  "executive_summary": "ملخص تنفيذي 3-4 جمل",
  "risks": ["خطر محدّد"],
  "recommendations": ["توصية عملية"],
  "predictions": ["توقّع مبني على الاتجاه الحالي"],
  "action_plan": ["إجراء تنفيذي مقترح لهذه الفترة"]
}
اكتب بالعربي. لا شيء خارج الـ JSON.`;

  const res = await AIService.execute(AITaskType.EXECUTIVE_REPORT, prompt, { actorId: actorId ?? undefined });
  const supabase = createServiceClient();

  let summary = "";
  const analysis: { risks: string[]; recommendations: string[]; predictions: string[]; action_plan: string[] } = { risks: [], recommendations: [], predictions: [], action_plan: [] };
  if (res.success && res.output) {
    const m = res.output.match(/\{[\s\S]*\}/);
    if (m) {
      try {
        const p = JSON.parse(m[0]) as Record<string, unknown>;
        const arr = (v: unknown) => (Array.isArray(v) ? v.filter((x) => typeof x === "string").map(String).slice(0, 15) : []);
        summary = typeof p.executive_summary === "string" ? p.executive_summary : "";
        analysis.risks = arr(p.risks); analysis.recommendations = arr(p.recommendations);
        analysis.predictions = arr(p.predictions); analysis.action_plan = arr(p.action_plan);
      } catch { /* fallback below */ }
    }
  }

  const { data: inserted, error } = await supabase
    .from("executive_reports")
    .insert({
      period_type: period, title: `${PERIOD_LABELS[period]} — صحة ${snapshot.health.score}%`,
      status: res.success ? "ready" : "failed", executive_summary: summary || null,
      kpis: snapshot.kpis, analysis, health_score: snapshot.health.score,
      last_error: res.success ? null : (res.error?.message ?? "فشل التوليد"), generated_by: actorId,
    })
    .select("*")
    .maybeSingle();
  if (error) return { ok: false, message: error.message };
  return { ok: res.success, report: (inserted as ExecutiveReport) ?? undefined, message: res.success ? undefined : "فشل توليد التقرير عبر AI." };
}

export async function listExecutiveReports(limit = 20): Promise<ExecutiveReport[]> {
  const supabase = createServiceClient();
  const { data } = await supabase.from("executive_reports").select("*").order("generated_at", { ascending: false }).limit(limit);
  return (data ?? []) as ExecutiveReport[];
}
