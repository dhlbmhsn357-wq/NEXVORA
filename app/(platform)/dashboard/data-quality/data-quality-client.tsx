"use client";

import { useState, useTransition, useCallback } from "react";
import { Sparkles, Play, Check, X, Brain, ChevronDown, Copy, AlertTriangle } from "lucide-react";
import Card from "@/components/ui/Card";
import Badge, { type BadgeTone } from "@/components/ui/Badge";
import Button from "@/components/ui/Button";
import Select from "@/components/ui/Select";
import Textarea from "@/components/ui/Textarea";
import EmptyState from "@/components/ui/EmptyState";
import type { DqDashboard } from "@/lib/data-quality/dashboard";
import { startCleansing, getDetail, decide, approveHighConf, approve, promote } from "./actions";

const DOMAINS = ["generic", "crm", "accounting", "ecommerce", "hr", "hospital"];

function qTone(s: number): BadgeTone {
  if (s >= 85) return "success";
  if (s >= 65) return "info";
  if (s >= 40) return "warning";
  return "danger";
}

export default function DataQualityClient({ dashboard }: { dashboard: DqDashboard }) {
  const [banner, setBanner] = useState<{ tone: BadgeTone; text: string } | null>(null);
  const notify = useCallback((tone: BadgeTone, text: string) => setBanner({ tone, text }), []);

  return (
    <div className="space-y-5">
      {banner && (
        <div className="rounded-[var(--v-radius-md)] border border-[var(--v-border)] bg-[var(--v-surface-2)] px-4 py-2.5 text-sm text-[var(--v-text)]">
          <Badge tone={banner.tone}>{banner.tone === "danger" ? "تنبيه" : "تم"}</Badge> <span className="ms-2">{banner.text}</span>
        </div>
      )}

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <StatTile label="تشغيلات" value={dashboard.totals.runs} />
        <StatTile label="متوسّط الجودة" value={`${dashboard.totals.avgQuality}%`} tone={qTone(dashboard.totals.avgQuality)} />
        <StatTile label="مشاكل" value={dashboard.totals.totalIssues} tone={dashboard.totals.totalIssues > 0 ? "warning" : "neutral"} />
        <StatTile label="مجموعات تكرار" value={dashboard.totals.duplicateGroups} tone={dashboard.totals.duplicateGroups > 0 ? "warning" : "neutral"} />
      </div>

      <h2 className="text-sm font-bold text-[var(--v-text)]">المصادر — حلّل جودة بياناتها</h2>

      {dashboard.sources.length === 0 ? (
        <EmptyState icon={<Sparkles size={22} />} title="لا توجد مصادر بعد" description="سجّل مصدرًا في «اكتشاف الترحيل» أولًا، ثم حلّل جودة بياناته هنا." />
      ) : (
        <div className="space-y-3">
          {dashboard.sources.map((s) => (
            <SourceRow key={s.id} source={s} run={dashboard.runs.find((r) => r.source_id === s.id) ?? null} onNotify={notify} />
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
      {tone && <div className="mt-1"><Badge tone={tone}>{typeof value === "string" ? value : ""}</Badge></div>}
    </Card>
  );
}

type NotifyFn = (tone: BadgeTone, text: string) => void;

interface RunSummary {
  id: string;
  quality_score: number;
  records: number;
  readiness_delta: number;
  status: string;
  report: Record<string, unknown>;
}

function SourceRow({ source, run, onNotify }: { source: DqDashboard["sources"][number]; run: RunSummary | null; onNotify: NotifyFn }) {
  const [open, setOpen] = useState(false);
  const [content, setContent] = useState("");
  const [domain, setDomain] = useState("generic");
  const [detail, setDetail] = useState<DetailShape | null>(null);
  const [pending, start] = useTransition();

  function runIt() {
    start(async () => {
      const r = await startCleansing(source.id, content, domain);
      onNotify(r.ok ? "info" : "danger", r.message ?? "");
    });
  }
  function load() {
    start(async () => {
      const r = await getDetail(source.id);
      if (r.ok && r.detail) setDetail(r.detail as DetailShape);
      setOpen(true);
    });
  }

  const stats = (run?.report?.stats ?? {}) as { missing?: number; invalid?: number; duplicateGroups?: number; reviewQueue?: number };

  return (
    <Card padding="sm">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="min-w-0">
          <div className="flex items-center gap-2">
            <Sparkles size={15} className="text-[var(--v-primary)]" />
            <span className="font-medium text-[var(--v-text)]">{source.name}</span>
            {run ? <Badge tone={qTone(run.quality_score)}>جودة {run.quality_score}%</Badge> : <Badge tone="neutral">لم تُحلَّل</Badge>}
          </div>
          {run && (
            <div className="mt-1.5 flex flex-wrap items-center gap-1.5 text-xs">
              <Badge tone="neutral">{run.records} صفّ</Badge>
              {(stats.missing ?? 0) > 0 && <Badge tone="warning">ناقص {stats.missing}</Badge>}
              {(stats.invalid ?? 0) > 0 && <Badge tone="warning">غير صالح {stats.invalid}</Badge>}
              {(stats.duplicateGroups ?? 0) > 0 && <Badge tone="danger">تكرار {stats.duplicateGroups}</Badge>}
              {run.readiness_delta > 0 && <Badge tone="success">+{run.readiness_delta}% جاهزية متوقّعة</Badge>}
            </div>
          )}
        </div>
        <div className="flex flex-wrap items-center gap-1.5">
          <Button size="sm" variant="ghost" onClick={() => setOpen((v) => !v)}><ChevronDown size={13} className={open ? "rotate-180 transition" : "transition"} /> البيانات</Button>
          {run && <Button size="sm" variant="ghost" onClick={load} loading={pending}>التقرير</Button>}
        </div>
      </div>

      {open && (
        <div className="mt-3 space-y-3 border-t border-[var(--v-border)] pt-3">
          <div className="grid gap-2 sm:grid-cols-[1fr_auto]">
            <Textarea label="الصق بيانات فعلية (CSV أو JSON)" value={content} onChange={(e) => setContent(e.target.value)} rows={5} placeholder={"name,email,phone\nMohamed Ali,ali@x.com,0100123..."} />
            <div className="flex flex-col gap-2">
              <Select label="المجال" value={domain} onChange={(e) => setDomain(e.target.value)}>
                {DOMAINS.map((d) => <option key={d} value={d}>{d}</option>)}
              </Select>
              <Button size="sm" onClick={runIt} loading={pending}><Play size={14} /> تحليل الجودة</Button>
            </div>
          </div>
          {detail?.run && <RunDetail detail={detail} onNotify={onNotify} />}
        </div>
      )}
    </Card>
  );
}

interface DetailShape {
  run: { id: string; quality_score: number; status: string; ai_summary?: string; report?: { recommendations?: string[] } } | null;
  issues: Array<{ id: string; issue_type: string; object: string; field: string; row_index: number; value: string; detail: string; suggestion: string | null; confidence: number; status: string }>;
  duplicates: Array<{ id: string; object: string; key_field: string; members: Array<{ value: string }>; match_method: string; similarity: number; suggested_action: string; status: string }>;
  changeset: Array<{ id: string; object: string; field: string; old_value: string; new_value: string; confidence: number }>;
}

function RunDetail({ detail, onNotify }: { detail: DetailShape; onNotify: NotifyFn }) {
  const [pending, start] = useTransition();
  const run = detail.run!;
  const recs = run.report?.recommendations ?? [];

  function act(fn: () => Promise<{ ok: boolean; message?: string; count?: number }>, okMsg: string) {
    start(async () => {
      const r = await fn();
      onNotify(r.ok ? "success" : "danger", r.ok ? (r.count != null ? `${okMsg} (${r.count})` : okMsg) : r.message ?? "فشل.");
    });
  }

  const invalidIssues = detail.issues.filter((i) => i.issue_type === "invalid" || i.issue_type === "missing");
  const bizIssues = detail.issues.filter((i) => ["orphan_record", "missing_reference", "business_rule", "broken_relation"].includes(i.issue_type));

  return (
    <div className="space-y-3 rounded-[var(--v-radius-md)] bg-[var(--v-surface-2)] p-3 text-sm">
      <div className="flex flex-wrap items-center gap-2">
        <Badge tone={qTone(run.quality_score)}>درجة الجودة {run.quality_score}%</Badge>
        {run.ai_summary && <span className="text-xs text-[var(--v-text-secondary)]">{run.ai_summary}</span>}
      </div>

      {recs.length > 0 && (
        <ul className="list-disc space-y-0.5 ps-4">{recs.map((r, i) => <li key={i} className="text-xs text-[var(--v-text-secondary)]">{r}</li>)}</ul>
      )}

      {detail.duplicates.length > 0 && (
        <Sec title={`تكرار محتمَل (${detail.duplicates.length})`}>
          {detail.duplicates.slice(0, 25).map((d) => (
            <Row key={d.id} pending={pending} onA={() => act(() => decide("duplicate", d.id, "approved"), "اعتُمد الدمج")} onR={() => act(() => decide("duplicate", d.id, "rejected"), "رُفض")} status={d.status}>
              <span className="text-[var(--v-text)]">{d.members.map((m) => m.value).join(" ≈ ")}</span>
              <Badge tone="info">{d.similarity}% · {d.suggested_action}</Badge>
            </Row>
          ))}
        </Sec>
      )}

      {invalidIssues.length > 0 && (
        <Sec title={`قيم ناقصة/غير صالحة (${invalidIssues.length})`}>
          {invalidIssues.slice(0, 40).map((i) => (
            <Row key={i.id} pending={pending} onA={() => act(() => decide("issue", i.id, "approved"), "اعتُمد")} onR={() => act(() => decide("issue", i.id, "rejected"), "رُفض")} status={i.status}>
              <span className="font-mono-plex text-[var(--v-text-muted)]">{i.object}.{i.field}</span>
              <span className="text-[var(--v-text-secondary)]">«{i.value || "∅"}» — {i.detail}</span>
              {i.suggestion && <Badge tone="success">→ {i.suggestion}</Badge>}
              <Badge tone={i.confidence >= 95 ? "success" : "warning"}>{i.confidence}%</Badge>
            </Row>
          ))}
        </Sec>
      )}

      {bizIssues.length > 0 && (
        <Sec title={`سلامة مرجعية وقواعد عمل (${bizIssues.length})`}>
          {bizIssues.slice(0, 30).map((i) => (
            <div key={i.id} className="flex items-start gap-1.5 py-0.5 text-xs text-[var(--v-text-secondary)]">
              <AlertTriangle size={12} className="mt-0.5 shrink-0 text-[var(--v-amber)]" />
              <span><b className="text-[var(--v-text)]">{i.object}.{i.field}</b> — {i.detail}</span>
            </div>
          ))}
        </Sec>
      )}

      {detail.changeset.length > 0 && (
        <div className="flex items-center gap-2 text-xs text-[var(--v-text-muted)]">
          <Copy size={12} /> {detail.changeset.length} تصحيح مقترَح في نسخة العمل (لا يُطبَّق إلا بعد الاعتماد).
        </div>
      )}

      <div className="flex flex-wrap gap-2 border-t border-[var(--v-border)] pt-2">
        <Button size="sm" onClick={() => act(() => approveHighConf(run.id), "اعتُمدت التصحيحات عالية الثقة")} loading={pending}><Check size={14} /> اعتماد عالي الثقة (≥٩٥٪)</Button>
        <Button size="sm" variant="outline" onClick={() => act(() => approve(run.id), "اعتُمد التنظيف — مرجع رسمي")} loading={pending}>اعتماد التشغيلة</Button>
        <Button size="sm" variant="ghost" onClick={() => act(() => promote(run.id), "تمت الترقية للذاكرة")} loading={pending}><Brain size={14} /> ترقية القواعد</Button>
      </div>
    </div>
  );
}

function Sec({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div>
      <div className="mb-1 text-xs font-bold text-[var(--v-text)]">{title}</div>
      <div className="space-y-1">{children}</div>
    </div>
  );
}

function Row({ children, pending, onA, onR, status }: { children: React.ReactNode; pending: boolean; onA: () => void; onR: () => void; status: string }) {
  return (
    <div className="flex flex-wrap items-center gap-1.5 text-xs">
      {children}
      {status === "pending" ? (
        <span className="flex gap-1">
          <button onClick={onA} disabled={pending} className="text-[var(--v-green)]" title="اعتماد"><Check size={13} /></button>
          <button onClick={onR} disabled={pending} className="text-[var(--v-red)]" title="رفض"><X size={13} /></button>
        </span>
      ) : (
        <Badge tone={status === "approved" ? "success" : "neutral"}>{status === "approved" ? "معتمَد" : status === "rejected" ? "مرفوض" : status}</Badge>
      )}
    </div>
  );
}
