import { isWTaskDone, isWTaskTerminal, WTASK_PRIORITY_ORDER, type WTaskPriority, type WTaskStatus } from "./statuses";

/**
 * منطق نقي لمهام "مساحتي" — تقدّم/تأخير/فرز/مقاييس. بدون I/O عشان
 * يتّختبر بسهولة ويُعاد استخدامه في السيرفر والعميل.
 */

export interface ChecklistItem {
  id: string;
  text: string;
  done: boolean;
}

export interface WTaskLink {
  label: string;
  url: string;
}

/** أساسيات المهمة اللي المنطق بيحتاجها (مجموعة فرعية من الصف الكامل). */
export interface WTaskCore {
  status: WTaskStatus;
  priority: WTaskPriority;
  due_date: string | null;
  checklist: ChecklistItem[];
  started_at: string | null;
  completed_at: string | null;
  created_at: string;
}

/** نسبة إنجاز التشيك-ليست (0..100). مهمة بلا تشيك-ليست: مكتملة=100 وإلا 0. */
export function checklistProgress(items: ChecklistItem[]): number {
  if (!items || items.length === 0) return 0;
  const done = items.filter((i) => i.done).length;
  return Math.round((done / items.length) * 100);
}

/** تقدّم المهمة: مكتملة=100، وإلا نسبة التشيك-ليست. */
export function computeWTaskProgress(task: Pick<WTaskCore, "status" | "checklist">): number {
  if (isWTaskDone(task.status)) return 100;
  return checklistProgress(task.checklist ?? []);
}

/** هل المهمة متأخرة؟ (تجاوزت الموعد وليست منتهية). */
export function isWTaskOverdue(task: Pick<WTaskCore, "status" | "due_date">, nowMs: number): boolean {
  if (!task.due_date || isWTaskTerminal(task.status)) return false;
  return new Date(task.due_date).getTime() < nowMs;
}

/** هل الموعد قريب خلال عدد أيام (وليست منتهية/متأخرة)؟ */
export function isWTaskDueSoon(
  task: Pick<WTaskCore, "status" | "due_date">,
  nowMs: number,
  withinDays = 2
): boolean {
  if (!task.due_date || isWTaskTerminal(task.status)) return false;
  const due = new Date(task.due_date).getTime();
  if (due < nowMs) return false;
  return due - nowMs <= withinDays * 24 * 60 * 60 * 1000;
}

/** زمن التنفيذ بالساعات (من started_at إلى completed_at) — null لو ناقص. */
export function executionHours(task: Pick<WTaskCore, "started_at" | "completed_at">): number | null {
  if (!task.started_at || !task.completed_at) return null;
  const ms = new Date(task.completed_at).getTime() - new Date(task.started_at).getTime();
  if (ms < 0) return null;
  return Math.round((ms / (60 * 60 * 1000)) * 10) / 10;
}

/** فرز: الأولوية أولاً، ثم الأقرب موعدًا (بلا موعد = الأخير). */
export function compareWTasks(
  a: Pick<WTaskCore, "priority" | "due_date">,
  b: Pick<WTaskCore, "priority" | "due_date">
): number {
  const p = WTASK_PRIORITY_ORDER[a.priority] - WTASK_PRIORITY_ORDER[b.priority];
  if (p !== 0) return p;
  const ad = a.due_date ? new Date(a.due_date).getTime() : Number.POSITIVE_INFINITY;
  const bd = b.due_date ? new Date(b.due_date).getTime() : Number.POSITIVE_INFINITY;
  return ad - bd;
}

export interface WTaskMetrics {
  total: number;
  completed: number;
  overdue: number;
  inProgress: number;
  waitingReview: number;
  completionPct: number;
  avgExecutionHours: number | null;
}

/** مقاييس لوحة المدير من قائمة مهام. */
export function computeWTaskMetrics(tasks: WTaskCore[], nowMs: number): WTaskMetrics {
  const total = tasks.length;
  const completed = tasks.filter((t) => isWTaskDone(t.status)).length;
  const overdue = tasks.filter((t) => isWTaskOverdue(t, nowMs)).length;
  const inProgress = tasks.filter((t) => t.status === "in_progress").length;
  const waitingReview = tasks.filter((t) => t.status === "waiting_review").length;

  const durations = tasks.map((t) => executionHours(t)).filter((h): h is number => h != null);
  const avgExecutionHours =
    durations.length > 0
      ? Math.round((durations.reduce((s, h) => s + h, 0) / durations.length) * 10) / 10
      : null;

  return {
    total,
    completed,
    overdue,
    inProgress,
    waitingReview,
    completionPct: total > 0 ? Math.round((completed / total) * 100) : 0,
    avgExecutionHours,
  };
}
