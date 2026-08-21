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
 * Registry — 7 إلزامية (product-focused) + بقية القائمة اختيارية.
 * item_key ثابت (snake_case) والـ label قابل للتغيير محليًا/عبر i18n.
 *
 * تحديث المراجعة (0106):
 *   الإلزاميات الجديدة تركّز على المنتج بدل الوثائق التسليمية:
 *     problem_brief · scope_mvp · user_stories · acceptance_criteria
 *     · prototype_link (Prototype) · prd_final (PRD) · product_evaluation_guide
 *   العناصر القديمة الإلزامية (brain_snapshot, presentation_final,
 *   developer_handoff, final_contract, sign_off_letter) بقيت في السجل
 *   كاختيارية — لا تُحذف حفاظًا على بيانات الحزم القديمة.
 */
export interface HandoffItemDef {
  key: string;
  label: string;
  category: "docs" | "code" | "ops" | "handover" | "compliance";
  isMandatory: boolean;
  description: string;
}

export const HANDOFF_ITEM_REGISTRY: readonly HandoffItemDef[] = [
  // 7 إلزامية (product-focused)
  { key: "problem_brief",            label: "موجز المشكلة",                  category: "docs",   isMandatory: true,  description: "ملخّص المشكلة اللي بيحلّها المنتج + مصادرها" },
  { key: "scope_mvp",                label: "النطاق و MVP",                   category: "docs",   isMandatory: true,  description: "حدود النطاق ومعالم MVP المعتمدة" },
  { key: "user_stories",             label: "قصص المستخدم",                  category: "docs",   isMandatory: true,  description: "قائمة القصص المعتمدة" },
  { key: "acceptance_criteria",      label: "معايير القبول (AC)",            category: "docs",   isMandatory: true,  description: "كل الـ AC المعتمدة" },
  { key: "prototype_link",           label: "النموذج الأولي (Prototype)",     category: "code",   isMandatory: true,  description: "رابط تفاعلي لـ Figma/Prototype" },
  { key: "prd_final",                label: "PRD نهائي معتمَد",              category: "docs",   isMandatory: true,  description: "النسخة المعتمدة من PRD مع رابط الوثيقة" },
  { key: "product_evaluation_guide", label: "دليل تقييم المنتج",              category: "docs",   isMandatory: true,  description: "سيناريوهات ومؤشّرات تقييم المنتج قبل التسليم" },

  // اختياريات — الإلزاميات القديمة بقيت هنا مع isMandatory=false (بدون حذف)
  { key: "brain_snapshot",      label: "Brain snapshot",                category: "docs",       isMandatory: false, description: "نسخة مجمَّدة من الـ Project Brain" },
  { key: "presentation_final",  label: "عرض العميل النهائي",           category: "docs",       isMandatory: false, description: "شرائح العرض النهائي المُقدَّمة" },
  { key: "developer_handoff",   label: "Developer Handoff",             category: "code",       isMandatory: false, description: "وثيقة تسليم المطور" },
  { key: "final_contract",      label: "العقد الموقّع",                 category: "compliance", isMandatory: false, description: "نسخة موقّعة من العقد" },
  { key: "sign_off_letter",     label: "خطاب استلام رسمي",             category: "handover",   isMandatory: false, description: "خطاب استلام موقّع من العميل" },
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
  // 0125 — علم "محتوى المشروع اتغيّر بعد آخر تجميع لهذه الحزمة". بيتظبّط
  // من apply-changes-service.ts::applyApprovedImpacts (عبر
  // lib/sector-standards/handoff-regeneration.ts)، وبيتصفّر تلقائيًا
  // في applyAssembly لما حزمة طازجة تتجمّع.
  needsRegeneration: boolean;
  regenerationReason: string;
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
  // 0110 — auto-assembly source linking
  sourceType: string | null;
  sourceVersion: string | null;
  sourceHash: string | null;
  assembledAt: string | null;
  assembledBy: string | null;
  isManualOverride: boolean;
  overrideReason: string;
}

// --------- Handoff Package Snapshots (0110) ---------
export interface HandoffPackageSnapshotRow {
  id: string;
  packageId: string;
  projectId: string;
  version: number;
  payload: unknown;
  createdAt: string;
  createdBy: string | null;
}

// --------- Partners ---------
/**
 * @deprecated `editor` — لا صلاحيات فعّالة له. القيمة موجودة فقط لتوافق
 * البيانات القديمة وسكيمة القاعدة. الشركاء الجدد يجب أن يكونوا `viewer` فقط.
 */
export type PartnerRole = "viewer" | "editor";
export const PARTNER_ROLES: readonly PartnerRole[] = ["viewer", "editor"] as const;
export const PARTNER_ROLE_LABELS: Record<PartnerRole, string> = { viewer: "قارئ", editor: "محرّر" };

export type PartnerStatus = "invited" | "active" | "suspended" | "revoked" | "expired";
export const PARTNER_STATUSES: readonly PartnerStatus[] = ["invited","active","suspended","revoked","expired"] as const;
export const PARTNER_STATUS_LABELS: Record<PartnerStatus, string> = {
  invited: "مدعوّ", active: "نشط", suspended: "موقوف", revoked: "ملغى", expired: "منتهي",
};

// --------- Handoff Questions (0107) ---------
export type HandoffQuestionStatus = "open" | "answered" | "needs_clarification" | "closed";
export const HANDOFF_QUESTION_STATUSES: readonly HandoffQuestionStatus[] = [
  "open", "answered", "needs_clarification", "closed",
] as const;
export const HANDOFF_QUESTION_STATUS_LABELS: Record<HandoffQuestionStatus, string> = {
  open: "مفتوح", answered: "مُجاب", needs_clarification: "يحتاج توضيحًا", closed: "مغلق",
};

export type HandoffQuestionPriority = "low" | "medium" | "high" | "critical";
export const HANDOFF_QUESTION_PRIORITIES: readonly HandoffQuestionPriority[] = [
  "low", "medium", "high", "critical",
] as const;
export const HANDOFF_QUESTION_PRIORITY_LABELS: Record<HandoffQuestionPriority, string> = {
  low: "منخفض", medium: "متوسّط", high: "عالٍ", critical: "حرج",
};

export interface HandoffQuestionRow {
  id: string;
  projectId: string;
  packageId: string;
  partnerId: string | null;
  question: string;
  answer: string;
  status: HandoffQuestionStatus;
  priority: HandoffQuestionPriority;
  askedBy: string | null;
  assignedTo: string | null;
  answeredBy: string | null;
  askedAt: string;
  answeredAt: string | null;
  closedAt: string | null;
  createdAt: string;
  updatedAt: string;
}

// --------- Handoff Deliveries (0107) ---------
export type HandoffDeliveryStatus =
  | "pending" | "sent" | "received" | "accepted" | "rejected" | "needs_clarification";
export const HANDOFF_DELIVERY_STATUSES: readonly HandoffDeliveryStatus[] = [
  "pending", "sent", "received", "accepted", "rejected", "needs_clarification",
] as const;
export const HANDOFF_DELIVERY_STATUS_LABELS: Record<HandoffDeliveryStatus, string> = {
  pending: "قيد الانتظار",
  sent: "أُرسل",
  received: "استُلم",
  accepted: "مقبول",
  rejected: "مرفوض",
  needs_clarification: "يحتاج توضيحًا",
};

export interface HandoffDeliveryRow {
  id: string;
  projectId: string;
  packageId: string;
  partnerId: string | null;
  partnerName: string;
  receiptStatus: HandoffDeliveryStatus;
  sentAt: string | null;
  sentBy: string | null;
  receivedAt: string | null;
  acceptedAt: string | null;
  rejectedAt: string | null;
  statusUpdatedBy: string | null;
  notes: string;
  createdAt: string;
  updatedAt: string;
}

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
