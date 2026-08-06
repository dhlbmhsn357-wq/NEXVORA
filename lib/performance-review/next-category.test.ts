import { describe, expect, it } from "vitest";
import { findNextCategoryToTrigger, allCategoriesReady, findStuckGeneratingCategory } from "./next-category";
import type { PerformanceReviewCategory, PerformanceReviewCategoryKey } from "@/lib/types/database";

function category(key: PerformanceReviewCategoryKey, status: PerformanceReviewCategory["status"], updatedAt = "2026-01-01T00:00:00.000Z"): PerformanceReviewCategory {
  return {
    id: `id-${key}`,
    performance_review_id: "review-1",
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
    expect(findNextCategoryToTrigger([category("query_performance", "pending"), category("caching", "pending")])?.category_key).toBe("query_performance");
  });

  it("يرجّع null لو فيه محور شغّال", () => {
    expect(findNextCategoryToTrigger([category("query_performance", "generating"), category("caching", "pending")])).toBeNull();
  });
});

describe("allCategoriesReady", () => {
  it("يرجّع true بس لو كل الستة محاور ready", () => {
    const keys: PerformanceReviewCategoryKey[] = ["query_performance", "bundle_size", "caching", "render_performance", "n_plus_one", "async_patterns"];
    expect(allCategoriesReady(keys.map((k) => category(k, "ready")))).toBe(true);
  });
});

describe("findStuckGeneratingCategory", () => {
  const NOW = new Date("2026-01-01T00:10:00.000Z").getTime();
  const STALE_MS = 6 * 60_000;

  it("يكتشف محور عالق", () => {
    expect(findStuckGeneratingCategory([category("caching", "generating", "2026-01-01T00:00:00.000Z")], NOW, STALE_MS)?.category_key).toBe("caching");
  });
});
