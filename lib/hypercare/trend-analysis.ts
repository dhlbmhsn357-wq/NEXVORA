/**
 * تحليل الاتجاهات (Trend Analysis) — **وحدة نقية بلا I/O**.
 *
 * يحلّل سلاسل زمنية (أداء/أعمال/نمو/إخفاقات) عبر نوافذ ويكشف الاتجاه ونسبة
 * التغيّر. يُستخدم للتقارير التنفيذية وكشف المشاكل المتكرّرة.
 */

import type { TrendSeries, TrendResult } from "./hypercare-types";

export function analyzeTrends(series: TrendSeries[]): TrendResult[] {
  return series.map((s) => {
    const pts = s.points.filter((p) => Number.isFinite(p));
    if (pts.length < 2) return { key: s.key, label: s.label, direction: "flat" as const, changePercent: 0, note: "بيانات غير كافية." };
    const first = pts[0];
    const last = pts[pts.length - 1];
    const changePercent = first === 0 ? (last === 0 ? 0 : 100) : Math.round(((last - first) / Math.abs(first)) * 100);
    const direction: TrendResult["direction"] = Math.abs(changePercent) <= 3 ? "flat" : changePercent > 0 ? "up" : "down";
    return {
      key: s.key, label: s.label, direction, changePercent,
      note: direction === "flat" ? "مستقرّ." : `${direction === "up" ? "ارتفاع" : "انخفاض"} ${Math.abs(changePercent)}٪ عبر النافذة.`,
    };
  });
}

/** يكشف المشاكل المتكرّرة من عناوين الحوادث (تكرار ≥ عتبة). */
export function findRecurring(incidentKeys: string[], threshold = 2): Array<{ key: string; count: number }> {
  const counts = new Map<string, number>();
  for (const k of incidentKeys) counts.set(k, (counts.get(k) ?? 0) + 1);
  return [...counts.entries()].filter(([, c]) => c >= threshold).map(([key, count]) => ({ key, count })).sort((a, b) => b.count - a.count);
}
