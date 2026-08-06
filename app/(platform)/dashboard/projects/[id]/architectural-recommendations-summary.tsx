"use client";

import { useState, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  Landmark,
  CheckCircle2,
  Clock3,
  AlertTriangle,
  ThumbsUp,
  ThumbsDown,
  Clock,
  RefreshCw,
} from "lucide-react";
import Card from "@/components/ui/Card";
import Badge from "@/components/ui/Badge";
import Button from "@/components/ui/Button";
import { toast } from "@/components/ui/Toaster";
import {
  setRecommendationStatusAction,
  syncRecommendationsToBrainAction,
} from "./organizational-intelligence-actions";
import { RECOMMENDATION_CATEGORY_LABELS } from "@/lib/organizational-intelligence/recommendation-labels";
import type { ArchitectureValidationReport, ProjectRecommendation, RecommendationStatus } from "@/lib/types/database";

/**
 * «توصيات معمارية وفنية» — مخرجات مرحلة التوصيات الذكية (التوصيات +
 * القرار المعماري) معروضة داخل Project Brain وProject Review، مع إمكانية
 * **اعتمادها من هنا مباشرة**. قبول أي توصية بيكتبها فورًا في مسودة الـ
 * Brain (مش مجرد تغيير حالة في لوحة تانية).
 */
export default function ArchitecturalRecommendationsSummary({
  projectId,
  recommendations,
  architectureReport,
  canManage = true,
}: {
  projectId: string;
  recommendations: ProjectRecommendation[];
  architectureReport: ArchitectureValidationReport | null;
  canManage?: boolean;
}) {
  const router = useRouter();
  const [pendingId, setPendingId] = useState<string | null>(null);
  const [syncing, startSync] = useTransition();

  const accepted = recommendations.filter((r) => r.status === "accepted");
  const pending = recommendations.filter((r) => r.status === "suggested" || r.status === "needs_discussion");
  const postponed = recommendations.filter((r) => r.status === "postponed");

  const hasAnything = recommendations.length > 0 || !!architectureReport;

  async function decide(rec: ProjectRecommendation, status: RecommendationStatus) {
    setPendingId(rec.id);
    const r = await setRecommendationStatusAction(projectId, rec.id, status);
    setPendingId(null);
    if (!r.ok) {
      toast.error(r.message ?? "فشل حفظ القرار.");
      return;
    }
    if (status === "accepted") {
      // رسالة الـ Brain بتوضّح إذا اتكتبت فعلًا ولا فيه مانع (مفيش مسودة مثلًا).
      toast.success(r.brainMessage ?? "تم اعتماد التوصية.");
    } else {
      toast.success("تم حفظ القرار.");
    }
    router.refresh();
  }

  function syncAll() {
    startSync(async () => {
      const r = await syncRecommendationsToBrainAction(projectId);
      if (!r.ok) {
        toast.error(r.message);
        return;
      }
      toast.success(r.message);
      router.refresh();
    });
  }

  return (
    <Card padding="md">
      <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
        <p className="flex items-center gap-2 text-sm font-semibold text-[var(--v-text)]">
          <Landmark size={16} className="text-[var(--v-primary)]" /> توصيات معمارية وفنية
        </p>
        <div className="flex items-center gap-2">
          {canManage && (accepted.length > 0 || architectureReport) && (
            <Button variant="outline" size="sm" onClick={syncAll} disabled={syncing}>
              <RefreshCw size={13} className={syncing ? "animate-spin" : ""} />
              {syncing ? "جاري الإضافة…" : "إضافة المعتمَد للـ Brain"}
            </Button>
          )}
          <Link
            href={`/dashboard/projects/${projectId}?tab=smartRecommendations`}
            className="text-xs font-medium text-[var(--v-primary)] hover:underline"
          >
            فتح مرحلة التوصيات الذكية ←
          </Link>
        </div>
      </div>

      {!hasAnything ? (
        <p className="rounded-[var(--v-radius-md)] border border-dashed border-[var(--v-border)] p-4 text-center text-xs text-[var(--v-text-muted)]">
          لسه مفيش توصيات ولا تحليل معماري — ولّدهم من مرحلة «توصيات ذكية» (قبل بناء الـ Brain).
        </p>
      ) : (
        <div className="space-y-4">
          {architectureReport && (
            <div className="rounded-[var(--v-radius-md)] border border-[var(--v-border)] bg-[var(--v-surface-2)] p-3">
              <div className="mb-1.5 flex flex-wrap items-center gap-2">
                <p className="text-xs font-semibold text-[var(--v-text)]">القرار المعماري (قبل الـ PRD)</p>
                <Badge
                  tone={
                    architectureReport.readiness_score >= 70
                      ? "success"
                      : architectureReport.readiness_score >= 40
                        ? "warning"
                        : "danger"
                  }
                >
                  جاهزية {architectureReport.readiness_score}%
                </Badge>
                {architectureReport.domain && (
                  <span className="text-[11px] text-[var(--v-text-muted)]">مجال: {architectureReport.domain}</span>
                )}
              </div>
              {architectureReport.ai_summary && (
                <p className="text-xs leading-relaxed text-[var(--v-text-secondary)]">{architectureReport.ai_summary}</p>
              )}
              {architectureReport.missing_modules.length > 0 && (
                <p className="mt-2 flex items-start gap-1.5 text-[11px] text-[var(--v-amber)]">
                  <AlertTriangle size={12} className="mt-0.5 shrink-0" />
                  وحدات مطلوبة ناقصة: {architectureReport.missing_modules.map((m) => m.name).join("، ")}
                </p>
              )}
            </div>
          )}

          {/* المعلّقة — قابلة للاعتماد من هنا مباشرة */}
          {pending.length > 0 && (
            <div>
              <p className="mb-1.5 flex items-center gap-1.5 text-xs font-semibold text-[var(--v-amber)]">
                <Clock3 size={13} /> بانتظار قرارك ({pending.length}) — لازم تُحسم قبل اعتماد الـ Brain
              </p>
              <div className="space-y-2">
                {pending.map((r) => (
                  <div key={r.id} className="rounded-[var(--v-radius-md)] border border-[var(--v-amber)]/30 bg-[var(--v-amber)]/5 p-2.5">
                    <p className="text-xs text-[var(--v-text)]">
                      <span className="text-[10px] font-semibold text-[var(--v-text-muted)]">
                        [{RECOMMENDATION_CATEGORY_LABELS[r.category] ?? r.category}]
                      </span>{" "}
                      {r.recommendation.length > 160 ? `${r.recommendation.slice(0, 160)}…` : r.recommendation}
                    </p>
                    {r.rationale && (
                      <p className="mt-1 text-[11px] text-[var(--v-text-muted)]">{r.rationale}</p>
                    )}
                    {canManage && (
                      <div className="mt-2 flex flex-wrap gap-1.5">
                        <Button variant="success" size="sm" onClick={() => decide(r, "accepted")} disabled={pendingId === r.id}>
                          <ThumbsUp size={12} /> اعتماد
                        </Button>
                        <Button variant="ghost" size="sm" onClick={() => decide(r, "postponed")} disabled={pendingId === r.id}>
                          <Clock size={12} /> تأجيل
                        </Button>
                        <Button variant="ghost" size="sm" onClick={() => decide(r, "dismissed")} disabled={pendingId === r.id}>
                          <ThumbsDown size={12} /> رفض
                        </Button>
                      </div>
                    )}
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* المعتمَدة — مكتوبة فعليًا في الـ Brain */}
          {accepted.length > 0 && (
            <div>
              <p className="mb-1.5 flex items-center gap-1.5 text-xs font-semibold text-[var(--v-green)]">
                <CheckCircle2 size={13} /> معتمَدة ({accepted.length}) — مضافة في «المزايا/التكاملات المقترحة» بالـ Brain
              </p>
              <ul className="space-y-1.5">
                {accepted.map((r) => (
                  <li key={r.id} className="rounded-[var(--v-radius-md)] border border-[var(--v-green)]/30 bg-[var(--v-green)]/5 p-2.5">
                    <p className="text-xs font-medium text-[var(--v-text)]">
                      <span className="text-[10px] text-[var(--v-text-muted)]">
                        [{RECOMMENDATION_CATEGORY_LABELS[r.category] ?? r.category}]
                      </span>{" "}
                      {r.recommendation.length > 120 ? `${r.recommendation.slice(0, 120)}…` : r.recommendation}
                    </p>
                  </li>
                ))}
              </ul>
            </div>
          )}

          {postponed.length > 0 && (
            <p className="text-[11px] text-[var(--v-text-muted)]">
              مؤجّلة: {postponed.length} · إجمالي التوصيات: {recommendations.length}
            </p>
          )}
        </div>
      )}
    </Card>
  );
}
