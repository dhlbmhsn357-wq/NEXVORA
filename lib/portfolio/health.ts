/**
 * حساب صحة المشروع (Project Health) — وحدة نقية بدون I/O.
 * بتجمع إشارات من المهام/المراحل/الحوادث/QA وتطلّع درجة 0-100 ولون.
 */

export type HealthColor = "green" | "yellow" | "red";

export interface HealthSignals {
  overallProgress: number; // 0-100 (متوسط تقدّم المهام الأعلى مستوى)
  blockedTasks: number;
  overdueTasks: number;
  criticalOverdueTasks: number;
  delayedMilestones: number; // مراحل فات موعدها وغير معتمدة
  openCriticalIncidents: number;
  engineeringQaFailing: boolean;
  totalTasks: number;
}

export interface HealthResult {
  score: number;
  color: HealthColor;
  reasons: string[];
}

/**
 * درجة الصحة = تبدأ من التقدّم العام، وتُخصم نقاط على كل إشارة خطر.
 * اللون: >=75 أخضر، >=50 أصفر، أقل أحمر.
 */
export function computeProjectHealth(s: HealthSignals): HealthResult {
  const reasons: string[] = [];
  let score = s.totalTasks === 0 ? 60 : s.overallProgress; // بدون مهام = محايد

  const deduct = (points: number, reason: string) => {
    if (points > 0) { score -= points; reasons.push(reason); }
  };

  deduct(s.criticalOverdueTasks * 12, `${s.criticalOverdueTasks} مهمة حرجة متأخرة`);
  deduct((s.overdueTasks - s.criticalOverdueTasks) * 5, `${Math.max(0, s.overdueTasks - s.criticalOverdueTasks)} مهمة متأخرة`);
  deduct(s.blockedTasks * 4, `${s.blockedTasks} مهمة محجوبة`);
  deduct(s.delayedMilestones * 10, `${s.delayedMilestones} مرحلة تسليم متأخرة`);
  deduct(s.openCriticalIncidents * 15, `${s.openCriticalIncidents} حادثة إنتاج حرجة`);
  if (s.engineeringQaFailing) deduct(10, "مراجعة Engineering QA غير مجتازة");

  score = Math.max(0, Math.min(100, Math.round(score)));
  const color: HealthColor = score >= 75 ? "green" : score >= 50 ? "yellow" : "red";
  if (reasons.length === 0) reasons.push("لا توجد مؤشرات خطر.");
  return { score, color, reasons };
}

export const HEALTH_LABELS: Record<HealthColor, string> = {
  green: "سليم",
  yellow: "يحتاج انتباه",
  red: "متعثّر",
};
