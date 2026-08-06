import type { StageState } from "../types";
import { makeState } from "./helpers";

interface MonitoringCheckLike {
  status: string;
  overall_status: string | null;
  last_error: string | null;
  updated_at: string;
  pm_approval_status?: "approved" | "rejected" | null;
  pm_approved_at?: string | null;
}

export function adaptProductionMonitoringStage(currentCheck: MonitoringCheckLike | null): StageState {
  if (!currentCheck) return makeState("productionMonitoring", "not_started", 0);
  if (currentCheck.status === "running") return makeState("productionMonitoring", "waiting_ai", 50, { updatedAt: currentCheck.updated_at });
  if (currentCheck.status === "failed") return makeState("productionMonitoring", "in_progress", 30, { lastError: currentCheck.last_error, updatedAt: currentCheck.updated_at });
  const completion = currentCheck.overall_status === "healthy" ? 100 : currentCheck.overall_status === "degraded" ? 60 : 30;
  return makeState("productionMonitoring", "completed", completion, { updatedAt: currentCheck.updated_at });
}

interface MonitoringIncidentLike {
  id: string;
  status: string;
  root_cause: string;
  patch_proposal: string;
  last_seen_at: string;
}

interface FixPromptLike {
  incident_id: string;
  status: string;
}

export function adaptProductionMonitoringPromptStage(openIncidents: MonitoringIncidentLike[], fixPrompts: FixPromptLike[] = []): StageState {
  if (openIncidents.length === 0) return makeState("productionMonitoringPrompt", "not_started", 100);
  const incidentsWithPrompts = new Set(fixPrompts.filter((p) => p.status === "pending").map((p) => p.incident_id));
  const covered = openIncidents.filter((i) => incidentsWithPrompts.has(i.id));
  if (covered.length === openIncidents.length) {
    return makeState("productionMonitoringPrompt", "completed", 100, { updatedAt: openIncidents[0]?.last_seen_at ?? null });
  }
  return makeState("productionMonitoringPrompt", "waiting_ai", Math.round((covered.length / openIncidents.length) * 100));
}

interface ReviewReportLike {
  overall_fix_score: number | null;
  generated_at: string;
}

export function adaptProductionMonitoringReviewStage(currentCheck: MonitoringCheckLike | null, latestReviewReport: ReviewReportLike | null = null): StageState {
  if (!currentCheck) return makeState("productionMonitoringReview", "not_started", 0);
  if (currentCheck.pm_approval_status === "approved") {
    return makeState("productionMonitoringReview", "approved", 100, { updatedAt: currentCheck.pm_approved_at ?? currentCheck.updated_at });
  }
  if (currentCheck.pm_approval_status === "rejected") {
    return makeState("productionMonitoringReview", "rejected", 40, { updatedAt: currentCheck.pm_approved_at ?? currentCheck.updated_at });
  }
  if (currentCheck.status !== "ready") return makeState("productionMonitoringReview", "not_started", 0);
  if (latestReviewReport) {
    const score = latestReviewReport.overall_fix_score ?? 0;
    return makeState("productionMonitoringReview", "waiting_review", Math.max(80, score), { updatedAt: latestReviewReport.generated_at });
  }
  return makeState("productionMonitoringReview", "waiting_review", 80, { updatedAt: currentCheck.updated_at });
}
