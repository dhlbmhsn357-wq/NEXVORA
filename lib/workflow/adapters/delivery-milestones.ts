import type { StageState } from "../types";
import { makeState } from "./helpers";

interface MilestoneSummary {
  total: number;
  approved: number;
  avgProgress: number;
  latestUpdatedAt: string | null;
}

/**
 * Adapter مرحلة "مراحل التسليم" (Work Management) — نقي. الحالة من ملخص
 * الـ Milestones: مفيش = not_started، كلها معتمدة = completed، غير كده
 * in_progress بنسبة متوسط التقدّم.
 */
export function adaptDeliveryMilestonesStage(summary: MilestoneSummary | null): StageState {
  if (!summary || summary.total === 0) return makeState("deliveryMilestones", "not_started", 0);
  if (summary.approved === summary.total) {
    return makeState("deliveryMilestones", "completed", 100, { updatedAt: summary.latestUpdatedAt ?? undefined });
  }
  return makeState("deliveryMilestones", "in_progress", summary.avgProgress, { updatedAt: summary.latestUpdatedAt ?? undefined });
}
