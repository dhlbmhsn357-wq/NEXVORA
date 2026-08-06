import type { ArchitectureReviewCategoryKey, ArchitectureScoreSummary } from "@/lib/types/database";

function average(values: number[]): number {
  if (values.length === 0) return 100;
  return Math.round(values.reduce((sum, v) => sum + v, 0) / values.length);
}

/** يبني لوحة درجات Architecture من درجات المحاور الستة — حسابيًا بالكامل، كل محور بُعد مستقل بذاته (بدون تجميع فرعي). */
export function computeArchitectureScoreSummary(categoryScores: Record<ArchitectureReviewCategoryKey, number>): ArchitectureScoreSummary {
  const { layering, coupling, scalability, module_boundaries, dependency_management, api_design } = categoryScores;

  return {
    layering,
    coupling,
    scalability,
    module_boundaries,
    dependency_management,
    api_design,
    overall_architecture_score: average([layering, coupling, scalability, module_boundaries, dependency_management, api_design]),
  };
}
