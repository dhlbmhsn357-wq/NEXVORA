/**
 * ProjectHealthStrip
 * ==================
 * شريط علوي دائم يظهر فوق شريط التبويبات في صفحة المشروع.
 * الهدف: إظهار مؤشر الصحة + عدد المخاطر المرصودة على كل تبويب،
 * بدون الحاجة للدخول لتبويب "التسليم" فقط عشان تشوف الحالة.
 *
 * Server component بلا state — بيتغذّى بالبيانات المُحمّلة server-side
 * من page.tsx (خزّان مشترك) فما يعملش fetch منفصل عند تبديل التبويب.
 *
 * المخاطر المرصودة = مجموع مبسّط لإشارات قابلة للحساب فورًا (بدون AI):
 *   • أعضاء محمّلين فوق العتبة (workload > OVERLOAD_THRESHOLD_PCT)
 *   • مراحل تسليم متأخرة (health.reasons عندها الحصر لكن نستخدم count مباشر)
 */

import Link from "next/link";
import { HeartPulse, AlertTriangle, ShieldCheck } from "lucide-react";
import Badge, { type BadgeTone } from "@/components/ui/Badge";
import { HEALTH_LABELS, type HealthColor, type HealthResult } from "@/lib/portfolio/health";
import { OVERLOAD_THRESHOLD_PCT } from "@/lib/portfolio/capacity";
import type { MemberWorkload } from "@/lib/portfolio/service";

const HEALTH_TONE: Record<HealthColor, BadgeTone> = {
  green: "success",
  yellow: "warning",
  red: "danger",
};

export interface ProjectHealthStripProps {
  projectId: string;
  health: HealthResult | null;
  workload: readonly MemberWorkload[];
  /** عدد مراحل التسليم المتأخرة (planned_date قبل اليوم و غير معتمدة). */
  delayedMilestonesCount: number;
  /** لو الفلاغ الممتد off، deep-link ?tab=deliveryMilestones غير موجود؛
   *  الشريط يوجّه لـ tasks بدلاً منه. */
  hasDeliveryMilestonesTab?: boolean;
}

export default function ProjectHealthStrip({
  projectId,
  health,
  workload,
  delayedMilestonesCount,
  hasDeliveryMilestonesTab = false,
}: ProjectHealthStripProps) {
  const overloadedCount = workload.filter((w) => w.overloaded).length;
  const risksCount = overloadedCount + delayedMilestonesCount;
  const hasRisks = risksCount > 0;

  const teamHref = `/dashboard/projects/${projectId}?tab=team`;
  const milestonesHref = hasDeliveryMilestonesTab
    ? `/dashboard/projects/${projectId}?tab=deliveryMilestones`
    : `/dashboard/projects/${projectId}?tab=tasks`;

  return (
    <div
      dir="rtl"
      className="sticky top-0 z-30 mb-3 flex flex-wrap items-center gap-3 rounded-[var(--v-radius-md)] border border-[var(--v-border)] bg-[var(--v-surface)]/95 px-3 py-2 text-xs backdrop-blur supports-[backdrop-filter]:bg-[var(--v-surface)]/80"
      data-testid="project-health-strip"
    >
      <div className="flex items-center gap-2">
        <HeartPulse size={14} className="text-[var(--v-primary)]" aria-hidden="true" />
        <span className="text-[var(--v-text-muted)]">صحة المشروع:</span>
        {health ? (
          <>
            <span className="font-mono-plex text-sm font-semibold text-[var(--v-text)]">{health.score}</span>
            <Badge tone={HEALTH_TONE[health.color]}>{HEALTH_LABELS[health.color]}</Badge>
          </>
        ) : (
          <span className="text-[var(--v-text-muted)]">—</span>
        )}
      </div>

      <span className="hidden h-4 w-px bg-[var(--v-border)] sm:inline-block" aria-hidden="true" />

      <div className="flex items-center gap-2">
        {hasRisks ? (
          <AlertTriangle size={14} className="text-[var(--v-amber)]" aria-hidden="true" />
        ) : (
          <ShieldCheck size={14} className="text-[var(--v-green)]" aria-hidden="true" />
        )}
        <span className="text-[var(--v-text-muted)]">المخاطر:</span>
        {hasRisks ? (
          <>
            <Badge tone="warning">{risksCount} مخاطر مرصودة</Badge>
            {overloadedCount > 0 && (
              <Link
                href={teamHref}
                className="text-[11px] text-[var(--v-text-secondary)] underline-offset-2 hover:text-[var(--v-primary)] hover:underline"
              >
                {overloadedCount} عضو محمّل &gt; {OVERLOAD_THRESHOLD_PCT}%
              </Link>
            )}
            {delayedMilestonesCount > 0 && (
              <Link
                href={milestonesHref}
                className="text-[11px] text-[var(--v-text-secondary)] underline-offset-2 hover:text-[var(--v-primary)] hover:underline"
              >
                {delayedMilestonesCount} مرحلة متأخرة
              </Link>
            )}
          </>
        ) : (
          <Badge tone="success">لا مخاطر</Badge>
        )}
      </div>

      <div className="ms-auto flex items-center gap-3">
        <Link
          href={teamHref}
          className="text-[11px] text-[var(--v-text-secondary)] transition hover:text-[var(--v-primary)]"
        >
          الفريق والملكية →
        </Link>
      </div>
    </div>
  );
}
