/**
 * محرّك قواعد الجودة — **وحدة نقية بلا I/O**.
 *
 * نموذج قواعد قابل لإعادة الاستخدام (تحقّق/توحيد/عمل/تنظيف)، مع مجموعات
 * قواعد افتراضية لكل مجال. القواعد المعتمَدة تُحفَظ لاحقًا في الذاكرة
 * المؤسسية لإعادة الاستخدام تلقائيًا في مشاريع مشابهة.
 */

export type RuleType = "validation" | "normalization" | "business" | "cleaning";

export interface QualityRule {
  key: string;
  type: RuleType;
  domain: string;
  title: string;
  description: string;
  /** حقل/نمط ينطبق عليه (اختياري). */
  appliesTo?: string;
}

/** مجموعات قواعد افتراضية لكل مجال (تُثرى بالخبرة المؤسسية). */
const DOMAIN_RULES: Record<string, QualityRule[]> = {
  generic: [
    { key: "email_valid", type: "validation", domain: "generic", title: "صحّة البريد", description: "كل بريد لازم يطابق صيغة صحيحة." },
    { key: "phone_e164", type: "normalization", domain: "generic", title: "توحيد الهاتف", description: "توحيد الهواتف لصيغة دولية E.164." },
    { key: "name_trim", type: "normalization", domain: "generic", title: "تنظيف الأسماء", description: "إزالة المسافات الزائدة وتوحيد الحالة." },
    { key: "no_dup_id", type: "validation", domain: "generic", title: "تفرّد المعرّف", description: "الحقول التعريفية (id/code) لازم تكون فريدة." },
  ],
  accounting: [
    { key: "invoice_has_customer", type: "business", domain: "accounting", title: "فاتورة بعميل", description: "كل فاتورة لازم ترتبط بعميل موجود." },
    { key: "amount_numeric", type: "validation", domain: "accounting", title: "مبلغ رقمي", description: "المبالغ لازم تكون أرقامًا صالحة." },
    { key: "currency_normalize", type: "normalization", domain: "accounting", title: "توحيد العملة", description: "توحيد صيغة العملة والقيم." },
  ],
  crm: [
    { key: "dedup_customers", type: "cleaning", domain: "crm", title: "إزالة تكرار العملاء", description: "دمج العملاء المكرّرين بمطابقة دلالية/صوتية." },
    { key: "country_code", type: "normalization", domain: "crm", title: "توحيد الدولة", description: "توحيد أسماء الدول إلى رموز ISO." },
  ],
  hr: [
    { key: "employee_has_dept", type: "business", domain: "hr", title: "موظف بقسم", description: "كل موظف لازم يرتبط بقسم." },
  ],
  hospital: [
    { key: "patient_national_id", type: "validation", domain: "hospital", title: "هوية المريض", description: "كل مريض لازم له معرّف/هوية فريدة." },
  ],
  ecommerce: [
    { key: "order_has_product", type: "business", domain: "ecommerce", title: "طلب بمنتج", description: "كل طلب لازم يحتوي منتجًا." },
    { key: "dedup_products", type: "cleaning", domain: "ecommerce", title: "إزالة تكرار المنتجات", description: "دمج المنتجات المكرّرة." },
  ],
};

/** يرجّع القواعد الافتراضية لمجال (+ العامّة دائمًا). */
export function rulesForDomain(domain: string): QualityRule[] {
  const specific = DOMAIN_RULES[domain] ?? [];
  const generic = DOMAIN_RULES.generic;
  const seen = new Set<string>();
  return [...specific, ...generic].filter((r) => (seen.has(r.key) ? false : (seen.add(r.key), true)));
}

export function countRulesByType(rules: QualityRule[]): Record<RuleType, number> {
  const out: Record<RuleType, number> = { validation: 0, normalization: 0, business: 0, cleaning: 0 };
  for (const r of rules) out[r.type]++;
  return out;
}
