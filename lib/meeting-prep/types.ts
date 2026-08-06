import type { EvidenceRef } from "@/lib/discovery-analysis/types";

export type MeetingPrepSectionStatus = "generated" | "manual_edit" | "failed";
export type PriorityLevel = "high" | "medium" | "low";

export interface SectionMeta {
  status: MeetingPrepSectionStatus;
  confidence: number; // 0..100
  confidence_reason: string | null;
  last_updated: string; // ISO
  error_message?: string | null; // لو status="failed"
}

export interface Section<T> {
  meta: SectionMeta;
  content: T;
}

// ============================================================
// أنواع محتوى كل قسم من الـ13
// ============================================================

/** 1) الملخّص التنفيذي — نص مختصر يُقرأ في أقل من دقيقتين. */
export type ExecutiveBriefContent = string;

/** 2) من هو العميل؟ */
export interface CustomerProfileContent {
  who: string;
  company_nature: string;
  company_size: string;
  what_they_want_to_achieve: string;
}

/** 3) فهم البيزنس. */
export interface BusinessUnderstandingContent {
  how_it_works: string;
  current_workflow: string;
  pain_points: string[];
}

/** 4) أهداف الاجتماع. */
export interface MeetingObjectivesContent {
  objectives: string[];
}

/** 5) الأجندة المقترحة. */
export interface AgendaItem {
  title: string;
  duration_minutes: number;
  description: string;
}
export interface SuggestedAgendaContent {
  items: AgendaItem[];
  total_minutes: number;
}

/** 6) محاكاة الحوار — أهم قسم. */
export interface ConversationTurn {
  speaker: "pm" | "client";
  line: string;
}
export interface ConversationBranch {
  trigger: string; // "لو العميل قال كذا..." / "لو اعترض..." / "لو طلب Feature إضافية..."
  guidance: string; // "قل كذا..." / "كيف تناقشه..."
}
export interface ConversationSimulationContent {
  dialogue: ConversationTurn[];
  branches: ConversationBranch[];
}

/** 7) أسئلة ذكية — مرتبة بالأولوية. */
export interface SmartQuestionItem {
  question: string;
  reason: string;
  priority: PriorityLevel;
}
export interface SmartQuestionsContent {
  items: SmartQuestionItem[];
}

/** 8) قائمة المعلومات الناقصة. */
export interface MissingInfoItem {
  info: string;
  why_needed: string;
  priority: PriorityLevel;
}
export interface MissingInfoChecklistContent {
  items: MissingInfoItem[];
}

/** 9) قرارات لازم تُتخذ قبل نهاية الاجتماع. */
export interface DecisionItem {
  decision: string;
  why_critical: string;
}
export interface DecisionChecklistContent {
  items: DecisionItem[];
}

/** 10) مخاطر تستحق النقاش مع العميل. */
export interface RiskDiscussionItem {
  risk: string;
  why_discuss_now: string;
  evidence: EvidenceRef[];
}
export interface RiskDiscussionContent {
  items: RiskDiscussionItem[];
}

/** 11) حماية النطاق من التوسّع. */
export interface ScopeProtectionContent {
  tactics: string[];
  suggested_phrases: string[];
}

/** 12) متى يعتبر الاجتماع ناجحًا؟ */
export interface SuccessCriteriaContent {
  criteria: string[];
}

/** 13) خطوات ما بعد الاجتماع مباشرة. */
export interface FollowUpItem {
  action: string;
  owner: "pm" | "client" | "team";
}
export interface FollowUpChecklistContent {
  items: FollowUpItem[];
}

// ============================================================
// الجذر: MeetingPrepSections = كل الأقسام الـ13
// ============================================================

export interface MeetingPrepSections {
  executive_brief: Section<ExecutiveBriefContent>;
  customer_profile: Section<CustomerProfileContent>;
  business_understanding: Section<BusinessUnderstandingContent>;
  meeting_objectives: Section<MeetingObjectivesContent>;
  suggested_agenda: Section<SuggestedAgendaContent>;
  conversation_simulation: Section<ConversationSimulationContent>;
  smart_questions: Section<SmartQuestionsContent>;
  missing_information_checklist: Section<MissingInfoChecklistContent>;
  decision_checklist: Section<DecisionChecklistContent>;
  risk_discussion: Section<RiskDiscussionContent>;
  scope_protection: Section<ScopeProtectionContent>;
  success_criteria: Section<SuccessCriteriaContent>;
  follow_up_checklist: Section<FollowUpChecklistContent>;
}

export const MEETING_PREP_SECTIONS = [
  "executive_brief",
  "customer_profile",
  "business_understanding",
  "meeting_objectives",
  "suggested_agenda",
  "conversation_simulation",
  "smart_questions",
  "missing_information_checklist",
  "decision_checklist",
  "risk_discussion",
  "scope_protection",
  "success_criteria",
  "follow_up_checklist",
] as const;

export type MeetingPrepSectionKey = (typeof MEETING_PREP_SECTIONS)[number];

export const MEETING_PREP_SECTION_LABELS: Record<MeetingPrepSectionKey, string> = {
  executive_brief: "الملخّص التنفيذي",
  customer_profile: "من هو العميل؟",
  business_understanding: "فهم البيزنس",
  meeting_objectives: "أهداف الاجتماع",
  suggested_agenda: "الأجندة المقترحة",
  conversation_simulation: "محاكاة الحوار",
  smart_questions: "أسئلة ذكية",
  missing_information_checklist: "معلومات ناقصة",
  decision_checklist: "قرارات مطلوبة",
  risk_discussion: "مخاطر للنقاش",
  scope_protection: "حماية النطاق",
  success_criteria: "معايير النجاح",
  follow_up_checklist: "متابعة ما بعد الاجتماع",
};

// ============================================================
// نوع صف قاعدة البيانات
// ============================================================

export type MeetingPrepStatus = "pending" | "generating" | "ready" | "failed";

export interface MeetingPreparationRow {
  id: string;
  project_id: string;
  based_on_analysis_id: string | null;
  based_on_brain_document_id: string | null;
  sections: Partial<MeetingPrepSections>;
  overall_confidence: number;
  status: MeetingPrepStatus;
  version: number;
  // Phase 2 — Meeting Intelligence: حقول ناقصة اتضافت (migration 0050)
  title: string | null;
  expected_outcomes: string[];
  previous_meeting_id: string | null;
  linked_open_question_ids: string[];
  linked_risk_ids: string[];
  linked_pending_decision_ids: string[];
  created_by: string | null;
  created_at: string;
  updated_at: string;
}

export interface MeetingPrepEditRow {
  id: string;
  meeting_preparation_id: string;
  project_id: string;
  section_key: MeetingPrepSectionKey;
  before_value: unknown;
  after_value: unknown;
  reason: string | null;
  edited_by: string | null;
  edited_at: string;
}
