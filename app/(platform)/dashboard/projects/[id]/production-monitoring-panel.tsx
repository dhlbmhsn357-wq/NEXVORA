"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Activity, AlertTriangle, ShieldCheck } from "lucide-react";
import {
  updateProjectProductionUrl,
  runMonitoringCheckNow,
  acknowledgeMonitoringIncident,
  resolveMonitoringIncident,
} from "./production-monitoring-actions";
import Badge, { type BadgeTone } from "@/components/ui/Badge";
import Button from "@/components/ui/Button";
import EmptyState from "@/components/ui/EmptyState";
import type {
  MonitoringCheck,
  MonitoringIncident,
  MonitoringIncidentEvent,
  AuditFindingSeverity,
  InfraServiceStatus,
} from "@/lib/types/database";
import { useBackgroundRefresh } from "@/lib/ui/use-background-refresh";

const INFRA_SERVICE_LABELS: Record<string, string> = { railway: "Railway", vercel: "Vercel", supabase: "Supabase" };
const INFRA_STATUS_LABELS: Record<string, string> = { unknown: "غير معروف", not_configured: "غير مُهيَّأ", healthy: "سليم", degraded: "متدهور", down: "متوقّف" };
const INFRA_STATUS_TONE: Record<string, BadgeTone> = { unknown: "neutral", not_configured: "neutral", healthy: "success", degraded: "warning", down: "danger" };

const SEVERITY_LABELS: Record<AuditFindingSeverity, string> = {
  critical: "Critical",
  high: "High",
  medium: "Medium",
  low: "Low",
  info: "Info",
};

const SEVERITY_TONE: Record<AuditFindingSeverity, BadgeTone> = {
  critical: "danger",
  high: "warning",
  medium: "info",
  low: "neutral",
  info: "neutral",
};

const OVERALL_STATUS_LABELS: Record<string, string> = { healthy: "سليم", degraded: "متدهور", down: "متوقّف" };
const OVERALL_STATUS_TONE: Record<string, BadgeTone> = { healthy: "success", degraded: "warning", down: "danger" };

/** لون شريط خطورة الحادثة (accent) — اتّساق بصري لسرعة المسح. */
const SEVERITY_ACCENT: Record<AuditFindingSeverity, string> = {
  critical: "var(--v-red)",
  high: "var(--v-amber)",
  medium: "var(--v-info)",
  low: "var(--v-border-strong)",
  info: "var(--v-border-strong)",
};

function scoreTone(value: number): string {
  if (value >= 75) return "var(--v-green)";
  if (value >= 50) return "var(--v-amber)";
  return "var(--v-red)";
}

export default function ProductionMonitoringPanel({
  projectId,
  productionUrl: initialProductionUrl,
  checks,
  currentCheck,
  incidents,
  events,
  infraStatus,
}: {
  projectId: string;
  productionUrl: string;
  checks: MonitoringCheck[];
  currentCheck: MonitoringCheck | null;
  incidents: MonitoringIncident[];
  events: MonitoringIncidentEvent[];
  infraStatus: InfraServiceStatus[];
}) {
  const router = useRouter();
  const [productionUrl, setProductionUrl] = useState(initialProductionUrl);
  const [savingUrl, setSavingUrl] = useState(false);
  const [running, setRunning] = useState(false);
  const [message, setMessage] = useState("");
  const [expandedIncident, setExpandedIncident] = useState<string | null>(null);

  const isChecking = currentCheck?.status === "running";

  // تحديث دوري مُجمَّع: منسّق واحد لكل الصفحة بدل مؤقّت لكل لوحة، بيقف
  // لما التبويب يكون مخفي وبيبطّل خالص لو المهمة اتعلّقت.
  useBackgroundRefresh(isChecking);

  async function saveProductionUrl() {
    setSavingUrl(true);
    const result = await updateProjectProductionUrl(projectId, productionUrl);
    setSavingUrl(false);
    setMessage(result.ok ? "تم حفظ رابط Production." : (result.message ?? "فشل الحفظ."));
    router.refresh();
  }

  async function runCheckNow() {
    setRunning(true);
    const result = await runMonitoringCheckNow(projectId);
    setRunning(false);
    if (result.status === "already_running") setMessage("فيه فحص شغّال بالفعل.");
    else if (result.status === "error") setMessage(result.message);
    router.refresh();
  }

  async function acknowledge(incidentId: string) {
    await acknowledgeMonitoringIncident(projectId, incidentId);
    router.refresh();
  }

  async function resolve(incidentId: string) {
    await resolveMonitoringIncident(projectId, incidentId);
    router.refresh();
  }

  const openIncidents = incidents.filter((i) => i.status !== "resolved");
  const resolvedIncidents = incidents.filter((i) => i.status === "resolved");
  const criticalCount = openIncidents.filter((i) => i.severity === "critical").length;
  const highCount = openIncidents.filter((i) => i.severity === "high").length;

  return (
    <div className="space-y-4">
      <div className="rounded-[var(--v-radius-lg)] border border-[var(--v-border)] bg-[var(--v-bg)] p-4">
        <p className="mb-1 text-sm font-semibold text-[var(--v-text)]">رابط Production</p>
        <p className="mb-3 text-[11px] text-[var(--v-text-muted)]">
          فحوصات المراقبة خفيفة وآمنة (Read-Only) — آمنة على بيئة Production حقيقية. لو الرابط ده فاضي، هنراقب رابط Staging بدلاً منه.
        </p>
        <div className="flex flex-col gap-2 sm:flex-row">
          <input
            value={productionUrl}
            onChange={(e) => setProductionUrl(e.target.value)}
            placeholder="https://your-live-app.com"
            dir="ltr"
            className="flex-1 rounded-[var(--v-radius-md)] border border-[var(--v-border)] bg-[var(--v-bg)] px-3 py-2 text-sm text-[var(--v-text)] outline-none transition-colors focus:border-[var(--v-primary)] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--v-primary)]"
          />
          <Button variant="secondary" onClick={saveProductionUrl} loading={savingUrl}>
            حفظ
          </Button>
          <Button variant="primary" onClick={runCheckNow} loading={running || isChecking} disabled={isChecking}>
            تشغيل فحص الآن
          </Button>
        </div>
        {message && <p className="mt-2 text-xs text-[var(--v-text-muted)]">{message}</p>}
      </div>

      {!currentCheck && (
        <EmptyState
          icon={<Activity size={28} />}
          title="لسه مفيش فحص مراقبة لهذا المشروع"
          description="حط رابط Production (أو Staging) واضغط تشغيل فحص الآن — أو انتظر الفحص اليومي التلقائي."
        />
      )}

      {currentCheck && (
        <>
          <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
            <div className="rounded-[var(--v-radius-lg)] border border-[var(--v-border)] bg-[var(--v-bg)] p-3 text-center transition-shadow hover:shadow-[var(--v-shadow-sm)]">
              <Badge tone={currentCheck.overall_status ? OVERALL_STATUS_TONE[currentCheck.overall_status] : "neutral"}>
                {currentCheck.overall_status ? OVERALL_STATUS_LABELS[currentCheck.overall_status] : "—"}
              </Badge>
              <p className="mt-1 text-[11px] text-[var(--v-text-muted)]">الحالة العامة</p>
            </div>
            <div className="rounded-[var(--v-radius-lg)] border border-[var(--v-border)] bg-[var(--v-bg)] p-3 text-center transition-shadow hover:shadow-[var(--v-shadow-sm)]">
              <p className="font-display text-2xl" style={{ color: currentCheck.health_score !== null ? scoreTone(currentCheck.health_score) : "var(--v-text-muted)" }}>
                {currentCheck.health_score ?? "—"}
              </p>
              <p className="mt-1 text-[11px] text-[var(--v-text-muted)]">Health Score</p>
            </div>
            <div className="rounded-[var(--v-radius-lg)] border border-[var(--v-border)] bg-[var(--v-bg)] p-3 text-center transition-shadow hover:shadow-[var(--v-shadow-sm)]">
              <p className="font-display text-2xl" style={{ color: currentCheck.performance_score !== null ? scoreTone(currentCheck.performance_score) : "var(--v-text-muted)" }}>
                {currentCheck.performance_score ?? "—"}
              </p>
              <p className="mt-1 text-[11px] text-[var(--v-text-muted)]">Performance Score</p>
            </div>
            <div className="rounded-[var(--v-radius-lg)] border border-[var(--v-border)] bg-[var(--v-bg)] p-3 text-center transition-shadow hover:shadow-[var(--v-shadow-sm)]">
              <p className="font-display text-2xl" style={{ color: currentCheck.response_time_ms !== null && currentCheck.response_time_ms < 1000 ? "var(--v-green)" : "var(--v-amber)" }}>
                {currentCheck.response_time_ms ?? "—"}ms
              </p>
              <p className="mt-1 text-[11px] text-[var(--v-text-muted)]">زمن الاستجابة</p>
            </div>
          </div>

          {infraStatus.length > 0 && (
            <div className="flex flex-wrap gap-2">
              {infraStatus.map((s) => (
                <div key={s.service} className="flex items-center gap-1.5 rounded-[var(--v-radius-md)] border border-[var(--v-border)] bg-[var(--v-bg)] px-2.5 py-1.5 text-xs">
                  <span className="font-medium text-[var(--v-text)]">{INFRA_SERVICE_LABELS[s.service] ?? s.service}</span>
                  <Badge tone={INFRA_STATUS_TONE[s.status]}>{INFRA_STATUS_LABELS[s.status]}</Badge>
                  {s.service === "supabase" && s.status === "healthy" && "database_size_bytes" in s.detail && (
                    <span className="text-[10px] text-[var(--v-text-muted)]">
                      {Math.round(Number(s.detail.database_size_bytes) / 1024 / 1024)}MB، {String(s.detail.table_count)} جدول
                    </span>
                  )}
                </div>
              ))}
            </div>
          )}

          {currentCheck.is_regression && (
            <div className="flex items-center gap-2 rounded-[var(--v-radius-lg)] border border-[var(--v-red)] bg-[var(--v-red)]/10 p-3">
              <AlertTriangle size={18} className="text-[var(--v-red)]" />
              <p className="text-sm font-semibold text-[var(--v-text)]">تم اكتشاف Regression — الصحة العامة اتدهورت بشكل ملحوظ عن آخر فحص.</p>
            </div>
          )}

          <div className="flex flex-wrap items-center gap-2 text-xs text-[var(--v-text-muted)]">
            {criticalCount > 0 && <span className="text-[var(--v-red)]">{criticalCount} Critical</span>}
            {highCount > 0 && <span className="text-[var(--v-amber)]">{highCount} High</span>}
            <span>{currentCheck.checked_pages.length} صفحة اتفحصت</span>
            {currentCheck.status === "failed" && currentCheck.last_error && <span className="text-[var(--v-red)]">{currentCheck.last_error}</span>}
          </div>

          <div>
            <p className="mb-2 text-sm font-semibold text-[var(--v-text)]">Incidents ({openIncidents.length} مفتوحة)</p>
            <div className="space-y-2">
              {openIncidents.length === 0 && (
                <div className="flex items-center gap-2 rounded-[var(--v-radius-lg)] border border-[var(--v-green)]/30 bg-[var(--v-green)]/10 p-3">
                  <ShieldCheck size={16} className="text-[var(--v-green)]" />
                  <p className="text-xs text-[var(--v-text)]">مفيش حوادث مفتوحة حاليًا.</p>
                </div>
              )}
              {openIncidents.map((inc) => (
                <div
                  key={inc.id}
                  className="rounded-[var(--v-radius-lg)] border border-[var(--v-border)] bg-[var(--v-bg)] p-3 transition-shadow hover:shadow-[var(--v-shadow-sm)]"
                  style={{ borderRightWidth: 3, borderRightColor: SEVERITY_ACCENT[inc.severity] }}
                >
                  <div className="flex flex-wrap items-start justify-between gap-2">
                    <div className="flex items-center gap-2">
                      <Badge tone={SEVERITY_TONE[inc.severity]}>{SEVERITY_LABELS[inc.severity]}</Badge>
                      <Badge>{inc.category}</Badge>
                      <span className="text-sm font-semibold text-[var(--v-text)]">{inc.title}</span>
                      {inc.occurrence_count > 1 && <span className="text-[10px] text-[var(--v-text-muted)]">(تكرر {inc.occurrence_count} مرة)</span>}
                      {inc.status === "acknowledged" && <Badge tone="info">مُقَرّ بها</Badge>}
                    </div>
                    <div className="flex items-center gap-2">
                      <button type="button" onClick={() => setExpandedIncident(expandedIncident === inc.id ? null : inc.id)} className="text-xs text-[var(--v-primary)] hover:underline">
                        {expandedIncident === inc.id ? "إخفاء" : "التفاصيل"}
                      </button>
                      {inc.status === "open" && (
                        <Button variant="outline" size="sm" onClick={() => acknowledge(inc.id)}>
                          إقرار
                        </Button>
                      )}
                      <Button variant="ghost" size="sm" onClick={() => resolve(inc.id)}>
                        إغلاق
                      </Button>
                    </div>
                  </div>
                  {expandedIncident === inc.id && (
                    <div className="mt-3 space-y-2">
                      <p className="text-xs text-[var(--v-text)]"><span className="font-bold">الوصف:</span> {inc.description}</p>
                      <p className="text-xs text-[var(--v-text)]"><span className="font-bold">السبب الجذري:</span> {inc.root_cause}</p>
                      {inc.similarity_reason && <p className="text-xs text-[var(--v-text)]"><span className="font-bold">تشابه مع حادثة سابقة:</span> {inc.similarity_reason}</p>}
                      {inc.patch_proposal && <p className="text-xs text-[var(--v-text)]"><span className="font-bold">اقتراح Patch:</span> {inc.patch_proposal}</p>}
                      {inc.refactoring_proposal && <p className="text-xs text-[var(--v-text)]"><span className="font-bold">اقتراح إعادة هيكلة:</span> {inc.refactoring_proposal}</p>}
                      {inc.performance_proposal && <p className="text-xs text-[var(--v-text)]"><span className="font-bold">اقتراح أداء:</span> {inc.performance_proposal}</p>}
                      {inc.security_proposal && <p className="text-xs text-[var(--v-text)]"><span className="font-bold">اقتراح أمني:</span> {inc.security_proposal}</p>}
                      {inc.ux_proposal && <p className="text-xs text-[var(--v-text)]"><span className="font-bold">اقتراح UX:</span> {inc.ux_proposal}</p>}
                      {inc.affected_components.length > 0 && <p className="text-xs text-[var(--v-text)]"><span className="font-bold">المكوّنات المتأثرة:</span> {inc.affected_components.join("، ")}</p>}
                      {inc.workaround && <p className="text-xs text-[var(--v-text)]"><span className="font-bold">حل مؤقت:</span> {inc.workaround}</p>}
                      {inc.permanent_solution && <p className="text-xs text-[var(--v-text)]"><span className="font-bold">حل دائم:</span> {inc.permanent_solution}</p>}
                      {inc.estimated_fix_time_hours !== null && <p className="text-xs text-[var(--v-text)]"><span className="font-bold">وقت إصلاح مُقدَّر:</span> {inc.estimated_fix_time_hours} ساعة</p>}
                      {inc.affected_users_estimate && <p className="text-xs text-[var(--v-text)]"><span className="font-bold">الأثر على المستخدمين:</span> {inc.affected_users_estimate}</p>}
                      {inc.source === "support_ticket" && <Badge tone="info">من بلاغ عميل</Badge>}
                      <p className="text-[11px] text-[var(--v-text-muted)]">درجة الثقة: {inc.confidence_score}%</p>
                    </div>
                  )}
                </div>
              ))}
            </div>
          </div>

          {events.length > 0 && (
            <div>
              <p className="mb-2 text-sm font-semibold text-[var(--v-text)]">Incident Timeline</p>
              <div className="space-y-1">
                {events.map((e) => (
                  <div key={e.id} className="flex items-center justify-between text-[11px]">
                    <span className="text-[var(--v-text)]">{e.event_type} — {e.detail}</span>
                    <span className="text-[var(--v-text-muted)]">{new Date(e.created_at).toLocaleString("ar-EG")}</span>
                  </div>
                ))}
              </div>
            </div>
          )}

          {resolvedIncidents.length > 0 && (
            <div>
              <p className="mb-2 text-sm font-semibold text-[var(--v-text)]">Root Cause Knowledge Base ({resolvedIncidents.length} حادثة مُغلقة)</p>
              <div className="space-y-1.5">
                {resolvedIncidents.map((inc) => (
                  <div key={inc.id} className="flex items-center justify-between rounded-[var(--v-radius-md)] border border-[var(--v-border)] bg-[var(--v-bg)] px-3 py-2 text-xs">
                    <span className="text-[var(--v-text)]">{inc.title}</span>
                    <Badge tone={SEVERITY_TONE[inc.severity]}>{SEVERITY_LABELS[inc.severity]}</Badge>
                    <span className="text-[var(--v-text-muted)]">{new Date(inc.resolved_at ?? inc.created_at).toLocaleString("ar-EG")}</span>
                  </div>
                ))}
              </div>
            </div>
          )}
        </>
      )}

      {checks.length > 1 && (
        <div>
          <p className="mb-2 text-sm font-semibold text-[var(--v-text)]">Trend Analysis ({checks.length} فحص)</p>
          <div className="flex flex-wrap gap-1.5">
            {[...checks].reverse().map((c) => (
              <span
                key={c.id}
                className="rounded-[var(--v-radius-sm)] border border-[var(--v-border)] px-2 py-1 text-[11px]"
                style={{ color: c.health_score !== null ? scoreTone(c.health_score) : undefined }}
              >
                {c.health_score ?? "-"}
                {c.is_regression && " ⚠️"}
              </span>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
