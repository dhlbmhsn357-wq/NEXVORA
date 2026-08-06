import type { StageState } from "../types";
import { makeState } from "./helpers";

/** "نظرة عامة" مرحلة مرجعية دايمة — بتُعتبر مكتملة بمجرد وجود المشروع، مفيش status حقيقي ليها. */
export function adaptOverviewStage(): StageState {
  return makeState("overview", "completed", 100);
}

interface DiscoveryFormLike {
  status: string;
}

export function adaptDiscoveryStage(discoveryForm: DiscoveryFormLike | null): StageState {
  if (!discoveryForm) return makeState("discovery", "not_started", 0);
  if (discoveryForm.status === "submitted") return makeState("discovery", "completed", 100);
  if (discoveryForm.status === "sent") return makeState("discovery", "waiting_review", 60);
  return makeState("discovery", "in_progress", 30);
}

interface DiscoveryAnalysisLike {
  status: string;
  last_error?: string | null;
  finished_at: string | null;
  updated_at?: string | null;
}

export function adaptAnalysisStage(analysis: DiscoveryAnalysisLike | null): StageState {
  if (!analysis) return makeState("analysis", "not_started", 0);
  if (analysis.status === "completed") {
    return makeState("analysis", "completed", 100, { updatedAt: analysis.finished_at ?? analysis.updated_at ?? null });
  }
  if (analysis.status === "failed") {
    return makeState("analysis", "in_progress", 30, { lastError: analysis.last_error ?? "فشل التحليل." });
  }
  return makeState("analysis", "waiting_ai", 50);
}
