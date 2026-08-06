import { describe, expect, it } from "vitest";
import { computePrdComplianceScoreSummary } from "./score-summary";
import type { PrdComplianceReviewCategoryKey } from "@/lib/types/database";

function scores(overrides: Partial<Record<PrdComplianceReviewCategoryKey, number>> = {}): Record<PrdComplianceReviewCategoryKey, number> {
  return {
    functional_requirements_coverage: 100,
    non_functional_requirements: 100,
    scope_adherence: 100,
    acceptance_criteria: 100,
    ...overrides,
  };
}

describe("computePrdComplianceScoreSummary", () => {
  it("لو كل المحاور 100، كل الدرجات النهائية 100", () => {
    const summary = computePrdComplianceScoreSummary(scores());
    expect(summary.overall_prd_compliance_score).toBe(100);
  });

  it("كل محور بيرجع درجته مباشرة (بدون تجميع فرعي)", () => {
    const summary = computePrdComplianceScoreSummary(scores({ scope_adherence: 10 }));
    expect(summary.scope_adherence).toBe(10);
  });

  it("overall_prd_compliance_score هو متوسط كل المحاور الأربعة", () => {
    const summary = computePrdComplianceScoreSummary(scores({ functional_requirements_coverage: 0, acceptance_criteria: 60 }));
    expect(summary.overall_prd_compliance_score).toBe(Math.round((0 + 100 + 100 + 60) / 4));
  });
});
