import { describe, expect, it } from "vitest";
import { findNextCategoryToTrigger, allCategoriesReady, findStuckGeneratingCategory } from "./next-category";
import type { PrdComplianceReviewCategory, PrdComplianceReviewCategoryKey } from "@/lib/types/database";

function category(key: PrdComplianceReviewCategoryKey, status: PrdComplianceReviewCategory["status"], updatedAt = "2026-01-01T00:00:00.000Z"): PrdComplianceReviewCategory {
  return {
    id: `id-${key}`,
    prd_compliance_review_id: "review-1",
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
    expect(
      findNextCategoryToTrigger([category("functional_requirements_coverage", "pending"), category("scope_adherence", "pending")])?.category_key
    ).toBe("functional_requirements_coverage");
  });

  it("يرجّع null لو فيه محور شغّال", () => {
    expect(findNextCategoryToTrigger([category("functional_requirements_coverage", "generating"), category("scope_adherence", "pending")])).toBeNull();
  });
});

describe("allCategoriesReady", () => {
  it("يرجّع true بس لو كل الأربعة محاور ready", () => {
    const keys: PrdComplianceReviewCategoryKey[] = ["functional_requirements_coverage", "non_functional_requirements", "scope_adherence", "acceptance_criteria"];
    expect(allCategoriesReady(keys.map((k) => category(k, "ready")))).toBe(true);
  });
});

describe("findStuckGeneratingCategory", () => {
  const NOW = new Date("2026-01-01T00:10:00.000Z").getTime();
  const STALE_MS = 6 * 60_000;

  it("يكتشف محور عالق", () => {
    expect(findStuckGeneratingCategory([category("scope_adherence", "generating", "2026-01-01T00:00:00.000Z")], NOW, STALE_MS)?.category_key).toBe("scope_adherence");
  });
});
