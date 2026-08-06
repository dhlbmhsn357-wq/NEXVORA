import { describe, expect, it } from "vitest";
import { computeArchitectureScoreSummary } from "./score-summary";
import type { ArchitectureReviewCategoryKey } from "@/lib/types/database";

function scores(overrides: Partial<Record<ArchitectureReviewCategoryKey, number>> = {}): Record<ArchitectureReviewCategoryKey, number> {
  return {
    layering: 100,
    coupling: 100,
    scalability: 100,
    module_boundaries: 100,
    dependency_management: 100,
    api_design: 100,
    ...overrides,
  };
}

describe("computeArchitectureScoreSummary", () => {
  it("لو كل المحاور 100، كل الدرجات النهائية 100", () => {
    const summary = computeArchitectureScoreSummary(scores());
    expect(summary.overall_architecture_score).toBe(100);
    expect(summary.layering).toBe(100);
  });

  it("كل محور بيرجع درجته مباشرة (بدون تجميع فرعي)", () => {
    const summary = computeArchitectureScoreSummary(scores({ coupling: 40, api_design: 70 }));
    expect(summary.coupling).toBe(40);
    expect(summary.api_design).toBe(70);
  });

  it("overall_architecture_score هو متوسط كل المحاور الستة", () => {
    const summary = computeArchitectureScoreSummary(scores({ layering: 0, coupling: 100 }));
    expect(summary.overall_architecture_score).toBe(Math.round((0 + 100 + 100 + 100 + 100 + 100) / 6));
  });
});
