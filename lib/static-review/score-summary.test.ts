import { describe, expect, it } from "vitest";
import { computeScoreSummary } from "./score-summary";
import type { StaticReviewCategoryKey } from "@/lib/types/database";

function scores(overrides: Partial<Record<StaticReviewCategoryKey, number>> = {}): Record<StaticReviewCategoryKey, number> {
  return {
    architecture: 100,
    clean_code: 100,
    solid: 100,
    dry_kiss: 100,
    ai_code_smell: 100,
    naming: 100,
    documentation: 100,
    ...overrides,
  };
}

describe("computeScoreSummary", () => {
  it("لو كل المحاور 100، كل الأبعاد المُشتقة والدرجة الكلية 100", () => {
    const summary = computeScoreSummary(scores());
    expect(summary.overall_static_score).toBe(100);
    expect(summary.maintainability).toBe(100);
    expect(summary.readability).toBe(100);
    expect(summary.technical_debt).toBe(100);
  });

  it("architecture/solid/dry/naming/documentation/ai_code_quality بترجع درجة المحور مباشرة من غير تعديل", () => {
    const summary = computeScoreSummary(scores({ architecture: 40, solid: 60, dry_kiss: 70, naming: 80, documentation: 90, ai_code_smell: 50 }));
    expect(summary.architecture).toBe(40);
    expect(summary.solid).toBe(60);
    expect(summary.dry).toBe(70);
    expect(summary.naming).toBe(80);
    expect(summary.documentation).toBe(90);
    expect(summary.ai_code_quality).toBe(50);
  });

  it("maintainability بيتحسب من متوسط (clean_code, solid, dry_kiss, documentation)", () => {
    const summary = computeScoreSummary(scores({ clean_code: 80, solid: 60, dry_kiss: 40, documentation: 20 }));
    expect(summary.maintainability).toBe(50); // (80+60+40+20)/4
  });

  it("technical_debt بيتأثر بانخفاض clean_code/dry_kiss/solid/ai_code_smell", () => {
    const healthy = computeScoreSummary(scores());
    const debtHeavy = computeScoreSummary(scores({ clean_code: 20, dry_kiss: 20, solid: 20, ai_code_smell: 20 }));
    expect(debtHeavy.technical_debt).toBeLessThan(healthy.technical_debt);
  });
});
