/**
 * NEXVORA Product Definition — Types (P6)
 * =======================================
 * ثلاث ركائز مبنية على البحث والتحقق (P5):
 *   • Personas         — شرائح المستخدمين المستهدفة
 *   • User Flows       — سيناريوهات الاستخدام
 *   • Requirements     — متطلبات وظيفية/غير وظيفية + MoSCoW
 */

// ---------------------------------------------------------------------------
// Personas
// ---------------------------------------------------------------------------
export interface PersonaRow {
  id: string;
  projectId: string;
  name: string;
  role: string;
  segment: string;
  jobsToBeDone: string;
  goals: string;
  pains: string;
  channels: string[];
  techSavviness: number;   // 0..100
  notes: string;
  isPrimary: boolean;
  /** مفتاح عنصر Brain المصدر (`section_key::item_key`) لو الـ persona دي مستوردة من Project Brain — null لو أُنشئت يدويًا. */
  sourceBrainItemKey: string | null;
  createdAt: string;
  updatedAt: string;
  createdBy: string | null;
}

// ---------------------------------------------------------------------------
// User Flows
// ---------------------------------------------------------------------------
export type FlowType = "primary" | "secondary" | "edge";

export const FLOW_TYPES: readonly FlowType[] = ["primary", "secondary", "edge"] as const;

export const FLOW_TYPE_LABELS: Record<FlowType, string> = {
  primary: "رئيسي", secondary: "ثانوي", edge: "حالة خاصة",
};

export interface FlowStep {
  order: number;
  action: string;
  expectedResult: string;
  notes: string;
}

export interface UserFlowRow {
  id: string;
  projectId: string;
  personaId: string | null;
  name: string;
  description: string;
  flowType: FlowType;
  triggerEvent: string;
  successOutcome: string;
  steps: FlowStep[];
  notes: string;
  createdAt: string;
  updatedAt: string;
  createdBy: string | null;
}

// ---------------------------------------------------------------------------
// Requirements + MoSCoW
// ---------------------------------------------------------------------------
export type RequirementType = "functional" | "non_functional";
export type MoscowPriority = "must" | "should" | "could" | "wont";
export type RequirementStatus = "draft" | "approved" | "in_progress" | "done" | "deferred";

export const REQUIREMENT_TYPES: readonly RequirementType[] = ["functional", "non_functional"] as const;
export const MOSCOW_PRIORITIES: readonly MoscowPriority[] = ["must", "should", "could", "wont"] as const;
export const REQUIREMENT_STATUSES: readonly RequirementStatus[] = [
  "draft", "approved", "in_progress", "done", "deferred",
] as const;

export const REQUIREMENT_TYPE_LABELS: Record<RequirementType, string> = {
  functional: "وظيفي", non_functional: "غير وظيفي",
};
export const MOSCOW_LABELS: Record<MoscowPriority, string> = {
  must: "Must (لازم)",
  should: "Should (يُفضّل)",
  could: "Could (لو أمكن)",
  wont: "Won't (خارج النطاق)",
};
export const REQUIREMENT_STATUS_LABELS: Record<RequirementStatus, string> = {
  draft: "مسودّة", approved: "معتمد", in_progress: "قيد التنفيذ",
  done: "منتهي", deferred: "مؤجّل",
};

export interface RequirementRow {
  id: string;
  projectId: string;
  code: string | null;
  title: string;
  description: string;
  requirementType: RequirementType;
  priority: MoscowPriority;
  status: RequirementStatus;
  rationale: string;
  acceptanceHint: string;
  effortEstimate: string;
  linkedPersonaId: string | null;
  linkedFlowId: string | null;
  tags: string[];
  /** مفتاح عنصر Brain المصدر (`section_key::item_key`) لو المتطلب ده مستورد من Project Brain — null لو أُنشئ يدويًا. */
  sourceBrainItemKey: string | null;
  createdAt: string;
  updatedAt: string;
  createdBy: string | null;
}
