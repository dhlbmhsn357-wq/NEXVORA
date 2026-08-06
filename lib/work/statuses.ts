import type { TaskStatus, TaskPriority, ProjectRole, MilestoneDeliveryType } from "@/lib/types/database";

/**
 * ثوابت حالة/أولوية المهام (Work Management) — وحدة نقية بدون I/O.
 */

export const TASK_STATUSES: TaskStatus[] = [
  "backlog", "planned", "ready", "in_progress", "waiting",
  "review", "testing", "blocked", "completed", "cancelled", "archived",
];

export const TASK_STATUS_LABELS: Record<TaskStatus, string> = {
  backlog: "قائمة الانتظار",
  planned: "مخطّط",
  ready: "جاهز",
  in_progress: "قيد التنفيذ",
  waiting: "معلّق",
  review: "مراجعة",
  testing: "اختبار",
  blocked: "محجوب",
  completed: "مكتمل",
  cancelled: "ملغي",
  archived: "مؤرشف",
};

/** أعمدة لوحة الكانبان (الحالات النشطة فقط — الملغي/المؤرشف مخفيين افتراضيًا). */
export const KANBAN_COLUMNS: TaskStatus[] = [
  "backlog", "planned", "ready", "in_progress", "waiting", "review", "testing", "blocked", "completed",
];

/** الحالات النهائية (المهمة "خلصت" بمعنى ما). */
export const TERMINAL_STATUSES: TaskStatus[] = ["completed", "cancelled", "archived"];

export function isTerminalStatus(s: TaskStatus): boolean {
  return TERMINAL_STATUSES.includes(s);
}

/** الحالات اللي تُحسب "منجزة" في نسبة التقدّم. */
export function isDoneStatus(s: TaskStatus): boolean {
  return s === "completed";
}

export const TASK_PRIORITIES: TaskPriority[] = ["critical", "high", "medium", "low", "optional"];

export const TASK_PRIORITY_LABELS: Record<TaskPriority, string> = {
  critical: "حرجة",
  high: "عالية",
  medium: "متوسطة",
  low: "منخفضة",
  optional: "اختيارية",
};

/** ترتيب الأولوية للفرز (الأعلى أولًا). */
export const PRIORITY_ORDER: Record<TaskPriority, number> = {
  critical: 0, high: 1, medium: 2, low: 3, optional: 4,
};

export const PROJECT_ROLE_LABELS: Record<ProjectRole, string> = {
  pm: "مدير المشروع",
  ba: "محلل أعمال",
  designer: "مصمم",
  developer: "مطوّر",
  qa: "مهندس جودة",
  support: "مهندس دعم",
  executor: "منفّذ",
  // Phase 4 — أدوار أوسع
  frontend: "مطوّر واجهات",
  backend: "مطوّر خلفية",
  fullstack: "مطوّر متكامل",
  ai_engineer: "مهندس ذكاء اصطناعي",
  prompt_engineer: "مهندس Prompt",
  devops: "مهندس DevOps",
  supervisor: "مشرف",
};

/** كل أدوار المشروع بالترتيب — للقوائم. */
export const ALL_PROJECT_ROLES: ProjectRole[] = [
  "pm", "ba", "designer", "frontend", "backend", "fullstack", "ai_engineer",
  "prompt_engineer", "qa", "devops", "support", "supervisor", "executor",
];

export const MILESTONE_DELIVERY_LABELS: Record<MilestoneDeliveryType, string> = {
  prototype: "نموذج أولي",
  module: "وحدة",
  beta: "Beta",
  alpha: "Alpha",
  release_candidate: "Release Candidate",
  final: "التسليم النهائي",
  custom: "مخصّص",
};

/** أنواع المهام الشائعة (قابلة للتوسّع — task_type نصّي حر في DB). */
export const COMMON_TASK_TYPES = [
  "development", "backend", "frontend", "database", "api", "ai", "prompt_engineering",
  "discovery", "meeting", "business_analysis", "ui", "ux", "design", "testing",
  "engineering_qa", "deployment", "documentation", "research", "support", "bug",
  "hotfix", "security", "infrastructure", "custom",
] as const;
