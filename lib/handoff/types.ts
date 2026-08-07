/** NEXVORA Handoff + External Partner — Types (P12) */

export type HandoffPackageStatus = "draft" | "ready" | "finalized" | "superseded";
export const HANDOFF_PACKAGE_STATUSES: readonly HandoffPackageStatus[] = ["draft","ready","finalized","superseded"] as const;
export const HANDOFF_PACKAGE_STATUS_LABELS: Record<HandoffPackageStatus, string> = {
  draft: "مسودّة", ready: "جاهزة", finalized: "مُسلَّمة", superseded: "استُبدلت",
};

export type HandoffItemStatus = "pending" | "in_progress" | "completed" | "skipped";
export const HANDOFF_ITEM_STATUSES: readonly HandoffItemStatus[] = ["pending","in_progress","completed","skipped"] as const;
export const HANDOFF_ITEM_STATUS_LABELS: Record<HandoffItemStatus, string> = {
  pending: "معلّق", in_progress: "قيد الإعداد", completed: "مكتمل", skipped: "متجاوَز",
};

/**
 * Registry — 7 إلزامية + 18 اختياري = 25 عنصر.
 * item_key ثابت (snake_case) والـ label قابل للتغيير محليًا/عبر i18n.
 */
export interface HandoffItemDef {
  key: string;
  label: string;
  category: "docs" | "code" | "ops" | "handover" | "compliance";
  isMandatory: boolean;
  description: string;
}

export const HANDOFF_ITEM_REGISTRY: readonly HandoffItemDef[] = [
  // 7 إلزامية
  { key: "prd_final",           label: "PRD نهائي معتمَد",              category: "docs",   isMandatory: true,  description: "النسخة المعتمدة من PRD مع رابط الوثيقة" },
  { key: "brain_snapshot",      label: "Brain snapshot",                category: "docs",   isMandatory: true,  description: "نسخة مجمَّدة من الـ Project Brain" },
  { key: "presentation_final",  label: "عرض العميل النهائي",           category: "docs",   isMandatory: true,  description: "شرائح العرض النهائي المُقدَّمة" },
  { key: "acceptance_criteria", label: "معايير القبول (AC)",           category: "docs",   isMandatory: true,  description: "كل الـ AC المعتمدة" },
  { key: "developer_handoff",   label: "Developer Handoff",             category: "code",   isMandatory: true,  description: "وثيقة تسليم المطور" },
  { key: "final_contract",      label: "العقد الموقّع",                 category: "compliance", isMandatory: true, description: "نسخة موقّعة من العقد" },
  { key: "sign_off_letter",     label: "خطاب استلام رسمي",             category: "handover", isMandatory: true, description: "خطاب استلام موقّع من العميل" },

  // 18 اختياري
  { key: "prototype_link",      label: "رابط النموذج (Prototype)",      category: "code",   isMandatory: false, description: "رابط تفاعلي لـ Figma/Prototype" },
  { key: "source_repo",         label: "مستودع المصدر (Git)",           category: "code",   isMandatory: false, description: "رابط GitHub/GitLab" },
  { key: "deployment_urls",     label: "روابط النشر",                   category: "ops",    isMandatory: false, description: "staging + production" },
  { key: "env_config_template", label: "قالب متغيرات البيئة",           category: "ops",    isMandatory: false, description: ".env.example" },
  { key: "db_schema_export",    label: "مخطط قاعدة البيانات",           category: "code",   isMandatory: false, description: "SQL dump أو ERD" },
  { key: "api_docs",            label: "وثائق API",                     category: "docs",   isMandatory: false, description: "OpenAPI أو Postman" },
  { key: "test_reports",        label: "تقارير الاختبار",               category: "code",   isMandatory: false, description: "unit / e2e / QA" },
  { key: "security_report",     label: "تقرير الأمن",                   category: "compliance", isMandatory: false, description: "أي فحص أمن أُجري" },
  { key: "performance_report",  label: "تقرير الأداء",                  category: "compliance", isMandatory: false, description: "load / lighthouse" },
  { key: "runbook",             label: "دليل التشغيل (Runbook)",        category: "ops",    isMandatory: false, description: "خطوات التشغيل/الاسترجاع" },
  { key: "monitoring_setup",    label: "إعداد المراقبة",                category: "ops",    isMandatory: false, description: "روابط لوحات المراقبة" },
  { key: "backup_policy",       label: "سياسة النسخ الاحتياطية",        category: "ops",    isMandatory: false, description: "سياسة النسخ + مواقعها" },
  { key: "user_manual",         label: "دليل المستخدم النهائي",          category: "handover", isMandatory: false, description: "PDF/HTML" },
  { key: "admin_manual",        label: "دليل المسؤول",                  category: "handover", isMandatory: false, description: "PDF/HTML" },
  { key: "training_videos",     label: "فيديوهات التدريب",              category: "handover", isMandatory: false, description: "روابط أو ملفات" },
  { key: "training_sessions",   label: "جلسات تدريب مسجّلة",             category: "handover", isMandatory: false, description: "بيانات الحضور + التسجيلات" },
  { key: "warranty_terms",      label: "شروط الضمان",                   category: "compliance", isMandatory: false, description: "الفترة والنطاق" },
  { key: "support_plan",        label: "خطة الدعم",                     category: "compliance", isMandatory: false, description: "SLA + قنوات الدعم" },
] as const;

export const MANDATORY_HANDOFF_KEYS = HANDOFF_ITEM_REGISTRY.filter((i) => i.isMandatory).map((i) => i.key);
export const OPTIONAL_HANDOFF_KEYS  = HANDOFF_ITEM_REGISTRY.filter((i) => !i.isMandatory).map((i) => i.key);

export interface HandoffPackageRow {
  id: string;
  projectId: string;
  version: number;
  title: string;
  status: HandoffPackageStatus;
  finalizedAt: string | null;
  finalizedBy: string | null;
  notes: string;
  createdAt: string;
  updatedAt: string;
  createdBy: string | null;
}

export interface HandoffItemRow {
  id: string;
  packageId: string;
  projectId: string;
  itemKey: string;
  isMandatory: boolean;
  status: HandoffItemStatus;
  contentUrl: string | null;
  contentText: string;
  contentRefType: string | null;
  contentRefId: string | null;
  notes: string;
  completedAt: string | null;
  completedBy: string | null;
  createdAt: string;
  updatedAt: string;
}

// --------- Partners ---------
export type PartnerRole = "viewer" | "editor";
export const PARTNER_ROLES: readonly PartnerRole[] = ["viewer", "editor"] as const;
export const PARTNER_ROLE_LABELS: Record<PartnerRole, string> = { viewer: "قارئ", editor: "محرّر" };

export type PartnerStatus = "invited" | "active" | "suspended" | "revoked" | "expired";
export const PARTNER_STATUSES: readonly PartnerStatus[] = ["invited","active","suspended","revoked","expired"] as const;
export const PARTNER_STATUS_LABELS: Record<PartnerStatus, string> = {
  invited: "مدعوّ", active: "نشط", suspended: "موقوف", revoked: "ملغى", expired: "منتهي",
};

export interface ExternalPartnerRow {
  id: string;
  projectId: string;
  name: string;
  organization: string;
  email: string;
  role: PartnerRole;
  status: PartnerStatus;
  accessToken: string;
  expiresAt: string | null;
  lastSeenAt: string | null;
  invitedAt: string;
  invitedBy: string | null;
  revokedAt: string | null;
  revokeReason: string;
  notes: string;
  updatedAt: string;
}
