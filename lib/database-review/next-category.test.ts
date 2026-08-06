import { describe, expect, it } from "vitest";
import { findNextCategoryToTrigger, allCategoriesReady, findStuckGeneratingCategory } from "./next-category";
import type { DatabaseReviewCategory, DatabaseReviewCategoryKey } from "@/lib/types/database";

function category(key: DatabaseReviewCategoryKey, status: DatabaseReviewCategory["status"], updatedAt = "2026-01-01T00:00:00.000Z"): DatabaseReviewCategory {
  return {
    id: `id-${key}`,
    database_review_id: "review-1",
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
    expect(findNextCategoryToTrigger([category("database_structure", "pending"), category("query", "pending")])?.category_key).toBe("database_structure");
  });

  it("يرجّع null لو فيه محور شغّال", () => {
    expect(findNextCategoryToTrigger([category("database_structure", "generating"), category("query", "pending")])).toBeNull();
  });
});

describe("allCategoriesReady", () => {
  it("يرجّع true بس لو كل الستة محاور ready", () => {
    const keys: DatabaseReviewCategoryKey[] = ["database_structure", "query", "migration", "data_integrity", "storage", "logging"];
    expect(allCategoriesReady(keys.map((k) => category(k, "ready")))).toBe(true);
  });
});

describe("findStuckGeneratingCategory", () => {
  const NOW = new Date("2026-01-01T00:10:00.000Z").getTime();
  const STALE_MS = 6 * 60_000;

  it("يكتشف محور عالق", () => {
    expect(findStuckGeneratingCategory([category("migration", "generating", "2026-01-01T00:00:00.000Z")], NOW, STALE_MS)?.category_key).toBe("migration");
  });
});
