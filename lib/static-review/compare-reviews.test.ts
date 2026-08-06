import { describe, expect, it } from "vitest";
import { compareStaticReviews } from "./compare-reviews";
import type { StaticReviewFinding } from "@/lib/types/database";

function finding(key: string): StaticReviewFinding {
  return {
    id: `id-${key}`,
    static_review_id: "review-x",
    project_id: "project-1",
    category_key: "clean_code",
    finding_key: key,
    severity: "medium",
    title: key,
    description: "",
    impact: "",
    file_path: "app/foo.ts",
    component_name: null,
    function_name: null,
    class_name: null,
    line_start: null,
    line_end: null,
    code_snippet: "const x = 1;",
    root_cause: "",
    recommended_fix: "",
    patch_suggestion: "",
    validation_steps: [],
    confidence_score: 90,
    carried_over: false,
    created_at: "2026-01-01T00:00:00.000Z",
  };
}

describe("compareStaticReviews", () => {
  it("يحسب Added/Fixed/Remaining صح لمزيج من findings مشتركة وجديدة وقديمة", () => {
    const oldFindings = [finding("a"), finding("b")];
    const newFindings = [finding("b"), finding("c")];
    const result = compareStaticReviews(oldFindings, newFindings, 70, 85);

    expect(result.added.map((f) => f.finding_key)).toEqual(["c"]);
    expect(result.fixed.map((f) => f.finding_key)).toEqual(["a"]);
    expect(result.remaining.map((f) => f.finding_key)).toEqual(["b"]);
    expect(result.scoreDiff).toBe(15);
  });

  it("لو مفيش أي findings قديمة، كل الجديد يُعتبر Added", () => {
    const result = compareStaticReviews([], [finding("x")], 100, 90);
    expect(result.added).toHaveLength(1);
    expect(result.fixed).toHaveLength(0);
    expect(result.remaining).toHaveLength(0);
    expect(result.scoreDiff).toBe(-10);
  });

  it("لو نفس الـ findings بالظبط، كله Remaining ومفيش Added/Fixed", () => {
    const shared = [finding("a"), finding("b")];
    const result = compareStaticReviews(shared, shared, 80, 80);
    expect(result.added).toHaveLength(0);
    expect(result.fixed).toHaveLength(0);
    expect(result.remaining).toHaveLength(2);
    expect(result.scoreDiff).toBe(0);
  });
});
