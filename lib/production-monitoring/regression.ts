/**
 * اكتشاف Regression — منطق حتمي بسيط: مقارنة درجة الصحة الحالية
 * بالفحص السابق مباشرة. أي انخفاض ملموس (أكتر من الحد المسموح)
 * يُعتبر تدهورًا حقيقيًا، مش تقدير AI.
 */
const REGRESSION_HEALTH_DROP_THRESHOLD = 15;

export interface RegressionResult {
  isRegression: boolean;
  healthScoreDiff: number | null;
}

export function detectRegression(currentHealthScore: number, previousHealthScore: number | null): RegressionResult {
  if (previousHealthScore === null) return { isRegression: false, healthScoreDiff: null };
  const diff = currentHealthScore - previousHealthScore;
  return { isRegression: diff <= -REGRESSION_HEALTH_DROP_THRESHOLD, healthScoreDiff: diff };
}
