import type { TransformRule } from "./rule-types";
import type { BusinessRule } from "./business-rules";
import { countRulesByKind } from "./rule-generator";
import { needsReview, clampConfidence } from "./confidence";

/**
 * تقرير التحويل — **وحدة نقية بلا I/O**.
 *
 * يجمّع القواعد وقواعد العمل في تقرير: تغطية، تعقيد، متوسّط ثقة، مخاطر،
 * تحذيرات، وتقدير أداء. المرجع الرسمي لمرحلة المحاكاة (Phase 5).
 */

export interface TransformationReport {
  stats: {
    rules: number;
    businessRules: number;
    calculated: number;
    lookups: number;
    reviewQueue: number;
    approved: number;
    confidenceAvg: number;
  };
  ruleCounts: Record<string, number>;
  coverage: number; // نسبة الحقول الهدف المغطّاة بقاعدة
  complexity: "low" | "medium" | "high" | "very_high";
  performanceEstimate: string;
  risks: string[];
  warnings: string[];
  recommendations: string[];
}

export function buildReport(rules: TransformRule[], businessRules: BusinessRule[], targetFieldCount: number): TransformationReport {
  const enabled = rules.filter((r) => r.enabled);
  const ruleCounts = countRulesByKind(enabled);
  const calculated = enabled.filter((r) => r.kind === "calculated" || r.kind === "formula").length;
  const lookups = enabled.filter((r) => r.kind === "reference_lookup").length;
  const reviewQueue = enabled.filter((r) => needsReview(r.confidence)).length;
  const approved = enabled.filter((r) => !needsReview(r.confidence)).length;
  const confVals = enabled.map((r) => r.confidence);
  const confidenceAvg = confVals.length ? clampConfidence(confVals.reduce((s, v) => s + v, 0) / confVals.length) : 0;

  const coveredTargets = new Set(enabled.map((r) => r.targetField)).size;
  const coverage = targetFieldCount > 0 ? Math.round((coveredTargets / targetFieldCount) * 100) : 0;

  const complexity = estimateComplexity(enabled.length, businessRules.length, calculated + lookups);
  const risks: string[] = [];
  const warnings: string[] = [];

  if (lookups > 0) risks.push(`${lookups} قاعدة بحث مرجعي — تتطلّب جداول مرجعية متاحة وقت التنفيذ.`);
  const formulaErrors = enabled.filter((r) => (r.kind === "formula" || r.kind === "calculated") && !String(r.config?.expression ?? "").trim());
  if (formulaErrors.length > 0) warnings.push(`${formulaErrors.length} حقل محسوب بلا معادلة محدّدة.`);
  if (reviewQueue > 0) warnings.push(`${reviewQueue} قاعدة بثقة أقل من ٩٠٪ تحتاج مراجعة المدير.`);
  if (coverage < 80) warnings.push(`تغطية التحويل ${coverage}٪ — بعض الحقول الهدف بلا قاعدة.`);

  const recommendations: string[] = [];
  if (reviewQueue > 0) recommendations.push("راجع القواعد منخفضة الثقة واعتمدها قبل المحاكاة.");
  if (coverage < 100) recommendations.push("أضف قواعد للحقول غير المغطّاة أو حدّد قيمًا افتراضية.");
  if (recommendations.length === 0) recommendations.push("المحرّك جاهز — انتقل للمحاكاة (Phase 5) بعد اعتماد سريع.");

  return {
    stats: { rules: enabled.length, businessRules: businessRules.length, calculated, lookups, reviewQueue, approved, confidenceAvg },
    ruleCounts,
    coverage,
    complexity,
    performanceEstimate: estimatePerformance(enabled.length, calculated, lookups),
    risks,
    warnings,
    recommendations,
  };
}

function estimateComplexity(rules: number, businessRules: number, heavy: number): TransformationReport["complexity"] {
  const score = rules + businessRules * 1.5 + heavy * 2;
  if (score >= 120) return "very_high";
  if (score >= 60) return "high";
  if (score >= 25) return "medium";
  return "low";
}

function estimatePerformance(rules: number, calculated: number, lookups: number): string {
  // تقدير تقريبي: العمليات البسيطة سريعة، الحسابية/البحث أبطأ.
  const perRowMicros = rules * 2 + calculated * 8 + lookups * 15;
  const per100k = Math.round((perRowMicros * 100_000) / 1_000_000);
  return `~${per100k} ثانية لكل ١٠٠ ألف صفّ (تقديري، على دفعات).`;
}
