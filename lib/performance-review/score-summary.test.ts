import { describe, expect, it } from "vitest";
import { computePerformanceScoreSummary } from "./score-summary";
import type { PerformanceReviewCategoryKey } from "@/lib/types/database";

function scores(overrides: Partial<Record<PerformanceReviewCategoryKey, number>> = {}): Record<PerformanceReviewCategoryKey, number> {
  return {
    query_performance: 100,
    bundle_size: 100,
    caching: 100,
    render_performance: 100,
    n_plus_one: 100,
    async_patterns: 100,
    ...overrides,
  };
}

describe("computePerformanceScoreSummary", () => {
  it("لو كل المحاور 100، كل الدرجات النهائية 100", () => {
    const summary = computePerformanceScoreSummary(scores());
    expect(summary.overall_performance_score).toBe(100);
  });

  it("كل محور بيرجع درجته مباشرة (بدون تجميع فرعي)", () => {
    const summary = computePerformanceScoreSummary(scores({ n_plus_one: 15 }));
    expect(summary.n_plus_one).toBe(15);
  });

  it("overall_performance_score هو متوسط كل المحاور الستة", () => {
    const summary = computePerformanceScoreSummary(scores({ query_performance: 0, bundle_size: 100 }));
    expect(summary.overall_performance_score).toBe(Math.round((0 + 100 + 100 + 100 + 100 + 100) / 6));
  });
});
