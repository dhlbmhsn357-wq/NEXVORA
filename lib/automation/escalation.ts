import type { NotificationSeverity } from "@/lib/types/database";

/**
 * منطق التصعيد التلقائي (pure). كل ما طال تجاهل بند متأخر، بيرتفع مستوى
 * التصعيد عبر السلسلة الإدارية: المنفّذ → المشرف → المدير/الإدارة →
 * مدير المشروع. الملف ده pure عشان يتقدر يُختبر بالكامل.
 *
 * ملاحظة معمارية: جدول notifications مشترك (مش per-recipient)، فالتصعيد
 * دلوقتي بيتمثّل في رفع الخطورة (severity) + وسم المستوى في الرسالة،
 * وكل صاحب صلاحية بيشوفه. التوجيه لكل مستقبِل تحديدًا مؤجّل لحين إضافة
 * عمود recipient (موثّق في التقرير النهائي).
 */

export type EscalationTier = "none" | "supervisor" | "admin" | "owner";

export interface EscalationDecision {
  tier: EscalationTier;
  severity: NotificationSeverity;
  /** هل نُنشئ مهمة مخاطرة تلقائيًا عند هذا المستوى؟ */
  createRiskTask: boolean;
  label: string;
}

const TIER_LABEL: Record<EscalationTier, string> = {
  none: "بدون تصعيد",
  supervisor: "تصعيد للمشرف",
  admin: "تصعيد للإدارة",
  owner: "تصعيد لمدير المشروع",
};

/**
 * يحسب مستوى التصعيد من عدد أيام التأخّر.
 * 0–1 يوم: لا تصعيد | 2–3: مشرف | 4–6: إدارة | 7+: مدير المشروع.
 */
export function computeEscalationTier(daysOverdue: number): EscalationTier {
  if (daysOverdue <= 1) return "none";
  if (daysOverdue <= 3) return "supervisor";
  if (daysOverdue <= 6) return "admin";
  return "owner";
}

export function escalationDecision(daysOverdue: number): EscalationDecision {
  const tier = computeEscalationTier(daysOverdue);
  const severity: NotificationSeverity = tier === "none" ? "info" : tier === "supervisor" ? "warning" : "critical";
  return {
    tier,
    severity,
    createRiskTask: tier === "admin" || tier === "owner",
    label: TIER_LABEL[tier],
  };
}

/** أيام كاملة بين تاريخين (YYYY-MM-DD أو ISO) بالنسبة للحظة مرجعية. */
export function daysBetween(dateStr: string, nowMs: number): number {
  const then = new Date(dateStr).getTime();
  if (Number.isNaN(then)) return 0;
  return Math.floor((nowMs - then) / (24 * 60 * 60 * 1000));
}
