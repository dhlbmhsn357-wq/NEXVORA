/**
 * NEXVORA Product Definition — Business Rules + System Messages Types
 * ====================================================================
 * كيانان مُهيكلان جديدان على مستوى تعريف المنتج (Project Definition)،
 * منفصلان تمامًا عن `business_rules` الحرّة في Project Brain (lib/brain-v2/types.ts
 * — BRAIN_SECTION قديم، نص حر غير مُهيكل، لا يُمس هنا).
 *
 * الهدف: التقاط عمق مواصفة وظيفية حقيقية (قواعد عمل بحدود واضحة + جدول
 * كامل برسائل النظام) بحيث تتغذّى PRD generation منها كمصدر أساسي
 * مضمون الوجود، بدل الاعتماد على اختراع الـ AI.
 */

// ---------------------------------------------------------------------------
// Business Rules — قواعد العمل والحالات الخاصة
// ---------------------------------------------------------------------------
export type BusinessRuleEnforcementPoint = "client" | "server" | "both";

export const BUSINESS_RULE_ENFORCEMENT_POINTS: readonly BusinessRuleEnforcementPoint[] = [
  "client",
  "server",
  "both",
] as const;

export const BUSINESS_RULE_ENFORCEMENT_POINT_LABELS: Record<BusinessRuleEnforcementPoint, string> = {
  client: "العميل (Client)",
  server: "الخادم (Server)",
  both: "الاثنان معًا",
};

export interface BusinessRuleRow {
  id: string;
  projectId: string;
  title: string; // اسم القاعدة
  triggerCondition: string; // الشرط المُفعِّل
  thresholdValue: string; // القيمة الحدّية (نص حر — "3 مرات", "لا يوجد حد" إلخ)
  onViolation: string; // ماذا يحدث عند التجاوز
  enforcementPoint: BusinessRuleEnforcementPoint; // مين بيطبّقها
  linkedFlowId: string | null; // ربط اختياري بتدفّق مستخدم
  notes: string;
  createdAt: string;
  updatedAt: string;
  createdBy: string | null;
}

// ---------------------------------------------------------------------------
// System Messages — رسائل النظام
// ---------------------------------------------------------------------------
export type SystemMessageType = "success" | "error" | "info" | "warning";

export const SYSTEM_MESSAGE_TYPES: readonly SystemMessageType[] = [
  "success",
  "error",
  "info",
  "warning",
] as const;

export const SYSTEM_MESSAGE_TYPE_LABELS: Record<SystemMessageType, string> = {
  success: "نجاح",
  error: "خطأ",
  info: "معلومة",
  warning: "تحذير",
};

export interface SystemMessageRow {
  id: string;
  projectId: string;
  eventName: string; // اسم الحدث ("تسجيل دخول ناجح", "رصيد غير كافٍ")
  messageType: SystemMessageType;
  messageText: string; // نص الرسالة كاملًا كما يظهر للمستخدم
  linkedFlowId: string | null;
  notes: string;
  createdAt: string;
  updatedAt: string;
  createdBy: string | null;
}
