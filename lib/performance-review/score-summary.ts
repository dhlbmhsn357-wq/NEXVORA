import type { PerformanceReviewCategoryKey, PerformanceScoreSummary } from "@/lib/types/database";

function average(values: number[]): number {
  if (values.length === 0) return 100;
  return Math.round(values.reduce((sum, v) => sum + v, 0) / values.length);
}

/** يبني لوحة درجات Performance من درجات المحاور الستة — حسابيًا بالكامل، كل محور بُعد مستقل بذاته. */
export function computePerformanceScoreSummary(categoryScores: Record<PerformanceReviewCategoryKey, number>): PerformanceScoreSummary {
  const { query_performance, bundle_size, caching, render_performance, n_plus_one, async_patterns } = categoryScores;

  return {
    query_performance,
    bundle_size,
    caching,
    render_performance,
    n_plus_one,
    async_patterns,
    overall_performance_score: average([query_performance, bundle_size, caching, render_performance, n_plus_one, async_patterns]),
  };
}
