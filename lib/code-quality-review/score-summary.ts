import type { CodeQualityReviewCategoryKey, CodeQualityScoreSummary } from "@/lib/types/database";

function average(values: number[]): number {
  if (values.length === 0) return 100;
  return Math.round(values.reduce((sum, v) => sum + v, 0) / values.length);
}

/** يبني لوحة درجات Code Quality من درجات المحاور الستة — حسابيًا بالكامل، كل محور بُعد مستقل بذاته. */
export function computeCodeQualityScoreSummary(categoryScores: Record<CodeQualityReviewCategoryKey, number>): CodeQualityScoreSummary {
  const { readability, duplication, error_handling, testing_coverage, naming_consistency, complexity } = categoryScores;

  return {
    readability,
    duplication,
    error_handling,
    testing_coverage,
    naming_consistency,
    complexity,
    overall_code_quality_score: average([readability, duplication, error_handling, testing_coverage, naming_consistency, complexity]),
  };
}
