/**
 * إغلاق المشروع ورضا العميل (Project Closure) — **وحدة نقية بلا I/O**.
 *
 * بعد انتهاء Hypercare، يُبنى تقرير إغلاق شامل: ملخّص الترحيل + Hypercare +
 * الحوادث + الحلول + الدروس + المعرفة المضافة + التحسينات + الصحة النهائية +
 * رضا الأعمال والعميل. لا يُغلَق إلا بلا حوادث حرجة مفتوحة.
 */

import type { ClosureInput, ClosureReport } from "./hypercare-types";

export function buildClosure(input: ClosureInput, criticalOpen: number): ClosureReport {
  const resolveRate = input.totalIncidents > 0 ? Math.round((input.resolvedIncidents / input.totalIncidents) * 100) : 100;
  const businessSatisfaction = Math.round((input.goLiveScore + input.finalHealthScore) / 2);

  const highlights: string[] = [
    `Hypercare لمدّة ${input.hypercareDays} يومًا.`,
    `حوادث: ${input.totalIncidents} (حُلّ ${resolveRate}٪).`,
    `تحسينات مُطبَّقة: ${input.optimizationsApplied} · معرفة مضافة: ${input.knowledgeAdded}.`,
    `الصحة النهائية: ${input.finalHealthScore}/100.`,
  ];
  if (criticalOpen > 0) highlights.push(`تحذير: ${criticalOpen} حادثة حرجة مفتوحة — لا يُغلَق قبل حلّها.`);

  return {
    migrationSummary: `اكتمل الترحيل والاعتماد الرسمي (درجة الإطلاق ${input.goLiveScore}/100).`,
    hypercareSummary: `مراقبة ${input.hypercareDays} يومًا: ${input.totalIncidents} حادثة، حُلّ ${resolveRate}٪، ${input.optimizationsApplied} تحسينًا.`,
    finalHealthScore: input.finalHealthScore,
    businessSatisfaction,
    customerSatisfaction: input.satisfactionScore,
    closed: criticalOpen === 0,
    highlights,
  };
}
