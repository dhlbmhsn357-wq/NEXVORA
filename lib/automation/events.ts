/**
 * ناقل الأحداث — تعريف أنواع الأحداث المركزية للمنصة (المرحلة الخامسة).
 * أي فعل مهم في المنصة بيتحوّل لحدث معياري قابل لإعادة الاستخدام، والـ
 * Workflow Engine بيستمع للأحداث دي ويطلق سلاسل الأتمتة. الملف ده pure
 * (بدون أي I/O) عشان يتقدر يُختبر ويُستورد من client/server بأمان.
 */

export const EVENT_TYPES = {
  TASK_COMPLETED: "task_completed",
  TASK_OVERDUE: "task_overdue",
  DELIVERY_APPROVED: "delivery_approved",
  DELIVERY_REJECTED: "delivery_rejected",
  PROJECT_MEMBER_ADDED: "project_member_added",
  DISCOVERY_ANALYSIS_COMPLETED: "discovery_analysis_completed",
  ENGINEERING_QA_FAILED: "engineering_qa_failed",
  BRAIN_APPROVED: "brain_approved",
  MONITORING_CRITICAL_INCIDENT: "monitoring_critical_incident",
  MILESTONE_OVERDUE: "milestone_overdue",
} as const;

export type EventType = (typeof EVENT_TYPES)[keyof typeof EVENT_TYPES];

/** الحدث كما يُرسَل للـ Event Bus. payload حر لكن مفاتيحه متعارف عليها لكل نوع. */
export interface AutomationEvent {
  type: EventType;
  projectId: string | null;
  actorId: string | null;
  /** معرّف السجل المصدر (task id / milestone id ...) — لبناء dedupe مستقر. */
  recordId: string | null;
  payload: Record<string, unknown>;
}

export const EVENT_LABELS: Record<EventType, string> = {
  task_completed: "اكتملت مهمة",
  task_overdue: "مهمة متأخرة",
  delivery_approved: "اعتماد مرحلة تسليم",
  delivery_rejected: "رفض/طلب تعديل مرحلة تسليم",
  project_member_added: "إضافة عضو للمشروع",
  discovery_analysis_completed: "اكتمال تحليل الاكتشاف",
  engineering_qa_failed: "إخفاق مراجعة هندسية",
  brain_approved: "اعتماد Project Brain",
  monitoring_critical_incident: "حادثة إنتاج حرجة",
  milestone_overdue: "تأخّر مرحلة تسليم",
};

/** يقرأ قيمة نصية من payload الحدث بأمان. */
export function payloadString(payload: Record<string, unknown>, key: string, fallback = ""): string {
  const v = payload[key];
  return typeof v === "string" ? v : fallback;
}
