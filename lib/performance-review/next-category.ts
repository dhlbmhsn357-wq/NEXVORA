import type { PerformanceReviewCategory } from "@/lib/types/database";

export const STALE_LOCK_MS = 6 * 60_000;

export function findNextCategoryToTrigger(categories: PerformanceReviewCategory[]): PerformanceReviewCategory | null {
  if (categories.some((c) => c.status === "generating")) return null;
  return categories.find((c) => c.status === "pending") ?? null;
}

export function allCategoriesReady(categories: PerformanceReviewCategory[]): boolean {
  return categories.length > 0 && categories.every((c) => c.status === "ready");
}

export function findStuckGeneratingCategory(
  categories: PerformanceReviewCategory[],
  nowMs: number,
  staleMs: number
): PerformanceReviewCategory | null {
  return categories.find((c) => c.status === "generating" && nowMs - new Date(c.updated_at).getTime() > staleMs) ?? null;
}
