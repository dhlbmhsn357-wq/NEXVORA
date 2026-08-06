/**
 * نموذج قواعد التحويل — **وحدة نقية بلا I/O**.
 *
 * كل Rule = عملية على صفّ بيانات: تأخذ صفًّا (Record) وتنتج قيمة جديدة
 * لحقل هدف، مع أثر (قديم→جديد) وسبب وثقة. القواعد تُركَّب في Pipeline.
 * **لا تنفيذ على Production** — تُطبَّق على عيّنة للمعاينة فقط.
 */

export type Row = Record<string, string>;

export type RuleKind =
  | "rename" | "copy" | "merge" | "split"
  | "uppercase" | "lowercase" | "trim" | "normalize" | "text_clean"
  | "replace_values" | "generate_id" | "hash"
  | "convert_currency" | "convert_units" | "convert_timezone" | "convert_date"
  | "boolean_mapping" | "status_mapping" | "enum_mapping"
  | "phone_format" | "address_format" | "email_format" | "encoding"
  | "reference_lookup" | "calculated" | "formula" | "constant";

/** مرحلة الـPipeline التي تنتمي لها القاعدة (للترتيب المرئي). */
export type PipelineStage = "extract" | "normalize" | "merge_split" | "convert" | "compute" | "validate" | "business" | "ready";

export interface RuleCondition {
  field: string;
  operator: "eq" | "neq" | "gt" | "lt" | "contains" | "empty" | "not_empty" | "in";
  value?: string;
  values?: string[];
}

export interface TransformRule {
  id: string;
  targetField: string;
  /** الحقول المصدر (واحد للأغلب؛ عدّة للـmerge). */
  sourceFields: string[];
  kind: RuleKind;
  stage: PipelineStage;
  config: Record<string, unknown>;
  /** شرط اختياري: القاعدة تُطبَّق فقط لو تحقّق. */
  condition?: RuleCondition;
  confidence: number;
  reason: string;
  enabled: boolean;
}

export const RULE_STAGE: Record<RuleKind, PipelineStage> = {
  rename: "extract",
  copy: "extract",
  constant: "extract",
  trim: "normalize",
  uppercase: "normalize",
  lowercase: "normalize",
  normalize: "normalize",
  text_clean: "normalize",
  email_format: "normalize",
  phone_format: "normalize",
  address_format: "normalize",
  encoding: "normalize",
  replace_values: "normalize",
  merge: "merge_split",
  split: "merge_split",
  convert_currency: "convert",
  convert_units: "convert",
  convert_timezone: "convert",
  convert_date: "convert",
  boolean_mapping: "convert",
  status_mapping: "convert",
  enum_mapping: "convert",
  generate_id: "compute",
  hash: "compute",
  calculated: "compute",
  formula: "compute",
  reference_lookup: "compute",
};

export const STAGE_ORDER: PipelineStage[] = ["extract", "normalize", "merge_split", "convert", "compute", "validate", "business", "ready"];

export const RULE_LABELS: Record<RuleKind, string> = {
  rename: "إعادة تسمية", copy: "نسخ", merge: "دمج حقول", split: "تقسيم حقل",
  uppercase: "أحرف كبيرة", lowercase: "أحرف صغيرة", trim: "إزالة مسافات", normalize: "تطبيع", text_clean: "تنظيف نصّ",
  replace_values: "استبدال قيم", generate_id: "توليد معرّف", hash: "تجزئة",
  convert_currency: "تحويل عملة", convert_units: "تحويل وحدة", convert_timezone: "تحويل منطقة زمنية", convert_date: "تحويل تاريخ",
  boolean_mapping: "تحويل منطقي", status_mapping: "تطبيع حالة", enum_mapping: "تطبيع تعداد",
  phone_format: "تنسيق هاتف", address_format: "تنسيق عنوان", email_format: "تنسيق بريد", encoding: "تحويل ترميز",
  reference_lookup: "بحث مرجعي", calculated: "حقل محسوب", formula: "معادلة", constant: "قيمة ثابتة",
};
