import type { StageState, VersionInfo } from "../types";
import { makeState, versionInfoFromUpstream } from "./helpers";

interface SyncStatusLike {
  sync_status: string;
  version: number;
  last_error: string | null;
  updated_at: string;
}

function statusFromSyncStatus(row: SyncStatusLike): StageState["status"] {
  if (row.sync_status === "generating") return "waiting_ai";
  if (row.sync_status === "failed") return "in_progress";
  if (row.version > 0) return "completed";
  return "not_started";
}

interface PrdLike extends SyncStatusLike {
  generated_from_brain_version: number | null;
}

export function adaptPrdStage(prd: PrdLike | null, currentBrainVersion: number | null): StageState {
  if (!prd) return makeState("prd", "not_started", 0);
  const versionInfo = versionInfoFromUpstream("projectBrain", prd.generated_from_brain_version, currentBrainVersion, prd.version, prd.updated_at);
  return makeState("prd", statusFromSyncStatus(prd), prd.version > 0 ? 100 : 30, {
    versionInfo,
    lastError: prd.sync_status === "failed" ? prd.last_error : null,
    updatedAt: prd.updated_at,
  });
}

interface PrototypePromptLike extends SyncStatusLike {
  generated_from_prd_version: number | null;
}

export function adaptPrototypePromptStage(prompt: PrototypePromptLike | null, currentPrdVersion: number | null): StageState {
  if (!prompt) return makeState("prototypePrompt", "not_started", 0);
  const versionInfo = versionInfoFromUpstream("prd", prompt.generated_from_prd_version, currentPrdVersion, prompt.version, prompt.updated_at);
  return makeState("prototypePrompt", statusFromSyncStatus(prompt), prompt.version > 0 ? 100 : 30, {
    versionInfo,
    lastError: prompt.sync_status === "failed" ? prompt.last_error : null,
    updatedAt: prompt.updated_at,
  });
}

interface PrototypeReviewLike extends SyncStatusLike {
  reviewed_prompt_version: number | null;
}

export function adaptPrototypeReviewStage(review: PrototypeReviewLike | null, currentPromptVersion: number | null): StageState {
  if (!review) return makeState("prototypeReview", "not_started", 0);
  const versionInfo = versionInfoFromUpstream("prototypePrompt", review.reviewed_prompt_version, currentPromptVersion, review.version, review.updated_at);
  return makeState("prototypeReview", statusFromSyncStatus(review), review.version > 0 ? 100 : 30, {
    versionInfo,
    lastError: review.sync_status === "failed" ? review.last_error : null,
    updatedAt: review.updated_at,
  });
}

interface ExecutionPlanLike {
  status: string;
  prototype_prompt_version: number;
  total_tasks: number;
  completed_tasks: number;
  failed_tasks: number;
  last_error: string | null;
  updated_at: string;
}

export function adaptPromptReviewStage(currentPlan: ExecutionPlanLike | null, currentPromptVersion: number | null): StageState {
  if (!currentPlan) return makeState("promptReview", "not_started", 0);
  const isStale = currentPromptVersion !== null && currentPlan.prototype_prompt_version < currentPromptVersion;
  const versionInfo: VersionInfo = {
    generatedFrom: "prototypePrompt",
    version: null,
    generatedAt: currentPlan.updated_at,
    parentVersion: currentPlan.prototype_prompt_version,
    isStale,
    staleReason: isStale ? "Prototype Prompt اتحدّث بعد آخر خطة تنفيذ — الخطة الحالية مبنية على نسخة قديمة." : null,
  };
  const completion = currentPlan.total_tasks > 0 ? Math.round((currentPlan.completed_tasks / currentPlan.total_tasks) * 100) : 0;
  let status: StageState["status"] = "in_progress";
  if (currentPlan.status === "completed") status = "completed";
  else if (currentPlan.status === "failed") status = "in_progress";
  else if (currentPlan.status === "ready") status = "waiting_review";
  else if (currentPlan.status === "planning") status = "waiting_ai";
  return makeState("promptReview", status, completion, { versionInfo, lastError: currentPlan.last_error, updatedAt: currentPlan.updated_at });
}

interface ClientPresentationLike {
  status: "idle" | "generating" | "failed";
  version: number;
  last_error: string | null;
  updated_at: string;
  generated_from_prd_version: number | null;
  generated_from_review_version: number | null;
}

export function adaptClientDeliveryStage(
  presentation: ClientPresentationLike | null,
  currentPrdVersion: number | null,
  currentReviewVersion: number | null
): StageState {
  if (!presentation || presentation.version === 0) {
    return makeState("clientDelivery", presentation?.status === "generating" ? "waiting_ai" : "not_started", 0);
  }
  const vsReview = versionInfoFromUpstream(
    "prototypeReview",
    presentation.generated_from_review_version,
    currentReviewVersion,
    presentation.version,
    presentation.updated_at
  );
  const vsPrd = versionInfoFromUpstream("prd", presentation.generated_from_prd_version, currentPrdVersion, presentation.version, presentation.updated_at);
  const versionInfo = vsReview.isStale ? vsReview : vsPrd;
  let status: StageState["status"] = "completed";
  if (presentation.status === "generating") status = "waiting_ai";
  else if (presentation.status === "failed") status = "in_progress";
  return makeState("clientDelivery", status, 100, {
    versionInfo,
    lastError: presentation.status === "failed" ? presentation.last_error : null,
    updatedAt: presentation.updated_at,
  });
}

interface DeveloperHandoffLike extends SyncStatusLike {
  generated_from_prd_version: number | null;
  generated_from_review_version: number | null;
}

export function adaptDeveloperHandoffStage(
  handoff: DeveloperHandoffLike | null,
  currentPrdVersion: number | null,
  currentReviewVersion: number | null
): StageState {
  if (!handoff) return makeState("developerHandoff", "not_started", 0);
  const vsReview = versionInfoFromUpstream("prototypeReview", handoff.generated_from_review_version, currentReviewVersion, handoff.version, handoff.updated_at);
  const vsPrd = versionInfoFromUpstream("prd", handoff.generated_from_prd_version, currentPrdVersion, handoff.version, handoff.updated_at);
  const versionInfo = vsReview.isStale ? vsReview : vsPrd;
  return makeState("developerHandoff", statusFromSyncStatus(handoff), handoff.version > 0 ? 100 : 30, {
    versionInfo,
    lastError: handoff.sync_status === "failed" ? handoff.last_error : null,
    updatedAt: handoff.updated_at,
  });
}
