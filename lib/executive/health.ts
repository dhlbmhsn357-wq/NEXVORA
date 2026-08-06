/**
 * محرّك صحة الشركة (Company Health Engine) — pure، بدون أي I/O.
 * بياخد أبعاد مُطبّعة (0-100 لكل بُعد) ويحسب درجة صحة موحّدة للشركة
 * كلها بأوزان معلومة. الأرقام الخام بتتجمّع في service.ts من بيانات
 * حقيقية عبر كل المشاريع؛ هنا الوزن والتجميع بس عشان يتقدر يُختبر.
 */

export type HealthBand = "green" | "yellow" | "red";

export interface CompanyHealthDimension {
  key: string;
  label: string;
  /** الدرجة المُطبّعة 0-100 لهذا البُعد. */
  score: number;
  weight: number;
}

export interface CompanyHealthResult {
  score: number;
  band: HealthBand;
  breakdown: CompanyHealthDimension[];
  /** أضعف الأبعاد (score منخفض) — لتوجيه انتباه الإدارة. */
  weakest: CompanyHealthDimension[];
}

/** الأبعاد وأوزانها (المجموع = 1.0). */
export const HEALTH_DIMENSIONS: { key: string; label: string; weight: number }[] = [
  { key: "projectSuccess", label: "نجاح المشاريع", weight: 0.2 },
  { key: "deliveryAccuracy", label: "دقّة التسليم", weight: 0.15 },
  { key: "engineeringQuality", label: "الجودة الهندسية", weight: 0.15 },
  { key: "productionStability", label: "استقرار الإنتاج", weight: 0.15 },
  { key: "supportQuality", label: "جودة الدعم", weight: 0.1 },
  { key: "teamCapacity", label: "طاقة الفريق", weight: 0.1 },
  { key: "automationEfficiency", label: "كفاءة الأتمتة", weight: 0.05 },
  { key: "knowledgeGrowth", label: "نموّ المعرفة", weight: 0.05 },
  { key: "riskControl", label: "التحكّم في المخاطر", weight: 0.05 },
];

export function bandFor(score: number): HealthBand {
  if (score >= 75) return "green";
  if (score >= 50) return "yellow";
  return "red";
}

function clamp(n: number): number {
  if (Number.isNaN(n)) return 0;
  return Math.max(0, Math.min(100, n));
}

/**
 * يحسب درجة صحة الشركة من الأبعاد المُطبّعة. أي بُعد ناقص يُعتبر
 * محايدًا (60) حتى لا يعاقب الشركة على غياب بيانات.
 */
export function computeCompanyHealth(scores: Record<string, number>): CompanyHealthResult {
  const breakdown: CompanyHealthDimension[] = HEALTH_DIMENSIONS.map((d) => ({
    key: d.key,
    label: d.label,
    score: d.key in scores ? clamp(scores[d.key]) : 60,
    weight: d.weight,
  }));

  const weightedSum = breakdown.reduce((acc, d) => acc + d.score * d.weight, 0);
  const totalWeight = breakdown.reduce((acc, d) => acc + d.weight, 0);
  const score = Math.round(totalWeight > 0 ? weightedSum / totalWeight : 60);

  const weakest = [...breakdown].filter((d) => d.score < 60).sort((a, b) => a.score - b.score).slice(0, 3);

  return { score, band: bandFor(score), breakdown, weakest };
}

/** نسبة مئوية آمنة (تتفادى القسمة على صفر). */
export function pct(part: number, total: number): number {
  if (total <= 0) return 0;
  return Math.round((part / total) * 100);
}
