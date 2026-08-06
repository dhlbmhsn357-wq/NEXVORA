/**
 * الـ Schema الثابت لنتيجة تحليل نموذج الاكتشاف (17 قسمًا).
 *
 * قواعد صارمة عبر كل الأقسام:
 *  - كل عنصر مستخرَج يحمل evidence[] يشير لسؤال الاكتشاف الأصلي.
 *  - أي معلومة بلا evidence = غير صالحة → validator يرفض.
 *  - Confidence لكل قسم من 0 إلى 100 مع reason عند الانخفاض.
 *  - التفريق بين Fact / Assumption / Suggestion صريح في الأسماء.
 */

/** إشارة لدليل من نموذج الاكتشاف. */
export interface EvidenceRef {
  /** مفتاح السؤال في القالب (id) */
  question_id: string;
  /** نص السؤال — للعرض دون الحاجة لجلب القالب من DB */
  question_label: string;
  /** جزء من إجابة العميل يبرّر الاستنتاج (مقتطف قصير) */
  quote: string;
}

/** ثقة القسم في مجموعه. */
export interface SectionConfidence {
  score: number; // 0..100
  reason: string | null; // لماذا انخفضت الثقة (لو انخفضت)
}

/** عنصر Fact بسيط — بيان مستخرَج من الإجابات. */
export interface EvidenceItem {
  statement: string;
  evidence: EvidenceRef[];
}

/** افتراض مع سبب. */
export interface AssumptionItem {
  statement: string;
  reason: string;
  evidence: EvidenceRef[];
}

/** اقتراح مع تبرير + مستوى ثقة فردي (لأن الاقتراحات أقل يقينًا). */
export interface SuggestionItem {
  title: string;
  rationale: string;
  priority: "high" | "medium" | "low";
  evidence: EvidenceRef[];
}

// ============================================================
// 17 قسمًا — كل قسم = محتوى + ثقة
// ============================================================

export interface ExecutiveSummarySection {
  summary: string; // 4-8 جمل بالعربية
  confidence: SectionConfidence;
  evidence: EvidenceRef[];
}

export interface BusinessModelSection {
  overview: string;
  how_it_works: string;
  value_delivery: string;
  users_description: string;
  confidence: SectionConfidence;
  evidence: EvidenceRef[];
}

export interface StakeholderItem {
  name: string;
  role: string;
  influence: "high" | "medium" | "low";
  evidence: EvidenceRef[];
}
export interface StakeholdersSection {
  items: StakeholderItem[];
  confidence: SectionConfidence;
}

export interface BusinessGoalItem {
  goal: string;
  priority: "high" | "medium" | "low";
  evidence: EvidenceRef[];
}
export interface BusinessGoalsSection {
  items: BusinessGoalItem[];
  confidence: SectionConfidence;
}

export interface FunctionalRequirementsSection {
  items: EvidenceItem[];
  confidence: SectionConfidence;
}

export interface NonFunctionalRequirementsSection {
  performance: EvidenceItem[];
  security: EvidenceItem[];
  scalability: EvidenceItem[];
  availability: EvidenceItem[];
  accessibility: EvidenceItem[];
  compliance: EvidenceItem[];
  confidence: SectionConfidence;
}

export interface RiskItem {
  risk: string;
  cause: string;
  likelihood: "high" | "medium" | "low";
  impact: "high" | "medium" | "low";
  evidence: EvidenceRef[];
}
export interface RisksSection {
  items: RiskItem[];
  confidence: SectionConfidence;
}

export interface AssumptionsSection {
  items: AssumptionItem[];
  confidence: SectionConfidence;
}

export interface MissingInfoItem {
  info: string;
  impact: "high" | "medium" | "low";
  reason: string;
}
export interface MissingInformationSection {
  items: MissingInfoItem[];
  confidence: SectionConfidence;
}

export interface SuggestedFeaturesSection {
  items: SuggestionItem[];
  confidence: SectionConfidence;
}

export interface SuggestedIntegrationsSection {
  items: SuggestionItem[];
  confidence: SectionConfidence;
}

export interface UserRoleItem {
  role: string;
  responsibilities: string[];
  evidence: EvidenceRef[];
}
export interface SuggestedUserRolesSection {
  items: UserRoleItem[];
  confidence: SectionConfidence;
}

export interface KpiItem {
  name: string;
  target_or_direction: string; // مثلاً "≥ 80%" أو "زيادة شهرية"
  goal_link: string; // بربطه بأي goal
  evidence: EvidenceRef[];
}
export interface SuggestedKPIsSection {
  items: KpiItem[];
  confidence: SectionConfidence;
}

export interface UserStoryItem {
  role: string;
  want: string;
  benefit: string;
  priority: "high" | "medium" | "low";
  evidence: EvidenceRef[];
}
export interface SuggestedUserStoriesSection {
  items: UserStoryItem[];
  confidence: SectionConfidence;
}

export interface SuggestedProjectScopeSection {
  in_scope: EvidenceItem[];
  out_of_scope: EvidenceItem[];
  confidence: SectionConfidence;
}

export interface RoadmapPhase {
  phase: string; // "المرحلة 1"، "MVP"، إلخ
  description: string;
  deliverables: string[];
  evidence: EvidenceRef[];
}
export interface SuggestedRoadmapSection {
  phases: RoadmapPhase[];
  confidence: SectionConfidence;
}

export interface MeetingQuestionItem {
  question: string;
  reason: string;
  priority: "high" | "medium" | "low";
}
export interface MeetingQuestionsSection {
  items: MeetingQuestionItem[];
  confidence: SectionConfidence;
}

// ============================================================
// النتيجة النهائية
// ============================================================

export interface DiscoveryAnalysisOutput {
  executive_summary: ExecutiveSummarySection;
  business_model: BusinessModelSection;
  stakeholders: StakeholdersSection;
  business_goals: BusinessGoalsSection;
  functional_requirements: FunctionalRequirementsSection;
  non_functional_requirements: NonFunctionalRequirementsSection;
  risks: RisksSection;
  assumptions: AssumptionsSection;
  missing_information: MissingInformationSection;
  suggested_features: SuggestedFeaturesSection;
  suggested_integrations: SuggestedIntegrationsSection;
  suggested_user_roles: SuggestedUserRolesSection;
  suggested_kpis: SuggestedKPIsSection;
  suggested_user_stories: SuggestedUserStoriesSection;
  suggested_project_scope: SuggestedProjectScopeSection;
  suggested_roadmap: SuggestedRoadmapSection;
  meeting_questions: MeetingQuestionsSection;
}

export const ANALYSIS_SECTIONS = [
  "executive_summary",
  "business_model",
  "stakeholders",
  "business_goals",
  "functional_requirements",
  "non_functional_requirements",
  "risks",
  "assumptions",
  "missing_information",
  "suggested_features",
  "suggested_integrations",
  "suggested_user_roles",
  "suggested_kpis",
  "suggested_user_stories",
  "suggested_project_scope",
  "suggested_roadmap",
  "meeting_questions",
] as const;

export type AnalysisSectionKey = (typeof ANALYSIS_SECTIONS)[number];

export const SECTION_LABELS: Record<AnalysisSectionKey, string> = {
  executive_summary: "الملخص التنفيذي",
  business_model: "نموذج العمل",
  stakeholders: "أصحاب المصلحة",
  business_goals: "أهداف العمل",
  functional_requirements: "المتطلبات الوظيفية",
  non_functional_requirements: "المتطلبات غير الوظيفية",
  risks: "المخاطر",
  assumptions: "الافتراضات",
  missing_information: "معلومات ناقصة",
  suggested_features: "مزايا مقترحة",
  suggested_integrations: "تكاملات مقترحة",
  suggested_user_roles: "أدوار المستخدمين",
  suggested_kpis: "مؤشرات الأداء",
  suggested_user_stories: "قصص المستخدم",
  suggested_project_scope: "نطاق المشروع",
  suggested_roadmap: "خارطة الطريق",
  meeting_questions: "أسئلة الاجتماع القادم",
};

// ============================================================
// نوع صف قاعدة البيانات
// ============================================================

export type DiscoveryAnalysisStatus = "pending" | "running" | "completed" | "failed";

export interface DiscoveryAnalysisRow {
  id: string;
  project_id: string;
  discovery_form_id: string | null;
  discovery_version_hash: string | null;
  status: DiscoveryAnalysisStatus;
  provider: string | null;
  model: string | null;
  started_at: string | null;
  finished_at: string | null;
  execution_ms: number | null;
  input_tokens: number | null;
  output_tokens: number | null;
  total_tokens: number | null;
  estimated_cost_usd: string | number | null;
  retry_count: number;
  error_code: string | null;
  error_message: string | null;
  output: DiscoveryAnalysisOutput | null;
  version: number;
  acknowledged_at: string | null;
  created_by: string | null;
  created_at: string;
  updated_at: string;
}
