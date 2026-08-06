import type { StageState } from "../types";
import { makeState } from "./helpers";

interface AdvisorAnalysisLike {
  status: string;
  updated_at?: string;
}

export function adaptOrganizationalIntelligenceStage(advisorAnalysis: AdvisorAnalysisLike | null): StageState {
  if (!advisorAnalysis) return makeState("organizationalIntelligence", "not_started", 0);
  if (advisorAnalysis.status === "generating") return makeState("organizationalIntelligence", "waiting_ai", 50);
  if (advisorAnalysis.status === "failed") return makeState("organizationalIntelligence", "in_progress", 30);
  return makeState("organizationalIntelligence", "completed", 100, { updatedAt: advisorAnalysis.updated_at ?? null });
}

export function adaptSupportStage(widgetKey: string | null, openRequestsCount: number): StageState {
  if (!widgetKey) return makeState("support", "not_started", 0);
  if (openRequestsCount > 0) return makeState("support", "in_progress", 60);
  return makeState("support", "completed", 100);
}
