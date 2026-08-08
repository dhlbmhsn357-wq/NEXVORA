/**
 * NEXVORA Project Stage Assignments — Types (0107)
 * تعيين مسؤول/مراجع/موعد نهائي لكل مرحلة من مراحل workflow v2 السبع.
 */

export const STAGE_KEYS = [
  "client_and_project",
  "discovery_and_research",
  "analysis_and_validation",
  "product_definition",
  "prototype_and_review",
  "client_approval",
  "handoff_and_closure",
] as const;
export type StageKey = (typeof STAGE_KEYS)[number];
export const STAGE_KEY_LABELS: Record<StageKey, string> = {
  client_and_project: "العميل والمشروع",
  discovery_and_research: "الاكتشاف والبحث",
  analysis_and_validation: "التحليل والتحقق",
  product_definition: "تعريف المنتج",
  prototype_and_review: "النموذج والمراجعة",
  client_approval: "اعتماد العميل",
  handoff_and_closure: "التسليم والإغلاق",
};

export type StageAssignmentStatus =
  | "not_started" | "in_progress" | "blocked" | "ready_for_review" | "completed";
export const STAGE_ASSIGNMENT_STATUSES: readonly StageAssignmentStatus[] = [
  "not_started", "in_progress", "blocked", "ready_for_review", "completed",
] as const;
export const STAGE_ASSIGNMENT_STATUS_LABELS: Record<StageAssignmentStatus, string> = {
  not_started: "لم يبدأ",
  in_progress: "قيد العمل",
  blocked: "متوقّف",
  ready_for_review: "جاهز للمراجعة",
  completed: "مكتمل",
};

export interface StageAssignmentRow {
  projectId: string;
  stageKey: StageKey;
  ownerId: string | null;
  reviewerId: string | null;
  dueDate: string | null;
  status: StageAssignmentStatus;
  notes: string;
  createdAt: string;
  updatedAt: string;
}
