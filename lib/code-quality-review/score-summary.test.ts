import { describe, expect, it } from "vitest";
import { computeCodeQualityScoreSummary } from "./score-summary";
import type { CodeQualityReviewCategoryKey } from "@/lib/types/database";

function scores(overrides: Partial<Record<CodeQualityReviewCategoryKey, number>> = {}): Record<CodeQualityReviewCategoryKey, number> {
  return {
    readability: 100,
    duplication: 100,
    error_handling: 100,
    testing_coverage: 100,
    naming_consistency: 100,
    complexity: 100,
    ...overrides,
  };
}

describe("computeCodeQualityScoreSummary", () => {
  it("لو كل المحاور 100، كل الدرجات النهائية 100", () => {
    const summary = computeCodeQualityScoreSummary(scores());
    expect(summary.overall_code_quality_score).toBe(100);
    expect(summary.readability).toBe(100);
  });

  it("كل محور بيرجع درجته مباشرة (بدون تجميع فرعي)", () => {
    const summary = computeCodeQualityScoreSummary(scores({ duplication: 20, testing_coverage: 80 }));
    expect(summary.duplication).toBe(20);
    expect(summary.testing_coverage).toBe(80);
  });

  it("overall_code_quality_score هو متوسط كل المحاور الستة", () => {
    const summary = computeCodeQualityScoreSummary(scores({ readability: 0, duplication: 100 }));
    expect(summary.overall_code_quality_score).toBe(Math.round((0 + 100 + 100 + 100 + 100 + 100) / 6));
  });
});
