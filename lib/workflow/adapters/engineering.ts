import type { StageState } from "../types";
import { makeState } from "./helpers";

interface EngineeringReviewLike {
  review_status: string;
  overall_progress: number;
  last_error: string | null;
  updated_at: string;
  pm_approval_status?: "approved" | "rejected" | null;
  pm_approved_at?: string | null;
}

export function adaptEngineeringQaStage(currentReview: EngineeringReviewLike | null): StageState {
  if (!currentReview) return makeState("engineeringQa", "not_started", 0);
  const { review_status } = currentReview;
  let status: StageState["status"] = "in_progress";
  if (review_status === "completed" || review_status === "certified") status = "completed";
  else if (review_status === "failed") status = "in_progress";
  else if (review_status === "needs_review") status = "waiting_review";
  else if (review_status === "rejected") status = "rejected";
  else if (review_status === "pending" || review_status === "queued") status = "waiting_ai";
  return makeState("engineeringQa", status, Math.round(currentReview.overall_progress), {
    lastError: currentReview.last_error,
    updatedAt: currentReview.updated_at,
  });
}

interface QaFixLoopLike {
  status: string;
  fix_prompt: string | null;
  fix_task_id: string | null;
  attempt_number: number;
  updated_at: string;
}

/** بياخد أحدث qa_fix_loops لمرحلة engineering_qa تحديدًا (مفلترة مسبقًا في build-stage-states.ts). */
export function adaptFixPromptStage(latestEngineeringQaLoop: QaFixLoopLike | null): StageState {
  if (!latestEngineeringQaLoop) return makeState("fixPrompt", "not_started", 100);
  if (latestEngineeringQaLoop.status === "fixed") return makeState("fixPrompt", "completed", 100, { updatedAt: latestEngineeringQaLoop.updated_at });
  if (latestEngineeringQaLoop.status === "failed" || latestEngineeringQaLoop.status === "max_attempts_reached") {
    return makeState("fixPrompt", "in_progress", 40, { updatedAt: latestEngineeringQaLoop.updated_at });
  }
  // running: لو fix_task_id اتحدد يبقى برومبت الإصلاح اتولّد وبينفّذ (waiting_ai)، غير كده لسه بيتولّد.
  return makeState("fixPrompt", "waiting_ai", latestEngineeringQaLoop.fix_task_id ? 60 : 30, {
    updatedAt: latestEngineeringQaLoop.updated_at,
  });
}

export function adaptEngineeringQaReviewStage(currentReview: EngineeringReviewLike | null): StageState {
  if (!currentReview) return makeState("engineeringQaReview", "not_started", 0);
  const qaDone = currentReview.review_status === "completed" || currentReview.review_status === "certified";
  if (currentReview.pm_approval_status === "approved") {
    return makeState("engineeringQaReview", "approved", 100, { updatedAt: currentReview.pm_approved_at ?? currentReview.updated_at });
  }
  if (currentReview.pm_approval_status === "rejected") {
    return makeState("engineeringQaReview", "rejected", 40, { updatedAt: currentReview.pm_approved_at ?? currentReview.updated_at });
  }
  if (!qaDone) return makeState("engineeringQaReview", "not_started", 0);
  return makeState("engineeringQaReview", "waiting_review", 80, { updatedAt: currentReview.updated_at });
}
