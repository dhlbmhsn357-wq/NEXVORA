import type { PromptProfile, PromptReadinessResult, PromptReadinessDeduction } from "./types";

/**
 * Prompt Readiness Score — يقيس جاهزية البرومبت **قبل** إرساله للـ AI:
 * هل كتل السياق الأساسية للـ Profile موجودة؟ الدرجة 0..100 = مجموع أوزان
 * المتطلبات المتوفّرة. كل متطلب ناقص بيظهر في deductions مع سبب واضح.
 *
 * Pure وقابل للاختبار: presentKeys = مجموعة مفاتيح كتل السياق المتوفّرة
 * فعليًا (اللي فيها محتوى غير فارغ).
 */
export function computePromptReadiness(
  profile: PromptProfile,
  presentKeys: Set<string>
): PromptReadinessResult {
  const deductions: PromptReadinessDeduction[] = [];
  let score = 0;

  for (const req of profile.readinessRequirements) {
    if (presentKeys.has(req.key)) {
      score += req.weight;
    } else {
      deductions.push({
        key: req.key,
        label: req.label,
        points: req.weight,
        reason: `العنصر «${req.label}» ناقص — البرومبت أضعف بدونه.`,
      });
    }
  }

  return { score: Math.max(0, Math.min(100, score)), deductions };
}
