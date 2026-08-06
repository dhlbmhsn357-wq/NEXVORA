import type { EvidenceRef } from "@/lib/discovery-analysis/types";

/**
 * Source: من أين جاءت هذه المعلومة.
 * - discovery: مباشرة من إجابة العميل في نموذج الاكتشاف
 * - ai_analysis: مستنبطة من AI Discovery Analysis (Phase 4A)
 * - pm_manual_edit: تعديل يدوي من الـ PM
 * - meeting: من محضر اجتماع (Phase 5)
 * - future_update: مصدر مستقبلي مخطط
 */
export type BrainSectionSource =
  | "discovery"
  | "ai_analysis"
  | "pm_manual_edit"
  | "meeting"
  | "future_update";

export interface BrainSectionMeta {
  confidence: number; // 0..100
  confidence_reason: string | null;
  evidence: EvidenceRef[];
  source: BrainSectionSource;
  last_updated: string; // ISO
}

// ============================================================
// أنواع المحتوى لكل قسم — كلها list-based أو text-based
// ============================================================

export type PriorityLevel = "high" | "medium" | "low";

export interface EvidenceItem {
  statement: string;
  evidence: EvidenceRef[];
}
export interface PriorityItem {
  statement: string;
  priority: PriorityLevel;
  evidence: EvidenceRef[];
}
export interface AssumptionItem {
  statement: string;
  reason: string;
  evidence: EvidenceRef[];
}
export interface StakeholderItem {
  name: string;
  role: string;
  influence: PriorityLevel;
  evidence: EvidenceRef[];
}
export interface RiskItem {
  risk: string;
  cause: string;
  likelihood: PriorityLevel;
  impact: PriorityLevel;
  evidence: EvidenceRef[];
}
export interface MissingInfoItem {
  info: string;
  impact: PriorityLevel;
  reason: string;
}
export interface SuggestionItem {
  title: string;
  rationale: string;
  priority: PriorityLevel;
  evidence: EvidenceRef[];
}
export interface UserRoleItem {
  role: string;
  responsibilities: string[];
  evidence: EvidenceRef[];
}
export interface KpiItem {
  name: string;
  target_or_direction: string;
  goal_link: string;
  evidence: EvidenceRef[];
}
export interface RoadmapPhaseItem {
  phase: string;
  description: string;
  deliverables: string[];
  evidence: EvidenceRef[];
}
export interface MeetingQuestionItem {
  question: string;
  reason: string;
  priority: PriorityLevel;
}
export interface BusinessRuleItem {
  rule: string;
  rationale: string;
  evidence: EvidenceRef[];
}
export interface ConstraintItem {
  constraint: string;
  type: "legal" | "technical" | "budget" | "timeline" | "other";
  evidence: EvidenceRef[];
}
export interface KnownFactItem {
  fact: string;
  category: string; // "business" | "users" | "process" | "tech" | ...
  evidence: EvidenceRef[];
}

// ============================================================
// الأقسام الـ19 — كل قسم = { meta + content }
// ============================================================

export interface Section<T> {
  meta: BrainSectionMeta;
  content: T;
}

/** الملخّص التنفيذي — نص. */
export type ExecutiveSummaryContent = string;

export interface BusinessModelContent {
  overview: string;
  how_it_works: string;
  value_delivery: string;
  users_description: string;
}

export interface ScopeContent {
  in_scope: EvidenceItem[];
  out_of_scope: EvidenceItem[];
}

export interface NonFunctionalContent {
  performance: EvidenceItem[];
  security: EvidenceItem[];
  scalability: EvidenceItem[];
  availability: EvidenceItem[];
  accessibility: EvidenceItem[];
  compliance: EvidenceItem[];
}

// ============================================================
// الجذر: BrainContent = كل الأقسام
// ============================================================

export interface BrainContent {
  executive_summary: Section<ExecutiveSummaryContent>;
  business_model: Section<BusinessModelContent>;
  business_goals: Section<PriorityItem[]>;
  stakeholders: Section<StakeholderItem[]>;
  business_rules: Section<BusinessRuleItem[]>;
  functional_requirements: Section<EvidenceItem[]>;
  non_functional_requirements: Section<NonFunctionalContent>;
  constraints: Section<ConstraintItem[]>;
  assumptions: Section<AssumptionItem[]>;
  risks: Section<RiskItem[]>;
  known_facts: Section<KnownFactItem[]>;
  missing_information: Section<MissingInfoItem[]>;
  user_roles: Section<UserRoleItem[]>;
  suggested_features: Section<SuggestionItem[]>;
  suggested_integrations: Section<SuggestionItem[]>;
  suggested_kpis: Section<KpiItem[]>;
  project_scope: Section<ScopeContent>;
  roadmap: Section<RoadmapPhaseItem[]>;
  meeting_questions: Section<MeetingQuestionItem[]>;
}

export const BRAIN_SECTIONS = [
  "executive_summary",
  "business_model",
  "business_goals",
  "stakeholders",
  "business_rules",
  "functional_requirements",
  "non_functional_requirements",
  "constraints",
  "assumptions",
  "risks",
  "known_facts",
  "missing_information",
  "user_roles",
  "suggested_features",
  "suggested_integrations",
  "suggested_kpis",
  "project_scope",
  "roadmap",
  "meeting_questions",
] as const;

export type BrainSectionKey = (typeof BRAIN_SECTIONS)[number];

export const BRAIN_SECTION_LABELS: Record<BrainSectionKey, string> = {
  executive_summary: "الملخّص التنفيذي",
  business_model: "نموذج العمل",
  business_goals: "أهداف العمل",
  stakeholders: "أصحاب المصلحة",
  business_rules: "قواعد العمل",
  functional_requirements: "المتطلبات الوظيفية",
  non_functional_requirements: "المتطلبات غير الوظيفية",
  constraints: "القيود",
  assumptions: "الافتراضات",
  risks: "المخاطر",
  known_facts: "الحقائق المعروفة",
  missing_information: "معلومات ناقصة",
  user_roles: "أدوار المستخدمين",
  suggested_features: "مزايا مقترحة",
  suggested_integrations: "تكاملات مقترحة",
  suggested_kpis: "مؤشرات الأداء",
  project_scope: "نطاق المشروع",
  roadmap: "خارطة الطريق",
  meeting_questions: "أسئلة الاجتماع",
};

export const SOURCE_LABELS: Record<BrainSectionSource, string> = {
  discovery: "من نموذج الاكتشاف",
  ai_analysis: "من تحليل AI",
  pm_manual_edit: "تعديل يدوي",
  meeting: "من اجتماع",
  future_update: "تحديث مستقبلي",
};

// ============================================================
// نوع صف قاعدة البيانات
// ============================================================

export type BrainDocStatus = "draft" | "in_review" | "approved" | "archived" | "rejected";

export interface BrainDocumentRow {
  id: string;
  project_id: string;
  version: number;
  status: BrainDocStatus;
  content: BrainContent;
  completeness_score: number;
  based_on_analysis_id: string | null;
  previous_version: number | null;
  change_summary: string | null;
  created_by: string | null;
  approved_by: string | null;
  approved_at: string | null;
  rejected_by: string | null;
  rejected_at: string | null;
  rejection_reason: string | null;
  created_at: string;
  updated_at: string;
  // Phase 4C — Review workflow
  section_reviews: import("./review-types").SectionReviewsMap;
  missing_info_dispositions: import("./review-types").MissingInfoDispositionsMap;
  assumption_dispositions: import("./review-types").AssumptionDispositionsMap;
  readiness_score: number;
  review_started_at: string | null;
  review_started_by: string | null;
  changes_requested_at: string | null;
  changes_requested_by: string | null;
  changes_requested_reason: string | null;
}

export interface BrainEditRow {
  id: string;
  document_id: string;
  project_id: string;
  section_key: BrainSectionKey;
  before_value: unknown;
  after_value: unknown;
  reason: string | null;
  edited_by: string | null;
  edited_at: string;
}
