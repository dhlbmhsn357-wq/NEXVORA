import type { ValidationCategory, ValidationJourney } from "@/lib/types/database";

export const STALE_LOCK_MS = 6 * 60_000;

/** ترتيب تنفيذ المحاور الثابتة بعد ما كل الرحلات تخلص — بالتسلسل عمدًا (نفس درس Meeting Prep). */
const CATEGORY_EXECUTION_ORDER = ["journey_execution", "responsive_validation", "accessibility_validation"] as const;

export type NextValidationTask = { kind: "journey"; journey: ValidationJourney } | { kind: "category"; category: ValidationCategory } | null;

/**
 * قرار "إيه اللي يتشغّل بعده" — الرحلات (Journeys) الأول بالتسلسل، بعد
 * كده محاور Responsive/Accessibility الثابتة بالترتيب. visual_regression
 * بنية تحتية بس (Placeholder جاهز فورًا من الـ init) فمابيتفحصش هنا.
 */
export function findNextValidationTask(journeys: ValidationJourney[], categories: ValidationCategory[]): NextValidationTask {
  if (journeys.some((j) => j.status === "running")) return null;
  const nextJourney = journeys.find((j) => j.status === "pending");
  if (nextJourney) return { kind: "journey", journey: nextJourney };

  const allJourneysDone = journeys.every((j) => j.status === "passed" || j.status === "failed");
  if (!allJourneysDone) return null;

  if (categories.some((c) => c.status === "generating")) return null;
  for (const key of CATEGORY_EXECUTION_ORDER) {
    const category = categories.find((c) => c.category_key === key);
    if (category?.status === "pending") return { kind: "category", category };
  }
  return null;
}

export function allCategoriesReady(categories: ValidationCategory[]): boolean {
  return categories.length > 0 && categories.every((c) => c.status === "ready");
}

export function findStuckJourney(journeys: ValidationJourney[], nowMs: number, staleMs: number): ValidationJourney | null {
  return journeys.find((j) => j.status === "running" && j.started_at && nowMs - new Date(j.started_at).getTime() > staleMs) ?? null;
}

export function findStuckCategory(categories: ValidationCategory[], nowMs: number, staleMs: number): ValidationCategory | null {
  return categories.find((c) => c.status === "generating" && nowMs - new Date(c.updated_at).getTime() > staleMs) ?? null;
}
