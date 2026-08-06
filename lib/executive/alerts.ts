import type { NotificationSeverity } from "@/lib/types/database";
import type { CompanyHealthResult } from "./health";

/**
 * اشتقاق التنبيهات التنفيذية (pure) من صحة الشركة + الإشارات المجمّعة.
 * التنبيهات مرتّبة حسب الأثر على العمل. service.ts بيحوّلها لإشعارات
 * فعلية (فئة executive) عبر نفس نمط upsertNotification الموجود.
 */

export interface ExecutiveAlertSignals {
  healthScore: number;
  qaFailRatePct: number;
  supportBacklog: number;
  overloadedEmployees: number;
  openCriticalIncidents: number;
  delayedProjectsPct: number;
  automationFailRatePct: number;
}

export interface ExecutiveAlert {
  key: string;
  severity: NotificationSeverity;
  title: string;
  message: string;
}

/** عتبات التنبيه — معلومة وثابتة عشان تتقدر تُختبر. */
export const ALERT_THRESHOLDS = {
  healthCritical: 60,
  qaFailRatePct: 30,
  supportBacklog: 5,
  overloadedEmployees: 1,
  openCriticalIncidents: 1,
  delayedProjectsPct: 30,
  automationFailRatePct: 25,
};

export function deriveExecutiveAlerts(health: CompanyHealthResult, s: ExecutiveAlertSignals): ExecutiveAlert[] {
  const alerts: ExecutiveAlert[] = [];

  if (s.healthScore < ALERT_THRESHOLDS.healthCritical) {
    alerts.push({
      key: "company-health-low",
      severity: "critical",
      title: "صحة الشركة منخفضة",
      message: `درجة صحة الشركة ${s.healthScore}% — أقل من الحد الآمن (${ALERT_THRESHOLDS.healthCritical}%). أضعف الأبعاد: ${health.weakest.map((w) => w.label).join("، ") || "غير محدّد"}.`,
    });
  }
  if (s.openCriticalIncidents >= ALERT_THRESHOLDS.openCriticalIncidents) {
    alerts.push({
      key: "critical-incidents-open",
      severity: "critical",
      title: "حوادث إنتاج حرجة مفتوحة",
      message: `${s.openCriticalIncidents} حادثة إنتاج حرجة غير محلولة عبر المشاريع.`,
    });
  }
  if (s.qaFailRatePct >= ALERT_THRESHOLDS.qaFailRatePct) {
    alerts.push({
      key: "qa-fail-rate-high",
      severity: "warning",
      title: "ارتفاع معدل إخفاق الجودة",
      message: `معدل إخفاق مراجعات الجودة ${s.qaFailRatePct}%.`,
    });
  }
  if (s.delayedProjectsPct >= ALERT_THRESHOLDS.delayedProjectsPct) {
    alerts.push({
      key: "delivery-delays-high",
      severity: "warning",
      title: "ارتفاع تأخّر التسليم",
      message: `${s.delayedProjectsPct}% من المشاريع بها مراحل تسليم متأخّرة.`,
    });
  }
  if (s.supportBacklog >= ALERT_THRESHOLDS.supportBacklog) {
    alerts.push({
      key: "support-backlog-high",
      severity: "warning",
      title: "تراكم طلبات الدعم",
      message: `${s.supportBacklog} طلب دعم غير محلول بحاجة متابعة.`,
    });
  }
  if (s.overloadedEmployees >= ALERT_THRESHOLDS.overloadedEmployees) {
    alerts.push({
      key: "team-overload",
      severity: "warning",
      title: "إرهاق في الفريق",
      message: `${s.overloadedEmployees} موظّف تجاوز طاقته الأسبوعية — أعد توزيع الأحمال.`,
    });
  }
  if (s.automationFailRatePct >= ALERT_THRESHOLDS.automationFailRatePct) {
    alerts.push({
      key: "automation-failures",
      severity: "warning",
      title: "إخفاقات في الأتمتة",
      message: `معدل إخفاق تنفيذ الأتمتة ${s.automationFailRatePct}%.`,
    });
  }

  const order: Record<NotificationSeverity, number> = { critical: 0, warning: 1, info: 2 };
  return alerts.sort((a, b) => order[a.severity] - order[b.severity]);
}
