"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Gauge, RefreshCw } from "lucide-react";
import Card from "@/components/ui/Card";
import Badge, { type BadgeTone } from "@/components/ui/Badge";
import Button from "@/components/ui/Button";
import { toast } from "@/components/ui/Toaster";
import { runReviewVerdictAction } from "./production-monitoring-actions";
import type { MonitoringIncident, MonitoringReviewReport, MonitoringReviewVerdictType } from "@/lib/types/database";

const VERDICT_LABELS: Record<MonitoringReviewVerdictType, string> = {
  solved_completely: "اتحلت بالكامل",
  solved_partially: "اتحلت جزئيًا",
  still_exists: "لسه موجودة",
  new_issues_introduced: "مشاكل جديدة ظهرت",
  performance_improved: "تحسّن الأداء",
  security_improved: "تحسّن الأمان",
  regression_found: "تراجع مكتشف",
};

const VERDICT_TONE: Record<MonitoringReviewVerdictType, BadgeTone> = {
  solved_completely: "success",
  solved_partially: "warning",
  still_exists: "danger",
  new_issues_introduced: "danger",
  performance_improved: "success",
  security_improved: "success",
  regression_found: "danger",
};

function scoreTone(score: number | null): string {
  if (score === null) return "var(--v-text-muted)";
  if (score >= 90) return "var(--v-green)";
  if (score >= 50) return "var(--v-amber)";
  return "var(--v-red)";
}

/**
 * "هل الإصلاح نجح فعلًا؟" — Phase 6. حكم AI لكل حادثة مفتوحة + درجة
 * إجمالية محسوبة بالكود (مش من الـ AI مباشرة). لو الدرجة أقل من 100،
 * بيولّد تلقائيًا جولة Fix Prompts جديدة للحوادث الناقصة.
 */
export default function ProductionReviewVerdictPanel({
  projectId,
  incidents,
  latestReport,
}: {
  projectId: string;
  incidents: MonitoringIncident[];
  latestReport: MonitoringReviewReport | null;
}) {
  const router = useRouter();
  const [running, setRunning] = useState(false);
  const openIncidents = incidents.filter((i) => i.status !== "resolved");

  async function handleRun() {
    setRunning(true);
    const result = await runReviewVerdictAction(projectId);
    setRunning(false);
    if (result.status === "error") {
      toast.error(result.message);
      return;
    }
    toast.success("جاري التحقّق من نجاح الإصلاح — النتيجة هتظهر بعد لحظات.");
    router.refresh();
  }

  const incidentTitleById = new Map(incidents.map((i) => [i.id, i.title]));

  return (
    <Card padding="md">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="flex items-center gap-2 text-sm font-semibold text-[var(--v-text)]">
          <Gauge size={16} className="text-[var(--v-primary)]" /> هل الإصلاح نجح فعلًا؟
        </p>
        <Button variant="outline" size="sm" icon={<RefreshCw size={13} />} onClick={handleRun} disabled={running || openIncidents.length === 0}>
          {running ? "جاري التحقّق..." : "تحقّق الآن"}
        </Button>
      </div>

      {openIncidents.length === 0 && !latestReport && <p className="mt-2 text-xs text-[var(--v-text-muted)]">مفيش حوادث مفتوحة تحتاج تحقّق حاليًا.</p>}

      {latestReport && (
        <div className="mt-3">
          <div className="mb-2 flex items-center gap-2">
            <p className="font-display text-3xl" style={{ color: scoreTone(latestReport.overall_fix_score) }}>
              {latestReport.overall_fix_score ?? "—"}%
            </p>
            <span className="text-xs text-[var(--v-text-muted)]">Overall Fix Score — {new Date(latestReport.generated_at).toLocaleString("ar-EG")}</span>
          </div>
          <div className="space-y-1.5">
            {latestReport.verdicts.map((v, i) => (
              <div key={i} className="flex flex-wrap items-center justify-between gap-2 rounded-[var(--v-radius-md)] border border-[var(--v-border)] p-2">
                <span className="text-xs text-[var(--v-text)]">{incidentTitleById.get(v.incident_id) ?? v.incident_id}</span>
                <div className="flex items-center gap-2">
                  <Badge tone={VERDICT_TONE[v.verdict]}>{VERDICT_LABELS[v.verdict]}</Badge>
                </div>
              </div>
            ))}
          </div>
          {(latestReport.overall_fix_score ?? 100) < 100 && (
            <p className="mt-2 text-[11px] text-[var(--v-amber)]">جولة Fix Prompts جديدة اتولّدت تلقائيًا للحوادث الناقصة — راجعها في تبويب &quot;Production Monitoring Prompt&quot;.</p>
          )}
        </div>
      )}
    </Card>
  );
}
