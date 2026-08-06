"use client";

import { useState, useTransition, useCallback } from "react";
import { HeartPulse, Play, Activity, AlertTriangle, Wrench, Brain, Flag, ChevronDown, Check, X } from "lucide-react";
import Card from "@/components/ui/Card";
import Badge, { type BadgeTone } from "@/components/ui/Badge";
import Button from "@/components/ui/Button";
import EmptyState from "@/components/ui/EmptyState";
import type { HypercareDashboard, HcCertifiedOption, HcPeriodRow } from "@/lib/hypercare/dashboard";
import { start, getDetail, runTick, resolveInc, rootCause, decideOpt, decideKnowledge, close } from "./actions";

interface Detail {
  period: HcPeriodRow & { status: string; overall_health_score: number; duration_days: number; satisfaction_score: number; closure_report: { finalHealthScore?: number; customerSatisfaction?: number; highlights?: string[] } };
  incidents: Array<{ id: string; title: string; severity: string; status: string; impact: string; affected_modules: string[]; suggested_solution: string; root_cause: string | null; detected_by: string }>;
  optimizations: Array<{ id: string; category: string; title: string; detail: string; priority: string; expected_gain: string; status: string; performance_gain: string | null }>;
  knowledge: Array<{ id: string; kind: string; title: string; content: string; confidence: number; status: string }>;
  feedback: Array<{ id: string; kind: string; title: string; status: string }>;
  snapshots: Array<{ health_score: number; anomalies_count: number; created_at: string }>;
}

function healthTone(n: number): BadgeTone {
  return n >= 90 ? "success" : n >= 70 ? "info" : n >= 50 ? "warning" : "danger";
}
function sevTone(s: string): BadgeTone {
  return s === "critical" || s === "high" ? "danger" : s === "medium" ? "warning" : "neutral";
}
const STATUS_LABEL: Record<string, string> = { active: "نشط", ending: "ينتهي", closed: "مغلق" };

export default function HypercareClient({ dashboard }: { dashboard: HypercareDashboard }) {
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

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <StatTile label="فترات نشطة" value={t.active} tone="info" />
        <StatTile label="مشاريع مُغلقة" value={t.closed} tone="success" />
        <StatTile label="حوادث مفتوحة" value={t.openIncidents} tone={t.openIncidents > 0 ? "danger" : "neutral"} />
        <StatTile label="متوسّط الصحة" value={t.avgHealth} tone={healthTone(t.avgHealth)} />
      </div>

      <div className="rounded-[var(--v-radius-md)] border border-[var(--v-border)] bg-[var(--v-surface-2)] px-4 py-3 text-xs text-[var(--v-text-secondary)]">
        <strong className="text-[var(--v-text)]">The System Must Continue Learning.</strong> مراقبة لحظية، حوادث تلقائية بجذور أسباب، توصيات تحسين، ودروس تُضاف للذاكرة المؤسسية بعد اعتماد المدير — فتصبح المنصّة أذكى مع كل مشروع.
      </div>

      <h2 className="text-sm font-bold text-[var(--v-text)]">مشاريع مُعتمَدة (Go-Live) — ابدأ Hypercare</h2>

      {dashboard.certified.length === 0 ? (
        <EmptyState icon={<HeartPulse size={22} />} title="لا توجد مشاريع مُعتمَدة" description="أصدِر شهادة إطلاق (المرحلة ٧) لبدء مراقبة Hypercare هنا." />
      ) : (
        <div className="space-y-3">
          {dashboard.certified.map((c) => (
            <CertifiedRow key={c.verification_id} cert={c} onNotify={notify} />
          ))}
        </div>
      )}

      {dashboard.periods.length > 0 && (
        <>
          <h2 className="text-sm font-bold text-[var(--v-text)]">فترات Hypercare</h2>
          <div className="space-y-3">{dashboard.periods.map((p) => <PeriodRow key={p.id} period={p} onNotify={notify} />)}</div>
        </>
      )}
    </div>
  );
}

function StatTile({ label, value, tone }: { label: string; value: string | number; tone?: BadgeTone }) {
  return (
    <Card padding="sm">
      <div className="text-xs text-[var(--v-text-muted)]">{label}</div>
      <div className="mt-1 text-xl font-bold tabular-nums text-[var(--v-text)]" style={tone && tone !== "neutral" ? { color: tone === "success" ? "var(--v-green)" : tone === "danger" ? "var(--v-red)" : tone === "warning" ? "var(--v-amber)" : "var(--v-primary)" } : undefined}>{value}</div>
    </Card>
  );
}

function CertifiedRow({ cert, onNotify }: { cert: HcCertifiedOption; onNotify: (t: BadgeTone, s: string) => void }) {
  const [pending, startTransition] = useTransition();
  const [days, setDays] = useState(30);
  if (cert.has_period) return null;
  return (
    <Card padding="md">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <span className="text-sm font-bold text-[var(--v-text)]">{cert.project_name} <Badge tone="success">مُعتمَد {cert.final_score}/100</Badge></span>
        <div className="flex items-center gap-2 text-xs">
          <label className="flex items-center gap-1">المدّة
            <select value={days} onChange={(e) => setDays(Number(e.target.value))} className="rounded-[var(--v-radius-sm)] border border-[var(--v-border)] bg-[var(--v-surface)] px-2 py-1 text-[var(--v-text)]">
              {[7, 14, 30, 60, 90].map((d) => <option key={d} value={d}>{d} يوم</option>)}
            </select>
          </label>
          <Button variant="primary" size="sm" loading={pending} disabled={pending} onClick={() => startTransition(async () => { const r = await start(cert.verification_id, days); onNotify(r.ok ? "success" : "danger", r.message ?? ""); })} icon={<Play size={14} />}>ابدأ Hypercare</Button>
        </div>
      </div>
    </Card>
  );
}

function PeriodRow({ period, onNotify }: { period: HcPeriodRow; onNotify: (t: BadgeTone, s: string) => void }) {
  const [open, setOpen] = useState(false);
  const [pending, startTransition] = useTransition();
  const [detail, setDetail] = useState<Detail | null>(null);
  const [sat, setSat] = useState(90);

  const load = useCallback(() => { getDetail(period.id).then((r) => { if (r.ok && r.detail) setDetail(r.detail as Detail); }); }, [period.id]);
  function act(fn: () => Promise<{ ok: boolean; message?: string; blockers?: string[] }>) {
    startTransition(async () => { const r = await fn(); onNotify(r.ok ? "success" : "danger", r.message ?? (r.blockers?.join("، ") ?? "")); load(); });
  }

  return (
    <Card padding="md">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <span className="flex items-center gap-2 text-sm font-bold text-[var(--v-text)]">
          <HeartPulse size={15} /> صحة <Badge tone={healthTone(period.overall_health_score)}>{period.overall_health_score}/100</Badge>
          <Badge tone={period.status === "closed" ? "neutral" : period.status === "ending" ? "warning" : "info"}>{STATUS_LABEL[period.status] ?? period.status}</Badge>
          {period.total_incidents - period.resolved_incidents > 0 && <Badge tone="danger">{period.total_incidents - period.resolved_incidents} حادثة</Badge>}
        </span>
        <Button variant="ghost" size="sm" onClick={() => { setOpen((o) => !o); if (!detail) load(); }} icon={<ChevronDown size={15} className={open ? "rotate-180 transition" : "transition"} />}>{open ? "إخفاء" : "التفاصيل"}</Button>
      </div>
      <div className="mt-2 h-1.5 w-full overflow-hidden rounded-full bg-[var(--v-surface-2)]"><div className="h-full rounded-full bg-[var(--v-primary)]" style={{ width: `${period.progressPercent}%` }} /></div>
      <div className="mt-1 flex flex-wrap gap-x-4 text-[0.65rem] text-[var(--v-text-muted)]">
        <span>{period.progressPercent}% ({period.daysRemaining} يوم متبقٍّ)</span><span>تحسينات {period.optimizations_applied}</span><span>معرفة {period.knowledge_added}</span>
      </div>

      {open && detail && (
        <div className="mt-4 space-y-4 border-t border-[var(--v-border)] pt-4">
          {period.status !== "closed" && (
            <Button variant="secondary" size="sm" disabled={pending} onClick={() => act(() => runTick(period.id, [], 200, 1))} icon={<Activity size={14} />}>تشغيل نبضة مراقبة</Button>
          )}

          {/* الحوادث */}
          <Section icon={<AlertTriangle size={15} />} title={`مركز الحوادث — ${detail.incidents.filter((i) => i.status === "open" || i.status === "investigating").length} مفتوحة`}>
            {detail.incidents.length === 0 ? <p className="text-xs text-[var(--v-text-muted)]">لا حوادث.</p> : detail.incidents.slice(0, 20).map((i) => (
              <div key={i.id} className="rounded-[var(--v-radius-sm)] bg-[var(--v-surface-2)] px-2.5 py-1.5 text-xs">
                <div className="flex items-center justify-between gap-2">
                  <span className="text-[var(--v-text)]"><Badge tone={sevTone(i.severity)}>{i.severity}</Badge> <span className="ms-1">{i.title}</span></span>
                  <Badge tone={i.status === "resolved" || i.status === "closed" ? "success" : "warning"}>{i.status === "resolved" ? "محلولة" : "مفتوحة"}</Badge>
                </div>
                {i.root_cause && <p className="mt-0.5 text-[var(--v-primary)]">الجذر: {i.root_cause}</p>}
                {(i.status === "open" || i.status === "investigating") && (
                  <div className="mt-1.5 flex flex-wrap gap-1.5">
                    <Button variant="ghost" size="sm" disabled={pending} onClick={() => act(() => rootCause(i.id))} icon={<Brain size={12} />}>جذر السبب (AI)</Button>
                    <Button variant="success" size="sm" disabled={pending} onClick={() => act(() => resolveInc(i.id, i.root_cause ?? "مُعالَج", i.suggested_solution))} icon={<Check size={12} />}>حلّ</Button>
                  </div>
                )}
              </div>
            ))}
          </Section>

          {/* التحسينات */}
          <Section icon={<Wrench size={15} />} title={`توصيات التحسين — ${detail.optimizations.length}`}>
            {detail.optimizations.slice(0, 20).map((o) => (
              <div key={o.id} className="rounded-[var(--v-radius-sm)] bg-[var(--v-surface-2)] px-2.5 py-1.5 text-xs">
                <div className="flex items-center justify-between gap-2">
                  <span className="text-[var(--v-text)]"><Badge tone={o.priority === "critical" || o.priority === "high" ? "danger" : "neutral"}>{o.category}</Badge> <span className="ms-1">{o.title}</span></span>
                  <Badge tone={o.status === "applied" ? "success" : o.status === "approved" ? "info" : o.status === "dismissed" ? "neutral" : "warning"}>{o.status}</Badge>
                </div>
                {o.status === "proposed" && (
                  <div className="mt-1.5 flex flex-wrap gap-1.5">
                    <Button variant="success" size="sm" disabled={pending} onClick={() => act(() => decideOpt(o.id, "applied", o.expected_gain))} icon={<Check size={12} />}>طبّق</Button>
                    <Button variant="secondary" size="sm" disabled={pending} onClick={() => act(() => decideOpt(o.id, "approved", ""))}>اعتماد</Button>
                    <Button variant="ghost" size="sm" disabled={pending} onClick={() => act(() => decideOpt(o.id, "dismissed", ""))} icon={<X size={12} />}>تجاهل</Button>
                  </div>
                )}
              </div>
            ))}
          </Section>

          {/* اقتراحات المعرفة */}
          {detail.knowledge.length > 0 && (
            <Section icon={<Brain size={15} />} title={`اقتراحات المعرفة (مراجعة المدير) — ${detail.knowledge.filter((k) => k.status === "pending").length} معلّقة`}>
              {detail.knowledge.slice(0, 15).map((k) => (
                <div key={k.id} className="rounded-[var(--v-radius-sm)] bg-[var(--v-surface-2)] px-2.5 py-1.5 text-xs">
                  <div className="flex items-center justify-between gap-2">
                    <span className="text-[var(--v-text)]"><Badge tone="info">{k.kind}</Badge> <span className="ms-1">{k.title}</span></span>
                    <Badge tone={k.status === "approved" ? "success" : k.status === "rejected" ? "danger" : "warning"}>{k.status === "approved" ? "معتمَد" : k.status === "rejected" ? "مرفوض" : "معلّق"}</Badge>
                  </div>
                  {k.status === "pending" && (
                    <div className="mt-1.5 flex gap-1.5">
                      <Button variant="success" size="sm" disabled={pending} onClick={() => act(() => decideKnowledge(k.id, "approved"))} icon={<Check size={12} />}>اعتماد → الذاكرة</Button>
                      <Button variant="ghost" size="sm" disabled={pending} onClick={() => act(() => decideKnowledge(k.id, "rejected"))} icon={<X size={12} />}>رفض</Button>
                    </div>
                  )}
                </div>
              ))}
            </Section>
          )}

          {/* الإغلاق */}
          {detail.period.closure_report?.highlights ? (
            <Section icon={<Flag size={15} />} title="تقرير إغلاق المشروع">
              <div className="rounded-[var(--v-radius-md)] border border-[var(--v-green)]/40 bg-[var(--v-green)]/5 p-3 text-xs">
                <div className="mb-1 flex flex-wrap gap-2"><Badge tone="success">مُغلق</Badge><span>الصحة {detail.period.closure_report.finalHealthScore}/100</span><span>رضا العميل {detail.period.closure_report.customerSatisfaction}/100</span></div>
                <ul className="list-inside list-disc space-y-0.5 text-[var(--v-text-muted)]">{detail.period.closure_report.highlights.map((h, i) => <li key={i}>{h}</li>)}</ul>
              </div>
            </Section>
          ) : (
            period.status !== "closed" && (
              <div className="flex flex-wrap items-center gap-2">
                <label className="flex items-center gap-1 text-xs text-[var(--v-text)]">رضا العميل
                  <input type="number" value={sat} min={0} max={100} onChange={(e) => setSat(Number(e.target.value))} className="w-16 rounded-[var(--v-radius-sm)] border border-[var(--v-border)] bg-[var(--v-surface)] px-2 py-1" />
                </label>
                <Button variant="danger" size="sm" disabled={pending} onClick={() => act(() => close(period.id, sat))} icon={<Flag size={14} />}>إغلاق المشروع</Button>
              </div>
            )
          )}
        </div>
      )}
    </Card>
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
