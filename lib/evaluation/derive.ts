/**
 * NEXVORA Product Evaluation Guide — Pure Derivations (P9)
 */
import type {
  EvaluationScenarioRow, EvaluationRunRow,
  EvalCategory, EvalSeverity, EvalRunResult,
} from "./types";

// ---------------------------------------------------------------------------
// Latest run per scenario (for pass/fail dashboard)
// ---------------------------------------------------------------------------
export function latestRunByScenario(runs: readonly EvaluationRunRow[]): Map<string, EvaluationRunRow> {
  const map = new Map<string, EvaluationRunRow>();
  for (const r of runs) {
    const prev = map.get(r.scenarioId);
    if (!prev || r.runAt > prev.runAt) map.set(r.scenarioId, r);
  }
  return map;
}

// ---------------------------------------------------------------------------
// Summary
// ---------------------------------------------------------------------------
export interface EvaluationSummary {
  totalScenarios: number;
  byCategory: Record<EvalCategory, number>;
  bySeverity: Record<EvalSeverity, number>;
  runsTotal: number;
  latestByResult: Record<EvalRunResult, number>;
  passRate: number;         // 0..100 — من آخر تشغيل لكل سيناريو
  scenariosNeverRun: number;
  criticalFailures: number; // آخر تشغيل fail على severity=critical
}

const EMPTY_CATEGORY = (): Record<EvalCategory, number> => ({
  functional: 0, usability: 0, performance: 0, security: 0, accessibility: 0, other: 0,
  empty_states: 0, error_states: 0, mobile_rtl: 0, ux_clarity: 0, user_outcomes: 0,
});
const EMPTY_SEVERITY = (): Record<EvalSeverity, number> => ({
  low: 0, medium: 0, high: 0, critical: 0,
});
const EMPTY_RESULT = (): Record<EvalRunResult, number> => ({
  pass: 0, fail: 0, blocked: 0, skipped: 0,
});

export function summarizeEvaluation(
  scenarios: readonly EvaluationScenarioRow[],
  runs: readonly EvaluationRunRow[],
): EvaluationSummary {
  const byCategory = EMPTY_CATEGORY();
  const bySeverity = EMPTY_SEVERITY();
  for (const s of scenarios) {
    byCategory[s.category]++;
    bySeverity[s.severity]++;
  }
  const latest = latestRunByScenario(runs);
  const latestByResult = EMPTY_RESULT();
  let criticalFailures = 0;
  const severityById = new Map(scenarios.map((s) => [s.id, s.severity]));
  for (const r of latest.values()) {
    latestByResult[r.result]++;
    if (r.result === "fail" && severityById.get(r.scenarioId) === "critical") criticalFailures++;
  }
  const runOnce = latest.size;
  const passRate = runOnce === 0 ? 0 : Math.round((latestByResult.pass / runOnce) * 100);
  return {
    totalScenarios: scenarios.length,
    byCategory,
    bySeverity,
    runsTotal: runs.length,
    latestByResult,
    passRate,
    scenariosNeverRun: scenarios.length - runOnce,
    criticalFailures,
  };
}

// ---------------------------------------------------------------------------
// Readiness — بوّابة قبل Client Approval (P11)
// ---------------------------------------------------------------------------
export interface EvaluationReadiness {
  score: number; ready: boolean;
  checks: {
    minScenariosOk: boolean;
    allRunOk: boolean;
    passRateOk: boolean;
    noCriticalFailuresOk: boolean;
  };
  breakdown: {
    scenarios: number; runCoverage: number; passRate: number; criticalFailures: number;
  };
}

const THRESHOLD = 70;
export function deriveEvaluationReadiness(
  scenarios: readonly EvaluationScenarioRow[],
  runs: readonly EvaluationRunRow[],
): EvaluationReadiness {
  const s = summarizeEvaluation(scenarios, runs);
  const coverage = scenarios.length === 0 ? 0
    : Math.round(((scenarios.length - s.scenariosNeverRun) / scenarios.length) * 100);
  const checks = {
    minScenariosOk: scenarios.length >= 5,
    allRunOk: scenarios.length > 0 && s.scenariosNeverRun === 0,
    passRateOk: s.passRate >= 90,
    // نتطلّب وجود سيناريوهات — بلاش نديّ نقاط "لا فشل" لمشروع فارغ.
    noCriticalFailuresOk: scenarios.length > 0 && s.criticalFailures === 0,
  };
  let score = 0;
  if (checks.minScenariosOk)        score += 25;
  if (checks.allRunOk)              score += 30;
  if (checks.passRateOk)            score += 25;
  if (checks.noCriticalFailuresOk)  score += 20;
  return {
    score, ready: score >= THRESHOLD, checks,
    breakdown: {
      scenarios: scenarios.length, runCoverage: coverage,
      passRate: s.passRate, criticalFailures: s.criticalFailures,
    },
  };
}
