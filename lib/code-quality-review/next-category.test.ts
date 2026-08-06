import { describe, expect, it } from "vitest";
import { findNextCategoryToTrigger, allCategoriesReady, findStuckGeneratingCategory } from "./next-category";
import type { CodeQualityReviewCategory, CodeQualityReviewCategoryKey } from "@/lib/types/database";

function category(key: CodeQualityReviewCategoryKey, status: CodeQualityReviewCategory["status"], updatedAt = "2026-01-01T00:00:00.000Z"): CodeQualityReviewCategory {
  return {
    id: `id-${key}`,
    code_quality_review_id: "review-1",
    project_id: "project-1",
    category_key: key,
    status,
    score: null,
    summary: "",
    last_error: null,
    created_at: "2026-01-01T00:00:00.000Z",
    updated_at: updatedAt,
  };
}

describe("findNextCategoryToTrigger", () => {
  it("يرجّع أول محور pending", () => {
    expect(findNextCategoryToTrigger([category("readability", "pending"), category("duplication", "pending")])?.category_key).toBe("readability");
  });

  it("يرجّع null لو فيه محور شغّال", () => {
    expect(findNextCategoryToTrigger([category("readability", "generating"), category("duplication", "pending")])).toBeNull();
  });
});

describe("allCategoriesReady", () => {
  it("يرجّع true بس لو كل الستة محاور ready", () => {
    const keys: CodeQualityReviewCategoryKey[] = ["readability", "duplication", "error_handling", "testing_coverage", "naming_consistency", "complexity"];
    expect(allCategoriesReady(keys.map((k) => category(k, "ready")))).toBe(true);
  });
});

describe("findStuckGeneratingCategory", () => {
  const NOW = new Date("2026-01-01T00:10:00.000Z").getTime();
  const STALE_MS = 6 * 60_000;

  it("يكتشف محور عالق", () => {
    expect(findStuckGeneratingCategory([category("complexity", "generating", "2026-01-01T00:00:00.000Z")], NOW, STALE_MS)?.category_key).toBe("complexity");
  });
});
