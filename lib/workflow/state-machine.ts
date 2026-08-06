import type { WorkflowStatus } from "./types";

/**
 * الانتقالات الشرعية بين الحالات الموحّدة. الجدول ده بيحكم أفعال
 * الـ Workflow Engine نفسها بس (approve/reject/archive على مستوى
 * الطبقة الجديدة) — مش بديل لأي Machine داخلية موجودة جوّه محرك معيّن
 * (زي pending/queued/running بتاعة Engineering QA)، دي هتفضل زي ما هي
 * دلوقتي (موضّح في خطة Phase 1).
 */
const TRANSITIONS: Record<WorkflowStatus, WorkflowStatus[]> = {
  not_started: ["in_progress", "waiting_ai"],
  in_progress: ["waiting_ai", "waiting_review", "completed", "needs_regeneration"],
  waiting_ai: ["waiting_review", "in_progress", "needs_regeneration"],
  waiting_review: ["approved", "rejected", "needs_regeneration"],
  needs_regeneration: ["in_progress", "waiting_ai"],
  approved: ["completed", "archived", "needs_regeneration"],
  rejected: ["in_progress", "needs_regeneration", "archived"],
  completed: ["archived", "needs_regeneration"],
  archived: [],
};

export function getLegalTransitions(from: WorkflowStatus): WorkflowStatus[] {
  return TRANSITIONS[from] ?? [];
}

export function isValidTransition(from: WorkflowStatus, to: WorkflowStatus): boolean {
  if (from === to) return true;
  return getLegalTransitions(from).includes(to);
}
