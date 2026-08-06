/**
 * درجات الثقة وعتبة المراجعة — **وحدة نقية بلا I/O**.
 *
 * من المواصفة: أي Mapping بثقة أقل من ٩٠٪ يدخل Review Queue ولا يُعتمد
 * تلقائيًا. هذه الوحدة المصدر الموحّد للعتبة وتصنيف الثقة.
 */

export const AUTO_APPROVE_THRESHOLD = 90;

export type ConfidenceBand = "high" | "medium" | "low";

export function confidenceBand(score: number): ConfidenceBand {
  if (score >= AUTO_APPROVE_THRESHOLD) return "high";
  if (score >= 60) return "medium";
  return "low";
}

/** هل يحتاج مراجعة بشرية؟ (كل ما دون العتبة). */
export function needsReview(score: number): boolean {
  return score < AUTO_APPROVE_THRESHOLD;
}

export function clampConfidence(n: number): number {
  if (!Number.isFinite(n)) return 0;
  return Math.max(0, Math.min(100, Math.round(n)));
}
