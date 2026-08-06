"use client";

import { useCallback, useEffect, useState, useTransition } from "react";
import { CheckCircle2, XCircle, MinusCircle, Zap, Activity, Sparkles, RefreshCw } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import Button from "@/components/ui/Button";
import PageHeader from "@/components/ui/PageHeader";
import { EVENT_LABELS, type EventType } from "@/lib/automation/events";
import type { AutomationStats, ExecutionRow, AutomationIntelligenceResult } from "@/lib/automation/service";
import { refreshExecutionsAction, analyzeAutomationAction } from "./automations-actions";

interface WorkflowMeta {
  id: string;
  title: string;
  description: string;
  trigger: string;
}

function StatCard({ label, value, tone }: { label: string; value: number; tone?: "ok" | "bad" | "muted" }) {
  const color = tone === "ok" ? "var(--v-success)" : tone === "bad" ? "var(--v-danger)" : "var(--v-text)";
  return (
    <div className="rounded-[var(--v-radius-lg)] border border-[var(--v-border)] bg-[var(--v-surface)] p-4">
      <div className="text-2xl font-bold" style={{ color }}>{value}</div>
      <div className="mt-1 text-xs text-[var(--v-text-secondary)]">{label}</div>
    </div>
  );
}

function StatusBadge({ status }: { status: ExecutionRow["status"] }) {
  if (status === "completed") return <span className="inline-flex items-center gap-1 text-[var(--v-success)]"><CheckCircle2 size={14} /> مكتمل</span>;
  if (status === "failed") return <span className="inline-flex items-center gap-1 text-[var(--v-danger)]"><XCircle size={14} /> فشل</span>;
  return <span className="inline-flex items-center gap-1 text-[var(--v-text-secondary)]"><MinusCircle size={14} /> متخطّى</span>;
}

export default function AutomationsClient({
  initialStats,
  initialExecutions,
  workflows,
}: {
  initialStats: AutomationStats;
  initialExecutions: ExecutionRow[];
  workflows: WorkflowMeta[];
}) {
  const [stats] = useState(initialStats);
  const [rows, setRows] = useState(initialExecutions);
  const [intel, setIntel] = useState<AutomationIntelligenceResult | null>(null);
  const [intelError, setIntelError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();
  const [analyzing, setAnalyzing] = useState(false);

  const refresh = useCallback(() => {
    startTransition(async () => {
      const res = await refreshExecutionsAction();
      if (res.ok && res.rows) setRows(res.rows);
    });
  }, []);

  // اشتراك Realtime — أي تنفيذ Workflow جديد بيحدّث اللوحة فورًا.
  useEffect(() => {
    const supabase = createClient();
    const channel = supabase
      .channel("workflow-executions")
      .on("postgres_changes", { event: "*", schema: "public", table: "workflow_executions" }, () => refresh())
      .subscribe();
    return () => { supabase.removeChannel(channel); };
  }, [refresh]);

  async function runAnalysis() {
    setAnalyzing(true);
    setIntelError(null);
    const res = await analyzeAutomationAction();
    setAnalyzing(false);
    if (res.ok && res.result) setIntel(res.result);
    else setIntelError(res.message ?? "تعذّر التحليل.");
  }

  return (
    <div className="mx-auto max-w-6xl space-y-6 px-4 py-6 sm:px-6">
      <PageHeader
        title="محرّك الأتمتة"
        icon={Zap}
        description="المنصة بتشتغل بنفسها — كل حدث مهم بيطلق Workflows تلقائية (مهام، إشعارات، تصعيد، Timeline)."
        actions={
          <Button variant="secondary" onClick={refresh} disabled={isPending}>
            <RefreshCw size={15} className={isPending ? "animate-spin" : ""} /> تحديث
          </Button>
        }
      />

      {/* إحصاءات */}
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5">
        <StatCard label="إجمالي التنفيذ" value={stats.total} />
        <StatCard label="مكتمل" value={stats.completed} tone="ok" />
        <StatCard label="فشل" value={stats.failed} tone="bad" />
        <StatCard label="متخطّى" value={stats.skipped} tone="muted" />
        <StatCard label="آخر ٢٤ ساعة" value={stats.last24h} />
      </div>

      {/* ذكاء الأتمتة (AI) */}
      <section className="rounded-[var(--v-radius-lg)] border border-[var(--v-border)] bg-[var(--v-surface)] p-5">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <h2 className="flex items-center gap-2 font-semibold"><Sparkles size={18} className="text-[var(--v-primary)]" /> ذكاء الأتمتة</h2>
          <Button onClick={runAnalysis} disabled={analyzing}>
            {analyzing ? "جارٍ التحليل…" : "حلّل الأداء (AI)"}
          </Button>
        </div>
        {intelError && <p className="mt-3 text-sm text-[var(--v-danger)]">{intelError}</p>}
        {intel && (
          <div className="mt-4 space-y-3 text-sm">
            {intel.executive_summary && <p className="rounded-[var(--v-radius-md)] bg-[var(--v-bg)] p-3 leading-relaxed">{intel.executive_summary}</p>}
            <div className="grid gap-3 sm:grid-cols-3">
              <IntelList title="اختناقات" items={intel.bottlenecks} />
              <IntelList title="إخفاقات متكررة" items={intel.repeated_failures} />
              <IntelList title="توصيات" items={intel.recommendations} />
            </div>
          </div>
        )}
      </section>

      {/* سجل التنفيذ */}
      <section className="rounded-[var(--v-radius-lg)] border border-[var(--v-border)] bg-[var(--v-surface)]">
        <h2 className="flex items-center gap-2 border-b border-[var(--v-border)] p-4 font-semibold">
          <Activity size={18} className="text-[var(--v-primary)]" /> سجل التنفيذ الحي
        </h2>
        {rows.length === 0 ? (
          <p className="p-6 text-center text-sm text-[var(--v-text-secondary)]">لسه مفيش عمليات أتمتة. أول ما يحصل حدث مهم (اكتمال مهمة، اعتماد تسليم…) هيظهر هنا فورًا.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[640px] text-right text-sm">
              <thead className="text-xs text-[var(--v-text-secondary)]">
                <tr className="border-b border-[var(--v-border)]">
                  <th className="p-3 font-medium">الـ Workflow</th>
                  <th className="p-3 font-medium">الحدث</th>
                  <th className="p-3 font-medium">المشروع</th>
                  <th className="p-3 font-medium">الحالة</th>
                  <th className="p-3 font-medium">الإجراءات</th>
                  <th className="p-3 font-medium">التوقيت</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((r) => (
                  <tr key={r.id} className="border-b border-[var(--v-border)] last:border-0">
                    <td className="p-3 font-medium">{r.workflow_id}</td>
                    <td className="p-3 text-[var(--v-text-secondary)]">{EVENT_LABELS[r.event_type as EventType] ?? r.event_type}</td>
                    <td className="p-3 text-[var(--v-text-secondary)]">{r.project_name ?? "—"}</td>
                    <td className="p-3"><StatusBadge status={r.status} /></td>
                    <td className="p-3 text-[var(--v-text-secondary)]">{Array.isArray(r.actions_run) ? r.actions_run.length : 0}{r.error ? ` · ${r.error}` : ""}</td>
                    <td className="p-3 text-xs text-[var(--v-text-secondary)]">{new Date(r.created_at).toLocaleString("ar-EG")}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>

      {/* تعريفات الـ Workflows المفعّلة */}
      <section className="rounded-[var(--v-radius-lg)] border border-[var(--v-border)] bg-[var(--v-surface)] p-5">
        <h2 className="mb-4 font-semibold">الـ Workflows المفعّلة ({workflows.length})</h2>
        <div className="grid gap-3 sm:grid-cols-2">
          {workflows.map((w) => (
            <div key={w.id} className="rounded-[var(--v-radius-md)] border border-[var(--v-border)] bg-[var(--v-bg)] p-3">
              <div className="flex items-center justify-between gap-2">
                <span className="font-medium">{w.title}</span>
                <span className="rounded-full bg-[var(--v-primary-tint)] px-2 py-0.5 text-xs text-[var(--v-primary)]">
                  {EVENT_LABELS[w.trigger as EventType] ?? w.trigger}
                </span>
              </div>
              <p className="mt-1 text-xs leading-relaxed text-[var(--v-text-secondary)]">{w.description}</p>
            </div>
          ))}
        </div>
      </section>
    </div>
  );
}

function IntelList({ title, items }: { title: string; items: string[] }) {
  return (
    <div className="rounded-[var(--v-radius-md)] bg-[var(--v-bg)] p-3">
      <div className="mb-2 text-xs font-semibold text-[var(--v-text-secondary)]">{title}</div>
      {items.length === 0 ? (
        <p className="text-xs text-[var(--v-text-secondary)]">لا يوجد</p>
      ) : (
        <ul className="space-y-1 text-xs leading-relaxed">
          {items.map((it, i) => <li key={i} className="flex gap-1.5"><span className="text-[var(--v-primary)]">•</span> {it}</li>)}
        </ul>
      )}
    </div>
  );
}
