import type { PrdComplianceReviewCategoryKey } from "@/lib/types/database";

/**
 * على عكس باقي المحركات، محاور PRD Compliance بتقارن الكود بمحتوى PRD
 * نفسه — أي ملف كود متغيّر ممكن يكون له أثر على أي بند من بنود PRD،
 * فمفيش نمط استبعاد ذكي هنا (كل المحاور دايمًا relevant).
 */
const RELEVANCE_PATTERNS: Record<PrdComplianceReviewCategoryKey, null> = {
  functional_requirements_coverage: null,
  non_functional_requirements: null,
  scope_adherence: null,
  acceptance_criteria: null,
};

export function isFileRelevantToPrdComplianceCategory(categoryKey: PrdComplianceReviewCategoryKey, filePath: string): boolean {
  const pattern = RELEVANCE_PATTERNS[categoryKey];
  if (pattern === null) return true;
  return (pattern as RegExp).test(filePath);
}

export function isCategoryRelevantToChangedFiles(categoryKey: PrdComplianceReviewCategoryKey, changedPaths: string[]): boolean {
  return changedPaths.some((p) => isFileRelevantToPrdComplianceCategory(categoryKey, p));
}
