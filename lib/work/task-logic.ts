import { isDoneStatus, isTerminalStatus } from "./statuses";
import type { Task, TaskStatus, TaskChecklistItem } from "@/lib/types/database";

/**
 * منطق المهام النقي (Work Management) — بدون I/O. تبعيات، تأخير،
 * حساب نسبة التقدّم (rollup)، والانتقالات المسموحة.
 */

/** الحالات اللي تعتبر "بدأ فيها التنفيذ" (ممنوعة قبل اكتمال التبعيات). */
const EXECUTION_STATUSES: TaskStatus[] = ["in_progress", "review", "testing", "completed"];

export interface DependencyGate {
  allowed: boolean;
  blockingTaskIds: string[];
  message?: string;
}

/**
 * هل يُسمح بنقل مهمة للحالة الجديدة بالنظر لتبعياتها؟ لا يُسمح بالدخول
 * في تنفيذ (in_progress+) طالما فيه تبعية لسه مش completed.
 * dependencyStatuses: خريطة taskId → status لكل ما تعتمد عليه المهمة.
 */
export function checkDependencyGate(
  targetStatus: TaskStatus,
  dependencyStatuses: { id: string; status: TaskStatus }[]
): DependencyGate {
  if (!EXECUTION_STATUSES.includes(targetStatus)) {
    return { allowed: true, blockingTaskIds: [] };
  }
  const blocking = dependencyStatuses.filter((d) => !isDoneStatus(d.status)).map((d) => d.id);
  if (blocking.length === 0) return { allowed: true, blockingTaskIds: [] };
  return {
    allowed: false,
    blockingTaskIds: blocking,
    message: `مش هينفع تبدأ المهمة قبل اكتمال ${blocking.length} مهمة تعتمد عليها.`,
  };
}

/** هل المهمة متأخرة؟ (لها due_date، مش نهائية، والتاريخ عدّى). */
export function isOverdue(task: Pick<Task, "due_date" | "status">, nowMs: number): boolean {
  if (!task.due_date || isTerminalStatus(task.status)) return false;
  return new Date(task.due_date).getTime() < nowMs;
}

/** مهمة حرجة ومتأخرة (للتمييز البصري). */
export function isCriticalOverdue(task: Pick<Task, "due_date" | "status" | "priority">, nowMs: number): boolean {
  return task.priority === "critical" && isOverdue(task, nowMs);
}

/** نسبة إنجاز الـ checklist (0-100). */
export function checklistProgress(checklist: TaskChecklistItem[]): number {
  if (!checklist || checklist.length === 0) return 0;
  const done = checklist.filter((c) => c.done).length;
  return Math.round((done / checklist.length) * 100);
}

/**
 * نسبة تقدّم مهمة: لو completed = 100. لو عندها subtasks = متوسط نسبها.
 * غير كده = نسبة الـ checklist (أو 0). subtaskProgress: نِسب الأبناء
 * محسوبة مسبقًا (نفس الدالة تُستدعى للأبناء).
 */
export function computeTaskProgress(
  task: Pick<Task, "status" | "checklist">,
  subtaskProgress: number[]
): number {
  if (isDoneStatus(task.status)) return 100;
  if (subtaskProgress.length > 0) {
    return Math.round(subtaskProgress.reduce((a, b) => a + b, 0) / subtaskProgress.length);
  }
  return checklistProgress(task.checklist);
}

/**
 * نسبة تقدّم Milestone = متوسط تقدّم مهامه المباشرة (الأعلى مستوى، بدون
 * subtasks المكرّرة). لو مفيش مهام = 0.
 */
export function computeMilestoneProgress(topLevelTaskProgress: number[]): number {
  if (topLevelTaskProgress.length === 0) return 0;
  return Math.round(topLevelTaskProgress.reduce((a, b) => a + b, 0) / topLevelTaskProgress.length);
}

/**
 * نسبة تقدّم المشروع = متوسط تقدّم كل المهام الأعلى مستوى (اللي مالهاش
 * parent). مستقل عن الـ Milestones عشان المهام الحرّة تتحسب كمان.
 */
export function computeProjectTaskProgress(topLevelTaskProgress: number[]): number {
  if (topLevelTaskProgress.length === 0) return 0;
  return Math.round(topLevelTaskProgress.reduce((a, b) => a + b, 0) / topLevelTaskProgress.length);
}
