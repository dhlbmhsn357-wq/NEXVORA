/** NEXVORA Stage Assignments — Pure Derivations (0107) */
import type { StageAssignmentRow, StageAssignmentStatus, StageKey } from "./types";
import { STAGE_KEYS } from "./types";

export function isStageOverdue(
  row: Pick<StageAssignmentRow, "dueDate" | "status">,
  nowISO: string,
): boolean {
  if (!row.dueDate) return false;
  if (row.status === "completed") return false;
  const today = nowISO.slice(0, 10);
  return row.dueDate < today;
}

export interface AssignmentsSummary {
  total: number;
  assigned: number;               // عندها owner
  withReviewer: number;
  overdue: number;
  byStatus: Record<StageAssignmentStatus, number>;
  missingStages: StageKey[];      // مراحل بلا صف
}

const EMPTY_STATUS = (): Record<StageAssignmentStatus, number> => ({
  not_started: 0, in_progress: 0, blocked: 0, ready_for_review: 0, completed: 0,
});

export function summarizeAssignments(
  rows: readonly StageAssignmentRow[],
  nowISO: string,
): AssignmentsSummary {
  const byStatus = EMPTY_STATUS();
  let assigned = 0;
  let withReviewer = 0;
  let overdue = 0;
  const present = new Set<StageKey>();
  for (const r of rows) {
    byStatus[r.status]++;
    if (r.ownerId) assigned++;
    if (r.reviewerId) withReviewer++;
    if (isStageOverdue(r, nowISO)) overdue++;
    present.add(r.stageKey);
  }
  const missingStages = STAGE_KEYS.filter((k) => !present.has(k));
  return { total: rows.length, assigned, withReviewer, overdue, byStatus, missingStages };
}

/** التقدّم العام (0..100) = المكتمل / (كل المراحل السبع). */
export function getStageProgress(rows: readonly StageAssignmentRow[]): number {
  const completed = rows.filter((r) => r.status === "completed").length;
  return Math.round((completed / STAGE_KEYS.length) * 100);
}
