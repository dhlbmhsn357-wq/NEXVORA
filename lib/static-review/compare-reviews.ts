import type { StaticReviewFinding } from "@/lib/types/database";

export interface StaticReviewComparison {
  added: StaticReviewFinding[];
  fixed: StaticReviewFinding[];
  remaining: StaticReviewFinding[];
  scoreDiff: number;
}

/**
 * يقارن Findings مراجعتين (بـ finding_key الثابت — راجع computeFindingKey)
 * لحساب Issues Added/Fixed/Remaining + فرق الدرجة الكلية. منطق خالص
 * بدون قراءة/كتابة قاعدة بيانات — يستقبل الـ Findings جاهزة من الكولر.
 */
export function compareStaticReviews(
  oldFindings: StaticReviewFinding[],
  newFindings: StaticReviewFinding[],
  oldOverallScore: number,
  newOverallScore: number
): StaticReviewComparison {
  const oldKeys = new Set(oldFindings.map((f) => f.finding_key));
  const newKeys = new Set(newFindings.map((f) => f.finding_key));

  return {
    added: newFindings.filter((f) => !oldKeys.has(f.finding_key)),
    fixed: oldFindings.filter((f) => !newKeys.has(f.finding_key)),
    remaining: newFindings.filter((f) => oldKeys.has(f.finding_key)),
    scoreDiff: newOverallScore - oldOverallScore,
  };
}
