"use client";

import { useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Landmark, RefreshCw } from "lucide-react";
import Card from "@/components/ui/Card";
import Badge from "@/components/ui/Badge";
import Button from "@/components/ui/Button";
import { toast } from "@/components/ui/Toaster";
import { syncRecommendationsToBrainAction } from "./organizational-intelligence-actions";
import type { ArchitectureValidationReport, ProjectRecommendation } from "@/lib/types/database";

/**
 * «توصيات معمارية وفنية» — شريط حالة مختصر (غير تفاعلي) لجاهزية القرار
 * المعماري وعدد التوصيات بانتظار القرار، يظهر مرة واحدة فوق أقسام Project
 * Brain. التفاصيل الكاملة (نص القرار المعماري، بطاقات الاعتماد/التأجيل/الرفض)
 * موجودة فقط داخل تبويب «التوصيات» عبر ArchitectureIntelligencePanel
 * وSmartRecommendationsPanel — تجنّبًا لتكرار نفس المحتوى مرتين.
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
  const [syncing, startSync] = useTransition();

  const accepted = recommendations.filter((r) => r.status === "accepted");
  const pending = recommendations.filter((r) => r.status === "suggested" || r.status === "needs_discussion");

  const hasAnything = recommendations.length > 0 || !!architectureReport;

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
      <div className="flex flex-wrap items-center justify-between gap-2">
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
        </div>
      </div>

      {!hasAnything ? (
        <p className="mt-3 rounded-[var(--v-radius-md)] border border-dashed border-[var(--v-border)] p-4 text-center text-xs text-[var(--v-text-muted)]">
          لسه مفيش توصيات ولا تحليل معماري — ولّدهم من تبويب «التوصيات».
        </p>
      ) : (
        <div className="mt-3 flex flex-wrap items-center justify-between gap-3">
          <div className="flex flex-wrap items-center gap-2">
            {architectureReport && (
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
            )}
            {pending.length > 0 && (
              <span className="text-xs font-medium text-[var(--v-amber)]">
                {pending.length} توصية بانتظار القرار
              </span>
            )}
            {pending.length === 0 && accepted.length > 0 && (
              <span className="text-xs text-[var(--v-text-muted)]">
                {accepted.length} توصية معتمَدة — راجعها في تبويب التوصيات
              </span>
            )}
          </div>

          {pending.length > 0 && (
            <Link
              href={`/dashboard/projects/${projectId}?tab=projectBrain&section=recommendations`}
              className="text-xs font-medium text-[var(--v-primary)] hover:underline"
            >
              راجع وقرّر ↓
            </Link>
          )}
        </div>
      )}
    </Card>
  );
}
