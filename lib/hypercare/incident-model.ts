/**
 * نموذج الحوادث (Incident Model) — **وحدة نقية بلا I/O**.
 *
 * يحوّل شذوذًا مكتشفًا إلى مسودّة حادثة: خطورة، أثر، وحدات متأثّرة، حلّ
 * مقترح، ثقة. حتمي — يُثريه الذكاء الاصطناعي بجذر السبب.
 */

import type { Anomaly, IncidentDraft, AnomalyKind } from "./hypercare-types";

const AFFECTED: Record<AnomalyKind, string[]> = {
  performance_drop: ["قاعدة البيانات", "التقارير", "لوحات المؤشّرات"],
  error_spike: ["الخدمات (API)", "سير العمل"],
  slow_queries: ["قاعدة البيانات", "الفهارس", "التقارير"],
  broken_workflow: ["سير العمل", "الاعتمادات", "الإشعارات"],
  business_anomaly: ["المبيعات", "المحاسبة", "التقارير"],
  data_anomaly: ["البيانات", "التقارير"],
  user_behavior_change: ["المستخدمون", "الواجهة"],
};

const SOLUTION: Record<AnomalyKind, string> = {
  performance_drop: "افحص أحمال قاعدة البيانات والفهارس، وفعّل التخزين المؤقّت.",
  error_spike: "افحص سجلّات الأخطاء وحدّد أكثر Endpoint فشلًا وأصلحه.",
  slow_queries: "أضف/راجع الفهارس على الاستعلامات البطيئة، وقسّم التقارير الثقيلة.",
  broken_workflow: "أعِد تشغيل العمّال/الطابور وتحقّق من صحّة السلاسل الخلفية.",
  business_anomaly: "راجع مع القسم المعني هل الهبوط حقيقي أم خطأ بيانات/تكامل.",
  data_anomaly: "قارن مع النسخة الاحتياطية وتحقّق من سلامة التحويل.",
  user_behavior_change: "راجع تغيّرات الواجهة/الصلاحيات التي قد تفسّر التغيّر.",
};

export function draftIncident(a: Anomaly): IncidentDraft {
  const impactMap = { critical: "أثر حرِج على التشغيل", high: "أثر مرتفع", medium: "أثر متوسّط", low: "أثر محدود" };
  return {
    title: `${a.label}: ${a.description}`.slice(0, 140),
    severity: a.severity,
    impact: impactMap[a.severity],
    affectedModules: AFFECTED[a.kind] ?? [],
    suggestedSolution: SOLUTION[a.kind] ?? "مراجعة يدوية.",
    // الثقة أعلى للانحرافات الأوضح.
    confidence: Math.min(95, 50 + Math.min(45, Math.abs(a.deviationPercent))),
    detectedBy: "rule",
  };
}

/** بصمة إسقاط تكرار الحادثة (نفس المقياس + الخطورة). */
export function incidentDedupeKey(a: Anomaly): string {
  return `${a.kind}:${a.metric}:${a.severity}`;
}
