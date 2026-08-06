import type { PerformanceReviewCategoryKey } from "@/lib/types/database";

/**
 * نفس فكرة lib/database-review/relevance.ts — المطابقة هنا على اسم/مسار
 * الملف بس (فحص سريع قبل استدعاء AI)، مش محتواه. أغلب المحاور
 * (query_performance/caching/n_plus_one/async_patterns) مستثناة عمدًا
 * (null) لأن كودها ممكن يظهر في أي ملف؛ render_performance/bundle_size
 * بس ليهم مسار مميز فعليًا (ملفات Component).
 */
const RELEVANCE_PATTERNS: Record<PerformanceReviewCategoryKey, RegExp | null> = {
  query_performance: null,
  bundle_size: /\.tsx?$/i,
  caching: null,
  render_performance: /\.tsx$/i,
  n_plus_one: null,
  async_patterns: null,
};

export function isFileRelevantToPerformanceCategory(categoryKey: PerformanceReviewCategoryKey, filePath: string): boolean {
  const pattern = RELEVANCE_PATTERNS[categoryKey];
  if (pattern === null) return true;
  return pattern.test(filePath);
}

export function isCategoryRelevantToChangedFiles(categoryKey: PerformanceReviewCategoryKey, changedPaths: string[]): boolean {
  return changedPaths.some((p) => isFileRelevantToPerformanceCategory(categoryKey, p));
}
