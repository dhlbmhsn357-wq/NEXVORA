/**
 * التحقّق من مؤشّرات الأداء (KPI Validation) — **وحدة نقية بلا I/O**.
 *
 * يقارن KPIs قبل/بعد الترحيل (الإيرادات/المخزون/الطلبات/العملاء/الموظفون/
 * الأرباح): هل حُوفِظ عليها (أو تحسّنت)؟ أي تدهور غير مبرَّر يُعلَّم.
 */

import type { KpiPair, KpiCheck, KpiReport } from "./verification-types";

const TOLERANCE = 1; // ٪ سماحية للتقريب.

export function validateKpis(pairs: KpiPair[]): KpiReport {
  const checks: KpiCheck[] = pairs.map((p) => {
    let verdict: KpiCheck["verdict"];
    let variancePercent = 0;
    if (p.before === 0 && p.after === 0) {
      verdict = "preserved";
    } else if (p.after === 0 && p.before > 0) {
      verdict = "missing";
      variancePercent = -100;
    } else {
      variancePercent = p.before === 0 ? 100 : Math.round(((p.after - p.before) / p.before) * 100);
      if (Math.abs(variancePercent) <= TOLERANCE) verdict = "preserved";
      else if (variancePercent > TOLERANCE) verdict = "improved";
      else verdict = "degraded";
    }
    return { key: p.key, label: p.label, before: p.before, after: p.after, variancePercent, verdict };
  });

  const preserved = checks.filter((c) => c.verdict === "preserved" || c.verdict === "improved").length;
  const degraded = checks.filter((c) => c.verdict === "degraded" || c.verdict === "missing").length;
  return { checks, preserved, degraded, passed: checks.length === 0 || degraded === 0 };
}
