import { describe, expect, it } from "vitest";
import { findNextValidationTask, allCategoriesReady, findStuckJourney, findStuckCategory } from "./next-task";
import type { ValidationCategory, ValidationCategoryKey, ValidationJourney } from "@/lib/types/database";

function journey(key: string, status: ValidationJourney["status"], startedAt: string | null = null): ValidationJourney {
  return {
    id: `id-${key}`,
    validation_session_id: "session-1",
    project_id: "project-1",
    journey_key: key,
    name: key,
    goal: "",
    steps: [],
    status,
    retry_count: 0,
    is_flaky: false,
    last_error: null,
    started_at: startedAt,
    finished_at: null,
    duration_seconds: null,
    created_at: "2026-01-01T00:00:00.000Z",
    updated_at: "2026-01-01T00:00:00.000Z",
  };
}

function category(key: ValidationCategoryKey, status: ValidationCategory["status"], updatedAt = "2026-01-01T00:00:00.000Z"): ValidationCategory {
  return {
    id: `id-${key}`,
    validation_session_id: "session-1",
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

describe("findNextValidationTask", () => {
  it("يرجّع أول رحلة pending لو مفيش رحلة شغّالة", () => {
    const journeys = [journey("a", "pending"), journey("b", "pending")];
    const task = findNextValidationTask(journeys, []);
    expect(task).toEqual({ kind: "journey", journey: journeys[0] });
  });

  it("يرجّع null لو فيه رحلة شغّالة بالفعل", () => {
    const journeys = [journey("a", "running"), journey("b", "pending")];
    expect(findNextValidationTask(journeys, [])).toBeNull();
  });

  it("يرجّع null لو الرحلات لسه ملخلصتش حتى لو مفيش pending", () => {
    // حالة غير واقعية لكنها تتحقق من الحارس: لسه مش كله passed/failed
    const journeys = [journey("a", "passed")];
    expect(findNextValidationTask(journeys, [])).toBeNull();
  });

  it("لما كل الرحلات تخلص، يرجّع journey_execution الأول من محاور الترتيب", () => {
    const journeys = [journey("a", "passed"), journey("b", "failed")];
    const categories = [category("journey_execution", "pending"), category("responsive_validation", "pending")];
    const task = findNextValidationTask(journeys, categories);
    expect(task).toEqual({ kind: "category", category: categories[0] });
  });

  it("بعد journey_execution، ياخد responsive_validation بعدها accessibility_validation بالترتيب", () => {
    const journeys = [journey("a", "passed")];
    const categories = [
      category("journey_execution", "ready"),
      category("responsive_validation", "pending"),
      category("accessibility_validation", "pending"),
    ];
    expect(findNextValidationTask(journeys, categories)).toEqual({ kind: "category", category: categories[1] });
  });

  it("يرجّع null لو محور شغّال بالفعل (منع تعارض)", () => {
    const journeys = [journey("a", "passed")];
    const categories = [category("journey_execution", "generating")];
    expect(findNextValidationTask(journeys, categories)).toBeNull();
  });
});

describe("allCategoriesReady", () => {
  it("يرجّع true بس لو كل المحاور ready", () => {
    const categories = ["journey_execution", "responsive_validation", "accessibility_validation", "visual_regression"].map((k) =>
      category(k as ValidationCategoryKey, "ready")
    );
    expect(allCategoriesReady(categories)).toBe(true);
  });

  it("يرجّع false لمصفوفة فاضية", () => {
    expect(allCategoriesReady([])).toBe(false);
  });
});

describe("findStuckJourney / findStuckCategory", () => {
  const NOW = new Date("2026-01-01T00:10:00.000Z").getTime();
  const STALE_MS = 6 * 60_000;

  it("يكتشف رحلة عالقة (running من زمان)", () => {
    const journeys = [journey("a", "running", "2026-01-01T00:00:00.000Z")];
    expect(findStuckJourney(journeys, NOW, STALE_MS)?.journey_key).toBe("a");
  });

  it("مايعتبرش رحلة حديثة عالقة", () => {
    const journeys = [journey("a", "running", "2026-01-01T00:08:00.000Z")];
    expect(findStuckJourney(journeys, NOW, STALE_MS)).toBeNull();
  });

  it("يكتشف محور عالق", () => {
    const categories = [category("responsive_validation", "generating", "2026-01-01T00:00:00.000Z")];
    expect(findStuckCategory(categories, NOW, STALE_MS)?.category_key).toBe("responsive_validation");
  });
});
