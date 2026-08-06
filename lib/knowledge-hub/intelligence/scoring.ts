/**
 * درجات النضج والجاهزية — **وحدة نقية بلا I/O**.
 *
 * ## الفلسفة
 *
 * «هل المشروع جاهز؟» سؤال له إجابة مركّبة لا رقم واحد. بنحسب ثلاث
 * درجات متمايزة، كل واحدة بتجاوب على سؤال مختلف:
 *
 * - **النضج** (Maturity): قد إيه فهمنا المشروع؟ — جودة المعرفة + اكتمالها
 *   + تغطية الأنواع المهيكلة.
 * - **جاهزية المشروع** (Readiness): قد إيه نقدر نبدأ التنفيذ؟ — تغطية
 *   المتطلبات + حسم التعارضات + معالجة المخاطر الحرجة + سدّ الفجوات.
 * - **جاهزية المعمار** (Architecture Readiness): قد إيه المعمار واضح؟ —
 *   الكيانات وعلاقاتها + سير العمل + القرارات المبرَّرة + غياب المخاطر
 *   المعمارية.
 *
 * كل الدرجات مشتقّة — القاعدة بتخزّن اللقطة، والاشتقاق منطق أعمال
 * يتغيّر مع فهمنا، فمكانه الكود لا SQL.
 */

export interface IntelligenceSignals {
  /** جودة المعرفة الكلية ٠–١٠٠ (من computeQuality). */
  qualityOverall: number;
  /** اكتمال المجالات الكلي ٠–١٠٠ (من aggregateCompleteness). */
  completenessOverall: number;
  counts: {
    entities: number;
    relations: number;
    rules: number;
    workflows: number;
    requirements: number;
    decisions: number;
    risks: number;
    items: number;
  };
  openConflicts: number;
  openGaps: number;
  criticalRisks: number;
  /** قرارات لها سبب مذكور — مؤشّر على «ليه» المعمار. */
  decisionsWithRationale: number;
  /** قدرات مؤسسية ناقصة (من domain-checklist). */
  missingCapabilities: number;
}

export interface ScoreBreakdown {
  label: string;
  value: number; // 0–100
  weight: number; // 0–1
}

export interface IntelligenceScores {
  maturity: number;
  projectReadiness: number;
  architectureReadiness: number;
  requirementCoverage: number;
  breakdown: {
    maturity: ScoreBreakdown[];
    projectReadiness: ScoreBreakdown[];
    architectureReadiness: ScoreBreakdown[];
  };
}

function clamp(n: number): number {
  if (!Number.isFinite(n)) return 0;
  return Math.max(0, Math.min(100, Math.round(n)));
}

/** يحوّل عدّادًا لدرجة تشبّع: صفر=٠، عند الهدف فأعلى=١٠٠، خطّي بينهما. */
function saturate(count: number, target: number): number {
  if (target <= 0) return 100;
  return Math.max(0, Math.min(100, (count / target) * 100));
}

/** الوزن المرجَّح لمجموعة أبعاد. */
function weighted(dims: ScoreBreakdown[]): number {
  const totalWeight = dims.reduce((s, d) => s + d.weight, 0) || 1;
  return clamp(dims.reduce((s, d) => s + d.value * d.weight, 0) / totalWeight);
}

/**
 * عقوبة نسبية: كل عنصر مفتوح (تعارض/فجوة) بيخصم، لكن التأثير بيتشبّع —
 * أول تعارض أخطر من العاشر. النتيجة معامل ٠–١ يُضرب في الدرجة.
 */
function opennessPenalty(openCount: number, halfLife: number): number {
  // 1 عند صفر، بيقترب من ٠ مع الزيادة. عند halfLife يبقى ٠٫٥.
  return halfLife / (halfLife + Math.max(0, openCount));
}

export function computeIntelligenceScores(signals: IntelligenceSignals): IntelligenceScores {
  const c = signals.counts;

  // بوّابة المحتوى: مشروع بلا معرفة مهيكلة لا يستحق درجة من «غياب
  // المشاكل». «مفيش تعارضات» في مشروع فارغ ليست جاهزية — هي فراغ.
  // الأبعاد المبنية على الغياب (حسم المخاطر، سدّ الفجوات، وضوح القدرات،
  // استقرار المخاطر) تُصفَّر بلا محتوى.
  const structuredTotal = c.entities + c.rules + c.workflows + c.requirements + c.decisions;
  const presence = structuredTotal === 0 ? 0 : 1;

  // --- تغطية المتطلبات: الاكتمال الكلي هو الأساس المباشر ---
  const requirementCoverage = clamp(signals.completenessOverall);

  // --- النضج ---
  const maturityDims: ScoreBreakdown[] = [
    { label: "جودة المعرفة", value: clamp(signals.qualityOverall), weight: 0.3 },
    { label: "اكتمال المجالات", value: clamp(signals.completenessOverall), weight: 0.3 },
    {
      label: "تغطية الأنواع المهيكلة",
      value: clamp(
        (saturate(c.entities, 8) +
          saturate(c.rules, 4) +
          saturate(c.workflows, 2) +
          saturate(c.requirements, 5) +
          saturate(c.decisions, 3)) /
          5
      ),
      weight: 0.25,
    },
    {
      // كثافة العلاقات: معرفة مترابطة أنضج من قائمة معزولة.
      label: "ترابط المعرفة",
      value: saturate(c.relations, Math.max(4, c.entities)),
      weight: 0.15,
    },
  ];
  const maturity = weighted(maturityDims);

  // --- جاهزية المشروع ---
  const readinessBase: ScoreBreakdown[] = [
    { label: "تغطية المتطلبات", value: requirementCoverage, weight: 0.4 },
    {
      label: "وضوح القدرات",
      // كل قدرة مؤسسية ناقصة تخصم — سقف الخصم عند ٦ قدرات.
      value: clamp(presence * 100 * opennessPenalty(signals.missingCapabilities, 6)),
      weight: 0.25,
    },
    {
      label: "حسم المخاطر الحرجة",
      value: clamp(presence * 100 * opennessPenalty(signals.criticalRisks, 3)),
      weight: 0.2,
    },
    {
      label: "سدّ الفجوات",
      value: clamp(presence * 100 * opennessPenalty(signals.openGaps, 8)),
      weight: 0.15,
    },
  ];
  // التعارضات المفتوحة عقوبة شاملة على الجاهزية كلها — معرفة متناقضة
  // لا يُبنى عليها.
  const conflictFactor = opennessPenalty(signals.openConflicts, 5);
  const projectReadiness = clamp(weighted(readinessBase) * conflictFactor);

  // --- جاهزية المعمار ---
  const archDims: ScoreBreakdown[] = [
    {
      label: "الكيانات والعلاقات",
      value: clamp((saturate(c.entities, 8) + saturate(c.relations, 6)) / 2),
      weight: 0.3,
    },
    { label: "سير العمل الموثَّق", value: saturate(c.workflows, 3), weight: 0.25 },
    {
      label: "القرارات المبرَّرة",
      value: c.decisions === 0 ? 0 : clamp((signals.decisionsWithRationale / c.decisions) * 100),
      weight: 0.25,
    },
    {
      // غياب المخاطر الحرجة المعمارية يرفع الجاهزية — لكن فقط لو فيه
      // معمار أصلًا؛ مشروع فارغ ليس «مستقرًا»، هو فارغ.
      label: "استقرار المخاطر",
      value: clamp(presence * 100 * opennessPenalty(signals.criticalRisks, 3)),
      weight: 0.2,
    },
  ];
  const architectureReadiness = weighted(archDims);

  return {
    maturity,
    projectReadiness,
    architectureReadiness,
    requirementCoverage,
    breakdown: {
      maturity: maturityDims,
      projectReadiness: readinessBase,
      architectureReadiness: archDims,
    },
  };
}

/** تصنيف نصّي للدرجة — للعرض. */
export function scoreLevel(score: number): "excellent" | "good" | "fair" | "weak" {
  if (score >= 85) return "excellent";
  if (score >= 65) return "good";
  if (score >= 40) return "fair";
  return "weak";
}

export const SCORE_LEVEL_LABELS: Record<ReturnType<typeof scoreLevel>, string> = {
  excellent: "ممتاز",
  good: "جيّد",
  fair: "مقبول",
  weak: "ضعيف",
};
