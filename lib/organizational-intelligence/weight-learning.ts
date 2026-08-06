import type { RecommendationStatus } from "@/lib/types/database";

const WEIGHT_STEP = 5;

/**
 * "تعلّم الوزن" — قرار PM على توصية بيحرّك learned_weight للمعرفة
 * اللي بُنيت عليها، منفصل عن confidence_score الأصلي للـ AI (يفضل
 * كما هو للتدقيق/المقارنة). postponed/needs_discussion/suggested
 * مش حكم نهائي، فمفيش نقلة — بيرجع null.
 */
export function computeWeightNudge(status: RecommendationStatus): 1 | -1 | null {
  if (status === "accepted") return 1;
  if (status === "dismissed") return -1;
  return null;
}

export function applyWeightNudge(currentWeight: number, direction: 1 | -1): number {
  return Math.max(0, Math.min(100, currentWeight + direction * WEIGHT_STEP));
}
