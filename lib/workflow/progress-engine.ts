import { STAGE_REGISTRY } from "./registry";
import type { StageState, WorkflowStageKey, WorkflowStatus } from "./types";

/**
 * تقدّم المشروع بقى مبني على وزن كل مرحلة وحالتها الفعلية (مش عدّ
 * تبويبات "مكتملة" زي ما كان في LifecycleStepper القديم اللي كان
 * بيحسب done: true/false فقط). دوال Pure بالكامل — بتاخد StageState
 * لكل مرحلة (مُجهّزة مسبقًا عبر adapters) وترجّع أرقام 0-100.
 */

const STATUS_WEIGHT: Record<WorkflowStatus, number> = {
  not_started: 0,
  in_progress: 40,
  waiting_ai: 50,
  waiting_review: 70,
  needs_regeneration: 60,
  approved: 100,
  rejected: 0,
  completed: 100,
  archived: 100,
};

/** لو الـ Adapter مادّاش completionPct دقيقة (مثلاً مرحلة بلا concept نسبة)، بنرجع لوزن الـ status. */
function effectiveCompletion(state: StageState | undefined): number {
  if (!state) return 0;
  if (Number.isFinite(state.completionPct) && state.completionPct > 0) return state.completionPct;
  return STATUS_WEIGHT[state.status] ?? 0;
}

function average(values: number[]): number {
  if (values.length === 0) return 0;
  return Math.round(values.reduce((a, b) => a + b, 0) / values.length);
}

export function calculateWeightedCompletion(states: Partial<Record<WorkflowStageKey, StageState>>): number {
  const values = STAGE_REGISTRY.map((s) => effectiveCompletion(states[s.id]));
  return average(values);
}

/** مراحل محتواها الأساسي مولّد بالذكاء الاصطناعي. */
const AI_STAGES: WorkflowStageKey[] = [
  "analysis",
  "meetingPreparation",
  "meetingPresentation",
  "projectBrain",
  "prd",
  "prototypePrompt",
  "promptReview",
  "developerHandoff",
  "fixPrompt",
  "productionMonitoringPrompt",
  "organizationalIntelligence",
];

/** بوابات اعتماد بشرية صريحة. */
const REVIEW_STAGES: WorkflowStageKey[] = [
  "brainReview",
  "prototypeReview",
  "engineeringQaReview",
  "productionMonitoringReview",
];

/** مدخلات/إدارة يدوية بحتة. */
const HUMAN_STAGES: WorkflowStageKey[] = ["overview", "discovery", "meetings", "support"];

function averageFor(states: Partial<Record<WorkflowStageKey, StageState>>, keys: WorkflowStageKey[]): number {
  return average(keys.map((k) => effectiveCompletion(states[k])));
}

export function calculateAiCompletion(states: Partial<Record<WorkflowStageKey, StageState>>): number {
  return averageFor(states, AI_STAGES);
}

export function calculateReviewCompletion(states: Partial<Record<WorkflowStageKey, StageState>>): number {
  return averageFor(states, REVIEW_STAGES);
}

export function calculateHumanCompletion(states: Partial<Record<WorkflowStageKey, StageState>>): number {
  return averageFor(states, HUMAN_STAGES);
}

const ENGINEERING_STAGES: WorkflowStageKey[] = ["developerHandoff", "engineeringQa", "fixPrompt", "engineeringQaReview"];
const DEPLOYMENT_STAGES: WorkflowStageKey[] = ["engineeringQaReview", "productionMonitoring"];
const SUPPORT_STAGES: WorkflowStageKey[] = ["productionMonitoringReview", "support"];

export interface ReadinessSummary {
  overall: number;
  engineering: number;
  deployment: number;
  support: number;
}

export function calculateReadiness(states: Partial<Record<WorkflowStageKey, StageState>>): ReadinessSummary {
  return {
    overall: calculateWeightedCompletion(states),
    engineering: averageFor(states, ENGINEERING_STAGES),
    deployment: averageFor(states, DEPLOYMENT_STAGES),
    support: averageFor(states, SUPPORT_STAGES),
  };
}
