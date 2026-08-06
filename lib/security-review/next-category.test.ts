import { describe, expect, it } from "vitest";
import { findNextCategoryToTrigger, allCategoriesReady, findStuckGeneratingCategory } from "./next-category";
import type { SecurityReviewCategory, SecurityReviewCategoryKey } from "@/lib/types/database";

function category(key: SecurityReviewCategoryKey, status: SecurityReviewCategory["status"], updatedAt = "2026-01-01T00:00:00.000Z"): SecurityReviewCategory {
  return {
    id: `id-${key}`,
    security_review_id: "review-1",
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
    expect(findNextCategoryToTrigger([category("authentication", "pending"), category("authorization", "pending")])?.category_key).toBe("authentication");
  });

  it("يرجّع null لو فيه محور شغّال", () => {
    expect(findNextCategoryToTrigger([category("authentication", "generating"), category("authorization", "pending")])).toBeNull();
  });
});

describe("allCategoriesReady", () => {
  it("يرجّع true بس لو كل السبع محاور ready", () => {
    const keys: SecurityReviewCategoryKey[] = ["authentication", "authorization", "rls", "api_security", "input_validation", "secrets", "environment"];
    expect(allCategoriesReady(keys.map((k) => category(k, "ready")))).toBe(true);
  });

  it("يرجّع false لمصفوفة فاضية", () => {
    expect(allCategoriesReady([])).toBe(false);
  });
});

describe("findStuckGeneratingCategory", () => {
  const NOW = new Date("2026-01-01T00:10:00.000Z").getTime();
  const STALE_MS = 6 * 60_000;

  it("يكتشف محور عالق (generating من زمان)", () => {
    expect(findStuckGeneratingCategory([category("secrets", "generating", "2026-01-01T00:00:00.000Z")], NOW, STALE_MS)?.category_key).toBe("secrets");
  });

  it("مايعتبرش محور حديث عالق", () => {
    expect(findStuckGeneratingCategory([category("secrets", "generating", "2026-01-01T00:08:00.000Z")], NOW, STALE_MS)).toBeNull();
  });
});
