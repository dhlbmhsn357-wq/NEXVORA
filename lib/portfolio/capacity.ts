import { isTerminalStatus } from "@/lib/work/statuses";
import type { Task } from "@/lib/types/database";

/**
 * حساب سعة/حمل المستخدم (Capacity) — وحدة نقية بدون I/O.
 * الحمل من المهام غير المنتهية المكلّف بها المستخدم عبر كل المشاريع.
 */

/** ساعات العمل الأسبوعية الافتراضية (سعة الفرد). قابلة للتوسّع مستقبلًا. */
export const WEEKLY_CAPACITY_HOURS = 40;

/** حد اعتبار المستخدم "محمّل زيادة" (نسبة من السعة). */
export const OVERLOAD_THRESHOLD_PCT = 100;

export interface UserWorkload {
  openTasks: number;
  estimatedHours: number;
  workloadPct: number;
  overloaded: boolean;
}

/**
 * يحسب حمل مستخدم من مهامه المكلّف بها. الساعات = مجموع estimated_hours
 * للمهام غير المنتهية (الافتراضي 4 ساعات لو مفيش تقدير). النسبة مقارنةً
 * بالسعة الأسبوعية.
 */
export function computeUserWorkload(tasks: Pick<Task, "status" | "estimated_hours">[]): UserWorkload {
  const open = tasks.filter((t) => !isTerminalStatus(t.status));
  const hours = open.reduce((sum, t) => sum + (t.estimated_hours ?? 4), 0);
  const pct = Math.round((hours / WEEKLY_CAPACITY_HOURS) * 100);
  return {
    openTasks: open.length,
    estimatedHours: hours,
    workloadPct: pct,
    overloaded: pct >= OVERLOAD_THRESHOLD_PCT,
  };
}
