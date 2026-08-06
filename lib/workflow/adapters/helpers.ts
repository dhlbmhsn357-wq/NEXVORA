import { NEUTRAL_VERSION_INFO } from "../types";
import type { StageState, VersionInfo, WorkflowStageKey, WorkflowStatus } from "../types";

export function makeState(
  key: WorkflowStageKey,
  status: WorkflowStatus,
  completionPct: number,
  opts: { versionInfo?: VersionInfo; lastError?: string | null; updatedAt?: string | null } = {}
): StageState {
  return {
    key,
    status,
    completionPct: Math.max(0, Math.min(100, completionPct)),
    versionInfo: opts.versionInfo ?? NEUTRAL_VERSION_INFO,
    lastError: opts.lastError ?? null,
    updatedAt: opts.updatedAt ?? null,
  };
}

/**
 * بيبني VersionInfo من نمط generated_from_X_version الموجود فعليًا في
 * PRD/Prototype Prompt/Prototype Review/Client Presentation/Developer
 * Handoff — مقارنة نسخة المصدر وقت التوليد بنسخته الحالية الفعلية.
 * لو المصدر مفيهوش نسخة أصلًا (null) أو المرحلة نفسها لسه ماتولّدتش،
 * مفيش Staleness ممكن تتحسب.
 */
export function versionInfoFromUpstream(
  generatedFrom: WorkflowStageKey,
  generatedFromVersion: number | null,
  currentUpstreamVersion: number | null,
  ownVersion: number | null,
  generatedAt: string | null
): VersionInfo {
  const isStale = ownVersion !== null && ownVersion > 0 && generatedFromVersion !== null && currentUpstreamVersion !== null && generatedFromVersion < currentUpstreamVersion;
  return {
    generatedFrom,
    version: ownVersion,
    generatedAt,
    parentVersion: generatedFromVersion,
    isStale,
    staleReason: isStale ? `المصدر (${generatedFrom}) اتحدّث لنسخة أحدث منذ آخر توليد.` : null,
  };
}
