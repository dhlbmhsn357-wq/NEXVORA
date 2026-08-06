/**
 * درجة صحة المعرفة.
 *
 * الغرض إن الـ PM يبص بصة واحدة ويعرف: قاعدة المعرفة دي جاهزة أقد إيه،
 * وإيه الخطوة اللي فاضلة. الدرجة مركّبة من أربعة أبعاد، وكل بُعد ليه
 * وزن يعكس أثره الحقيقي مش أهميته الشكلية.
 *
 * الوحدة نقية بالكامل.
 */

export interface KnowledgeHealthInput {
  totalSources: number;
  readySources: number;
  failedSources: number;
  totalItems: number;
  enrichedItems: number;
  openGaps: number;
  openConflicts: number;
  appliedProposals: number;
  totalProposals: number;
}

export type HealthLevel = "empty" | "weak" | "fair" | "good" | "strong";

export interface KnowledgeHealth {
  /** 0..100، أو `null` لما مفيش مصادر أصلًا. */
  score: number | null;
  level: HealthLevel;
  /** الخطوة التالية الأوضح — نص عربي جاهز للعرض. */
  nextStep: string;
  breakdown: {
    processing: number;
    enrichment: number;
    integration: number;
    cleanliness: number;
  };
}

function pct(part: number, whole: number): number {
  if (whole <= 0) return 0;
  return Math.max(0, Math.min(100, Math.round((part / whole) * 100)));
}

/**
 * الأوزان:
 *  - المعالجة 30: من غير تحليل المصادر مفيش معرفة أصلًا.
 *  - الإثراء 25: المعرفة غير المترابطة قيمتها أقل بكتير.
 *  - الإدماج 30: المقترح اللي ما دخلش الـ Brain ما أثّرش في أي مخرَج.
 *  - النظافة 15: التعارضات والفجوات المفتوحة بتخصم، لكن وجودها في حد
 *    ذاته مش فشل — هي أسئلة مرصودة، والرصد أحسن من العمى.
 */
export function computeKnowledgeHealth(input: KnowledgeHealthInput): KnowledgeHealth {
  if (input.totalSources === 0) {
    return {
      score: null,
      level: "empty",
      nextStep: "ارفع أول دفعة مستندات لبناء قاعدة معرفة المشروع.",
      breakdown: { processing: 0, enrichment: 0, integration: 0, cleanliness: 0 },
    };
  }

  const processing = pct(input.readySources, input.totalSources);
  const enrichment = input.totalItems === 0 ? 0 : pct(input.enrichedItems, input.totalItems);
  const integration =
    input.totalProposals === 0 ? 0 : pct(input.appliedProposals, input.totalProposals);

  // كل تعارض مفتوح بيخصم 8، وكل فجوة بتخصم 3، بحد أدنى صفر.
  const cleanliness = Math.max(0, 100 - input.openConflicts * 8 - input.openGaps * 3);

  const score = Math.round(
    processing * 0.3 + enrichment * 0.25 + integration * 0.3 + cleanliness * 0.15
  );

  return {
    score,
    level: levelOf(score),
    nextStep: nextStepFor(input, { processing, enrichment, integration }),
    breakdown: { processing, enrichment, integration, cleanliness },
  };
}

function levelOf(score: number): HealthLevel {
  if (score >= 85) return "strong";
  if (score >= 65) return "good";
  if (score >= 40) return "fair";
  return "weak";
}

/**
 * الخطوة التالية بترتيب السلسلة نفسها — مافيش فايدة نقول "اعتمد
 * المقترحات" والمصادر لسه بتتحلّل.
 */
function nextStepFor(
  input: KnowledgeHealthInput,
  parts: { processing: number; enrichment: number; integration: number }
): string {
  if (input.failedSources > 0 && parts.processing < 100) {
    return `${input.failedSources} مصدر فشل تحليله — راجع سببه قبل ما تكمّل.`;
  }
  if (parts.processing < 100) {
    return "التحليل لسه شغّال — استنى انتهاء كل المصادر.";
  }
  if (input.totalItems > 0 && parts.enrichment < 100) {
    return "شغّل الإثراء والربط لدمج المكرّر وبناء شبكة العلاقات.";
  }
  if (input.totalProposals === 0) {
    return "شغّل التوليف لاستخراج قواعد وأدوار ومؤشرات جاهزة للـ Brain.";
  }
  if (parts.integration < 100) {
    const pending = input.totalProposals - input.appliedProposals;
    return `${pending} مقترح بانتظار الاعتماد لإدخاله Project Brain.`;
  }
  if (input.openConflicts > 0) {
    return `${input.openConflicts} تعارض مفتوح يحتاج قرارك.`;
  }
  if (input.openGaps > 0) {
    return `${input.openGaps} فجوة معرفية مفتوحة — اسأل العميل أو ابحث عنها.`;
  }
  return "قاعدة المعرفة مكتملة — كل ما رُفع تم تحليله واعتماده.";
}

export const HEALTH_LEVEL_LABELS: Record<HealthLevel, string> = {
  empty: "لم تبدأ",
  weak: "ضعيفة",
  fair: "متوسطة",
  good: "جيدة",
  strong: "قوية",
};
