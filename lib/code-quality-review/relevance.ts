import type { CodeQualityReviewCategoryKey } from "@/lib/types/database";

/**
 * نفس فكرة lib/security-review/relevance.ts — كل محاور جودة الكود عامة
 * وممكن تظهر في أي ملف كود (بما فيها testing_coverage: بيتحقق هل الكود
 * المتغيّر — إنتاج أو اختبار — مغطّى بشكل كافي، مش مقصور على ملفات
 * *.test.ts بس).
 */
const RELEVANCE_PATTERNS: Record<CodeQualityReviewCategoryKey, RegExp | null> = {
  readability: null,
  duplication: null,
  error_handling: null,
  testing_coverage: null,
  naming_consistency: null,
  complexity: null,
};

export function isFileRelevantToCodeQualityCategory(categoryKey: CodeQualityReviewCategoryKey, filePath: string): boolean {
  const pattern = RELEVANCE_PATTERNS[categoryKey];
  if (pattern === null) return true;
  return pattern.test(filePath);
}

export function isCategoryRelevantToChangedFiles(categoryKey: CodeQualityReviewCategoryKey, changedPaths: string[]): boolean {
  return changedPaths.some((p) => isFileRelevantToCodeQualityCategory(categoryKey, p));
}
