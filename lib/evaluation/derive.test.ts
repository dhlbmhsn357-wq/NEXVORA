import { describe, expect, it } from "vitest";
import { latestRunByScenario, summarizeEvaluation, deriveEvaluationReadiness } from "./derive";
import type { EvaluationScenarioRow, EvaluationRunRow } from "./types";

const NOW = "2026-08-07T10:00:00.000Z";

function scen(over: Partial<EvaluationScenarioRow>): EvaluationScenarioRow {
  return {
    id: "s", projectId: "prj", code: null, title: "t", description: "",
    category: "functional", severity: "medium", preconditions: "", steps: [],
    expectedResult: "", linkedStoryId: null, linkedFlowId: null, tags: [],
    createdAt: NOW, updatedAt: NOW, createdBy: null, ...over,
  };
}
function run(over: Partial<EvaluationRunRow>): EvaluationRunRow {
  return {
    id: "r", projectId: "prj", scenarioId: "s", result: "pass",
    actualResult: "", environment: "", runBy: null, runAt: NOW, notes: "", ...over,
  };
}

describe("latestRunByScenario", () => {
  it("يختار الأحدث لكل سيناريو", () => {
    const map = latestRunByScenario([
      run({ id: "r1", scenarioId: "a", runAt: "2026-01-01T00:00:00Z", result: "fail" }),
      run({ id: "r2", scenarioId: "a", runAt: "2026-02-01T00:00:00Z", result: "pass" }),
      run({ id: "r3", scenarioId: "b", runAt: "2026-01-15T00:00:00Z", result: "pass" }),
    ]);
    expect(map.get("a")?.result).toBe("pass");
    expect(map.get("b")?.result).toBe("pass");
    expect(map.size).toBe(2);
  });
});

describe("summarizeEvaluation", () => {
  it("فاضي = أصفار", () => {
    const s = summarizeEvaluation([], []);
    expect(s.totalScenarios).toBe(0);
    expect(s.passRate).toBe(0);
  });
  it("يحسب pass rate من آخر تشغيل", () => {
    const s = summarizeEvaluation(
      [scen({ id: "a" }), scen({ id: "b" }), scen({ id: "c" })],
      [
        run({ scenarioId: "a", result: "pass" }),
        run({ scenarioId: "b", result: "fail" }),
      ],
    );
    expect(s.runsTotal).toBe(2);
    // 1 pass من 2 مُشغَّلين → 50%
    expect(s.passRate).toBe(50);
    expect(s.scenariosNeverRun).toBe(1);
  });
  it("يكتشف critical failures", () => {
    const s = summarizeEvaluation(
      [scen({ id: "a", severity: "critical" }), scen({ id: "b", severity: "low" })],
      [run({ scenarioId: "a", result: "fail" }), run({ scenarioId: "b", result: "fail" })],
    );
    expect(s.criticalFailures).toBe(1);
  });
});

describe("deriveEvaluationReadiness", () => {
  it("فاضي = 0", () => {
    const r = deriveEvaluationReadiness([], []);
    expect(r.score).toBe(0);
    expect(r.ready).toBe(false);
  });
  it("جاهزية كاملة = 100", () => {
    const scenarios = Array.from({ length: 5 }, (_, i) => scen({ id: `s${i}` }));
    const runs = scenarios.map((s) => run({ scenarioId: s.id, result: "pass" }));
    const r = deriveEvaluationReadiness(scenarios, runs);
    expect(r.checks.minScenariosOk).toBe(true);
    expect(r.checks.allRunOk).toBe(true);
    expect(r.checks.passRateOk).toBe(true);
    expect(r.checks.noCriticalFailuresOk).toBe(true);
    expect(r.score).toBe(100);
  });
  it("critical failure واحدة تكسر الفحص", () => {
    const scenarios = [scen({ id: "s1", severity: "critical" }), ...Array.from({ length: 4 }, (_, i) => scen({ id: `s${i+2}` }))];
    const runs = [
      run({ scenarioId: "s1", result: "fail" }),
      ...Array.from({ length: 4 }, (_, i) => run({ scenarioId: `s${i+2}`, result: "pass" })),
    ];
    const r = deriveEvaluationReadiness(scenarios, runs);
    expect(r.checks.noCriticalFailuresOk).toBe(false);
    // pass rate = 4/5 = 80% < 90 فيفشل passRateOk كمان
    expect(r.checks.passRateOk).toBe(false);
  });
});
