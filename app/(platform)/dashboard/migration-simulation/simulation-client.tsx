"use client";

import { useState, useTransition, useCallback, useRef, useEffect } from "react";
import { FlaskConical, Play, Check, X, Archive, Brain, ChevronDown, ShieldAlert, GitBranch, Gauge, Boxes, Zap, RotateCcw, AlertTriangle } from "lucide-react";
import Card from "@/components/ui/Card";
import Badge, { type BadgeTone } from "@/components/ui/Badge";
import Button from "@/components/ui/Button";
import Textarea from "@/components/ui/Textarea";
import EmptyState from "@/components/ui/EmptyState";
import type { SimDashboard, SimSource, SimRow } from "@/lib/simulation/simulation-dashboard";
import { runDryRun, getStatus, getDetail, approve, reject, archive, promote } from "./actions";

// ────────────────────────────────────────────────────────────
// أنواع العرض (مطابقة لِمخرَجات lib/simulation)
// ────────────────────────────────────────────────────────────

interface SimDetail {
  simulation: SimRow & {
    status: string; domain: string; blockers: string[]; ai_summary: string;
    report: FullReport; duration_ms: number; error: string | null; promoted_to_org_memory: boolean;
  };
  steps: Array<{ step_order: number; name: string; status: string; processed: number; failed: number; estimated_ms: number }>;
  issues: Array<{ entity: string; category: string; issue_type: string; field: string; severity: string; count: number; message: string; samples: Array<{ oldValue: string; newValue: string }> }>;
  reports: Array<{ report_type: string; content: unknown }>;
}

interface FullReport {
  summary?: Record<string, unknown>;
  approval?: { score: number; verdict: string; blocked: boolean; blockers: string[]; breakdown: Record<string, number>; reasons: string[] };
  difference?: { counts: Array<{ label: string; oldValue: number; newValue: number; difference: number; expected: boolean; reason: string }>; unexpectedCount: number };
  relationships?: { checks: Array<{ fromEntity: string; toEntity: string; kind: string; checked: number; broken: number; passed: boolean; message: string }>; totalBroken: number; circularChains: string[][] };
  business?: { checks: Array<{ title: string; entity: string; passed: boolean; oldValue: string; newValue: string; message: string }>; failures: number };
  risk?: { riskScore: number; level: string; failureProbability: number; criticalTables: string[]; bottlenecks: string[]; risks: Array<{ title: string; level: string; probability: number; reason: string; mitigation: string }> };
  performance?: { scenarios: Array<{ label: string; rows: number; estimatedSeconds: number; peakMemoryMb: number; estimatedDowntimeSeconds: number }>; strategy: { batchSize: number; queueSize: number; parallelism: number; retryStrategy: string; resumeStrategy: string }; notes: string[] };
  failure?: { scenarios: Array<{ title: string; verdict: string; canResume: boolean; canRecover: boolean; safeRetry: boolean; dataLossRisk: boolean; explanation: string }>; resilient: boolean };
  rollback?: { success: boolean; estimatedSeconds: number; dataLoss: boolean; coverage: number; notes: string[] };
  recommendations?: Array<{ order: number; title: string; detail: string; priority: string }>;
  ai?: { executive_summary: string; business_consistency: { verdict: string; findings: string[] }; risk_prediction: Array<{ title: string; level: string; reason: string; mitigation: string }>; recommendations: string[]; go_no_go: string };
}

// ────────────────────────────────────────────────────────────
// أدوات مساعدة
// ────────────────────────────────────────────────────────────

function scoreTone(n: number): BadgeTone {
  if (n >= 90) return "success";
  if (n >= 70) return "info";
  if (n >= 50) return "warning";
  return "danger";
}
function verdictLabel(v: string): { label: string; tone: BadgeTone } {
  if (v === "ready") return { label: "جاهز للترحيل", tone: "success" };
  if (v === "ready_with_warnings") return { label: "جاهز مع تحذيرات", tone: "warning" };
  return { label: "غير جاهز", tone: "danger" };
}
function riskTone(l: string): BadgeTone {
  return l === "critical" || l === "high" ? "danger" : l === "medium" ? "warning" : "success";
}
function stepTone(s: string): BadgeTone {
  return s === "passed" ? "success" : s === "warning" ? "warning" : "danger";
}
function sevTone(s: string): BadgeTone {
  return s === "critical" ? "danger" : s === "high" ? "danger" : s === "medium" ? "warning" : "neutral";
}

// ────────────────────────────────────────────────────────────
// الجذر
// ────────────────────────────────────────────────────────────

export default function SimulationClient({ dashboard }: { dashboard: SimDashboard }) {
  const [banner, setBanner] = useState<{ tone: BadgeTone; text: string } | null>(null);
  const notify = useCallback((tone: BadgeTone, text: string) => setBanner({ tone, text }), []);
  const t = dashboard.totals;

  return (
    <div className="space-y-5">
      {banner && (
        <div className="rounded-[var(--v-radius-md)] border border-[var(--v-border)] bg-[var(--v-surface-2)] px-4 py-2.5 text-sm text-[var(--v-text)]">
          <Badge tone={banner.tone}>{banner.tone === "danger" ? "تنبيه" : "تم"}</Badge> <span className="ms-2">{banner.text}</span>
        </div>
      )}

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-5">
        <StatTile label="محاكاة" value={t.runs} />
        <StatTile label="جاهزة" value={t.ready} tone="success" />
        <StatTile label="معتمَدة" value={t.approved} tone="info" />
        <StatTile label="محظورة" value={t.blocked} tone={t.blocked > 0 ? "danger" : "neutral"} />
        <StatTile label="متوسّط الدرجة" value={t.avgScore} tone={scoreTone(t.avgScore)} />
      </div>

      <div className="rounded-[var(--v-radius-md)] border border-[var(--v-border)] bg-[var(--v-surface-2)] px-4 py-3 text-xs text-[var(--v-text-secondary)]">
        <strong className="text-[var(--v-text)]">Never Touch Production Before Simulation.</strong> كل محاكاة تعمل داخل نسخة رقمية (Digital Twin) في الذاكرة — لا كتابة ولا اتصال ببيانات الإنتاج.
      </div>

      <h2 className="text-sm font-bold text-[var(--v-text)]">المصادر — شغّل محاكاة كاملة</h2>

      {dashboard.sources.length === 0 ? (
        <EmptyState icon={<FlaskConical size={22} />} title="لا توجد مصادر جاهزة" description="أنشئ مصدرًا (المرحلة ١)، ابنِ Mapping (٢)، نظّف (٣)، وابنِ محرّك تحويل معتمَدًا (٤) — ثم شغّل المحاكاة هنا." />
      ) : (
        <div className="space-y-3">
          {dashboard.sources.map((s) => (
            <SourceCard key={s.id} source={s} latest={dashboard.simulations.find((x) => x.source_id === s.id) ?? null} onNotify={notify} />
          ))}
        </div>
      )}
    </div>
  );
}

function StatTile({ label, value, tone }: { label: string; value: string | number; tone?: BadgeTone }) {
  return (
    <Card padding="sm">
      <div className="text-xs text-[var(--v-text-muted)]">{label}</div>
      <div className="mt-1 text-xl font-bold tabular-nums text-[var(--v-text)]">{value}</div>
      {tone && tone !== "neutral" && <div className="mt-1 h-1 rounded-full" style={{ background: `var(--v-${tone === "success" ? "green" : tone === "danger" ? "red" : tone === "warning" ? "amber" : "primary"})` }} />}
    </Card>
  );
}

// ────────────────────────────────────────────────────────────
// بطاقة مصدر — تشغيل ومتابعة وعرض
// ────────────────────────────────────────────────────────────

function SourceCard({ source, latest, onNotify }: { source: SimSource; latest: SimRow | null; onNotify: (t: BadgeTone, s: string) => void }) {
  const [open, setOpen] = useState(false);
  const [content, setContent] = useState("");
  const [pending, startTransition] = useTransition();
  const [simId, setSimId] = useState<string | null>(latest?.id ?? null);
  const [status, setStatus] = useState<string | null>(latest?.status ?? null);
  const [detail, setDetail] = useState<SimDetail | null>(null);
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const loadDetail = useCallback((id: string) => {
    getDetail(id).then((r) => { if (r.ok && r.detail) setDetail(r.detail as SimDetail); });
  }, []);

  useEffect(() => () => { if (pollRef.current) clearInterval(pollRef.current); }, []);

  const startPolling = useCallback((id: string) => {
    if (pollRef.current) clearInterval(pollRef.current);
    pollRef.current = setInterval(async () => {
      const r = await getStatus(id);
      if (r.ok && r.status && r.status !== "running") {
        if (pollRef.current) clearInterval(pollRef.current);
        setStatus(r.status);
        loadDetail(id);
        onNotify(r.status === "failed" ? "danger" : "success", r.status === "failed" ? "فشلت المحاكاة — راجع التفاصيل." : "اكتملت المحاكاة.");
      }
    }, 2500);
  }, [loadDetail, onNotify]);

  function run() {
    startTransition(async () => {
      const r = await runDryRun(source.id, content);
      onNotify(r.ok ? "info" : "danger", r.message ?? "");
      if (r.ok && r.simulationId) {
        setSimId(r.simulationId); setStatus("running"); setDetail(null); setOpen(true);
        startPolling(r.simulationId);
      }
    });
  }

  function act(fn: (id: string) => Promise<{ ok: boolean; message?: string }>) {
    if (!simId) return;
    startTransition(async () => {
      const r = await fn(simId);
      onNotify(r.ok ? "success" : "danger", r.message ?? "");
      if (r.ok) loadDetail(simId);
    });
  }

  return (
    <Card padding="md">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="min-w-0">
          <div className="flex items-center gap-2">
            <span className="truncate text-sm font-bold text-[var(--v-text)]">{source.name}</span>
            <Badge tone="neutral">{source.source_type}</Badge>
            {latest && <Badge tone={scoreTone(latest.approval_score)}>{latest.approval_score}/100</Badge>}
          </div>
          {!source.pipeline_approved && <p className="mt-1 text-xs text-[var(--v-amber)]">اعتمد محرّك التحويل (المرحلة ٤) أولًا لتفعيل المحاكاة.</p>}
        </div>
        <div className="flex items-center gap-2">
          {(simId || source.pipeline_approved) && (
            <Button variant="ghost" size="sm" onClick={() => { setOpen((o) => !o); if (!detail && simId) loadDetail(simId); }} icon={<ChevronDown size={15} className={open ? "rotate-180 transition" : "transition"} />}>
              {open ? "إخفاء" : "التفاصيل"}
            </Button>
          )}
        </div>
      </div>

      {open && (
        <div className="mt-4 space-y-4 border-t border-[var(--v-border)] pt-4">
          {source.pipeline_approved && (
            <div className="space-y-2">
              <div className="text-xs font-bold text-[var(--v-text)]">شغّل محاكاة (Dry Run) — الصق عيّنة تصدير من النظام القديم</div>
              <Textarea rows={4} value={content} onChange={(e) => setContent(e.target.value)} placeholder='CSV أو JSON — يدعم عدّة كيانات مثل {"customers":[...],"orders":[...]}' />
              <Button variant="primary" size="sm" onClick={run} loading={pending && status === "running"} disabled={pending} icon={<Play size={15} />}>تشغيل المحاكاة الكاملة</Button>
            </div>
          )}

          {status === "running" && (
            <div className="flex items-center gap-2 rounded-[var(--v-radius-md)] bg-[var(--v-surface-2)] px-3 py-2 text-sm text-[var(--v-text-secondary)]">
              <span className="h-2 w-2 animate-pulse rounded-full bg-[var(--v-primary)]" /> تجري المحاكاة داخل الـDigital Twin…
            </div>
          )}

          {detail && status !== "running" && <SimulationReportView detail={detail} onAct={act} pending={pending} />}
        </div>
      )}
    </Card>
  );
}

// ────────────────────────────────────────────────────────────
// عرض التقرير الشامل
// ────────────────────────────────────────────────────────────

function SimulationReportView({ detail, onAct, pending }: { detail: SimDetail; onAct: (fn: (id: string) => Promise<{ ok: boolean; message?: string }>) => void; pending: boolean }) {
  const sim = detail.simulation;
  const r = sim.report ?? {};
  const approval = r.approval;
  const v = verdictLabel(sim.readiness_verdict);

  if (sim.status === "failed") {
    return <div className="rounded-[var(--v-radius-md)] border border-[var(--v-red)]/40 bg-[var(--v-red)]/5 px-3 py-2 text-sm text-[var(--v-text)]"><Badge tone="danger">فشل</Badge> <span className="ms-2">{sim.error ?? "خطأ غير معروف."}</span></div>;
  }

  return (
    <div className="space-y-4">
      {/* الحكم + الدرجة */}
      <div className="grid gap-3 sm:grid-cols-[auto_1fr]">
        <ScoreRing score={approval?.score ?? sim.approval_score} />
        <div className="space-y-2">
          <div className="flex flex-wrap items-center gap-2">
            <Badge tone={v.tone}>{v.label}</Badge>
            <Badge tone={riskTone(sim.risk_level)}>مخاطر: {sim.risk_level}</Badge>
            {sim.status === "approved" && <Badge tone="success">معتمَدة</Badge>}
            {sim.status === "rejected" && <Badge tone="danger">مرفوضة</Badge>}
            {sim.promoted_to_org_memory && <Badge tone="info">مُرقّاة للذاكرة</Badge>}
          </div>
          {sim.ai_summary && <p className="text-xs leading-relaxed text-[var(--v-text-secondary)]">{sim.ai_summary}</p>}
          {approval?.blocked && (
            <div className="rounded-[var(--v-radius-md)] border border-[var(--v-red)]/40 bg-[var(--v-red)]/5 px-3 py-2 text-xs text-[var(--v-text)]">
              <div className="mb-1 flex items-center gap-1.5 font-bold text-[var(--v-red)]"><ShieldAlert size={14} /> قواعد المنع — الترحيل الحقيقي محظور</div>
              <ul className="list-inside list-disc space-y-0.5">{approval.blockers.map((b, i) => <li key={i}>{b}</li>)}</ul>
            </div>
          )}
        </div>
      </div>

      {/* أزرار المدير */}
      {(sim.status === "completed" || sim.status === "approved" || sim.status === "rejected") && (
        <div className="flex flex-wrap gap-2">
          <Button variant="success" size="sm" disabled={pending || approval?.blocked || sim.status === "approved"} onClick={() => onAct((id) => approve(id))} icon={<Check size={15} />}>اعتماد</Button>
          <Button variant="danger" size="sm" disabled={pending || sim.status === "rejected"} onClick={() => onAct((id) => reject(id, "مرفوضة من المدير"))} icon={<X size={15} />}>رفض</Button>
          <Button variant="secondary" size="sm" disabled={pending || sim.promoted_to_org_memory} onClick={() => onAct((id) => promote(id))} icon={<Brain size={15} />}>ترقية الدروس</Button>
          <Button variant="ghost" size="sm" disabled={pending} onClick={() => onAct((id) => archive(id))} icon={<Archive size={15} />}>أرشفة</Button>
        </div>
      )}

      {/* خطوات إعادة التنفيذ */}
      <Section icon={<Boxes size={15} />} title={`خطوات إعادة التنفيذ (Digital Twin) — ${detail.steps.length}`}>
        <div className="space-y-1">
          {detail.steps.map((s) => (
            <div key={s.step_order} className="flex items-center justify-between gap-2 rounded-[var(--v-radius-sm)] bg-[var(--v-surface-2)] px-2.5 py-1.5 text-xs">
              <span className="flex items-center gap-2"><Badge tone={stepTone(s.status)}>{s.step_order}</Badge> <span className="text-[var(--v-text)]">{s.name}</span></span>
              <span className="tabular-nums text-[var(--v-text-muted)]">{s.processed} صفّ · {s.failed} فشل · ~{s.estimated_ms}ms</span>
            </div>
          ))}
        </div>
      </Section>

      {/* الفروق */}
      {r.difference && (
        <Section icon={<GitBranch size={15} />} title={`تحليل الفروق — ${r.difference.unexpectedCount} فرق غير متوقّع`}>
          <div className="overflow-x-auto">
            <table className="w-full text-xs">
              <thead><tr className="text-[var(--v-text-muted)]"><th className="p-1.5 text-start">الكيان</th><th className="p-1.5">قديم</th><th className="p-1.5">جديد</th><th className="p-1.5">الفرق</th><th className="p-1.5 text-start">الحالة</th></tr></thead>
              <tbody>
                {r.difference.counts.map((c, i) => (
                  <tr key={i} className="border-t border-[var(--v-border)]">
                    <td className="p-1.5 text-[var(--v-text)]">{c.label}</td>
                    <td className="p-1.5 text-center tabular-nums">{c.oldValue}</td>
                    <td className="p-1.5 text-center tabular-nums">{c.newValue}</td>
                    <td className="p-1.5 text-center tabular-nums">{c.difference}</td>
                    <td className="p-1.5"><Badge tone={c.expected ? "success" : "danger"}>{c.expected ? "متوقّع" : "غير متوقّع"}</Badge></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Section>
      )}

      {/* العلاقات */}
      {r.relationships && (
        <Section icon={<GitBranch size={15} />} title={`السلامة المرجعية — ${r.relationships.totalBroken} مرجع مكسور`}>
          {r.relationships.checks.length === 0 ? <p className="text-xs text-[var(--v-text-muted)]">لا علاقات في العيّنة.</p> : r.relationships.checks.map((c, i) => (
            <div key={i} className="flex items-center justify-between gap-2 py-1 text-xs">
              <span className="text-[var(--v-text)]">{c.fromEntity} → {c.toEntity} <span className="text-[var(--v-text-muted)]">({c.kind})</span></span>
              <Badge tone={c.passed ? "success" : "danger"}>{c.message}</Badge>
            </div>
          ))}
          {r.relationships.circularChains.length > 0 && <p className="mt-1 text-xs text-[var(--v-amber)]">دورات: {r.relationships.circularChains.map((ch) => ch.join(" → ")).join(" | ")}</p>}
        </Section>
      )}

      {/* التحقّق التجاري */}
      {r.business && (
        <Section icon={<Check size={15} />} title={`التحقّق التجاري — ${r.business.failures} فشل`}>
          {r.business.checks.map((c, i) => (
            <div key={i} className="flex items-center justify-between gap-2 py-1 text-xs">
              <span className="text-[var(--v-text)]">{c.title} <span className="text-[var(--v-text-muted)]">({c.entity})</span></span>
              <span className="flex items-center gap-1.5"><span className="tabular-nums text-[var(--v-text-muted)]">{c.oldValue}→{c.newValue}</span><Badge tone={c.passed ? "success" : "danger"}>{c.passed ? "سليم" : "فشل"}</Badge></span>
            </div>
          ))}
        </Section>
      )}

      {/* كتالوج المشاكل (Explainability) */}
      {detail.issues.length > 0 && (
        <Section icon={<AlertTriangle size={15} />} title={`كتالوج المشاكل — ${detail.issues.length}`}>
          <div className="space-y-1.5">
            {detail.issues.slice(0, 40).map((i, k) => (
              <div key={k} className="rounded-[var(--v-radius-sm)] bg-[var(--v-surface-2)] px-2.5 py-1.5 text-xs">
                <div className="flex items-center justify-between gap-2">
                  <span className="text-[var(--v-text)]"><Badge tone={sevTone(i.severity)}>{i.severity}</Badge> <span className="ms-1">{i.entity}.{i.field}</span></span>
                  <span className="tabular-nums text-[var(--v-text-muted)]">×{i.count}</span>
                </div>
                <p className="mt-0.5 text-[var(--v-text-secondary)]">{i.message}</p>
                {i.samples.length > 0 && <p className="mt-0.5 text-[var(--v-text-muted)]">مثال: {i.samples.map((s) => `${s.oldValue || "∅"}→${s.newValue || "∅"}`).join("، ")}</p>}
              </div>
            ))}
          </div>
        </Section>
      )}

      {/* الأداء */}
      {r.performance && (
        <Section icon={<Zap size={15} />} title="محاكاة الأداء والدفعات">
          <div className="overflow-x-auto">
            <table className="w-full text-xs">
              <thead><tr className="text-[var(--v-text-muted)]"><th className="p-1.5 text-start">الحجم</th><th className="p-1.5">الزمن</th><th className="p-1.5">ذروة الذاكرة</th><th className="p-1.5">التوقّف</th></tr></thead>
              <tbody>{r.performance.scenarios.map((s, i) => (
                <tr key={i} className="border-t border-[var(--v-border)]"><td className="p-1.5 text-[var(--v-text)]">{s.label}</td><td className="p-1.5 text-center tabular-nums">{s.estimatedSeconds}ث</td><td className="p-1.5 text-center tabular-nums">{s.peakMemoryMb}MB</td><td className="p-1.5 text-center tabular-nums">{s.estimatedDowntimeSeconds}ث</td></tr>
              ))}</tbody>
            </table>
          </div>
          <p className="mt-2 text-xs text-[var(--v-text-secondary)]">الإستراتيجية المقترحة: Batch {r.performance.strategy.batchSize} · توازي {r.performance.strategy.parallelism} · طابور {r.performance.strategy.queueSize}.</p>
        </Section>
      )}

      {/* الأعطال */}
      {r.failure && (
        <Section icon={<ShieldAlert size={15} />} title={`محاكاة الأعطال — ${r.failure.resilient ? "صامد" : "به نقاط ضعف"}`}>
          {r.failure.scenarios.map((s, i) => (
            <div key={i} className="flex items-center justify-between gap-2 py-1 text-xs">
              <span className="text-[var(--v-text)]">{s.title}</span>
              <span className="flex items-center gap-1"><Badge tone={s.canResume ? "success" : "danger"}>استئناف</Badge><Badge tone={s.safeRetry ? "success" : "warning"}>إعادة آمنة</Badge><Badge tone={stepTone(s.verdict)}>{s.verdict === "passed" ? "سليم" : s.verdict === "warning" ? "تحذير" : "خطر"}</Badge></span>
            </div>
          ))}
        </Section>
      )}

      {/* التراجع */}
      {r.rollback && (
        <Section icon={<RotateCcw size={15} />} title="محاكاة التراجع (Rollback)">
          <div className="flex flex-wrap items-center gap-2 text-xs">
            <Badge tone={r.rollback.success ? "success" : "danger"}>{r.rollback.success ? "نجح" : "فشل"}</Badge>
            <Badge tone={r.rollback.dataLoss ? "danger" : "success"}>{r.rollback.dataLoss ? "فقدان بيانات" : "بلا فقدان"}</Badge>
            <span className="text-[var(--v-text-muted)]">~{r.rollback.estimatedSeconds}ث · تغطية {r.rollback.coverage}%</span>
          </div>
        </Section>
      )}

      {/* التوصيات */}
      {r.recommendations && r.recommendations.length > 0 && (
        <Section icon={<Gauge size={15} />} title="التوصيات الذكية">
          <ol className="space-y-1.5">
            {r.recommendations.map((rec) => (
              <li key={rec.order} className="rounded-[var(--v-radius-sm)] bg-[var(--v-surface-2)] px-2.5 py-1.5 text-xs">
                <span className="flex items-center gap-1.5"><Badge tone={rec.priority === "critical" ? "danger" : rec.priority === "high" ? "warning" : "neutral"}>{rec.order}</Badge> <span className="font-bold text-[var(--v-text)]">{rec.title}</span></span>
                <p className="mt-0.5 text-[var(--v-text-secondary)]">{rec.detail}</p>
              </li>
            ))}
          </ol>
        </Section>
      )}

      {/* رؤى الذكاء الاصطناعي */}
      {r.ai && (
        <Section icon={<Brain size={15} />} title={`رؤى الذكاء الاصطناعي — القرار: ${r.ai.go_no_go}`}>
          {r.ai.business_consistency.findings.length > 0 && <ul className="mb-2 list-inside list-disc space-y-0.5 text-xs text-[var(--v-text-secondary)]">{r.ai.business_consistency.findings.map((f, i) => <li key={i}>{f}</li>)}</ul>}
          {r.ai.risk_prediction.map((rp, i) => (
            <div key={i} className="py-1 text-xs"><Badge tone={riskTone(rp.level)}>{rp.level}</Badge> <span className="ms-1 font-bold text-[var(--v-text)]">{rp.title}</span><p className="text-[var(--v-text-secondary)]">{rp.reason} — <span className="text-[var(--v-text-muted)]">{rp.mitigation}</span></p></div>
          ))}
        </Section>
      )}
    </div>
  );
}

function ScoreRing({ score }: { score: number }) {
  const tone = scoreTone(score);
  const color = tone === "success" ? "var(--v-green)" : tone === "info" ? "var(--v-primary)" : tone === "warning" ? "var(--v-amber)" : "var(--v-red)";
  return (
    <div className="flex flex-col items-center justify-center rounded-[var(--v-radius-md)] bg-[var(--v-surface-2)] p-3" style={{ minWidth: 96 }}>
      <div className="grid h-16 w-16 place-items-center rounded-full" style={{ background: `conic-gradient(${color} ${score * 3.6}deg, var(--v-border) 0deg)` }}>
        <div className="grid h-12 w-12 place-items-center rounded-full bg-[var(--v-surface)]">
          <span className="text-base font-bold tabular-nums text-[var(--v-text)]">{score}</span>
        </div>
      </div>
      <div className="mt-1.5 text-[0.65rem] text-[var(--v-text-muted)]">درجة الاعتماد</div>
    </div>
  );
}

function Section({ icon, title, children }: { icon: React.ReactNode; title: string; children: React.ReactNode }) {
  return (
    <div className="rounded-[var(--v-radius-md)] border border-[var(--v-border)] p-3">
      <div className="mb-2 flex items-center gap-1.5 text-xs font-bold text-[var(--v-text)]">{icon} {title}</div>
      {children}
    </div>
  );
}
