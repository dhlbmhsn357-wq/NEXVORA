"use client";

import { useState, useTransition, useCallback } from "react";
import { Database, Plus, Play, FlaskConical, Trash2, Brain, RefreshCw, ChevronDown } from "lucide-react";
import Card from "@/components/ui/Card";
import Badge, { type BadgeTone } from "@/components/ui/Badge";
import Button from "@/components/ui/Button";
import Select from "@/components/ui/Select";
import Input from "@/components/ui/Input";
import Textarea from "@/components/ui/Textarea";
import EmptyState from "@/components/ui/EmptyState";
import { SOURCE_TYPES, getSourceType, isExecutableNow, type ConnectionMode } from "@/lib/migration-discovery/source-types";
import type { MigrationDashboard } from "@/lib/migration-discovery/dashboard";
import { createSource, testConnection, startAnalysis, getSourceReport, removeSource, promoteToOrgMemory } from "./actions";

const MODE_LABELS: Record<ConnectionMode, string> = {
  file_upload: "رفع ملف",
  schema_upload: "رفع بنية (Schema/DDL)",
  live_connection: "اتصال حيّ",
};

function readinessTone(score: number): BadgeTone {
  if (score >= 80) return "success";
  if (score >= 60) return "info";
  if (score >= 35) return "warning";
  return "danger";
}

export default function MigrationSourcesClient({ dashboard }: { dashboard: MigrationDashboard }) {
  const [showWizard, setShowWizard] = useState(false);
  const [banner, setBanner] = useState<{ tone: BadgeTone; text: string } | null>(null);

  const notify = useCallback((tone: BadgeTone, text: string) => setBanner({ tone, text }), []);

  return (
    <div className="space-y-5">
      {banner && (
        <div className="rounded-[var(--v-radius-md)] border border-[var(--v-border)] bg-[var(--v-surface-2)] px-4 py-2.5 text-sm text-[var(--v-text)]">
          <Badge tone={banner.tone}>{banner.tone === "danger" ? "تنبيه" : "تم"}</Badge> <span className="ms-2">{banner.text}</span>
        </div>
      )}

      {/* إحصاءات */}
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <StatTile label="المصادر" value={dashboard.totals.sources} />
        <StatTile label="المُحلَّلة" value={dashboard.totals.analyzed} />
        <StatTile label="متوسّط الجاهزية" value={`${dashboard.totals.avgReadiness}%`} tone={readinessTone(dashboard.totals.avgReadiness)} />
        <StatTile label="مصادر بمخاطر" value={dashboard.totals.totalRisks} tone={dashboard.totals.totalRisks > 0 ? "warning" : "neutral"} />
      </div>

      <div className="flex items-center justify-between">
        <h2 className="text-sm font-bold text-[var(--v-text)]">المصادر المسجَّلة</h2>
        <Button size="sm" onClick={() => setShowWizard((v) => !v)}>
          <Plus size={15} /> إضافة مصدر
        </Button>
      </div>

      {showWizard && <SourceWizard onDone={(msg) => { setShowWizard(false); notify("success", msg); }} onError={(m) => notify("danger", m)} />}

      {dashboard.sources.length === 0 && !showWizard ? (
        <EmptyState
          icon={<Database size={22} />}
          title="لا توجد مصادر بعد"
          description="أضف أول مصدر بيانات (ملف أو بنية Schema) لبدء اكتشاف نظام قديم."
          primaryAction={{ label: "إضافة مصدر", onClick: () => setShowWizard(true) }}
        />
      ) : (
        <div className="space-y-3">
          {dashboard.sources.map((s) => (
            <SourceRow
              key={s.id}
              source={s}
              report={dashboard.latestReports.find((r) => r.source_id === s.id) ?? null}
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
      <div className="mt-1 flex items-center gap-2">
        <span className="text-xl font-bold tabular-nums text-[var(--v-text)]">{value}</span>
        {tone && <span className="inline-block h-2 w-2 rounded-full" style={{ background: `var(--v-${tone === "success" ? "green" : tone === "warning" ? "amber" : tone === "danger" ? "red" : "primary"})` }} />}
      </div>
    </Card>
  );
}

type NotifyFn = (tone: BadgeTone, text: string) => void;

function SourceWizard({ onDone, onError }: { onDone: (msg: string) => void; onError: (m: string) => void }) {
  const [name, setName] = useState("");
  const [sourceType, setSourceType] = useState("postgresql");
  const def = getSourceType(sourceType);
  const [mode, setMode] = useState<ConnectionMode>(def?.modes[0] ?? "schema_upload");
  const [pending, start] = useTransition();

  function handleTypeChange(t: string) {
    setSourceType(t);
    const d = getSourceType(t);
    if (d && !d.modes.includes(mode)) setMode(d.modes[0]);
  }

  function submit() {
    if (!name.trim()) return onError("اسم المصدر مطلوب.");
    start(async () => {
      const r = await createSource({ projectId: null, name, sourceType, connectionMode: mode, connectionConfig: {} });
      if (r.ok) onDone("تم تسجيل المصدر — افتحه لاختبار الاتصال وبدء التحليل.");
      else onError(r.message ?? "فشل التسجيل.");
    });
  }

  const liveWarn = mode === "live_connection" && !isExecutableNow(sourceType, mode);

  return (
    <Card padding="md">
      <div className="mb-3 text-sm font-bold text-[var(--v-text)]">مصدر جديد</div>
      <div className="grid gap-3 sm:grid-cols-2">
        <Input label="اسم المصدر" value={name} onChange={(e) => setName(e.target.value)} placeholder="نظام محاسبة العميل" />
        <Select label="نوع المصدر" value={sourceType} onChange={(e) => handleTypeChange(e.target.value)}>
          {SOURCE_TYPES.map((s) => (
            <option key={s.key} value={s.key}>{s.label}</option>
          ))}
        </Select>
        <Select label="طريقة الاتصال" value={mode} onChange={(e) => setMode(e.target.value as ConnectionMode)}>
          {(def?.modes ?? []).map((m) => (
            <option key={m} value={m}>{MODE_LABELS[m]}</option>
          ))}
        </Select>
      </div>
      {liveWarn && (
        <p className="mt-2 text-xs text-[var(--v-amber)]">
          الاتصال الحيّ المباشر غير مفعَّل بعد (يُنفَّذ عبر طبقة اتصال معزولة لاحقًا). الأأمن لقواعد الإنتاج: رفع Schema Dump/DDL.
        </p>
      )}
      <div className="mt-4 flex gap-2">
        <Button size="sm" onClick={submit} loading={pending}>حفظ المصدر</Button>
      </div>
    </Card>
  );
}

interface ReportShape {
  system_type: string;
  readiness_score: number;
  risk_score: number;
  quality_score: number;
  detected_domains: string[];
}

function SourceRow({
  source,
  report,
  onNotify,
}: {
  source: MigrationDashboard["sources"][number];
  report: ReportShape | null;
  onNotify: NotifyFn;
}) {
  const [open, setOpen] = useState(false);
  const [content, setContent] = useState("");
  const [detail, setDetail] = useState<{ report: Record<string, unknown> | null } | null>(null);
  const [pending, start] = useTransition();
  const def = getSourceType(source.source_type);

  function runTest() {
    start(async () => {
      const r = await testConnection(source.id, content);
      const res = r.result as { tableCount?: number; issues?: string[] } | undefined;
      onNotify(r.ok ? "success" : "warning", r.ok ? `اتصال صالح — ${res?.tableCount ?? 0} كائن مكتشَف.` : (res?.issues?.[0] ?? r.message ?? "تعذّر التحقّق."));
    });
  }

  function runAnalysis() {
    start(async () => {
      const r = await startAnalysis(source.id, content);
      onNotify(r.ok ? "info" : "danger", r.message ?? "");
    });
  }

  function loadReport() {
    start(async () => {
      const r = await getSourceReport(source.id);
      setDetail({ report: (r.report as Record<string, unknown>) ?? null });
      setOpen(true);
    });
  }

  function promote() {
    start(async () => {
      const r = await promoteToOrgMemory(source.id);
      onNotify(r.ok ? "success" : "warning", r.message ?? "");
    });
  }

  function del() {
    if (!confirm("حذف المصدر وكل تحليلاته؟")) return;
    start(async () => {
      const r = await removeSource(source.id);
      if (r.ok) onNotify("info", "تم الحذف — حدّث الصفحة."); else onNotify("danger", r.message ?? "");
    });
  }

  return (
    <Card padding="sm">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="min-w-0">
          <div className="flex items-center gap-2">
            <Database size={15} className="text-[var(--v-primary)]" />
            <span className="font-medium text-[var(--v-text)]">{source.name}</span>
            <Badge tone="neutral">{def?.label ?? source.source_type}</Badge>
            <Badge tone={source.status === "analyzed" ? "success" : source.status === "analyzing" ? "info" : source.status === "failed" ? "danger" : "neutral"}>
              {statusLabel(source.status)}
            </Badge>
          </div>
          {report && (
            <div className="mt-1.5 flex flex-wrap items-center gap-1.5 text-xs">
              <Badge tone={readinessTone(report.readiness_score)}>جاهزية {report.readiness_score}%</Badge>
              <Badge tone="neutral">جودة {report.quality_score}%</Badge>
              <Badge tone={report.risk_score > 0 ? "warning" : "neutral"}>مخاطر {report.risk_score}</Badge>
              {report.detected_domains.slice(0, 3).map((d) => <Badge key={d} tone="info">{d}</Badge>)}
            </div>
          )}
        </div>
        <div className="flex flex-wrap items-center gap-1.5">
          <Button size="sm" variant="ghost" onClick={() => setOpen((v) => !v)} title="تفاصيل الإدخال">
            <ChevronDown size={14} className={open ? "rotate-180 transition" : "transition"} /> الإدخال
          </Button>
          {report && <Button size="sm" variant="ghost" onClick={loadReport} loading={pending}><RefreshCw size={13} /> التقرير</Button>}
          {report && <Button size="sm" variant="ghost" onClick={promote} loading={pending}><Brain size={13} /> ترقية للذاكرة</Button>}
          <Button size="sm" variant="ghost" onClick={del}><Trash2 size={13} /></Button>
        </div>
      </div>

      {open && (
        <div className="mt-3 space-y-3 border-t border-[var(--v-border)] pt-3">
          <Textarea
            label={source.connection_mode === "schema_upload" ? "الصق بنية النظام (CREATE TABLE… أو JSON schema)" : "الصق محتوى الملف (CSV/JSON)"}
            value={content}
            onChange={(e) => setContent(e.target.value)}
            rows={6}
            placeholder={source.connection_mode === "schema_upload" ? "CREATE TABLE customers (id INT PRIMARY KEY, ...);" : "id,name,email\n1,Ali,ali@x.com"}
          />
          <div className="flex flex-wrap gap-2">
            <Button size="sm" variant="outline" onClick={runTest} loading={pending}><FlaskConical size={14} /> اختبار</Button>
            <Button size="sm" onClick={runAnalysis} loading={pending}><Play size={14} /> بدء التحليل</Button>
          </div>
          {detail?.report && <ReportView report={detail.report} />}
        </div>
      )}
    </Card>
  );
}

function ReportView({ report }: { report: Record<string, unknown> }) {
  const detail = (report.detail ?? {}) as Record<string, unknown>;
  const risks = Array.isArray(detail.risks) ? (detail.risks as Array<{ title: string; severity: string }>) : [];
  const flows = Array.isArray(detail.businessFlows) ? (detail.businessFlows as Array<{ name: string; coverage: number }>) : [];
  const humanReview = Array.isArray(detail.humanReviewNeeded) ? (detail.humanReviewNeeded as string[]) : [];
  const aiSummary = typeof report.ai_summary === "string" ? report.ai_summary : "";

  return (
    <div className="rounded-[var(--v-radius-md)] bg-[var(--v-surface-2)] p-3 text-sm">
      <div className="font-bold text-[var(--v-text)]">{String(report.system_type ?? "تقرير التحليل")}</div>
      {aiSummary && <p className="mt-1 whitespace-pre-line text-xs text-[var(--v-text-secondary)]">{aiSummary}</p>}

      {flows.length > 0 && (
        <div className="mt-2">
          <div className="text-xs font-semibold text-[var(--v-text)]">تدفّقات الأعمال</div>
          <div className="mt-1 flex flex-wrap gap-1.5">
            {flows.map((f) => <Badge key={f.name} tone="info">{f.name} · {f.coverage}%</Badge>)}
          </div>
        </div>
      )}

      {risks.length > 0 && (
        <div className="mt-2">
          <div className="text-xs font-semibold text-[var(--v-text)]">المخاطر</div>
          <ul className="mt-1 space-y-0.5">
            {risks.map((r, i) => (
              <li key={i} className="text-xs text-[var(--v-text-secondary)]">
                <Badge tone={r.severity === "critical" ? "danger" : r.severity === "high" ? "warning" : "neutral"}>{r.severity}</Badge> {r.title}
              </li>
            ))}
          </ul>
        </div>
      )}

      {humanReview.length > 0 && (
        <div className="mt-2">
          <div className="text-xs font-semibold text-[var(--v-text)]">يحتاج مراجعة بشرية</div>
          <ul className="mt-1 list-disc space-y-0.5 ps-4">
            {humanReview.map((h, i) => <li key={i} className="text-xs text-[var(--v-text-secondary)]">{h}</li>)}
          </ul>
        </div>
      )}
    </div>
  );
}

function statusLabel(s: string): string {
  return { draft: "مسودة", connected: "متّصل", analyzing: "جارٍ التحليل", analyzed: "مُحلَّل", failed: "فشل", disabled: "معطّل" }[s] ?? s;
}
