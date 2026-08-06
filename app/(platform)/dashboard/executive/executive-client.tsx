"use client";

import { useState } from "react";
import { Activity, Send, FileText, RefreshCw, TrendingUp, AlertTriangle, Sparkles } from "lucide-react";
import Button from "@/components/ui/Button";
import PageHeader from "@/components/ui/PageHeader";
import type {
  CompanyMetricSnapshot, ExecutiveReport, ExecutiveInsight, ExecutiveReportPeriod,
} from "@/lib/types/database";
import type { CompanyHealthResult as HealthResult } from "@/lib/executive/health";
import {
  askExecutiveAssistantAction, generateExecutiveReportAction, refreshExecutiveSnapshotAction,
} from "./executive-actions";

interface SnapshotProps {
  health: HealthResult;
  kpis: Record<string, number>;
  greenProjects: number;
  yellowProjects: number;
  redProjects: number;
}

const KPI_LABELS: Record<string, string> = {
  activeProjects: "المشاريع النشطة",
  projectSuccessRatePct: "نجاح المشاريع %",
  delayedProjectsPct: "تأخّر التسليم %",
  avgQaScore: "متوسط الجودة",
  qaFailRatePct: "إخفاق الجودة %",
  openCriticalIncidents: "حوادث حرجة مفتوحة",
  supportBacklog: "تراكم الدعم",
  supportSatisfactionPct: "رضا الدعم %",
  automationEfficiencyPct: "كفاءة الأتمتة %",
  overloadedEmployees: "موظّفون فوق الطاقة",
  totalEmployees: "إجمالي الفريق",
  totalKnowledge: "عناصر المعرفة",
};

const REPORT_PERIODS: { key: ExecutiveReportPeriod; label: string }[] = [
  { key: "weekly", label: "أسبوعي" },
  { key: "monthly", label: "شهري" },
  { key: "quarterly", label: "ربع سنوي" },
  { key: "risk", label: "مخاطر" },
];

function bandColor(band: string): string {
  return band === "green" ? "var(--v-success)" : band === "yellow" ? "var(--v-warning)" : "var(--v-danger)";
}

const SUGGESTED = [
  "ما أهم المخاطر هذا الأسبوع؟",
  "أي المشاريع متعثّرة ولماذا؟",
  "من الموظّفون المُرهَقون؟",
  "ما الذي يجب أن أعطيه الأولوية الآن؟",
];

export default function ExecutiveClient({
  snapshot, history, reports, insights,
}: {
  snapshot: SnapshotProps;
  history: CompanyMetricSnapshot[];
  reports: ExecutiveReport[];
  insights: ExecutiveInsight[];
}) {
  const health = snapshot.health;
  const [question, setQuestion] = useState("");
  const [answer, setAnswer] = useState<string | null>(null);
  const [asking, setAsking] = useState(false);
  const [reportList, setReportList] = useState(reports);
  const [genPeriod, setGenPeriod] = useState<ExecutiveReportPeriod | null>(null);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function ask(q: string) {
    const text = q.trim();
    if (!text) return;
    setAsking(true); setError(null); setAnswer(null);
    const res = await askExecutiveAssistantAction(text);
    setAsking(false);
    if (res.ok) setAnswer(res.answer ?? "");
    else setError(res.message ?? "تعذّر الحصول على إجابة.");
  }

  async function genReport(period: ExecutiveReportPeriod) {
    setGenPeriod(period); setError(null);
    const res = await generateExecutiveReportAction(period);
    setGenPeriod(null);
    if (res.ok && res.report) setReportList((prev) => [res.report as ExecutiveReport, ...prev]);
    else setError(res.message ?? "تعذّر توليد التقرير.");
  }

  async function refresh() {
    setRefreshing(true);
    await refreshExecutiveSnapshotAction();
    setRefreshing(false);
    window.location.reload();
  }

  const trend = [...history].reverse();

  return (
    <div className="mx-auto max-w-6xl space-y-6 px-4 py-6 sm:px-6">
      <PageHeader
        title="غرفة القيادة التنفيذية"
        icon={Activity}
        description="العقل التنفيذي (COO) — رؤية حيّة لصحة الشركة كاملة، مع مساعد AI وتقارير تنفيذية."
        actions={
          <Button variant="secondary" onClick={refresh} disabled={refreshing}>
            <RefreshCw size={15} className={refreshing ? "animate-spin" : ""} /> تحديث
          </Button>
        }
      />

      {error && <p className="rounded-[var(--v-radius-md)] bg-[var(--v-danger)]/10 p-3 text-sm text-[var(--v-danger)]">{error}</p>}

      {/* درجة الصحة + توزيع المشاريع */}
      <section className="grid gap-4 lg:grid-cols-3">
        <div className="flex flex-col items-center justify-center rounded-[var(--v-radius-lg)] border border-[var(--v-border)] bg-[var(--v-surface)] p-6">
          <div className="text-6xl font-bold" style={{ color: bandColor(health.band) }}>{health.score}<span className="text-2xl">%</span></div>
          <div className="mt-2 text-sm text-[var(--v-text-secondary)]">درجة صحة الشركة</div>
          <div className="mt-3 flex gap-3 text-xs">
            <span className="text-[var(--v-success)]">● {snapshot.greenProjects} سليم</span>
            <span className="text-[var(--v-warning)]">● {snapshot.yellowProjects} متوسط</span>
            <span className="text-[var(--v-danger)]">● {snapshot.redProjects} خطر</span>
          </div>
        </div>
        <div className="lg:col-span-2 rounded-[var(--v-radius-lg)] border border-[var(--v-border)] bg-[var(--v-surface)] p-5">
          <h2 className="mb-3 text-sm font-semibold">أبعاد الصحة</h2>
          <div className="space-y-2">
            {health.breakdown.map((d) => (
              <div key={d.key} className="flex items-center gap-3">
                <span className="w-32 shrink-0 text-xs text-[var(--v-text-secondary)]">{d.label}</span>
                <div className="h-2 flex-1 overflow-hidden rounded-full bg-[var(--v-bg)]">
                  <div className="h-full rounded-full" style={{ width: `${d.score}%`, background: bandColor(d.score >= 75 ? "green" : d.score >= 50 ? "yellow" : "red") }} />
                </div>
                <span className="w-10 shrink-0 text-left text-xs font-medium">{d.score}%</span>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* KPI tiles */}
      <section className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6">
        {Object.entries(snapshot.kpis).map(([k, v]) => (
          <div key={k} className="rounded-[var(--v-radius-lg)] border border-[var(--v-border)] bg-[var(--v-surface)] p-3">
            <div className="text-xl font-bold">{v}</div>
            <div className="mt-1 text-[11px] leading-tight text-[var(--v-text-secondary)]">{KPI_LABELS[k] ?? k}</div>
          </div>
        ))}
      </section>

      {/* اتجاه الصحة */}
      {trend.length > 1 && (
        <section className="rounded-[var(--v-radius-lg)] border border-[var(--v-border)] bg-[var(--v-surface)] p-5">
          <h2 className="mb-3 flex items-center gap-1.5 text-sm font-semibold"><TrendingUp size={16} className="text-[var(--v-primary)]" /> اتجاه صحة الشركة</h2>
          <div className="flex items-end gap-1" style={{ height: 80 }}>
            {trend.map((s) => (
              <div key={s.id} className="flex-1 rounded-t" title={`${s.health_score}% · ${new Date(s.snapshot_at).toLocaleString("ar-EG")}`}
                style={{ height: `${Math.max(4, s.health_score)}%`, background: bandColor(s.health_band), opacity: 0.85 }} />
            ))}
          </div>
        </section>
      )}

      {/* المساعد التنفيذي */}
      <section className="rounded-[var(--v-radius-lg)] border border-[var(--v-border)] bg-[var(--v-surface)] p-5">
        <h2 className="mb-3 flex items-center gap-1.5 font-semibold"><Sparkles size={18} className="text-[var(--v-primary)]" /> المساعد التنفيذي (COO)</h2>
        <div className="flex gap-2">
          <input
            value={question}
            onChange={(e) => setQuestion(e.target.value)}
            onKeyDown={(e) => { if (e.key === "Enter") ask(question); }}
            placeholder="اسأل عن حالة الشركة، المخاطر، الأولويات…"
            className="flex-1 rounded-[var(--v-radius-md)] border border-[var(--v-border)] bg-[var(--v-bg)] px-3 py-2 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--v-primary)]"
          />
          <Button onClick={() => ask(question)} disabled={asking}><Send size={15} /> {asking ? "…" : "اسأل"}</Button>
        </div>
        <div className="mt-2 flex flex-wrap gap-1.5">
          {SUGGESTED.map((s) => (
            <button key={s} onClick={() => { setQuestion(s); ask(s); }} disabled={asking}
              className="rounded-full border border-[var(--v-border)] px-2.5 py-1 text-xs text-[var(--v-text-secondary)] hover:bg-[var(--v-bg)]">
              {s}
            </button>
          ))}
        </div>
        {answer && <div className="mt-4 whitespace-pre-wrap rounded-[var(--v-radius-md)] bg-[var(--v-bg)] p-4 text-sm leading-relaxed">{answer}</div>}
        {insights.length > 0 && (
          <details className="mt-3">
            <summary className="cursor-pointer text-xs text-[var(--v-text-secondary)]">أسئلة سابقة ({insights.length})</summary>
            <div className="mt-2 space-y-2">
              {insights.map((i) => (
                <div key={i.id} className="rounded-[var(--v-radius-md)] border border-[var(--v-border)] p-2 text-xs">
                  <div className="font-medium">{i.question}</div>
                  <div className="mt-1 whitespace-pre-wrap text-[var(--v-text-secondary)]">{i.answer}</div>
                </div>
              ))}
            </div>
          </details>
        )}
      </section>

      {/* التقارير التنفيذية */}
      <section className="rounded-[var(--v-radius-lg)] border border-[var(--v-border)] bg-[var(--v-surface)] p-5">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <h2 className="flex items-center gap-1.5 font-semibold"><FileText size={18} className="text-[var(--v-primary)]" /> التقارير التنفيذية</h2>
          <div className="flex flex-wrap gap-1.5">
            {REPORT_PERIODS.map((p) => (
              <Button key={p.key} variant="secondary" onClick={() => genReport(p.key)} disabled={genPeriod !== null}>
                {genPeriod === p.key ? "…" : p.label}
              </Button>
            ))}
          </div>
        </div>
        {reportList.length === 0 ? (
          <p className="mt-4 text-sm text-[var(--v-text-secondary)]">لسه مفيش تقارير. ولّد تقريرًا من الأزرار فوق.</p>
        ) : (
          <div className="mt-4 space-y-3">
            {reportList.map((r) => {
              const analysis = (r.analysis ?? {}) as { risks?: string[]; recommendations?: string[]; predictions?: string[]; action_plan?: string[] };
              return (
                <details key={r.id} className="rounded-[var(--v-radius-md)] border border-[var(--v-border)] bg-[var(--v-bg)] p-3">
                  <summary className="cursor-pointer text-sm font-medium">{r.title} · {new Date(r.generated_at).toLocaleDateString("ar-EG")}</summary>
                  {r.status === "failed" ? (
                    <p className="mt-2 text-xs text-[var(--v-danger)]">فشل التوليد: {r.last_error}</p>
                  ) : (
                    <div className="mt-2 space-y-2 text-xs leading-relaxed">
                      {r.executive_summary && <p>{r.executive_summary}</p>}
                      <ReportList icon={<AlertTriangle size={12} />} title="المخاطر" items={analysis.risks} color="var(--v-danger)" />
                      <ReportList title="التوصيات" items={analysis.recommendations} color="var(--v-primary)" />
                      <ReportList title="التوقّعات" items={analysis.predictions} color="var(--v-warning)" />
                      <ReportList title="خطة العمل" items={analysis.action_plan} color="var(--v-success)" />
                    </div>
                  )}
                </details>
              );
            })}
          </div>
        )}
      </section>
    </div>
  );
}

function ReportList({ title, items, color, icon }: { title: string; items?: string[]; color: string; icon?: React.ReactNode }) {
  if (!items || items.length === 0) return null;
  return (
    <div>
      <div className="mb-0.5 flex items-center gap-1 font-semibold" style={{ color }}>{icon} {title}</div>
      <ul className="space-y-0.5">
        {items.map((it, i) => <li key={i} className="flex gap-1.5"><span style={{ color }}>•</span> {it}</li>)}
      </ul>
    </div>
  );
}
