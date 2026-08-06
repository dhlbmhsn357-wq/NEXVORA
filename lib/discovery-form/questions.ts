import type { ProjectType } from "@/lib/types/database";

export type QuestionType = "text" | "textarea" | "select" | "boolean" | "number";

export interface DiscoveryQuestion {
  key: string; // المفتاح المستخدم داخل answers (jsonb)
  label: string;
  type: QuestionType;
  options?: string[]; // لو type === "select"
  required?: boolean;
}

/**
 * أسئلة عامة تظهر لكل أنواع المشاريع بغض النظر عن project_type.
 * مأخوذة حرفيًا من قائمة الأسئلة المرسلة.
 */
export const commonQuestions: DiscoveryQuestion[] = [
  { key: "business_activity", label: "ما نشاط شركتك؟", type: "textarea", required: true },
  { key: "core_problem", label: "ما المشكلة الأساسية؟", type: "textarea", required: true },
  { key: "why_project", label: "لماذا تريد المشروع؟", type: "textarea", required: true },
  { key: "project_goals", label: "ما أهداف المشروع؟", type: "textarea", required: true },
  { key: "target_audience", label: "من جمهورك؟", type: "textarea", required: true },
  { key: "current_solution", label: "ما الذي تستخدمه حاليًا؟", type: "textarea" },
  { key: "current_likes", label: "ما الذي يعجبك في الحل الحالي؟", type: "textarea" },
  { key: "current_dislikes", label: "ما الذي لا يعجبك في الحل الحالي؟", type: "textarea" },
  { key: "competitors", label: "من المنافسون؟", type: "textarea" },
  { key: "expected_budget", label: "الميزانية المتوقعة؟", type: "text" },
  { key: "expected_timeline", label: "مدة التنفيذ المطلوبة؟", type: "text" },
  { key: "has_brand_guide", label: "هل يوجد Brand Guide؟", type: "boolean" },
  { key: "has_logo", label: "هل يوجد Logo؟", type: "boolean" },
  { key: "has_design", label: "هل يوجد Design جاهز؟", type: "boolean" },
  { key: "has_content", label: "هل يوجد محتوى جاهز؟", type: "boolean" },
  { key: "has_api", label: "هل يوجد API؟", type: "boolean" },
  { key: "has_legacy_system", label: "هل يوجد نظام قديم؟", type: "boolean" },
  { key: "success_priorities", label: "ما أولويات النجاح؟", type: "textarea" },
  { key: "success_measurement", label: "كيف ستقيس نجاح المشروع؟", type: "textarea" },
  { key: "legal_constraints", label: "هل توجد قيود قانونية؟", type: "textarea" },
  { key: "security_requirements", label: "هل توجد متطلبات أمنية؟", type: "textarea" },
  { key: "future_requirements", label: "هل توجد متطلبات مستقبلية؟", type: "textarea" },
  { key: "integrations", label: "هل توجد Integrations مطلوبة؟", type: "textarea" },
  { key: "biggest_concern", label: "ما أكثر شيء يقلقك؟", type: "textarea" },
];

/**
 * أسئلة إضافية خاصة بكل نوع مشروع — تظهر فوق الأسئلة العامة.
 */
export const questionsByProjectType: Record<
  Exclude<ProjectType, "other">,
  DiscoveryQuestion[]
> = {
  website: [
    { key: "site_pages_count", label: "كم عدد الصفحات المتوقعة؟", type: "number" },
    { key: "needs_cms", label: "هل تحتاج لوحة تحكم لتعديل المحتوى بنفسك؟", type: "boolean" },
    { key: "needs_multilingual", label: "هل الموقع متعدد اللغات؟", type: "boolean" },
    { key: "hosting_preference", label: "هل لديك تفضيل لمكان الاستضافة؟", type: "text" },
  ],
  mobile_app: [
    { key: "target_platforms", label: "المنصات المستهدفة", type: "select", options: ["iOS", "Android", "الاثنان معًا"] },
    { key: "needs_push_notifications", label: "هل تحتاج إشعارات فورية (Push)؟", type: "boolean" },
    { key: "needs_offline_mode", label: "هل يجب أن يعمل التطبيق بدون إنترنت؟", type: "boolean" },
    { key: "app_store_accounts", label: "هل لديك حسابات على متاجر التطبيقات؟", type: "boolean" },
  ],
  saas: [
    { key: "pricing_model", label: "ما نموذج التسعير المتوقع؟", type: "text" },
    { key: "needs_multi_tenant", label: "هل يحتاج النظام لدعم عدة شركات مستقلة (Multi-tenant)؟", type: "boolean" },
    { key: "needs_billing_integration", label: "هل تحتاج تكامل مع نظام دفع/فوترة؟", type: "boolean" },
    { key: "expected_user_scale", label: "العدد المتوقع للمستخدمين خلال أول سنة؟", type: "text" },
  ],
  dashboard: [
    { key: "data_sources", label: "من أين تأتي البيانات المطلوب عرضها؟", type: "textarea" },
    { key: "update_frequency", label: "ما مدى تكرار تحديث البيانات المطلوب؟", type: "text" },
    { key: "needs_export", label: "هل تحتاج تصدير التقارير (PDF/Excel)؟", type: "boolean" },
    { key: "user_roles_count", label: "كم عدد مستويات الصلاحيات المطلوبة لعرض البيانات؟", type: "number" },
  ],
};

/**
 * يبني قائمة الأسئلة الكاملة المطلوب عرضها لمشروع معيّن:
 * الأسئلة الخاصة بالنوع أولاً، ثم الأسئلة العامة.
 */
export function getQuestionsForProjectType(type: ProjectType): DiscoveryQuestion[] {
  const specific = type === "other" ? [] : questionsByProjectType[type];
  return [...specific, ...commonQuestions];
}
