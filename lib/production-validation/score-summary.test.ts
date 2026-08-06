import { describe, expect, it } from "vitest";
import { computeValidationScoreSummary } from "./score-summary";

describe("computeValidationScoreSummary", () => {
  it("يحسب overall_score كمتوسط الثلاثة (مش شامل visual_regression)", () => {
    const summary = computeValidationScoreSummary(100, 80, 60);
    expect(summary.overall_score).toBe(80); // (100+80+60)/3
    expect(summary.visual_regression_score).toBeNull();
  });

  it("يحتفظ بكل درجة كما هي في الحقل المناسب", () => {
    const summary = computeValidationScoreSummary(90, 70, 50);
    expect(summary.journey_success_rate).toBe(90);
    expect(summary.responsive_score).toBe(70);
    expect(summary.accessibility_score).toBe(50);
  });
});
