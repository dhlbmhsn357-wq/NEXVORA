import type { SecurityReviewCategoryKey, SecurityScoreSummary } from "@/lib/types/database";

function average(values: number[]): number {
  if (values.length === 0) return 100;
  return Math.round(values.reduce((sum, v) => sum + v, 0) / values.length);
}

/**
 * يبني لوحة درجات Security Audit من درجات المحاور السبعة — حسابيًا
 * بالكامل (نفس قرار Static Review: راجع lib/ai/validation/phase-audit-findings.ts::computePhaseCategoryScore).
 * "API Security" بُعد مُشتق (متوسط api_security + input_validation)
 * لأن الاثنين بيغطوا نفس المساحة عمليًا (Input Validation جزء أساسي من
 * أمان الـ API). الباقي بيرجع درجة محوره مباشرة.
 */
export function computeSecurityScoreSummary(categoryScores: Record<SecurityReviewCategoryKey, number>): SecurityScoreSummary {
  const { authentication, authorization, rls, api_security, input_validation, secrets, environment } = categoryScores;

  return {
    authentication,
    authorization,
    rls,
    api_security: average([api_security, input_validation]),
    secrets_management: secrets,
    configuration: environment,
    overall_security_score: average([authentication, authorization, rls, api_security, input_validation, secrets, environment]),
  };
}
