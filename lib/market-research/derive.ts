/**
 * NEXVORA Market Research + Validation — Pure Derivations (P5)
 * ============================================================
 * دوال نقيّة (بدون I/O) بتشتق مؤشرات جودة من العناصر الخام:
 *   • summarizeMarketResearch      — عدّاد لكل نوع + متوسط ثقة
 *   • summarizeProblemValidation   — عدّاد أدلة + عدد pain points المميّز + متوسط قوة
 *   • deriveValidationReadiness    — نسبة جاهزية التحقق قبل السماح بـ Product Definition
 *   • classifyEvidenceQuality      — تصنيف كل دليل (weak/moderate/strong) من `strength`
 *   • summarizeClassifications     — توزيع تصنيفات المعلومات
 *
 * الاختبارات في derive.test.ts تغطّي حالات الحواف (فاضي/كامل/متوازن/شاذّ).
 */
import type {
  MarketResearchItem,
  MarketResearchItemType,
  ProblemValidationItem,
  EvidenceType,
  InformationClassification,
  InformationClassificationMark,
} from "./types";

// ---------------------------------------------------------------------------
// Market Research summary
// ---------------------------------------------------------------------------
export interface MarketResearchSummary {
  total: number;
  byType: Record<MarketResearchItemType, number>;
  avgConfidence: number;             // 0..100 (0 لو فاضي)
  directCompetitors: number;         // اختصار مفيد للـ UI
  segments: number;
}

const EMPTY_MR_BY_TYPE = (): Record<MarketResearchItemType, number> => ({
  direct_competitor: 0, indirect_competitor: 0, market_trend: 0,
  user_segment: 0, pricing_model: 0, swot: 0, other: 0,
});

export function summarizeMarketResearch(rows: readonly MarketResearchItem[]): MarketResearchSummary {
  const byType = EMPTY_MR_BY_TYPE();
  let confSum = 0;
  for (const r of rows) {
    byType[r.itemType]++;
    confSum += r.confidence;
  }
  return {
    total: rows.length,
    byType,
    avgConfidence: rows.length === 0 ? 0 : Math.round(confSum / rows.length),
    directCompetitors: byType.direct_competitor,
    segments: byType.user_segment,
  };
}

// ---------------------------------------------------------------------------
// Problem Validation summary
// ---------------------------------------------------------------------------
export type EvidenceQuality = "weak" | "moderate" | "strong";

/** يحوّل الـ strength (0..100) لتصنيف بسيط عشان UI. */
export function classifyEvidenceQuality(strength: number): EvidenceQuality {
  if (strength >= 70) return "strong";
  if (strength >= 40) return "moderate";
  return "weak";
}

export interface ProblemValidationSummary {
  total: number;
  distinctPainPoints: number;   // عدد الـ pain points المميّز (unique)
  byEvidenceType: Record<EvidenceType, number>;
  byQuality: Record<EvidenceQuality, number>;
  avgStrength: number;          // 0..100
  strongCount: number;          // اختصار: strength >= 70
}

const EMPTY_EVIDENCE_BY_TYPE = (): Record<EvidenceType, number> => ({
  user_interview: 0, survey: 0, analytics_data: 0, recorded_session: 0,
  direct_observation: 0, internal_document: 0, support_ticket: 0, other: 0,
});

export function summarizeProblemValidation(rows: readonly ProblemValidationItem[]): ProblemValidationSummary {
  const byEvidenceType = EMPTY_EVIDENCE_BY_TYPE();
  const byQuality: Record<EvidenceQuality, number> = { weak: 0, moderate: 0, strong: 0 };
  const pains = new Set<string>();
  let strengthSum = 0;
  for (const r of rows) {
    byEvidenceType[r.evidenceType]++;
    const q = classifyEvidenceQuality(r.strength);
    byQuality[q]++;
    if (r.painPoint.trim()) pains.add(r.painPoint.trim().toLowerCase());
    strengthSum += r.strength;
  }
  return {
    total: rows.length,
    distinctPainPoints: pains.size,
    byEvidenceType,
    byQuality,
    avgStrength: rows.length === 0 ? 0 : Math.round(strengthSum / rows.length),
    strongCount: byQuality.strong,
  };
}

// ---------------------------------------------------------------------------
// Validation Readiness — بوّابة قبل السماح بـ Product Definition
// ---------------------------------------------------------------------------
/**
 * قواعد الجاهزية (تُطبَّق بشفافية للمستخدم في الـ UI):
 *   1. لا يقل عن 3 pain points مميّزة  — 30 نقطة
 *   2. لا يقل عن 5 أدلة (evidence)      — 30 نقطة
 *   3. متوسط قوّة الأدلة ≥ 60           — 25 نقطة
 *   4. تنوّع مصادر (≥ 3 evidence types) — 15 نقطة
 * المجموع = 100. لا نستخدم "کل شيء أو لا شيء" لأن الفريق قد يبني تدريجيًا.
 */
export interface ValidationReadiness {
  score: number;                          // 0..100
  ready: boolean;                         // score >= 70 = جاهز
  checks: {
    distinctPainPointsOk: boolean;
    minEvidenceOk: boolean;
    avgStrengthOk: boolean;
    diversityOk: boolean;
  };
  breakdown: {
    distinctPainPoints: number;
    totalEvidence: number;
    avgStrength: number;
    evidenceTypeCount: number;
  };
}

const READINESS_THRESHOLD = 70;

export function deriveValidationReadiness(
  rows: readonly ProblemValidationItem[]
): ValidationReadiness {
  const s = summarizeProblemValidation(rows);
  const evidenceTypeCount = Object.values(s.byEvidenceType).filter((n) => n > 0).length;

  const checks = {
    distinctPainPointsOk: s.distinctPainPoints >= 3,
    minEvidenceOk: s.total >= 5,
    avgStrengthOk: s.avgStrength >= 60,
    diversityOk: evidenceTypeCount >= 3,
  };

  let score = 0;
  if (checks.distinctPainPointsOk) score += 30;
  if (checks.minEvidenceOk)        score += 30;
  if (checks.avgStrengthOk)        score += 25;
  if (checks.diversityOk)          score += 15;

  return {
    score,
    ready: score >= READINESS_THRESHOLD,
    checks,
    breakdown: {
      distinctPainPoints: s.distinctPainPoints,
      totalEvidence: s.total,
      avgStrength: s.avgStrength,
      evidenceTypeCount,
    },
  };
}

// ---------------------------------------------------------------------------
// Info Classification summary
// ---------------------------------------------------------------------------
export interface ClassificationSummary {
  total: number;
  byClassification: Record<InformationClassification, number>;
  /** نسبة verified من الإجمالي (0..100). فاضي = 0. */
  verifiedRatio: number;
}

const EMPTY_CLASS_MAP = (): Record<InformationClassification, number> => ({
  unclassified: 0, legacy: 0, needs_review: 0, verified: 0,
});

export function summarizeClassifications(
  rows: readonly InformationClassificationMark[]
): ClassificationSummary {
  const byClassification = EMPTY_CLASS_MAP();
  for (const r of rows) byClassification[r.classification]++;
  return {
    total: rows.length,
    byClassification,
    verifiedRatio: rows.length === 0
      ? 0
      : Math.round((byClassification.verified / rows.length) * 100),
  };
}
