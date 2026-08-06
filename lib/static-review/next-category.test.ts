import { describe, expect, it } from "vitest";
import { findNextCategoryToTrigger, allCategoriesReady, findStuckGeneratingCategory } from "./next-category";
import type { StaticReviewCategory, StaticReviewCategoryKey } from "@/lib/types/database";

function category(
  key: StaticReviewCategoryKey,
  status: StaticReviewCategory["status"],
  updatedAt = "2026-01-01T00:00:00.000Z"
): StaticReviewCategory {
  return {
    id: `id-${key}`,
    static_review_id: "review-1",
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
  it("يرجّع أول محور pending لو مفيش أي محور شغال", () => {
    const categories = [category("architecture", "pending"), category("solid", "pending")];
    expect(findNextCategoryToTrigger(categories)?.category_key).toBe("architecture");
  });

  it("يرجّع null لو فيه محور شغّال بالفعل", () => {
    const categories = [category("architecture", "generating"), category("solid", "pending")];
    expect(findNextCategoryToTrigger(categories)).toBeNull();
  });

  it("يتخطى المحاور الجاهزة أو الفاشلة ويلاقي أول pending بالترتيب", () => {
    const categories = [
      category("architecture", "ready"),
      category("solid", "failed"),
      category("dry_kiss", "pending"),
      category("naming", "pending"),
    ];
    expect(findNextCategoryToTrigger(categories)?.category_key).toBe("dry_kiss");
  });
});

describe("allCategoriesReady", () => {
  it("يرجّع true بس لو كل الـ 7 محاور ready", () => {
    const categories = ["architecture", "clean_code", "solid", "dry_kiss", "ai_code_smell", "naming", "documentation"].map(
      (k) => category(k as StaticReviewCategoryKey, "ready")
    );
    expect(allCategoriesReady(categories)).toBe(true);
  });

  it("يرجّع false لو محور واحد لسه مش ready", () => {
    const categories = [category("architecture", "ready"), category("solid", "generating")];
    expect(allCategoriesReady(categories)).toBe(false);
  });

  it("يرجّع false لمصفوفة فاضية", () => {
    expect(allCategoriesReady([])).toBe(false);
  });
});

describe("findStuckGeneratingCategory", () => {
  const NOW = new Date("2026-01-01T00:10:00.000Z").getTime();
  const STALE_MS = 6 * 60_000;

  it("يرجّع null لو محور generating بس لسه جوّه حد الـ stale", () => {
    const categories = [category("architecture", "generating", "2026-01-01T00:08:00.000Z")];
    expect(findStuckGeneratingCategory(categories, NOW, STALE_MS)).toBeNull();
  });

  it("يرجّع المحور لو generating من زمان أكتر من الحد المسموح", () => {
    const categories = [category("architecture", "generating", "2026-01-01T00:00:00.000Z")];
    expect(findStuckGeneratingCategory(categories, NOW, STALE_MS)?.category_key).toBe("architecture");
  });

  it("يرجّع null لمحاور مش generating حتى لو قديمة", () => {
    const categories = [category("architecture", "failed", "2026-01-01T00:00:00.000Z")];
    expect(findStuckGeneratingCategory(categories, NOW, STALE_MS)).toBeNull();
  });
});
