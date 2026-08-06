import type { MonitoringReviewVerdict, MonitoringReviewVerdictType } from "@/lib/types/database";

/**
 * نقاط ثابتة لكل نوع حكم — الدرجة الإجمالية مُحسوبة بالكود دايمًا،
 * مش بالـ AI مباشرة (نفس تقسيم Brain Review Validation). new_issues_
 * introduced/regression_found بتاخد نقاط سالبة تُقصّ لصفر لأنها أسوأ
 * من "المشكلة لسه موجودة" بس مش أسوأ من الدرجة الكلية.
 */
const VERDICT_POINTS: Record<MonitoringReviewVerdictType, number> = {
  solved_completely: 100,
  performance_improved: 80,
  security_improved: 80,
  solved_partially: 50,
  still_exists: 0,
  new_issues_introduced: -20,
  regression_found: -30,
};

/** بلا أحكام = بلا حادثة اتحكم عليها فعليًا → null (مش صفر، عشان "معدوم" مختلف عن "فشل"). */
export function computeOverallFixScore(verdicts: MonitoringReviewVerdict[]): number | null {
  if (verdicts.length === 0) return null;
  const total = verdicts.reduce((sum, v) => sum + VERDICT_POINTS[v.verdict], 0);
  const average = total / verdicts.length;
  return Math.max(0, Math.min(100, Math.round(average)));
}

/** الحوادث اللي لسه محتاجة جولة Fix Prompts جديدة — أي حكم غير solved_completely. */
export function incidentsNeedingNewFixPrompts(verdicts: MonitoringReviewVerdict[]): string[] {
  return verdicts.filter((v) => v.verdict !== "solved_completely").map((v) => v.incident_id);
}
