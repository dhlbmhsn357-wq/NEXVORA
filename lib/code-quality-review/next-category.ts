import type { CodeQualityReviewCategory } from "@/lib/types/database";

export const STALE_LOCK_MS = 6 * 60_000;

export function findNextCategoryToTrigger(categories: CodeQualityReviewCategory[]): CodeQualityReviewCategory | null {
  if (categories.some((c) => c.status === "generating")) return null;
  return categories.find((c) => c.status === "pending") ?? null;
}

export function allCategoriesReady(categories: CodeQualityReviewCategory[]): boolean {
  return categories.length > 0 && categories.every((c) => c.status === "ready");
}

export function findStuckGeneratingCategory(
  categories: CodeQualityReviewCategory[],
  nowMs: number,
  staleMs: number
): CodeQualityReviewCategory | null {
  return categories.find((c) => c.status === "generating" && nowMs - new Date(c.updated_at).getTime() > staleMs) ?? null;
}
