import type { StageState } from "../types";
import { makeState } from "./helpers";

interface BrainDocLike {
  status: string;
  version: number;
  completeness_score: number;
  updated_at: string;
}

export function adaptProjectBrainStage(latest: BrainDocLike | null, approved: BrainDocLike | null): StageState {
  if (!latest) return makeState("projectBrain", "not_started", 0);
  if (approved) return makeState("projectBrain", "approved", 100, { updatedAt: approved.updated_at });
  if (latest.status === "in_review") return makeState("projectBrain", "waiting_review", 70, { updatedAt: latest.updated_at });
  if (latest.status === "rejected") return makeState("projectBrain", "rejected", 40, { updatedAt: latest.updated_at });
  return makeState("projectBrain", "in_progress", Math.round(latest.completeness_score), { updatedAt: latest.updated_at });
}

/** كل توصية لسه status='suggested' تمنع اكتمال المرحلة — نفس منطق checkApprovalGate الرابع في readiness.ts. */
export function adaptSmartRecommendationsStage(recommendations: { status: string }[]): StageState {
  if (recommendations.length === 0) return makeState("smartRecommendations", "not_started", 0);
  const pending = recommendations.filter((r) => r.status === "suggested").length;
  if (pending > 0) return makeState("smartRecommendations", "waiting_review", Math.round(((recommendations.length - pending) / recommendations.length) * 100));
  return makeState("smartRecommendations", "completed", 100);
}

export function adaptBrainReviewStage(reviewable: BrainDocLike | null): StageState {
  if (!reviewable) return makeState("brainReview", "not_started", 0);
  if (reviewable.status === "approved") return makeState("brainReview", "approved", 100, { updatedAt: reviewable.updated_at });
  if (reviewable.status === "rejected") return makeState("brainReview", "rejected", 40, { updatedAt: reviewable.updated_at });
  if (reviewable.status === "in_review") return makeState("brainReview", "waiting_review", 70, { updatedAt: reviewable.updated_at });
  return makeState("brainReview", "in_progress", Math.round(reviewable.completeness_score), { updatedAt: reviewable.updated_at });
}
