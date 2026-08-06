/**
 * درجة الصحة المستمرة (Continuous Health Score) — **وحدة نقية بلا I/O**.
 *
 * تحسب باستمرار: صحة النظام/الأعمال/الأداء/استقرار الترحيل/قاعدة البيانات/
 * البنية التحتية → درجة إجمالية من ١٠٠. الخدمة تُغذّي الإشارات الفعلية.
 */

import type { HealthSignals, HealthBreakdown, HealthReport } from "./hypercare-types";

const WEIGHTS = { systemHealth: 0.2, businessHealth: 0.2, performanceHealth: 0.2, migrationStability: 0.15, databaseHealth: 0.15, infrastructureHealth: 0.1 };

export function computeHealth(s: HealthSignals): HealthReport {
  const perfOk = s.avgQueryMs > 0 && s.avgQueryMs <= 500;
  const errOk = s.errorRatePercent <= 2;

  const breakdown: HealthBreakdown = {
    systemHealth: pct([s.apiOk, s.storageOk, s.cacheOk, errOk]),
    businessHealth: s.businessStable ? 100 : 40,
    performanceHealth: pct([perfOk, s.avgQueryMs <= 250, errOk]),
    migrationStability: pct([s.databaseOk, s.businessStable, errOk]),
    databaseHealth: pct([s.databaseOk, perfOk]),
    infrastructureHealth: pct([s.queuesOk, s.workersActive, s.storageOk]),
  };

  const overall = Math.round(
    breakdown.systemHealth * WEIGHTS.systemHealth +
    breakdown.businessHealth * WEIGHTS.businessHealth +
    breakdown.performanceHealth * WEIGHTS.performanceHealth +
    breakdown.migrationStability * WEIGHTS.migrationStability +
    breakdown.databaseHealth * WEIGHTS.databaseHealth +
    breakdown.infrastructureHealth * WEIGHTS.infrastructureHealth
  );

  const status: HealthReport["status"] = !s.databaseOk || overall < 50 ? "critical" : overall < 80 ? "degraded" : "healthy";
  return { breakdown, overall: Math.max(0, Math.min(100, overall)), status };
}

function pct(flags: boolean[]): number {
  if (!flags.length) return 100;
  return Math.round((flags.filter(Boolean).length / flags.length) * 100);
}
