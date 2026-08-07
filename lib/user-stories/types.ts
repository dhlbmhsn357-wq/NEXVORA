/**
 * NEXVORA User Stories + Acceptance Criteria — Types (P7)
 * =======================================================
 * قصص المستخدم المهيكلة (as_a/i_want/so_that) + AC (Given/When/Then).
 * تُبنى على متطلبات P6 (Personas/Flows/Requirements).
 */

// ---------------------------------------------------------------------------
// Story status + Risk
// ---------------------------------------------------------------------------
export type StoryStatus =
  | "draft"      // مسودة
  | "in_review"  // قيد المراجعة
  | "approved"   // معتمدة (جاهزة للتنفيذ)
  | "in_dev"     // قيد التطوير
  | "done"       // منتهية
  | "archived";  // مؤرشفة

export const STORY_STATUSES: readonly StoryStatus[] = [
  "draft", "in_review", "approved", "in_dev", "done", "archived",
] as const;

export const STORY_STATUS_LABELS: Record<StoryStatus, string> = {
  draft: "مسودّة",
  in_review: "قيد المراجعة",
  approved: "معتمدة",
  in_dev: "قيد التطوير",
  done: "منتهية",
  archived: "مؤرشفة",
};

export type RiskLevel = "low" | "medium" | "high";
export const RISK_LEVELS: readonly RiskLevel[] = ["low", "medium", "high"] as const;
export const RISK_LABELS: Record<RiskLevel, string> = {
  low: "منخفضة", medium: "متوسطة", high: "عالية",
};

/** نقاط Fibonacci الشائعة لتقدير القصص. */
export const STORY_POINT_OPTIONS: readonly number[] = [0, 1, 2, 3, 5, 8, 13, 21] as const;

// ---------------------------------------------------------------------------
// User Story row
// ---------------------------------------------------------------------------
export interface UserStoryRow {
  id: string;
  projectId: string;
  code: string | null;
  title: string;
  asA: string;
  iWant: string;
  soThat: string;
  narrativeExtra: string;
  status: StoryStatus;
  storyPoints: number | null;
  businessValue: number;   // 0..100
  riskLevel: RiskLevel;
  linkedPersonaId: string | null;
  linkedFlowId: string | null;
  linkedRequirementId: string | null;
  tags: string[];
  createdAt: string;
  updatedAt: string;
  createdBy: string | null;
}

// ---------------------------------------------------------------------------
// Acceptance Criterion (Gherkin)
// ---------------------------------------------------------------------------
export type AcStatus = "draft" | "approved" | "verified" | "failed";

export const AC_STATUSES: readonly AcStatus[] = ["draft", "approved", "verified", "failed"] as const;

export const AC_STATUS_LABELS: Record<AcStatus, string> = {
  draft: "مسودّة",
  approved: "معتمد",
  verified: "تمّ التحقق",
  failed: "فشل",
};

export interface AcceptanceCriterionRow {
  id: string;
  userStoryId: string;
  projectId: string;
  orderIndex: number;
  title: string;
  givenClause: string;
  whenClause: string;
  thenClause: string;
  andConditions: string[];
  status: AcStatus;
  notes: string;
  createdAt: string;
  updatedAt: string;
  createdBy: string | null;
}
