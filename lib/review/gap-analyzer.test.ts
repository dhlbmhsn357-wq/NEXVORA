import { describe, expect, it } from "vitest";
import { calculateCompletionPercentage, calculateOverallStatus } from "./gap-analyzer";
import type { GapReport } from "@/lib/types/database";

function makeCriterion(status: string, override: string | null = null) {
  return {
    criterion: "x",
    ai_status: status as GapReport["acceptance_criteria_results"][number]["ai_status"],
    ai_evidence: status === "not_implemented" ? null : [{ file: "a.ts" }],
    ai_gap: null,
    pm_override: override
      ? { status: override as GapReport["acceptance_criteria_results"][number]["ai_status"], overridden_by: null, overridden_at: "now" }
      : null,
  };
}

function baseReport(overrides: Partial<GapReport> = {}): GapReport {
  return {
    user_stories: [],
    acceptance_criteria_results: [],
    missing_features: [],
    scope_creep: [],
    non_functional_gaps: [],
    unresolved_risks: [],
    recommendation_summary: "x",
    ...overrides,
  };
}

describe("calculateCompletionPercentage", () => {
  it("returns 0 for no acceptance criteria", () => {
    expect(calculateCompletionPercentage(baseReport())).toBe(0);
  });

  it("computes the percentage of implemented criteria", () => {
    const report = baseReport({
      acceptance_criteria_results: [
        makeCriterion("implemented"),
        makeCriterion("implemented"),
        makeCriterion("not_implemented"),
        makeCriterion("partially_implemented"),
      ],
    });
    expect(calculateCompletionPercentage(report)).toBe(50);
  });

  it("respects a PM override that changes the effective status", () => {
    const report = baseReport({
      acceptance_criteria_results: [makeCriterion("not_implemented", "implemented")],
    });
    expect(calculateCompletionPercentage(report)).toBe(100);
  });
});

describe("calculateOverallStatus", () => {
  it("is blocked when there are missing features regardless of completion", () => {
    const report = baseReport({ missing_features: ["Auth"] });
    expect(calculateOverallStatus(report, 100)).toBe("blocked");
  });

  it("is blocked when completion is below 50%", () => {
    const report = baseReport();
    expect(calculateOverallStatus(report, 40)).toBe("blocked");
  });

  it("is ready at 100% completion with no unresolved risks", () => {
    const report = baseReport();
    expect(calculateOverallStatus(report, 100)).toBe("ready");
  });

  it("is needs_changes at 100% completion but with unresolved risks", () => {
    const report = baseReport({ unresolved_risks: ["Payment gateway untested"] });
    expect(calculateOverallStatus(report, 100)).toBe("needs_changes");
  });

  it("is needs_changes for partial completion with no missing features", () => {
    const report = baseReport();
    expect(calculateOverallStatus(report, 75)).toBe("needs_changes");
  });
});
