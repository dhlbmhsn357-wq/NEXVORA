/**
 * NEXVORA Workflow v2 — Types
 * ===========================
 *
 * الـ 7 مراحل الجوهرية لمشاريع NEXVORA (Product Discovery, Definition,
 * Prototype, Client Approval, Handoff). موجودة **جنب** الـ 24 stage
 * القديم في lib/workflow — لا يتم لمس أي شيء في v1.
 *
 * v1 يبقى للمشاريع القديمة (project.workflow_version = 'v1').
 * v2 للمشاريع الجديدة (workflow_version = 'v2') + الـ Adapter يعرض v1
 * كواحدة من الـ 7 عند الطلب.
 */

/** المراحل السبع بالترتيب (كل مفتاح مطابق لـ workflow_stages_v2.key في DB). */
export type WorkflowV2StageKey =
  | "client_and_project"
  | "discovery_and_research"
  | "analysis_and_validation"
  | "product_definition"
  | "prototype_and_review"
  | "client_approval"
  | "handoff_and_closure";

/** الترتيب الرقمي (يطابق stage_order في DB). */
export const STAGE_ORDER: Record<WorkflowV2StageKey, number> = {
  client_and_project: 1,
  discovery_and_research: 2,
  analysis_and_validation: 3,
  product_definition: 4,
  prototype_and_review: 5,
  client_approval: 6,
  handoff_and_closure: 7,
};

/** كل المفاتيح مرتّبة (helper للـ iteration). */
export const ALL_V2_STAGES: readonly WorkflowV2StageKey[] = [
  "client_and_project",
  "discovery_and_research",
  "analysis_and_validation",
  "product_definition",
  "prototype_and_review",
  "client_approval",
  "handoff_and_closure",
] as const;

/**
 * حالة موحّدة لكل مرحلة — أبسط من v1 عن قصد (المراحل السبع أعرض،
 * فالحالة الجوهرية بس اللي مهمة).
 */
export type WorkflowV2Status =
  | "not_started"
  | "in_progress"
  | "waiting_review"
  | "approved"
  | "blocked";

export interface WorkflowV2StageDefinition {
  key: WorkflowV2StageKey;
  slug: string;
  displayName: string;
  description: string;
  icon: string;
  order: number;
  dependencies: WorkflowV2StageKey[];
}

/** عنصر داخلي (Checklist item) داخل مرحلة. */
export interface WorkflowV2ChecklistItem {
  stageKey: WorkflowV2StageKey;
  itemKey: string;
  displayName: string;
  description: string;
  order: number;
  isMandatory: boolean;
}

/** حالة عنصر checklist لمشروع معيّن (بيتم حسابها/تحديثها في P3+). */
export interface WorkflowV2ChecklistItemState {
  itemKey: string;
  status: "not_started" | "in_progress" | "completed" | "skipped" | "blocked";
  completedAt?: string | null;
}

/** حالة مرحلة كاملة لمشروع (aggregation عبر عناصر الـ checklist). */
export interface WorkflowV2StageState {
  key: WorkflowV2StageKey;
  status: WorkflowV2Status;
  /** نسبة إتمام العناصر الإلزامية (0-100). */
  mandatoryCompletion: number;
  /** نسبة إتمام كل العناصر (إلزامية + اختيارية). */
  overallCompletion: number;
  items: WorkflowV2ChecklistItemState[];
}
