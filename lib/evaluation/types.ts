/** NEXVORA Product Evaluation Guide — Types (P9) */

/**
 * فئات تقييم المنتج.
 *
 * تحديث 0106: أُضيفت فئات product/UX-focused (empty_states, error_states,
 * mobile_rtl, ux_clarity, user_outcomes). القيم القديمة (functional,
 * performance, security) تبقى صالحة للسجلّات القديمة لكن لا تُعرض للاختيار
 * في UI السيناريوهات الجديدة (اُنظر NEW_EVAL_CATEGORIES).
 */
export type EvalCategory =
  | "functional" | "usability" | "performance" | "security" | "accessibility" | "other"
  | "empty_states" | "error_states" | "mobile_rtl" | "ux_clarity" | "user_outcomes";
export const EVAL_CATEGORIES: readonly EvalCategory[] = [
  "functional", "usability", "performance", "security", "accessibility", "other",
  "empty_states", "error_states", "mobile_rtl", "ux_clarity", "user_outcomes",
] as const;
/** الفئات الموصى بها للاختيار في UI (تستبعد القيم القديمة engineering-flavored). */
export const NEW_EVAL_CATEGORIES: readonly EvalCategory[] = [
  "usability", "empty_states", "error_states", "mobile_rtl",
  "ux_clarity", "accessibility", "user_outcomes", "other",
] as const;
export const EVAL_CATEGORY_LABELS: Record<EvalCategory, string> = {
  functional: "وظيفي", usability: "قابلية استخدام", performance: "أداء",
  security: "أمن", accessibility: "إتاحة", other: "أخرى",
  empty_states: "الحالات الفارغة", error_states: "حالات الخطأ",
  mobile_rtl: "الموبايل و RTL", ux_clarity: "وضوح تجربة المستخدم",
  user_outcomes: "نتائج المستخدم",
};

export type EvalSeverity = "low" | "medium" | "high" | "critical";
export const EVAL_SEVERITIES: readonly EvalSeverity[] = ["low", "medium", "high", "critical"] as const;
export const EVAL_SEVERITY_LABELS: Record<EvalSeverity, string> = {
  low: "منخفضة", medium: "متوسطة", high: "عالية", critical: "حرجة",
};

/**
 * حالة سيناريو التقييم (0109 migration).
 * القيمة الافتراضية في DB هي 'draft'؛ الاعتماد يجعلها 'approved' حتى يقبلها
 * محلّل Handoff (source-resolvers.ts) ضمن مصادر product_evaluation_guide.
 */
export type EvalScenarioStatus = "draft" | "approved" | "needs_review";
export const EVAL_SCENARIO_STATUSES: readonly EvalScenarioStatus[] = [
  "draft", "approved", "needs_review",
] as const;
export const EVAL_SCENARIO_STATUS_LABELS: Record<EvalScenarioStatus, string> = {
  draft: "مسوّدة", approved: "معتمَد", needs_review: "بحاجة مراجعة",
};

export type EvalRunResult = "pass" | "fail" | "blocked" | "skipped";
export const EVAL_RUN_RESULTS: readonly EvalRunResult[] = ["pass", "fail", "blocked", "skipped"] as const;
export const EVAL_RUN_RESULT_LABELS: Record<EvalRunResult, string> = {
  pass: "نجح", fail: "فشل", blocked: "معطَّل", skipped: "تخطّي",
};

export interface EvalStep {
  order: number;
  action: string;
}

export interface EvaluationScenarioRow {
  id: string;
  projectId: string;
  code: string | null;
  title: string;
  description: string;
  category: EvalCategory;
  severity: EvalSeverity;
  preconditions: string;
  steps: EvalStep[];
  expectedResult: string;
  linkedStoryId: string | null;
  linkedFlowId: string | null;
  tags: string[];
  /**
   * حالة السيناريو. اختيارية للتوافق مع بيانات قبل migration 0109.
   * القيمة الفعلية دائمًا موجودة بعد 0109 (default 'draft').
   */
  status?: EvalScenarioStatus;
  createdAt: string;
  updatedAt: string;
  createdBy: string | null;
}

export interface EvaluationRunRow {
  id: string;
  projectId: string;
  scenarioId: string;
  result: EvalRunResult;
  actualResult: string;
  environment: string;
  runBy: string | null;
  runAt: string;
  notes: string;
}
