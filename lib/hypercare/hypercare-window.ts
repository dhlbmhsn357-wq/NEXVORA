/**
 * نافذة Hypercare (Duration & Progress) — **وحدة نقية بلا I/O**.
 *
 * يحدّد المدير المدة (٧/١٤/٣٠/٦٠/٩٠ يومًا أو مخصّصة). هذه الوحدة تحسب
 * التقدّم والحالة (نشطة/تنتهي/مغلقة) من تواريخ ثابتة تُمرَّر إليها.
 */

import type { HypercareStatus } from "./hypercare-types";

export function clampDuration(days: number): number {
  if (!Number.isFinite(days)) return 30;
  return Math.max(1, Math.min(180, Math.round(days)));
}

export interface WindowState {
  progressPercent: number;
  daysElapsed: number;
  daysRemaining: number;
  status: HypercareStatus;
}

/** يحسب حالة النافذة من الأيام المنقضية والمدّة (تُمرَّر — لا Date داخليًا). */
export function windowState(daysElapsed: number, durationDays: number, closed: boolean): WindowState {
  const dur = clampDuration(durationDays);
  const elapsed = Math.max(0, Math.min(dur, Math.floor(daysElapsed)));
  const remaining = Math.max(0, dur - elapsed);
  const progressPercent = dur > 0 ? Math.round((elapsed / dur) * 100) : 100;
  const status: HypercareStatus = closed ? "closed" : remaining <= Math.max(1, Math.ceil(dur * 0.1)) ? "ending" : "active";
  return { progressPercent, daysElapsed: elapsed, daysRemaining: remaining, status };
}
