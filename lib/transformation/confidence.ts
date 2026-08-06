/**
 * عتبة الثقة والاعتماد — **وحدة نقية**.
 *
 * قاعدة بثقة أقل من العتبة تدخل مراجعة المدير قبل استخدامها في المحاكاة/
 * الترحيل. لا تنفيذ على Production في هذه المرحلة أصلًا.
 */

export const REVIEW_THRESHOLD = 90;

export function needsReview(confidence: number): boolean {
  return confidence < REVIEW_THRESHOLD;
}

export function clampConfidence(n: number): number {
  if (!Number.isFinite(n)) return 0;
  return Math.max(0, Math.min(100, Math.round(n)));
}
