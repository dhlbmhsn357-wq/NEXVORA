import "server-only";
import { createServiceClient } from "@/lib/supabase/service";
import { resolveNotificationTarget } from "@/lib/navigation/targets";
import { createTaskFromSource } from "@/lib/work/source-service";
import { recordAuthEvent } from "@/lib/auth/audit";
import { AIService } from "@/lib/ai/service";
import { AITaskType } from "@/lib/ai/types";
import { escalationDecision, daysBetween } from "./escalation";
import type { WorkflowExecution } from "@/lib/types/database";

/**
 * خدمة محرّك الأتمتة — سجل التنفيذ + إحصاءات لوحة المدير + فحص التصعيد
 * الدوري (بينستدعى من الـ Cron) + الذكاء الإداري (تقرير تنفيذي عبر AI).
 */

function projectNameOf(rel: unknown): string | null {
  if (Array.isArray(rel)) return (rel[0] as { name?: string } | undefined)?.name ?? null;
  return (rel as { name?: string } | null)?.name ?? null;
}

// ===== Automation Log =====
export interface ExecutionRow extends WorkflowExecution {
  project_name: string | null;
}

export async function listWorkflowExecutions(limit = 100, projectId?: string): Promise<ExecutionRow[]> {
  const supabase = createServiceClient();
  let query = supabase
    .from("workflow_executions")
    .select("*, projects(name)")
    .order("created_at", { ascending: false })
    .limit(limit);
  if (projectId) query = query.eq("project_id", projectId);
  const { data } = await query;
  return ((data ?? []) as (WorkflowExecution & { projects: unknown })[]).map((r) => ({
    ...r,
    project_name: projectNameOf(r.projects),
  }));
}

export interface AutomationStats {
  total: number;
  completed: number;
  failed: number;
  skipped: number;
  last24h: number;
  byWorkflow: { workflow_id: string; count: number; failed: number }[];
}

export async function getAutomationStats(): Promise<AutomationStats> {
  const supabase = createServiceClient();
  const { data } = await supabase.from("workflow_executions").select("workflow_id, status, created_at").limit(2000);
  const rows = (data ?? []) as { workflow_id: string; status: string; created_at: string }[];
  const cutoff = Date.now() - 24 * 60 * 60 * 1000;
  const byWorkflow = new Map<string, { count: number; failed: number }>();
  let completed = 0, failed = 0, skipped = 0, last24h = 0;
  for (const r of rows) {
    if (r.status === "completed") completed++;
    else if (r.status === "failed") failed++;
    else if (r.status === "skipped") skipped++;
    if (new Date(r.created_at).getTime() >= cutoff) last24h++;
    const w = byWorkflow.get(r.workflow_id) ?? { count: 0, failed: 0 };
    w.count++;
    if (r.status === "failed") w.failed++;
    byWorkflow.set(r.workflow_id, w);
  }
  return {
    total: rows.length,
    completed,
    failed,
    skipped,
    last24h,
    byWorkflow: [...byWorkflow.entries()].map(([workflow_id, v]) => ({ workflow_id, ...v })).sort((a, b) => b.count - a.count),
  };
}

// ===== Escalation scan (cron) =====
async function upsertNotification(
  supabase: ReturnType<typeof createServiceClient>,
  n: { dedupeKey: string; type: string; category: string; severity: "info" | "warning" | "critical"; projectId: string | null; recordId: string | null; title: string; message: string }
): Promise<boolean> {
  const { data: existing } = await supabase.from("notifications").select("id").eq("dedupe_key", n.dedupeKey).maybeSingle();
  if (existing) {
    await supabase.from("notifications").update({ last_seen_at: new Date().toISOString(), source_resolved: false }).eq("id", existing.id);
    return false;
  }
  const target = resolveNotificationTarget({ type: n.type, projectId: n.projectId, recordId: n.recordId });
  const { data: inserted } = await supabase
    .from("notifications")
    .insert({
      dedupe_key: n.dedupeKey,
      type: n.type,
      category: n.category,
      severity: n.severity,
      project_id: n.projectId,
      title: n.title,
      message: n.message,
      target_url: target.url,
      target_module: target.tab,
      target_record_id: n.recordId,
    })
    .select("id")
    .maybeSingle();
  if (inserted) await supabase.from("notification_events").insert({ notification_id: inserted.id, event_type: "created" });
  return !!inserted;
}

/**
 * فحص التصعيد الدوري: يمرّ على المهام والمراحل المتأخّرة، يحسب مستوى
 * التصعيد من مدّة التأخّر، ويولّد إشعار تصعيد متصاعد الخطورة + مهمة
 * مخاطرة تلقائية عند المستويات العليا. idempotent عبر dedupe_key يومي.
 */
export async function runEscalationScan(): Promise<{ escalated: number; riskTasks: number }> {
  const supabase = createServiceClient();
  const nowMs = Date.now();
  const today = new Date().toISOString().slice(0, 10);

  const [{ data: overdueTasks }, { data: overdueMilestones }] = await Promise.all([
    supabase
      .from("tasks")
      .select("id, project_id, title, due_date, projects(name)")
      .not("status", "in", "(completed,cancelled,archived)")
      .not("due_date", "is", null)
      .lt("due_date", today)
      .limit(200),
    supabase
      .from("milestones")
      .select("id, project_id, title, planned_date, projects(name)")
      .not("approval_status", "in", "(approved,client_approved)")
      .not("planned_date", "is", null)
      .lt("planned_date", today)
      .limit(200),
  ]);

  let escalated = 0;
  let riskTasks = 0;

  for (const t of (overdueTasks ?? []) as Array<{ id: string; project_id: string; title: string; due_date: string; projects: unknown }>) {
    const days = daysBetween(t.due_date, nowMs);
    const dec = escalationDecision(days);
    if (dec.tier === "none") continue;
    const projectName = projectNameOf(t.projects) ?? "المشروع";
    const created = await upsertNotification(supabase, {
      dedupeKey: `escalation-task-${t.id}-${dec.tier}`,
      type: "task_overdue",
      category: "escalation",
      severity: dec.severity,
      projectId: t.project_id,
      recordId: t.id,
      title: `${dec.label}: مهمة متأخّرة`,
      message: `مهمة "${t.title}" في "${projectName}" متأخّرة ${days} يوم — ${dec.label}`,
    });
    if (created) {
      escalated++;
      await recordAuthEvent({ actorId: null, targetUserId: null, action: "escalation_triggered", details: { kind: "task", task_id: t.id, days, tier: dec.tier } });
    }
    if (dec.createRiskTask) {
      const res = await createTaskFromSource({
        projectId: t.project_id,
        title: `مخاطرة تأخّر: ${t.title}`,
        description: `مهمة متأخّرة ${days} يوم بلغت مستوى ${dec.label}. مطلوب تدخّل.`,
        priority: "critical",
        sourceType: "risk",
        sourceReference: `escalation-risk-${t.id}`,
        createdBy: null,
      });
      if (res.ok && !res.duplicate) riskTasks++;
    }
  }

  for (const m of (overdueMilestones ?? []) as Array<{ id: string; project_id: string; title: string; planned_date: string; projects: unknown }>) {
    const days = daysBetween(m.planned_date, nowMs);
    const dec = escalationDecision(days);
    if (dec.tier === "none") continue;
    const projectName = projectNameOf(m.projects) ?? "المشروع";
    const created = await upsertNotification(supabase, {
      dedupeKey: `escalation-milestone-${m.id}-${dec.tier}`,
      type: "milestone_due",
      category: "escalation",
      severity: dec.severity,
      projectId: m.project_id,
      recordId: m.id,
      title: `${dec.label}: مرحلة تسليم متأخّرة`,
      message: `مرحلة "${m.title}" في "${projectName}" تأخّرت ${days} يوم — ${dec.label}`,
    });
    if (created) {
      escalated++;
      await recordAuthEvent({ actorId: null, targetUserId: null, action: "escalation_triggered", details: { kind: "milestone", milestone_id: m.id, days, tier: dec.tier } });
    }
  }

  return { escalated, riskTasks };
}

// ===== Automation Intelligence (AI) =====
export interface AutomationIntelligenceResult {
  bottlenecks: string[];
  repeated_failures: string[];
  recommendations: string[];
  executive_summary: string;
}

export async function analyzeAutomation(actorId?: string): Promise<{ ok: boolean; result?: AutomationIntelligenceResult; message?: string }> {
  const stats = await getAutomationStats();
  const recent = await listWorkflowExecutions(40);
  const failing = recent.filter((r) => r.status === "failed");
  const prompt = `أنت محلّل عمليات (Operations Analyst) خبير. حلّل أداء محرّك الأتمتة واكتشف الاختناقات والإخفاقات المتكررة.

إجمالي عمليات التنفيذ: ${stats.total} | مكتملة: ${stats.completed} | فاشلة: ${stats.failed} | متخطّاة: ${stats.skipped} | آخر ٢٤ ساعة: ${stats.last24h}
حسب الـ Workflow: ${stats.byWorkflow.map((w) => `${w.workflow_id}: ${w.count} (فشل ${w.failed})`).join(" | ") || "لا يوجد"}
أمثلة إخفاقات حديثة: ${failing.slice(0, 10).map((f) => `${f.workflow_id}: ${f.error ?? "غير محدّد"}`).join(" | ") || "لا يوجد"}

أعد **JSON فقط**:
{
  "bottlenecks": ["اختناق تشغيلي محدّد"],
  "repeated_failures": ["نمط إخفاق متكرّر"],
  "recommendations": ["توصية عملية لتحسين الأتمتة"],
  "executive_summary": "ملخص تنفيذي موجز (2-3 جمل)"
}
قواعد: استنتج من الأرقام المعطاة فقط، لا تخترع. اكتب بالعربي.`;

  const response = await AIService.execute(AITaskType.AUTOMATION_INTELLIGENCE, prompt, { actorId });
  if (!response.success) return { ok: false, message: response.error?.message ?? "فشل التحليل." };
  try {
    const match = (response.output ?? "").match(/\{[\s\S]*\}/);
    if (!match) return { ok: false, message: "رد غير مفهوم." };
    const p = JSON.parse(match[0]) as Partial<AutomationIntelligenceResult>;
    const arr = (v: unknown): string[] => (Array.isArray(v) ? v.filter((x) => typeof x === "string").map(String) : []);
    return {
      ok: true,
      result: {
        bottlenecks: arr(p.bottlenecks),
        repeated_failures: arr(p.repeated_failures),
        recommendations: arr(p.recommendations),
        executive_summary: typeof p.executive_summary === "string" ? p.executive_summary : "",
      },
    };
  } catch {
    return { ok: false, message: "تعذّر قراءة نتيجة التحليل." };
  }
}
