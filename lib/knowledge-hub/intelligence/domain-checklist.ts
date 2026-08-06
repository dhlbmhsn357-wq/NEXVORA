import type { Severity } from "./insight-model";

/**
 * فحص القدرات المؤسسية الناقصة — **وحدة نقية بلا I/O**.
 *
 * ## ما هذا
 *
 * المواصفة طلبت: لو مشروع ERP مافيهوش صلاحيات، Workflow، Inventory،
 * Approval Matrix، Audit Logs، Notifications، Backup، Reporting، إدارة
 * مستخدمين، Integration، API، Security — أنشئ Missing Items تلقائيًا.
 *
 * ده بيعمل ده حتميًا (بلا ذكاء اصطناعي): بيقارن القدرات **الحاضرة**
 * (أسماء الكيانات + وحدات المتطلبات + أسماء سير العمل) بقائمتين:
 *
 * 1. **الأساسيات المؤسسية** — قدرات أي نظام جادّ محتاجها مهما كان مجاله.
 * 2. **قدرات المجال** — تُمرَّر من `DOMAIN_PROFILES` (لا نكرّرها هنا).
 *
 * الفحص بالكلمات المفتاحية (عربي + إنجليزي) عشان «الصلاحيات» و
 * «Permissions» و«Roles» كلها تعدّ حضورًا لنفس القدرة.
 */

export interface CapabilitySpec {
  key: string;
  label: string;
  /** كلمات تدلّ على حضور القدرة — أي واحدة تكفي. */
  keywords: string[];
  severity: Severity;
  /** ليه القدرة دي مهمة — يدخل في تفسير الرأي. */
  why: string;
}

/**
 * الأساسيات المؤسسية — تُفحص لكل مشروع.
 *
 * الشدّة مقصودة: غياب الصلاحيات أو Audit أو Backup **حرج** (مخاطرة
 * أمنية/امتثال)، وغياب الإشعارات **متوسط** (تجربة لا أمان).
 */
export const ENTERPRISE_ESSENTIALS: CapabilitySpec[] = [
  { key: "permissions", label: "الصلاحيات وأدوار المستخدمين", severity: "critical",
    keywords: ["permission", "role", "access control", "rbac", "صلاحي", "أدوار", "دور", "تصريح"],
    why: "بدون صلاحيات، أي مستخدم يصل لأي شيء — مخاطرة أمنية وامتثال." },
  { key: "user_management", label: "إدارة المستخدمين", severity: "high",
    keywords: ["user management", "users", "accounts", "إدارة المستخدم", "مستخدم", "حساب"],
    why: "إنشاء وتعطيل وإدارة المستخدمين شرط تشغيلي أساسي." },
  { key: "audit_logs", label: "سجلّات التدقيق", severity: "critical",
    keywords: ["audit", "activity log", "trail", "تدقيق", "سجل النشاط", "سجلات"],
    why: "بدون Audit Trail لا يمكن تتبّع مَن فعل ماذا — عائق امتثال." },
  { key: "approval_matrix", label: "مصفوفة الموافقات", severity: "high",
    keywords: ["approval", "authorization matrix", "موافق", "اعتماد", "مصفوفة"],
    why: "العمليات الحسّاسة تحتاج اعتمادًا متدرّجًا لا تنفيذًا مباشرًا." },
  { key: "workflow", label: "محرّك سير العمل", severity: "high",
    keywords: ["workflow", "process engine", "سير العمل", "سير عمل", "إجراء"],
    why: "أتمتة تسلسل الخطوات تقلّل الأخطاء اليدوية والتأخير." },
  { key: "notifications", label: "الإشعارات", severity: "medium",
    keywords: ["notification", "alert", "reminder", "إشعار", "تنبيه", "تذكير"],
    why: "إبلاغ المستخدمين بالأحداث المهمة في وقتها." },
  { key: "reporting", label: "التقارير", severity: "high",
    keywords: ["report", "dashboard", "analytics", "تقرير", "لوحة", "تحليل"],
    why: "بدون تقارير، البيانات محبوسة بلا قيمة قرارية." },
  { key: "backup", label: "النسخ الاحتياطي والاستعادة", severity: "critical",
    keywords: ["backup", "restore", "recovery", "نسخ احتياط", "استعادة", "استرجاع"],
    why: "فقدان البيانات بلا نسخ احتياطي كارثة لا رجعة فيها." },
  { key: "integration", label: "التكامل مع الأنظمة", severity: "medium",
    keywords: ["integration", "webhook", "sync", "تكامل", "ربط", "مزامنة"],
    why: "الأنظمة المعزولة تخلق جزرًا من البيانات المكرّرة." },
  { key: "api", label: "واجهة برمجية (API)", severity: "medium",
    keywords: ["api", "endpoint", "rest", "graphql", "واجهة برمجية"],
    why: "الـ API شرط أي تكامل أو توسّع مستقبلي." },
  { key: "security", label: "الأمان", severity: "critical",
    keywords: ["security", "encryption", "authentication", "أمان", "تشفير", "مصادقة"],
    why: "الأمان ليس ميزة إضافية — هو أساس أي نظام مؤسسي." },
];

/** يطبّع اسمًا للمطابقة: تشكيل، همزات، حالة، مسافات. */
function normalize(text: string): string {
  return text
    .toLowerCase()
    .replace(/[ً-ْ]/g, "")
    .replace(/[أإآ]/g, "ا")
    .replace(/ة/g, "ه")
    .replace(/ى/g, "ي")
    .replace(/\s+/g, " ")
    .trim();
}

export interface MissingCapability {
  key: string;
  label: string;
  severity: Severity;
  why: string;
  /** مجال المصدر: essential أو domain. */
  origin: "essential" | "domain";
}

/**
 * يكتشف القدرات الناقصة.
 *
 * @param present أسماء القدرات الحاضرة (كيانات + وحدات + سير عمل + وحدات مكتشفة).
 * @param domainExpectedItems قائمة `DOMAIN_PROFILES[domain].expectedItems` (اختيارية).
 */
export function detectMissingCapabilities(
  present: string[],
  domainExpectedItems: string[] = []
): MissingCapability[] {
  const haystack = present.map(normalize).join(" | ");
  const missing: MissingCapability[] = [];

  const hasAny = (keywords: string[]): boolean =>
    keywords.some((k) => haystack.includes(normalize(k)));

  // --- الأساسيات ---
  for (const cap of ENTERPRISE_ESSENTIALS) {
    if (!hasAny(cap.keywords)) {
      missing.push({ key: cap.key, label: cap.label, severity: cap.severity, why: cap.why, origin: "essential" });
    }
  }

  // --- قدرات المجال (اسمها هو كلمتها المفتاحية) ---
  for (const item of domainExpectedItems) {
    const norm = normalize(item);
    if (!haystack.includes(norm)) {
      missing.push({
        key: `domain:${norm.replace(/\s+/g, "_")}`,
        label: item,
        severity: "medium",
        why: `عنصر متوقَّع في هذا المجال لكنه غير موجود في المعرفة المستخرَجة.`,
        origin: "domain",
      });
    }
  }

  return missing;
}
