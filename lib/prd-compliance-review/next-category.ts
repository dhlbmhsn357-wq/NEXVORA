import type { PrdComplianceReviewCategory } from "@/lib/types/database";

export const STALE_LOCK_MS = 6 * 60_000;

export function findNextCategoryToTrigger(categories: PrdComplianceReviewCategory[]): PrdComplianceReviewCategory | null {
  if (categories.some((c) => c.status === "generating")) return null;
  return categories.find((c) => c.status === "pending") ?? null;
}

export function allCategoriesReady(categories: PrdComplianceReviewCategory[]): boolean {
  return categories.length > 0 && categories.every((c) => c.status === "ready");
}

export function findStuckGeneratingCategory(
  categories: PrdComplianceReviewCategory[],
  nowMs: number,
  staleMs: number
): PrdComplianceReviewCategory | null {
  return categories.find((c) => c.status === "generating" && nowMs - new Date(c.updated_at).getTime() > staleMs) ?? null;
}
