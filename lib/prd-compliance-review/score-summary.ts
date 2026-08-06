import type { PrdComplianceReviewCategoryKey, PrdComplianceScoreSummary } from "@/lib/types/database";

function average(values: number[]): number {
  if (values.length === 0) return 100;
  return Math.round(values.reduce((sum, v) => sum + v, 0) / values.length);
}

/** يبني لوحة درجات PRD Compliance من درجات المحاور الأربعة — حسابيًا بالكامل. */
export function computePrdComplianceScoreSummary(categoryScores: Record<PrdComplianceReviewCategoryKey, number>): PrdComplianceScoreSummary {
  const { functional_requirements_coverage, non_functional_requirements, scope_adherence, acceptance_criteria } = categoryScores;

  return {
    functional_requirements_coverage,
    non_functional_requirements,
    scope_adherence,
    acceptance_criteria,
    overall_prd_compliance_score: average([functional_requirements_coverage, non_functional_requirements, scope_adherence, acceptance_criteria]),
  };
}
