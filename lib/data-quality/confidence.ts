/**
 * عتبة الثقة للمرحلة ٣ — **وحدة نقية**.
 *
 * من المواصفة: أي عنصر بثقة أقل من ٩٥٪ يدخل Human Review Queue ولا
 * يُطبَّق تلقائيًا. لا تعديل تلقائي بلا اعتماد المدير إطلاقًا.
 */

export const REVIEW_THRESHOLD = 95;

export function needsReview(confidence: number): boolean {
  return confidence < REVIEW_THRESHOLD;
}

export function clampConfidence(n: number): number {
  if (!Number.isFinite(n)) return 0;
  return Math.max(0, Math.min(100, Math.round(n)));
}
