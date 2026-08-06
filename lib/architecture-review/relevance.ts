import type { ArchitectureReviewCategoryKey } from "@/lib/types/database";

/** نفس فكرة lib/security-review/relevance.ts — محاور معمارية عامة (coupling/scalability) بتُفحص دايمًا لأنها ممكن تظهر في أي ملف كود. */
const RELEVANCE_PATTERNS: Record<ArchitectureReviewCategoryKey, RegExp | null> = {
  layering: null,
  coupling: null,
  scalability: null,
  module_boundaries: /lib\/|app\//i,
  dependency_management: /package\.json$|import |require\(/i,
  api_design: /route\.ts$|actions?\.ts$|api\//i,
};

export function isFileRelevantToArchitectureCategory(categoryKey: ArchitectureReviewCategoryKey, filePath: string): boolean {
  const pattern = RELEVANCE_PATTERNS[categoryKey];
  if (pattern === null) return true;
  return pattern.test(filePath);
}

export function isCategoryRelevantToChangedFiles(categoryKey: ArchitectureReviewCategoryKey, changedPaths: string[]): boolean {
  return changedPaths.some((p) => isFileRelevantToArchitectureCategory(categoryKey, p));
}
