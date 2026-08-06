"use client";

import { useState, useTransition, useCallback } from "react";
import { BadgeCheck, Play, Check, X, Building2, GitBranch, ClipboardCheck, HeartPulse, TrendingUp, Award, ChevronDown, AlertTriangle, Brain } from "lucide-react";
import Card from "@/components/ui/Card";
import Badge, { type BadgeTone } from "@/components/ui/Badge";
import Button from "@/components/ui/Button";
import EmptyState from "@/components/ui/EmptyState";
import type { GoLiveDashboard, GlExecutionOption, GlVerificationRow } from "@/lib/go-live/dashboard";
import { startVerification, getDetail, approveDepartment, createBranch, approveBranch, raiseIssue, resolveIssue, certify } from "./actions";

interface Detail {
  verification: GlVerificationRow & { status: string; go_live_status: string; verification_score: number; business_acceptance_score: number; final_score: number; open_issues: number; ai_summary: string; report: { ai?: { executive_summary: string; hidden_problems: Array<{ title: string; severity: string; reason: string }>; go_live_opinion: string }; health?: { components: Array<{ label: string; ok: boolean }>; score: number; passed: boolean }; kpi?: { checks: Array<{ label: string; verdict: string; variancePercent: number }> }; business?: Array<{ title: string; state: string }> } };
  dataChecks: Array<{ entity: string; label: string; source_count: number; production_count: number; difference: number; matched: boolean }>;
  departments: Array<{ id: string; department: string; label: string; checklist: string[]; status: string; decided_role: string | null }>;
  branches: Array<{ id: string; branch_name: string; status: string }>;
  uat: Array<{ scenario: string; verdict: string; comment: string | null; actor_role: string | null }>;
  issues: Array<{ id: string; title: string; severity: string; status: string; detail: string | null }>;
  certificate: { project_name: string; migration_version: string; final_score: number; verification_score: number; business_acceptance_score: number; go_live_status: string; lessons: Array<{ category: string; title: string; detail: string }> } | null;
}

function scoreTone(n: number): BadgeTone {
  return n >= 90 ? "success" : n >= 70 ? "info" : n >= 50 ? "warning" : "danger";
}
function statusTone(s: string): BadgeTone {
  return s === "certified" ? "success" : s === "rejected" ? "danger" : "info";
}
function apprTone(s: string): BadgeTone {
  return s === "approved" ? "success" : s === "rejected" ? "danger" : "neutral";
}
const GL_LABEL: Record<string, string> = { not_ready: "غير جاهز", conditional: "مشروط", ready: "جاهز", live: "مُطلَق" };

export default function GoLiveClient({ dashboard }: { dashboard: GoLiveDashboard }) {
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
        <StatTile label="تحقّقات" value={t.verifications} />
        <StatTile label="مُعتمَدة" value={t.certified} tone="success" />
        <StatTile label="جاهزة للإطلاق" value={t.ready} tone="info" />
        <StatTile label="مشكلات مفتوحة" value={t.openIssues} tone={t.openIssues > 0 ? "danger" : "neutral"} />
      </div>

      <div className="rounded-[var(--v-radius-md)] border border-[var(--v-border)] bg-[var(--v-surface-2)] px-4 py-3 text-xs text-[var(--v-text-secondary)]">
        <strong className="text-[var(--v-text)]">Migration is NOT Finished Until Business Confirms Success.</strong> الشهادة لا تُصدَر إلا بعد تطابق البيانات + اعتماد كل الأقسام والفروع + إغلاق المشكلات + اجتياز الصحة.
      </div>

      <h2 className="text-sm font-bold text-[var(--v-text)]">عمليات ترحيل مكتملة — ابدأ التحقّق</h2>

      {dashboard.executions.length === 0 ? (
        <EmptyState icon={<BadgeCheck size={22} />} title="لا توجد عمليات مكتملة" description="أكمل ترحيلًا حقيقيًا (المرحلة ٦) لتفعيل التحقّق وقبول الأعمال هنا." />
      ) : (
        <div className="space-y-3">
          {dashboard.executions.map((e) => (
            <ExecutionRow key={e.id} exec={e} verification={dashboard.verifications.find((v) => v.source_id === e.source_id) ?? null} onNotify={notify} />
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
      {tone && tone !== "neutral" && <div className="mt-1"><Badge tone={tone}>{typeof value === "number" && value > 0 ? "•" : ""}</Badge></div>}
    </Card>
  );
}

function ExecutionRow({ exec, verification, onNotify }: { exec: GlExecutionOption; verification: GlVerificationRow | null; onNotify: (t: BadgeTone, s: string) => void }) {
  const [open, setOpen] = useState(false);
  const [pending, startTransition] = useTransition();
  const [vid, setVid] = useState<string | null>(verification?.id ?? null);
  const [detail, setDetail] = useState<Detail | null>(null);

  const load = useCallback((id: string) => { getDetail(id).then((r) => { if (r.ok && r.detail) setDetail(r.detail as Detail); }); }, []);

  function begin() {
    startTransition(async () => {
      const r = await startVerification(exec.id, []);
      onNotify(r.ok ? "info" : "danger", r.message ?? "");
      if (r.ok && r.verificationId) { setVid(r.verificationId); setOpen(true); load(r.verificationId); }
    });
  }
  function act(fn: () => Promise<{ ok: boolean; message?: string; blockers?: string[] }>) {
    startTransition(async () => {
      const r = await fn();
      onNotify(r.ok ? "success" : "danger", r.message ?? (r.blockers?.join("، ") ?? ""));
      if (vid) load(vid);
    });
  }

  return (
    <Card padding="md">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <span className="truncate text-sm font-bold text-[var(--v-text)]">{exec.source_name}</span>
          <Badge tone="success">ترحيل مكتمل</Badge>
          {verification && <Badge tone={scoreTone(verification.final_score)}>{verification.final_score}/100</Badge>}
          {verification && <Badge tone={statusTone(verification.status)}>{verification.status === "certified" ? "مُعتمَد" : GL_LABEL[verification.go_live_status] ?? verification.go_live_status}</Badge>}
        </div>
        <div className="flex items-center gap-2">
          {!vid && <Button variant="primary" size="sm" onClick={begin} loading={pending} disabled={pending} icon={<Play size={14} />}>ابدأ التحقّق</Button>}
          {vid && <Button variant="ghost" size="sm" onClick={() => { setOpen((o) => !o); if (!detail) load(vid); }} icon={<ChevronDown size={15} className={open ? "rotate-180 transition" : "transition"} />}>{open ? "إخفاء" : "التفاصيل"}</Button>}
        </div>
      </div>

      {open && vid && detail && <VerificationView detail={detail} onAct={act} pending={pending} vid={vid} />}
    </Card>
  );
}

function VerificationView({ detail, onAct, pending, vid }: { detail: Detail; onAct: (fn: () => Promise<{ ok: boolean; message?: string; blockers?: string[] }>) => void; pending: boolean; vid: string }) {
  const v = detail.verification;
  const [branchName, setBranchName] = useState("");
  const [issueTitle, setIssueTitle] = useState("");

  return (
    <div className="mt-4 space-y-4 border-t border-[var(--v-border)] pt-4">
      {/* الدرجات */}
      <div className="grid grid-cols-3 gap-2">
        <ScoreTile label="التحقّق التقني" value={v.verification_score} />
        <ScoreTile label="القبول التجاري" value={v.business_acceptance_score} />
        <ScoreTile label="الدرجة النهائية" value={v.final_score} />
      </div>
      <div className="flex flex-wrap items-center gap-2">
        <Badge tone={v.go_live_status === "ready" ? "success" : v.go_live_status === "not_ready" ? "danger" : "warning"}>جاهزية: {GL_LABEL[v.go_live_status] ?? v.go_live_status}</Badge>
        <Badge tone={v.data_match ? "success" : "warning"}>{v.data_match ? "البيانات مطابقة" : "فروق في البيانات"}</Badge>
        {v.open_issues > 0 && <Badge tone="danger">{v.open_issues} مشكلة مفتوحة</Badge>}
        {detail.certificate && <Badge tone="success">شهادة صادرة</Badge>}
      </div>
      {v.ai_summary && <p className="text-xs leading-relaxed text-[var(--v-text-secondary)]">{v.ai_summary}</p>}

      {/* تطابق البيانات */}
      <Section icon={<ClipboardCheck size={15} />} title={`التحقّق من البيانات — ${detail.dataChecks.filter((c) => c.matched).length}/${detail.dataChecks.length} مطابق`}>
        <div className="overflow-x-auto">
          <table className="w-full text-xs">
            <thead><tr className="text-[var(--v-text-muted)]"><th className="p-1.5 text-start">الكيان</th><th className="p-1.5">المصدر</th><th className="p-1.5">الإنتاج</th><th className="p-1.5">الحالة</th></tr></thead>
            <tbody>{detail.dataChecks.map((c, i) => (
              <tr key={i} className="border-t border-[var(--v-border)]"><td className="p-1.5 text-[var(--v-text)]">{c.label}</td><td className="p-1.5 text-center tabular-nums">{c.source_count}</td><td className="p-1.5 text-center tabular-nums">{c.production_count}</td><td className="p-1.5 text-center"><Badge tone={c.matched ? "success" : "danger"}>{c.matched ? "مطابق" : `${c.difference}`}</Badge></td></tr>
            ))}</tbody>
          </table>
        </div>
      </Section>

      {/* الأقسام */}
      <Section icon={<Building2 size={15} />} title={`اعتماد الأقسام — ${detail.departments.filter((d) => d.status === "approved").length}/${detail.departments.length}`}>
        <div className="space-y-1.5">
          {detail.departments.map((d) => (
            <div key={d.id} className="flex flex-wrap items-center justify-between gap-2 rounded-[var(--v-radius-sm)] bg-[var(--v-surface-2)] px-2.5 py-1.5 text-xs">
              <span className="text-[var(--v-text)]">{d.label} <Badge tone={apprTone(d.status)}>{d.status === "approved" ? "معتمَد" : d.status === "rejected" ? "مرفوض" : "بانتظار"}</Badge></span>
              {d.status === "pending" && (
                <span className="flex gap-1">
                  <Button variant="success" size="sm" disabled={pending} onClick={() => onAct(() => approveDepartment(d.id, "approved", ""))} icon={<Check size={12} />}>اعتماد</Button>
                  <Button variant="ghost" size="sm" disabled={pending} onClick={() => onAct(() => approveDepartment(d.id, "rejected", ""))} icon={<X size={12} />}>رفض</Button>
                </span>
              )}
            </div>
          ))}
        </div>
      </Section>

      {/* الفروع */}
      <Section icon={<GitBranch size={15} />} title={`اعتماد الفروع — ${detail.branches.filter((b) => b.status === "approved").length}/${detail.branches.length}`}>
        <div className="mb-2 flex gap-2">
          <input value={branchName} onChange={(e) => setBranchName(e.target.value)} placeholder="اسم الفرع" className="flex-1 rounded-[var(--v-radius-sm)] border border-[var(--v-border)] bg-[var(--v-surface)] px-2 py-1 text-xs text-[var(--v-text)]" />
          <Button variant="secondary" size="sm" disabled={pending || !branchName.trim()} onClick={() => { onAct(() => createBranch(vid, branchName)); setBranchName(""); }}>إضافة فرع</Button>
        </div>
        {detail.branches.map((b) => (
          <div key={b.id} className="flex items-center justify-between gap-2 py-1 text-xs">
            <span className="text-[var(--v-text)]">{b.branch_name} <Badge tone={apprTone(b.status)}>{b.status === "approved" ? "معتمَد" : b.status === "rejected" ? "مرفوض" : "بانتظار"}</Badge></span>
            {b.status === "pending" && (
              <span className="flex gap-1">
                <Button variant="success" size="sm" disabled={pending} onClick={() => onAct(() => approveBranch(b.id, "approved", ""))} icon={<Check size={12} />}>اعتماد</Button>
                <Button variant="ghost" size="sm" disabled={pending} onClick={() => onAct(() => approveBranch(b.id, "rejected", ""))} icon={<X size={12} />}>رفض</Button>
              </span>
            )}
          </div>
        ))}
      </Section>

      {/* الصحة + KPI */}
      {v.report?.health && (
        <Section icon={<HeartPulse size={15} />} title={`فحص الصحة — ${v.report.health.score}/100 (${v.report.health.passed ? "ناجح" : "فاشل"})`}>
          <div className="flex flex-wrap gap-1.5">{v.report.health.components.map((c, i) => <Badge key={i} tone={c.ok ? "success" : "danger"}>{c.label}</Badge>)}</div>
        </Section>
      )}
      {v.report?.kpi && v.report.kpi.checks.length > 0 && (
        <Section icon={<TrendingUp size={15} />} title="مؤشّرات الأداء (قبل ↔ بعد)">
          {v.report.kpi.checks.map((k, i) => <div key={i} className="flex items-center justify-between py-0.5 text-xs"><span className="text-[var(--v-text)]">{k.label}</span><Badge tone={k.verdict === "degraded" || k.verdict === "missing" ? "danger" : "success"}>{k.verdict} ({k.variancePercent}%)</Badge></div>)}
        </Section>
      )}

      {/* المشكلات + UAT */}
      <Section icon={<AlertTriangle size={15} />} title={`المشكلات (UAT) — ${detail.issues.filter((i) => i.status === "open").length} مفتوحة`}>
        <div className="mb-2 flex gap-2">
          <input value={issueTitle} onChange={(e) => setIssueTitle(e.target.value)} placeholder="أبلغ عن مشكلة" className="flex-1 rounded-[var(--v-radius-sm)] border border-[var(--v-border)] bg-[var(--v-surface)] px-2 py-1 text-xs text-[var(--v-text)]" />
          <Button variant="secondary" size="sm" disabled={pending || !issueTitle.trim()} onClick={() => { onAct(() => raiseIssue(vid, issueTitle, "medium", "")); setIssueTitle(""); }}>إبلاغ</Button>
        </div>
        {detail.issues.map((i) => (
          <div key={i.id} className="flex items-center justify-between gap-2 py-1 text-xs">
            <span className="text-[var(--v-text)]"><Badge tone={i.severity === "critical" || i.severity === "high" ? "danger" : "warning"}>{i.severity}</Badge> <span className="ms-1">{i.title}</span></span>
            {i.status === "open" ? <Button variant="ghost" size="sm" disabled={pending} onClick={() => onAct(() => resolveIssue(i.id, "أُغلقت"))}>إغلاق</Button> : <Badge tone="success">مغلقة</Badge>}
          </div>
        ))}
      </Section>

      {/* رؤى AI */}
      {v.report?.ai && v.report.ai.hidden_problems.length > 0 && (
        <Section icon={<Brain size={15} />} title={`رؤى الذكاء الاصطناعي — الرأي: ${v.report.ai.go_live_opinion}`}>
          {v.report.ai.hidden_problems.map((p, i) => <div key={i} className="py-0.5 text-xs"><Badge tone={p.severity === "critical" || p.severity === "high" ? "danger" : "warning"}>{p.severity}</Badge> <span className="ms-1 text-[var(--v-text)]">{p.title}</span> — <span className="text-[var(--v-text-muted)]">{p.reason}</span></div>)}
        </Section>
      )}

      {/* الشهادة */}
      {detail.certificate ? (
        <Section icon={<Award size={15} />} title="شهادة الإطلاق (Go Live Certificate)">
          <div className="rounded-[var(--v-radius-md)] border border-[var(--v-green)]/40 bg-[var(--v-green)]/5 p-3 text-xs">
            <div className="font-bold text-[var(--v-text)]">{detail.certificate.project_name} · {detail.certificate.migration_version}</div>
            <div className="mt-1 flex flex-wrap gap-2 text-[var(--v-text-secondary)]"><span>تقني {detail.certificate.verification_score}</span><span>تجاري {detail.certificate.business_acceptance_score}</span><span>نهائي {detail.certificate.final_score}</span><Badge tone="success">{GL_LABEL[detail.certificate.go_live_status] ?? detail.certificate.go_live_status}</Badge></div>
            {detail.certificate.lessons.length > 0 && <ul className="mt-2 list-inside list-disc space-y-0.5 text-[var(--v-text-muted)]">{detail.certificate.lessons.slice(0, 5).map((l, i) => <li key={i}>{l.title}</li>)}</ul>}
          </div>
        </Section>
      ) : (
        v.status !== "certified" && (
          <Button variant="success" size="sm" disabled={pending} onClick={() => onAct(() => certify(vid))} icon={<Award size={15} />}>إصدار شهادة الإطلاق</Button>
        )
      )}
    </div>
  );
}

function ScoreTile({ label, value }: { label: string; value: number }) {
  return (
    <Card padding="sm">
      <div className="text-[0.65rem] text-[var(--v-text-muted)]">{label}</div>
      <div className={`mt-0.5 text-lg font-bold tabular-nums`} style={{ color: value >= 90 ? "var(--v-green)" : value >= 70 ? "var(--v-primary)" : value >= 50 ? "var(--v-amber)" : "var(--v-red)" }}>{value}</div>
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
