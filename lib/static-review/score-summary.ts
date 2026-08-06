import type { StaticReviewCategoryKey, StaticReviewScoreSummary } from "@/lib/types/database";

function average(values: number[]): number {
  if (values.length === 0) return 100;
  return Math.round(values.reduce((sum, v) => sum + v, 0) / values.length);
}

/**
 * يبني لوحة الدرجات النهائية (Score Summary) من درجات المحاور السبعة —
 * حسابيًا بالكامل، بدون استدعاء AI إضافي (قرار معماري: راجع
 * lib/ai/validation/static-review.ts::computeCategoryScore للسبب). بعض
 * الأبعاد المطلوبة في الـ Spec (Maintainability, Readability, Technical
 * Debt) مش محور فحص منفصل — دي أبعاد مُشتقة (Blend) من المحاور الأقرب
 * لها دلاليًا:
 *   - Maintainability  ← متوسط (Clean Code, SOLID, DRY/KISS, Documentation)
 *   - Readability      ← متوسط (Clean Code, Naming, Documentation)
 *   - Technical Debt   ← متوسط (Clean Code, DRY/KISS, SOLID, AI Code Smell)
 * الباقي (Architecture, SOLID→dry, Naming, Documentation, AI Code
 * Quality) بيرجع درجة محوره مباشرة من غير تعديل.
 */
export function computeScoreSummary(categoryScores: Record<StaticReviewCategoryKey, number>): StaticReviewScoreSummary {
  const { architecture, clean_code, solid, dry_kiss, ai_code_smell, naming, documentation } = categoryScores;

  const maintainability = average([clean_code, solid, dry_kiss, documentation]);
  const readability = average([clean_code, naming, documentation]);
  const technical_debt = average([clean_code, dry_kiss, solid, ai_code_smell]);
  const overall_static_score = average([architecture, clean_code, solid, dry_kiss, ai_code_smell, naming, documentation]);

  return {
    architecture,
    maintainability,
    readability,
    solid,
    dry: dry_kiss,
    naming,
    documentation,
    ai_code_quality: ai_code_smell,
    technical_debt,
    overall_static_score,
  };
}
