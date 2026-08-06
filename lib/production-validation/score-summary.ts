import type { ValidationScoreSummary } from "@/lib/types/database";

/**
 * درجات Production Validation — حسابية بالكامل (نفس قرار كل محركات
 * الفحص السابقة: لا نطلب من الـ AI يخترع درجة، الدرجة مبنية على نتائج
 * فعلية: نسبة نجاح الرحلات + درجة كل محور محسوبة من عدد/خطورة Findings).
 * visual_regression_score = null دايمًا في هذه النسخة (Placeholder صريح
 * — لا يدخل في متوسط الدرجة الكلية لأنه مش قياس حقيقي بعد).
 */
export function computeValidationScoreSummary(
  journeySuccessRate: number,
  responsiveScore: number,
  accessibilityScore: number
): ValidationScoreSummary {
  return {
    journey_success_rate: journeySuccessRate,
    responsive_score: responsiveScore,
    accessibility_score: accessibilityScore,
    visual_regression_score: null,
    overall_score: Math.round((journeySuccessRate + responsiveScore + accessibilityScore) / 3),
  };
}
