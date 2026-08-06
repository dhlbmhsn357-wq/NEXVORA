"use client";

import { useState, useTransition, useCallback } from "react";
import { Workflow, Play, Check, X, Brain, ChevronDown, Eye, Ban } from "lucide-react";
import Card from "@/components/ui/Card";
import Badge, { type BadgeTone } from "@/components/ui/Badge";
import Button from "@/components/ui/Button";
import Textarea from "@/components/ui/Textarea";
import EmptyState from "@/components/ui/EmptyState";
import type { TrDashboard } from "@/lib/transformation/dashboard";
import { startBuild, getDetail, decide, approve, promote, preview } from "./actions";

function cTone(c: number): BadgeTone {
  if (c >= 90) return "success";
  if (c >= 60) return "info";
  if (c >= 35) return "warning";
  return "danger";
}
const STAGE_LABELS: Record<string, string> = {
  extract: "استخراج", normalize: "تطبيع", merge_split: "دمج/تقسيم", convert: "تحويل", compute: "حساب", validate: "تحقّق", business: "قواعد عمل", ready: "جاهز",
};

export default function TransformationClient({ dashboard }: { dashboard: TrDashboard }) {
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
        <StatTile label="محرّكات" value={dashboard.totals.pipelines} />
        <StatTile label="معتمَدة" value={dashboard.totals.approved} tone="success" />
        <StatTile label="قواعد" value={dashboard.totals.totalRules} />
        <StatTile label="متوسّط تغطية" value={`${dashboard.totals.avgCoverage}%`} tone={cTone(dashboard.totals.avgCoverage)} />
      </div>

      {dashboard.templates.length > 0 && (
        <Card padding="sm">
          <div className="mb-1.5 text-xs font-bold text-[var(--v-text)]">قواعد قابلة لإعادة الاستخدام</div>
          <div className="flex flex-wrap gap-1.5">{dashboard.templates.map((t) => <Badge key={t.rule_key} tone="info">{t.kind} · {t.domain}</Badge>)}</div>
        </Card>
      )}

      <h2 className="text-sm font-bold text-[var(--v-text)]">المصادر — ابنِ محرّك التحويل</h2>

      {dashboard.sources.length === 0 ? (
        <EmptyState icon={<Workflow size={22} />} title="لا توجد مصادر بعد" description="ابنِ Mapping في المرحلة ٢ لمصدر أولًا، ثم ابنِ محرّك التحويل هنا." />
      ) : (
        <div className="space-y-3">
          {dashboard.sources.map((s) => (
            <SourceRow key={s.id} source={s} pipeline={dashboard.pipelines.find((p) => p.source_id === s.id) ?? null} onNotify={notify} />
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
interface PipelineSummary { id: string; status: string; confidence_avg: number; coverage: number; complexity: string; report: Record<string, unknown> }

function SourceRow({ source, pipeline, onNotify }: { source: TrDashboard["sources"][number]; pipeline: PipelineSummary | null; onNotify: NotifyFn }) {
  const [open, setOpen] = useState(false);
  const [detail, setDetail] = useState<DetailShape | null>(null);
  const [pending, start] = useTransition();

  function build() {
    start(async () => {
      const r = await startBuild(source.id);
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
  const stats = (pipeline?.report?.stats ?? {}) as { rules?: number; reviewQueue?: number; businessRules?: number };

  return (
    <Card padding="sm">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="min-w-0">
          <div className="flex items-center gap-2">
            <Workflow size={15} className="text-[var(--v-primary)]" />
            <span className="font-medium text-[var(--v-text)]">{source.name}</span>
            {pipeline ? <Badge tone={pipeline.status === "approved" ? "success" : pipeline.status === "in_review" ? "warning" : "neutral"}>{statusLabel(pipeline.status)}</Badge> : <Badge tone="neutral">لا محرّك</Badge>}
          </div>
          {pipeline && (
            <div className="mt-1.5 flex flex-wrap items-center gap-1.5 text-xs">
              <Badge tone={cTone(pipeline.coverage)}>تغطية {pipeline.coverage}%</Badge>
              <Badge tone="neutral">{stats.rules ?? 0} قاعدة · ثقة {pipeline.confidence_avg}%</Badge>
              {(stats.reviewQueue ?? 0) > 0 && <Badge tone="warning">{stats.reviewQueue} للمراجعة</Badge>}
              <Badge tone="info">{pipeline.complexity}</Badge>
            </div>
          )}
        </div>
        <div className="flex flex-wrap items-center gap-1.5">
          <Button size="sm" onClick={build} loading={pending}><Play size={13} /> {pipeline ? "إعادة بناء" : "بناء المحرّك"}</Button>
          {pipeline && <Button size="sm" variant="ghost" onClick={load} loading={pending}><ChevronDown size={13} className={open ? "rotate-180 transition" : "transition"} /> التفاصيل</Button>}
        </div>
      </div>
      {open && detail && <PipelineDetail sourceId={source.id} detail={detail} onNotify={onNotify} />}
    </Card>
  );
}

interface DetailShape {
  pipeline: { id: string; status: string; report?: { recommendations?: string[]; warnings?: string[] } } | null;
  rules: Array<{ id: string; target_field: string; source_fields: string[]; kind: string; stage: string; confidence: number; status: string; reason: string }>;
  businessRules: Array<{ id: string; entity: string; title: string; action: string; status: string; reason: string }>;
}

function PipelineDetail({ sourceId, detail, onNotify }: { sourceId: string; detail: DetailShape; onNotify: NotifyFn }) {
  const [pending, start] = useTransition();
  const [sample, setSample] = useState("");
  const [traces, setTraces] = useState<PreviewRow[] | null>(null);
  const p = detail.pipeline!;
  const recs = p.report?.recommendations ?? [];
  const warnings = p.report?.warnings ?? [];

  function act(fn: () => Promise<{ ok: boolean; message?: string }>, okMsg: string) {
    start(async () => {
      const r = await fn();
      onNotify(r.ok ? "success" : "danger", r.ok ? okMsg : r.message ?? "فشل.");
    });
  }
  function runPreview() {
    start(async () => {
      const r = await preview(sourceId, sample);
      if (r.ok && r.results) setTraces(r.results as PreviewRow[]);
      else onNotify("warning", r.message ?? "تعذّرت المعاينة.");
    });
  }

  const byStage = new Map<string, DetailShape["rules"]>();
  for (const r of detail.rules) { const a = byStage.get(r.stage) ?? []; a.push(r); byStage.set(r.stage, a); }

  return (
    <div className="mt-3 space-y-3 border-t border-[var(--v-border)] pt-3 text-sm">
      {warnings.length > 0 && <ul className="list-disc space-y-0.5 ps-4">{warnings.map((w, i) => <li key={i} className="text-xs text-[var(--v-amber)]">{w}</li>)}</ul>}
      {recs.length > 0 && <ul className="list-disc space-y-0.5 ps-4">{recs.map((r, i) => <li key={i} className="text-xs text-[var(--v-text-secondary)]">{r}</li>)}</ul>}

      {/* Pipeline بالمراحل */}
      {[...byStage.entries()].map(([stage, rules]) => (
        <div key={stage}>
          <div className="mb-1 text-xs font-bold text-[var(--v-text)]">{STAGE_LABELS[stage] ?? stage} ({rules.length})</div>
          <div className="rounded-[var(--v-radius-sm)] bg-[var(--v-surface-2)] p-2 space-y-1">
            {rules.slice(0, 40).map((r) => (
              <div key={r.id} className="flex flex-wrap items-center gap-1.5 text-xs">
                <Badge tone="neutral">{r.kind}</Badge>
                <span className="font-mono-plex text-[var(--v-text-muted)]">{r.source_fields.join("+")} → {r.target_field}</span>
                <Badge tone={cTone(r.confidence)}>{r.confidence}%</Badge>
                {r.status === "pending" ? (
                  <span className="flex gap-1">
                    <button onClick={() => act(() => decide("rule", r.id, "approved"), "اعتُمدت")} disabled={pending} className="text-[var(--v-green)]"><Check size={13} /></button>
                    <button onClick={() => act(() => decide("rule", r.id, "rejected"), "رُفضت")} disabled={pending} className="text-[var(--v-red)]"><X size={13} /></button>
                    <button onClick={() => act(() => decide("rule", r.id, "disabled"), "عُطّلت")} disabled={pending} className="text-[var(--v-text-muted)]"><Ban size={13} /></button>
                  </span>
                ) : <Badge tone={r.status === "approved" ? "success" : "neutral"}>{r.status}</Badge>}
              </div>
            ))}
          </div>
        </div>
      ))}

      {detail.businessRules.length > 0 && (
        <div>
          <div className="mb-1 text-xs font-bold text-[var(--v-text)]">قواعد العمل ({detail.businessRules.length})</div>
          <div className="rounded-[var(--v-radius-sm)] bg-[var(--v-surface-2)] p-2 space-y-1">
            {detail.businessRules.map((b) => (
              <div key={b.id} className="flex flex-wrap items-center gap-1.5 text-xs">
                <span className="text-[var(--v-text)]">{b.title}</span>
                <Badge tone={b.action === "skip" ? "warning" : b.action === "archive" ? "info" : "neutral"}>{b.action}</Badge>
                {b.status === "pending" && (
                  <span className="flex gap-1">
                    <button onClick={() => act(() => decide("business_rule", b.id, "approved"), "اعتُمدت")} disabled={pending} className="text-[var(--v-green)]"><Check size={13} /></button>
                    <button onClick={() => act(() => decide("business_rule", b.id, "rejected"), "رُفضت")} disabled={pending} className="text-[var(--v-red)]"><X size={13} /></button>
                  </span>
                )}
              </div>
            ))}
          </div>
        </div>
      )}

      {/* معاينة */}
      <div className="space-y-2">
        <Textarea label="عيّنة بيانات للمعاينة (قديم → جديد، لا تنفيذ على Production)" value={sample} onChange={(e) => setSample(e.target.value)} rows={3} placeholder={"name,mobile\nali,0100123456"} />
        <Button size="sm" variant="outline" onClick={runPreview} loading={pending}><Eye size={14} /> معاينة</Button>
        {traces && <PreviewTable traces={traces} />}
      </div>

      {p.status !== "approved" ? (
        <div className="flex flex-wrap gap-2 border-t border-[var(--v-border)] pt-2">
          <Button size="sm" onClick={() => act(() => approve(p.id), "اعتُمد المحرّك — جاهز للمحاكاة")} loading={pending}><Check size={14} /> اعتماد المحرّك</Button>
          <Button size="sm" variant="ghost" onClick={() => act(() => promote(p.id), "تمت الترقية للذاكرة")} loading={pending}><Brain size={14} /> ترقية القواعد</Button>
        </div>
      ) : (
        <div className="flex flex-wrap items-center gap-2 border-t border-[var(--v-border)] pt-2">
          <Badge tone="success"><Check size={12} /> معتمَد — جاهز لـPhase 5</Badge>
          <Button size="sm" variant="ghost" onClick={() => act(() => promote(p.id), "تمت الترقية للذاكرة")} loading={pending}><Brain size={14} /> ترقية القواعد</Button>
        </div>
      )}
    </div>
  );
}

interface PreviewRow { traces: Array<{ targetField: string; oldValue: string; newValue: string; ruleKind: string; skipped: boolean }>; decision: { action: string } }

function PreviewTable({ traces }: { traces: PreviewRow[] }) {
  const rows = traces.slice(0, 5);
  return (
    <div className="overflow-x-auto rounded-[var(--v-radius-sm)] bg-[var(--v-surface-2)] p-2">
      {rows.map((row, i) => (
        <div key={i} className="border-b border-[var(--v-border)] py-1 last:border-0">
          <div className="mb-0.5 text-[0.6875rem] text-[var(--v-text-muted)]">صفّ {i + 1} — القرار: <b>{row.decision.action}</b></div>
          {row.traces.filter((t) => t.oldValue !== t.newValue).slice(0, 6).map((t, j) => (
            <div key={j} className="flex flex-wrap items-center gap-1.5 text-xs">
              <span className="font-mono-plex text-[var(--v-text-muted)]">{t.targetField}</span>
              <span className="text-[var(--v-text-secondary)]">«{t.oldValue}»</span>
              <span className="text-[var(--v-text-muted)]">→</span>
              <span className="text-[var(--v-text)]">«{t.newValue}»</span>
              <Badge tone="neutral">{t.ruleKind}</Badge>
            </div>
          ))}
        </div>
      ))}
    </div>
  );
}

function statusLabel(s: string): string {
  return { draft: "مسودة", in_review: "قيد المراجعة", approved: "معتمَد", failed: "فشل", generating: "جارٍ البناء" }[s] ?? s;
}
