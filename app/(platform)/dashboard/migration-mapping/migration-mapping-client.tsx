"use client";

import { useState, useTransition, useCallback } from "react";
import { GitBranch, Play, Check, X, Brain, ChevronDown, AlertTriangle, RefreshCw } from "lucide-react";
import Card from "@/components/ui/Card";
import Badge, { type BadgeTone } from "@/components/ui/Badge";
import Button from "@/components/ui/Button";
import EmptyState from "@/components/ui/EmptyState";
import type { MappingDashboard } from "@/lib/schema-mapping/dashboard";
import { startBlueprint, getDetail, decide, approve, promote } from "./actions";

function confTone(c: number): BadgeTone {
  if (c >= 90) return "success";
  if (c >= 60) return "info";
  if (c >= 35) return "warning";
  return "danger";
}

export default function MigrationMappingClient({ dashboard }: { dashboard: MappingDashboard }) {
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
        <StatTile label="المخطّطات" value={dashboard.totals.blueprints} />
        <StatTile label="معتمَدة" value={dashboard.totals.approved} tone="success" />
        <StatTile label="قيد المراجعة" value={dashboard.totals.inReview} tone={dashboard.totals.inReview > 0 ? "warning" : "neutral"} />
        <StatTile label="متوسّط الثقة" value={`${dashboard.totals.avgConfidence}%`} tone={confTone(dashboard.totals.avgConfidence)} />
      </div>

      {dashboard.templates.length > 0 && (
        <Card padding="sm">
          <div className="mb-1.5 text-xs font-bold text-[var(--v-text)]">قوالب Mapping قابلة لإعادة الاستخدام</div>
          <div className="flex flex-wrap gap-1.5">
            {dashboard.templates.map((t) => (
              <Badge key={t.template_key} tone="info">{t.label} · {t.usage_count}×</Badge>
            ))}
          </div>
        </Card>
      )}

      <h2 className="text-sm font-bold text-[var(--v-text)]">المصادر المُحلَّلة (المرحلة ١) — جاهزة للـMapping</h2>

      {dashboard.sources.length === 0 ? (
        <EmptyState
          icon={<GitBranch size={22} />}
          title="لا توجد مصادر مُحلَّلة بعد"
          description="حلّل مصدرًا في مرحلة «اكتشاف الترحيل» أولًا، ثم ابنِ Mapping له هنا."
        />
      ) : (
        <div className="space-y-3">
          {dashboard.sources.map((s) => (
            <SourceMappingRow
              key={s.id}
              source={s}
              blueprint={dashboard.blueprints.find((b) => b.source_id === s.id) ?? null}
              onNotify={notify}
            />
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

interface BlueprintSummary {
  id: string;
  status: string;
  confidence_avg: number;
  complexity: string;
  detected_template: string | null;
  stats: Record<string, unknown>;
}

function SourceMappingRow({ source, blueprint, onNotify }: { source: MappingDashboard["sources"][number]; blueprint: BlueprintSummary | null; onNotify: NotifyFn }) {
  const [open, setOpen] = useState(false);
  const [detail, setDetail] = useState<DetailShape | null>(null);
  const [pending, start] = useTransition();

  function generate() {
    start(async () => {
      const r = await startBlueprint(source.id);
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

  const stats = (blueprint?.stats ?? {}) as { entities?: number; fields?: number; mappedFields?: number; reviewCount?: number };

  return (
    <Card padding="sm">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="min-w-0">
          <div className="flex items-center gap-2">
            <GitBranch size={15} className="text-[var(--v-primary)]" />
            <span className="font-medium text-[var(--v-text)]">{source.name}</span>
            {blueprint ? (
              <Badge tone={blueprint.status === "approved" ? "success" : blueprint.status === "in_review" ? "warning" : "neutral"}>
                {statusLabel(blueprint.status)}
              </Badge>
            ) : (
              <Badge tone="neutral">لا يوجد Mapping</Badge>
            )}
          </div>
          {blueprint && (
            <div className="mt-1.5 flex flex-wrap items-center gap-1.5 text-xs">
              <Badge tone={confTone(blueprint.confidence_avg)}>ثقة {blueprint.confidence_avg}%</Badge>
              <Badge tone="neutral">{stats.entities ?? 0} كيان · {stats.mappedFields ?? 0}/{stats.fields ?? 0} حقل</Badge>
              {(stats.reviewCount ?? 0) > 0 && <Badge tone="warning">{stats.reviewCount} للمراجعة</Badge>}
              {blueprint.detected_template && <Badge tone="info">{blueprint.detected_template}</Badge>}
            </div>
          )}
        </div>
        <div className="flex flex-wrap items-center gap-1.5">
          <Button size="sm" onClick={generate} loading={pending}><Play size={13} /> {blueprint ? "إعادة توليد" : "بناء Mapping"}</Button>
          {blueprint && <Button size="sm" variant="ghost" onClick={load} loading={pending}><ChevronDown size={13} className={open ? "rotate-180 transition" : "transition"} /> التفاصيل</Button>}
        </div>
      </div>

      {open && detail && <BlueprintDetail detail={detail} onNotify={onNotify} />}
    </Card>
  );
}

interface DetailShape {
  blueprint: { id: string; status: string; recommendations?: string[]; ai_summary?: string } | null;
  entities: Array<{ id: string; canonical_label: string; canonical_entity: string; old_objects: string[]; confidence: number; status: string; reason: string }>;
  fields: Array<{ id: string; old_object: string; old_field: string; new_field: string | null; new_field_label: string | null; kind: string; confidence: number; status: string; reason: string; transformation: { kind?: string } }>;
  relationships: Array<{ id: string; from_entity: string | null; to_entity: string | null; new_kind: string; note: string }>;
  rules: Array<{ id: string; rule_type: string; condition: string; result: string }>;
  conflicts: Array<{ id: string; conflict_type: string; subject: string; detail: string }>;
}

function BlueprintDetail({ detail, onNotify }: { detail: DetailShape; onNotify: NotifyFn }) {
  const [pending, start] = useTransition();
  const bp = detail.blueprint;
  const lowConfFields = detail.fields.filter((f) => f.new_field && f.status === "pending");
  const unmapped = detail.fields.filter((f) => !f.new_field);

  function act(fn: () => Promise<{ ok: boolean; message?: string }>, okMsg: string) {
    start(async () => {
      const r = await fn();
      onNotify(r.ok ? "success" : "danger", r.ok ? okMsg : r.message ?? "فشل.");
    });
  }

  return (
    <div className="mt-3 space-y-3 border-t border-[var(--v-border)] pt-3">
      {bp?.ai_summary && <p className="whitespace-pre-line rounded-[var(--v-radius-sm)] bg-[var(--v-surface-2)] p-2 text-xs text-[var(--v-text-secondary)]">{bp.ai_summary}</p>}

      {bp?.recommendations && bp.recommendations.length > 0 && (
        <ul className="list-disc space-y-0.5 ps-4">
          {bp.recommendations.map((r, i) => <li key={i} className="text-xs text-[var(--v-text-secondary)]">{r}</li>)}
        </ul>
      )}

      {/* الكيانات */}
      <Section title={`مطابقة الكيانات (${detail.entities.length})`}>
        {detail.entities.map((e) => (
          <div key={e.id} className="flex flex-wrap items-center gap-2 py-1 text-xs">
            <span className="font-mono-plex text-[var(--v-text-muted)]">{e.old_objects.join(" + ")}</span>
            <span className="text-[var(--v-text-muted)]">→</span>
            <span className="font-medium text-[var(--v-text)]">{e.canonical_label}</span>
            <Badge tone={confTone(e.confidence)}>{e.confidence}%</Badge>
            {e.status === "pending" && (
              <span className="flex gap-1">
                <button onClick={() => act(() => decide("entity", e.id, "approved"), "اعتُمد الكيان")} disabled={pending} className="text-[var(--v-green)]"><Check size={14} /></button>
                <button onClick={() => act(() => decide("entity", e.id, "rejected"), "رُفض الكيان")} disabled={pending} className="text-[var(--v-red)]"><X size={14} /></button>
              </span>
            )}
          </div>
        ))}
      </Section>

      {/* حقول تحتاج مراجعة */}
      {lowConfFields.length > 0 && (
        <Section title={`حقول تحتاج مراجعة (${lowConfFields.length})`}>
          {lowConfFields.slice(0, 40).map((f) => (
            <div key={f.id} className="flex flex-wrap items-center gap-2 py-1 text-xs">
              <span className="font-mono-plex text-[var(--v-text-muted)]">{f.old_object}.{f.old_field}</span>
              <span className="text-[var(--v-text-muted)]">→</span>
              <span className="font-medium text-[var(--v-text)]">{f.new_field_label ?? f.new_field}</span>
              <Badge tone={confTone(f.confidence)}>{f.confidence}%</Badge>
              {f.transformation?.kind && f.transformation.kind !== "none" && <Badge tone="neutral">{f.transformation.kind}</Badge>}
              <span className="flex gap-1">
                <button onClick={() => act(() => decide("field", f.id, "approved"), "اعتُمد الحقل")} disabled={pending} className="text-[var(--v-green)]"><Check size={14} /></button>
                <button onClick={() => act(() => decide("field", f.id, "rejected"), "رُفض الحقل")} disabled={pending} className="text-[var(--v-red)]"><X size={14} /></button>
              </span>
            </div>
          ))}
        </Section>
      )}

      {/* تعارضات */}
      {detail.conflicts.length > 0 && (
        <Section title={`تعارضات (${detail.conflicts.length})`}>
          {detail.conflicts.slice(0, 30).map((c) => (
            <div key={c.id} className="flex items-start gap-1.5 py-0.5 text-xs text-[var(--v-text-secondary)]">
              <AlertTriangle size={12} className="mt-0.5 shrink-0 text-[var(--v-amber)]" />
              <span><b className="text-[var(--v-text)]">{c.subject}</b> — {c.detail}</span>
            </div>
          ))}
        </Section>
      )}

      {/* علاقات + قواعد */}
      {detail.relationships.length > 0 && (
        <Section title={`العلاقات (${detail.relationships.length})`}>
          {detail.relationships.slice(0, 20).map((r) => (
            <div key={r.id} className="py-0.5 text-xs text-[var(--v-text-secondary)]">
              {r.from_entity ?? "?"} → {r.to_entity ?? "?"} <Badge tone="neutral">{r.new_kind}</Badge>
            </div>
          ))}
        </Section>
      )}
      {detail.rules.length > 0 && (
        <Section title={`قواعد العمل والتدفّق (${detail.rules.length})`}>
          {detail.rules.slice(0, 15).map((r) => (
            <div key={r.id} className="py-0.5 text-xs text-[var(--v-text-secondary)]"><b className="text-[var(--v-text)]">{r.condition}</b> ⇐ {r.result}</div>
          ))}
        </Section>
      )}

      {unmapped.length > 0 && <p className="text-xs text-[var(--v-text-muted)]">حقول بلا مطابقة: {unmapped.length} — تُعرَض لا تُهمَل، راجعها قبل الاعتماد.</p>}

      {bp && bp.status !== "approved" && (
        <div className="flex flex-wrap gap-2 border-t border-[var(--v-border)] pt-3">
          <Button size="sm" onClick={() => act(() => approve(bp.id), "اعتُمد المخطّط — أصبح المرجع الرسمي")} loading={pending}><Check size={14} /> اعتماد المخطّط</Button>
          <Button size="sm" variant="ghost" onClick={() => act(() => promote(bp.id), "تمت الترقية للذاكرة المؤسسية")} loading={pending}><Brain size={14} /> ترقية للذاكرة</Button>
        </div>
      )}
      {bp && bp.status === "approved" && (
        <div className="flex flex-wrap gap-2 border-t border-[var(--v-border)] pt-3">
          <Badge tone="success"><Check size={12} /> معتمَد — مرجع رسمي</Badge>
          <Button size="sm" variant="ghost" onClick={() => act(() => promote(bp.id), "تمت الترقية للذاكرة المؤسسية")} loading={pending}><Brain size={14} /> ترقية للذاكرة</Button>
        </div>
      )}
    </div>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div>
      <div className="mb-1 flex items-center gap-1.5 text-xs font-bold text-[var(--v-text)]"><RefreshCw size={11} className="text-[var(--v-text-muted)]" /> {title}</div>
      <div className="rounded-[var(--v-radius-sm)] bg-[var(--v-surface-2)] p-2">{children}</div>
    </div>
  );
}

function statusLabel(s: string): string {
  return { draft: "مسودة", in_review: "قيد المراجعة", approved: "معتمَد", failed: "فشل", generating: "جارٍ التوليد" }[s] ?? s;
}
