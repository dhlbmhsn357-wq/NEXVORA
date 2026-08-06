import type { RuleKind } from "./rule-types";

/**
 * مكتبة قواعد التحويل القابلة لإعادة الاستخدام — **وحدة نقية بلا I/O**.
 *
 * قوالب قواعد جاهزة لكل مجال، تُقترَح عند بدء مشروع جديد بنفس المجال.
 * القواعد المعتمَدة تُرقَّى للذاكرة المؤسسية لإعادة الاستخدام التلقائي.
 */

export interface RuleTemplate {
  key: string;
  domain: string;
  kind: RuleKind;
  title: string;
  targetHint: string;
}

const LIBRARY: Record<string, RuleTemplate[]> = {
  generic: [
    { key: "email_norm", domain: "generic", kind: "email_format", title: "توحيد البريد", targetHint: "email" },
    { key: "phone_e164", domain: "generic", kind: "phone_format", title: "توحيد الهاتف", targetHint: "phone" },
    { key: "name_trim", domain: "generic", kind: "trim", title: "تنظيف الأسماء", targetHint: "name" },
    { key: "date_iso", domain: "generic", kind: "convert_date", title: "توحيد التواريخ", targetHint: "date" },
  ],
  accounting: [
    { key: "amount_num", domain: "accounting", kind: "convert_currency", title: "تحويل المبالغ", targetHint: "amount" },
    { key: "total_calc", domain: "accounting", kind: "formula", title: "حساب الإجمالي", targetHint: "total" },
    { key: "tax_calc", domain: "accounting", kind: "formula", title: "حساب الضريبة", targetHint: "tax" },
  ],
  crm: [
    { key: "status_map", domain: "crm", kind: "status_mapping", title: "تطبيع الحالة", targetHint: "status" },
    { key: "country_code", domain: "crm", kind: "replace_values", title: "توحيد الدولة", targetHint: "country" },
  ],
  ecommerce: [
    { key: "sku_gen", domain: "ecommerce", kind: "generate_id", title: "توليد رمز المنتج", targetHint: "sku" },
    { key: "price_num", domain: "ecommerce", kind: "convert_currency", title: "تحويل السعر", targetHint: "price" },
  ],
  hr: [{ key: "salary_num", domain: "hr", kind: "convert_currency", title: "تحويل الراتب", targetHint: "salary" }],
  hospital: [{ key: "mrn_hash", domain: "hospital", kind: "hash", title: "تجزئة رقم الملف", targetHint: "national_id" }],
};

/** يوصي بقوالب قواعد لمجال (+العامّة دائمًا). */
export function recommendTemplates(domain: string): RuleTemplate[] {
  const specific = LIBRARY[domain] ?? [];
  return [...specific, ...LIBRARY.generic];
}

export const ALL_DOMAINS = Object.keys(LIBRARY);
