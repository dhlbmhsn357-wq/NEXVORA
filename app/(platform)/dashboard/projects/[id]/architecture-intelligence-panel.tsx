"use client";

import { useState } from "react";
import { Boxes, ShieldAlert, Lightbulb, RefreshCw, CheckCircle2, AlertTriangle, Recycle } from "lucide-react";
import Button from "@/components/ui/Button";
import type { ArchitectureValidationReport, ArchitectureGaps } from "@/lib/types/database";
import { runArchitectureValidationAction } from "./architecture-intelligence-actions";

const GAP_LABELS: Record<keyof ArchitectureGaps, string> = {
  reports: "تقارير ناقصة",
  permissions: "صلاحيات ناقصة",
  roles: "أدوار ناقصة",
  integrations: "تكاملات ناقصة",
  workflows: "Workflows ناقصة",
  dashboards: "لوحات ناقصة",
  notifications: "إشعارات ناقصة",
  business_rules: "قواعد عمل ناقصة",
  audit_logs: "سجلات تدقيق ناقصة",
  security: "ميزات أمان ناقصة",
  apis: "APIs ناقصة",
  db_tables: "جداول قاعدة بيانات ناقصة",
};

function scoreColor(score: number): string {
  if (score >= 80) return "var(--v-success)";
  if (score >= 50) return "var(--v-warning)";
  return "var(--v-danger)";
}

export default function ArchitectureIntelligencePanel({
  projectId,
  initialReport,
  canManage,
}: {
  projectId: string;
  initialReport: ArchitectureValidationReport | null;
  canManage: boolean;
}) {
  const [report, setReport] = useState<ArchitectureValidationReport | null>(initialReport);
  const [running, setRunning] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function run() {
    setRunning(true);
    setError(null);
    const res = await runArchitectureValidationAction(projectId);
    setRunning(false);
    if (res.ok) setReport(res.report ?? null);
    else setError(res.message ?? "فشل التحقّق المعماري.");
  }

  const gaps = (report?.gaps ?? {}) as Partial<ArchitectureGaps>;
  const gapEntries = (Object.keys(GAP_LABELS) as (keyof ArchitectureGaps)[])
    .map((k) => ({ key: k, items: gaps[k] ?? [] }))
    .filter((g) => g.items.length > 0);

  return (
    <div className="rounded-[var(--v-radius-lg)] border border-[var(--v-border)] bg-[var(--v-surface)] p-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h3 className="flex items-center gap-2 font-semibold">
            <Boxes size={18} className="text-[var(--v-primary)]" /> الذكاء المعماري (قبل الـ PRD)
          </h3>
          <p className="mt-1 text-xs text-[var(--v-text-secondary)]">
            المنصة بتفكّر قبل توليد الـ PRD: تحليل عابر للوحدات + نواقص معمارية + إعادة استخدام خبرة المشاريع السابقة.
          </p>
          <p className="mt-1 text-xs text-[var(--v-text-secondary)]">
            أي نواقص هتتحول لتوصيات في خطوة «قرارات التوصيات» — اعتمدها من هناك عشان تنضاف لمحتوى الـ Brain.
          </p>
        </div>
        {canManage && (
          <Button onClick={run} disabled={running}>
            <RefreshCw size={15} className={running ? "animate-spin" : ""} /> {report ? "إعادة التحقّق" : "شغّل التحقّق المعماري"}
          </Button>
        )}
      </div>

      {error && <p className="mt-3 text-sm text-[var(--v-danger)]">{error}</p>}

      {!report ? (
        <p className="mt-4 text-sm text-[var(--v-text-secondary)]">
          لسه مفيش تحقّق معماري. بيتشغّل تلقائيًا عند اعتماد الـ Brain، أو شغّله يدويًا.
        </p>
      ) : report.status === "failed" ? (
        <p className="mt-4 text-sm text-[var(--v-danger)]">فشل التحقّق: {report.last_error}</p>
      ) : (
        <div className="mt-4 space-y-5">
          {/* درجة الجاهزية */}
          <div className="flex items-center gap-4">
            <div className="text-3xl font-bold" style={{ color: scoreColor(report.readiness_score) }}>
              {report.readiness_score}%
            </div>
            <div className="text-sm text-[var(--v-text-secondary)]">
              جاهزية معمارية · مجال: {report.domain ?? "عام"}
            </div>
          </div>

          {report.ai_summary && (
            <p className="rounded-[var(--v-radius-md)] bg-[var(--v-bg)] p-3 text-sm leading-relaxed">{report.ai_summary}</p>
          )}

          {/* وحدات ناقصة */}
          {report.missing_modules.length > 0 && (
            <section>
              <h4 className="mb-2 flex items-center gap-1.5 text-sm font-semibold text-[var(--v-danger)]">
                <ShieldAlert size={15} /> وحدات مطلوبة ناقصة ({report.missing_modules.length})
              </h4>
              <div className="flex flex-wrap gap-2">
                {report.missing_modules.map((m) => (
                  <span key={m.module_key} className="rounded-full bg-[var(--v-danger)]/10 px-3 py-1 text-xs text-[var(--v-danger)]" title={m.reason}>
                    {m.name}
                  </span>
                ))}
              </div>
            </section>
          )}

          {/* ميزات فرعية ناقصة */}
          {report.missing_features.length > 0 && (
            <section>
              <h4 className="mb-2 flex items-center gap-1.5 text-sm font-semibold text-[var(--v-warning)]">
                <AlertTriangle size={15} /> ميزات فرعية ناقصة ({report.missing_features.length})
              </h4>
              <div className="flex flex-wrap gap-1.5">
                {report.missing_features.slice(0, 40).map((f, i) => (
                  <span key={i} className="rounded-[var(--v-radius-sm)] bg-[var(--v-bg)] px-2 py-0.5 text-xs text-[var(--v-text-secondary)]">
                    {f.feature}
                  </span>
                ))}
              </div>
            </section>
          )}

          {/* فجوات دلالية (AI) */}
          {gapEntries.length > 0 && (
            <section className="grid gap-3 sm:grid-cols-2">
              {gapEntries.map((g) => (
                <div key={g.key} className="rounded-[var(--v-radius-md)] bg-[var(--v-bg)] p-3">
                  <div className="mb-1.5 text-xs font-semibold text-[var(--v-text-secondary)]">{GAP_LABELS[g.key]}</div>
                  <ul className="space-y-1 text-xs leading-relaxed">
                    {g.items.map((it, i) => <li key={i} className="flex gap-1.5"><span className="text-[var(--v-warning)]">•</span> {it}</li>)}
                  </ul>
                </div>
              ))}
            </section>
          )}

          {/* إعادة استخدام معرفة المشاريع السابقة */}
          {report.reused_insights.length > 0 && (
            <section>
              <h4 className="mb-2 flex items-center gap-1.5 text-sm font-semibold text-[var(--v-primary)]">
                <Recycle size={15} /> خبرة من مشاريع مشابهة سابقة
              </h4>
              <div className="space-y-2">
                {report.reused_insights.map((r) => (
                  <div key={r.project_id} className="rounded-[var(--v-radius-md)] border border-[var(--v-border)] bg-[var(--v-bg)] p-3">
                    <div className="flex items-center gap-1.5 text-sm font-medium"><Lightbulb size={14} className="text-[var(--v-primary)]" /> {r.name}</div>
                    {r.modules.length > 0 && <p className="mt-1 text-xs text-[var(--v-text-secondary)]">وحدات: {r.modules.join("، ")}</p>}
                    {r.mistakes.length > 0 && (
                      <ul className="mt-1.5 space-y-0.5 text-xs text-[var(--v-text-secondary)]">
                        {r.mistakes.slice(0, 5).map((m, i) => <li key={i} className="flex gap-1.5"><span className="text-[var(--v-danger)]">⚠</span> {m}</li>)}
                      </ul>
                    )}
                  </div>
                ))}
              </div>
            </section>
          )}

          {report.missing_modules.length === 0 && report.missing_features.length === 0 && gapEntries.length === 0 && (
            <p className="flex items-center gap-1.5 text-sm text-[var(--v-success)]"><CheckCircle2 size={16} /> لا توجد نواقص معمارية بارزة — التصميم جاهز للـ PRD.</p>
          )}
        </div>
      )}
    </div>
  );
}
