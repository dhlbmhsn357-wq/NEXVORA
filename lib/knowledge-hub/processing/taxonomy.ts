/**
 * تصنيفات محرّك المعالجة — **وحدة نقية بلا I/O**.
 *
 * ده العقد بين مخرَج الذكاء الاصطناعي وجداول ٠٠٧٧. كل قائمة هنا لها
 * مقابل في `check` بقاعدة البيانات، والفارق مقصود: القوائم المفتوحة
 * (كيانات، علاقات) نصّ حر في القاعدة عشان النظام يتعلّم أنواعًا جديدة
 * بلا ترحيل، والقوائم المغلقة (نوع المخاطرة، نوع المتطلب) مقيّدة لأن
 * تفرّعها يكسر الفلترة المهيكلة.
 */

// ============================================================
// الكيانات — قائمة مفتوحة
// ============================================================

/**
 * الأنواع المعروفة — **دليل توجيه لا قيد**.
 *
 * الذكاء الاصطناعي بيتشجّع يستخدم واحدًا منها، لكنه يقدر يرجّع نوعًا
 * جديدًا، والعمود نصّ حر يقبله. المواصفة عدّدت ثلاثين، والقائمة نموّها
 * مستمر مع كل مجال جديد.
 */
export const ENTITY_TYPES = [
  "company", "department", "employee", "role", "customer", "supplier",
  "product", "service", "project", "invoice", "order", "payment",
  "warehouse", "branch", "asset", "document", "meeting", "system",
  "api", "database", "policy", "sop", "regulation", "requirement",
  "deadline", "milestone", "kpi", "technology", "tool", "unknown",
] as const;

export type EntityType = (typeof ENTITY_TYPES)[number] | string;

export const ENTITY_TYPE_LABELS: Record<string, string> = {
  company: "شركة", department: "قسم", employee: "موظف", role: "دور",
  customer: "عميل", supplier: "مورّد", product: "منتج", service: "خدمة",
  project: "مشروع", invoice: "فاتورة", order: "طلب", payment: "دفعة",
  warehouse: "مخزن", branch: "فرع", asset: "أصل", document: "مستند",
  meeting: "اجتماع", system: "نظام", api: "واجهة برمجية", database: "قاعدة بيانات",
  policy: "سياسة", sop: "إجراء تشغيلي", regulation: "لائحة", requirement: "متطلّب",
  deadline: "موعد نهائي", milestone: "علامة فارقة", kpi: "مؤشّر أداء",
  technology: "تقنية", tool: "أداة", unknown: "غير مصنَّف",
};

export function entityTypeLabel(type: string): string {
  return ENTITY_TYPE_LABELS[type] ?? type;
}

// ============================================================
// القوائم المغلقة — مقيّدة في القاعدة
// ============================================================

export const REQUIREMENT_TYPES = [
  "functional", "non_functional", "constraint",
  "assumption", "dependency", "acceptance_criteria",
] as const;
export type RequirementType = (typeof REQUIREMENT_TYPES)[number];

export const REQUIREMENT_TYPE_LABELS: Record<RequirementType, string> = {
  functional: "متطلّب وظيفي",
  non_functional: "متطلّب غير وظيفي",
  constraint: "قيد",
  assumption: "افتراض",
  dependency: "اعتماد",
  acceptance_criteria: "معيار قبول",
};

export const RISK_TYPES = [
  "business", "technical", "financial", "security",
  "operational", "legal", "architecture",
] as const;
export type RiskType = (typeof RISK_TYPES)[number];

export const RISK_TYPE_LABELS: Record<RiskType, string> = {
  business: "أعمال", technical: "تقني", financial: "مالي",
  security: "أمني", operational: "تشغيلي", legal: "قانوني",
  architecture: "معماري",
};

export const RULE_TYPES = ["validation", "approval", "calculation", "restriction"] as const;
export type RuleType = (typeof RULE_TYPES)[number];

// ============================================================
// أولوية المخاطر — احتمال × شدّة
// ============================================================

export type Likelihood = "high" | "medium" | "low";
export type Severity = "critical" | "high" | "medium" | "low";

const LIKELIHOOD_WEIGHT: Record<Likelihood, number> = { high: 3, medium: 2, low: 1 };
const SEVERITY_WEIGHT: Record<Severity, number> = { critical: 4, high: 3, medium: 2, low: 1 };

/**
 * أولوية المخاطرة = احتمال × شدّة.
 *
 * الحساب في الكود لا في القاعدة: القاعدة بتخزّن العاملين، والأولوية
 * مشتقّة — تخزينها كان بيخاطر بتناقض لو اتغيّر أحد العاملين بلا
 * إعادة حساب.
 */
export function riskPriority(likelihood: Likelihood, severity: Severity): {
  score: number;
  level: "critical" | "high" | "medium" | "low";
} {
  const score = LIKELIHOOD_WEIGHT[likelihood] * SEVERITY_WEIGHT[severity];
  const level = score >= 9 ? "critical" : score >= 6 ? "high" : score >= 3 ? "medium" : "low";
  return { score, level };
}

// ============================================================
// تطبيع مفتاح الكيان
// ============================================================

/**
 * يطبّع اسم الكيان لمفتاح دمج.
 *
 * «قسم المبيعات» و«ادارة المبيعات» و«المبيعات» لازم يبقوا نفس
 * المفتاح، وإلا الكيان الواحد بيتضاعف لثلاثة. التطبيع العربي شرط:
 * بدونه «الإدارة» و«الاداره» كيانان مختلفان.
 */
export function normalizeEntityKey(name: string): string {
  const cleaned = name
    .trim()
    .toLowerCase()
    .replace(/[ً-ْ]/g, "")
    .replace(/[أإآ]/g, "ا")
    .replace(/ة/g, "ه")
    .replace(/ى/g, "ي")
    // بادئات شائعة تُزال عشان «قسم X» و«X» يتطابقوا
    .replace(/^(قسم|اداره|ادارة|دائره|دائرة|وحده|وحدة|فريق)\s+/u, "")
    .replace(/\s+/g, " ")
    .trim();

  return cleaned || name.trim().toLowerCase();
}
