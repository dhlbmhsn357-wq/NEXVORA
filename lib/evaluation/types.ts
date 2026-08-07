/** NEXVORA Product Evaluation Guide — Types (P9) */

export type EvalCategory =
  | "functional" | "usability" | "performance" | "security" | "accessibility" | "other";
export const EVAL_CATEGORIES: readonly EvalCategory[] = [
  "functional", "usability", "performance", "security", "accessibility", "other",
] as const;
export const EVAL_CATEGORY_LABELS: Record<EvalCategory, string> = {
  functional: "وظيفي", usability: "قابلية استخدام", performance: "أداء",
  security: "أمن", accessibility: "إتاحة", other: "أخرى",
};

export type EvalSeverity = "low" | "medium" | "high" | "critical";
export const EVAL_SEVERITIES: readonly EvalSeverity[] = ["low", "medium", "high", "critical"] as const;
export const EVAL_SEVERITY_LABELS: Record<EvalSeverity, string> = {
  low: "منخفضة", medium: "متوسطة", high: "عالية", critical: "حرجة",
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
