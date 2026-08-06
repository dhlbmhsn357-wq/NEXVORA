/**
 * مقارنة عامة بين نتائج مراجعتين (Versioning) — بيُستخدم من Security
 * Review وDatabase Review (Phase 12.3) وممكن أي محرك تدقيق قادم كمان،
 * لأن منطق المقارنة (Added/Fixed/Remaining + فرق الدرجة) مطابق تمامًا
 * بغض النظر عن شكل الـ Finding التفصيلي — بيعتمد بس على finding_key.
 */

export interface PhaseAuditComparison<T> {
  added: T[];
  fixed: T[];
  remaining: T[];
  scoreDiff: number;
}

export function comparePhaseAuditFindings<T extends { finding_key: string }>(
  oldFindings: T[],
  newFindings: T[],
  oldOverallScore: number,
  newOverallScore: number
): PhaseAuditComparison<T> {
  const oldKeys = new Set(oldFindings.map((f) => f.finding_key));
  const newKeys = new Set(newFindings.map((f) => f.finding_key));

  return {
    added: newFindings.filter((f) => !oldKeys.has(f.finding_key)),
    fixed: oldFindings.filter((f) => !newKeys.has(f.finding_key)),
    remaining: newFindings.filter((f) => oldKeys.has(f.finding_key)),
    scoreDiff: newOverallScore - oldOverallScore,
  };
}
