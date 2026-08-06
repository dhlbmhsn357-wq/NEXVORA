/**
 * نظام حالات وأولويات مهام "مساحتي" (Task Management) — وحدة نقية بدون I/O.
 * Workflow: To Do → In Progress → Waiting Review → Approved → Completed →
 * Archived، مع Blocked و Cancelled كحالات جانبية.
 */

export const WTASK_STATUSES = [
  "todo",
  "in_progress",
  "waiting_review",
  "approved",
  "completed",
  "archived",
  "blocked",
  "cancelled",
] as const;
export type WTaskStatus = (typeof WTASK_STATUSES)[number];

export const WTASK_STATUS_LABELS: Record<WTaskStatus, string> = {
  todo: "قيد الانتظار",
  in_progress: "قيد التنفيذ",
  waiting_review: "بانتظار المراجعة",
  approved: "معتمَدة",
  completed: "مكتملة",
  archived: "مؤرشفة",
  blocked: "معطّلة",
  cancelled: "ملغاة",
};

export const WTASK_STATUS_LABELS_EN: Record<WTaskStatus, string> = {
  todo: "To Do",
  in_progress: "In Progress",
  waiting_review: "Waiting Review",
  approved: "Approved",
  completed: "Completed",
  archived: "Archived",
  blocked: "Blocked",
  cancelled: "Cancelled",
};

/** نغمة الـ Badge لكل حالة (متوافقة مع نظام التصميم). */
export const WTASK_STATUS_TONE: Record<WTaskStatus, "neutral" | "info" | "warning" | "success" | "danger"> = {
  todo: "neutral",
  in_progress: "info",
  waiting_review: "warning",
  approved: "info",
  completed: "success",
  archived: "neutral",
  blocked: "danger",
  cancelled: "danger",
};

/** أعمدة لوحة الكانبان (بترتيب الـ Workflow؛ تستبعد المؤرشفة). */
export const WTASK_KANBAN_COLUMNS: WTaskStatus[] = [
  "todo",
  "in_progress",
  "waiting_review",
  "approved",
  "completed",
  "blocked",
];

export const WTASK_TERMINAL_STATUSES: WTaskStatus[] = ["completed", "archived", "cancelled"];
export function isWTaskTerminal(status: WTaskStatus): boolean {
  return WTASK_TERMINAL_STATUSES.includes(status);
}
export function isWTaskDone(status: WTaskStatus): boolean {
  return status === "completed" || status === "archived";
}

// الأولويات
export const WTASK_PRIORITIES = ["critical", "high", "medium", "low"] as const;
export type WTaskPriority = (typeof WTASK_PRIORITIES)[number];

export const WTASK_PRIORITY_LABELS: Record<WTaskPriority, string> = {
  critical: "حرجة",
  high: "عالية",
  medium: "متوسطة",
  low: "منخفضة",
};
export const WTASK_PRIORITY_LABELS_EN: Record<WTaskPriority, string> = {
  critical: "Critical",
  high: "High",
  medium: "Medium",
  low: "Low",
};
export const WTASK_PRIORITY_ORDER: Record<WTaskPriority, number> = {
  critical: 0,
  high: 1,
  medium: 2,
  low: 3,
};
export const WTASK_PRIORITY_TONE: Record<WTaskPriority, "danger" | "warning" | "info" | "neutral"> = {
  critical: "danger",
  high: "warning",
  medium: "info",
  low: "neutral",
};

/**
 * الانتقالات المسموحة بين الحالات (بغض النظر عن الدور). صلاحية الدور
 * تُفحص إضافيًا في permissions.ts (مثلاً الاعتماد لِـ owner/admin فقط).
 */
export const WTASK_TRANSITIONS: Record<WTaskStatus, WTaskStatus[]> = {
  todo: ["in_progress", "blocked", "cancelled"],
  in_progress: ["waiting_review", "blocked", "cancelled"],
  waiting_review: ["approved", "in_progress", "blocked"], // in_progress = رفض المراجعة
  approved: ["completed", "in_progress"],
  completed: ["archived", "in_progress"],
  archived: ["todo"],
  blocked: ["todo", "in_progress", "cancelled"],
  cancelled: ["todo"],
};

export function canTransition(from: WTaskStatus, to: WTaskStatus): boolean {
  if (from === to) return false;
  return (WTASK_TRANSITIONS[from] ?? []).includes(to);
}

/** حالات لا يقدر المنفّذ يوصّلها بنفسه (اعتماد/إكمال/أرشفة = للمدير فقط). */
export const MANAGER_ONLY_TARGET_STATUSES: WTaskStatus[] = ["approved", "completed", "archived"];
