import type { NormalizedColumn } from "@/lib/migration-discovery/schema-model";
import type { CanonicalField } from "./canonical-model";

/**
 * محرّك قواعد التحويل — **وحدة نقية بلا I/O**.
 *
 * لكل تطابق حقل، يستنتج قاعدة التحويل اللازمة من فرق الأنواع ودلائل
 * الاسم/القيم: تحويل تاريخ، تطبيع حالة، تنسيق هاتف، تحقّق بريد، تحويل
 * منطقي، تطبيع تعداد/حالة، تنظيف نصّ... إلخ.
 */

export type TransformationKind =
  | "none"
  | "trim"
  | "uppercase"
  | "lowercase"
  | "text_cleaning"
  | "date_conversion"
  | "currency_conversion"
  | "boolean_mapping"
  | "enum_mapping"
  | "status_mapping"
  | "unit_conversion"
  | "encoding_conversion"
  | "phone_formatting"
  | "email_validation"
  | "country_normalization"
  | "address_parsing"
  | "number_parsing";

export interface TransformationRule {
  kind: TransformationKind;
  description: string;
  /** لو enum/boolean/status: خريطة تحويل مقترَحة (قديم → جديد). */
  valueMap?: Record<string, string>;
}

const NONE: TransformationRule = { kind: "none", description: "نقل مباشر بلا تحويل." };

/**
 * يستنتج قاعدة التحويل بين عمود قديم وحقل قياسي جديد.
 */
export function inferTransformation(oldCol: NormalizedColumn, target: CanonicalField): TransformationRule {
  const oldType = oldCol.dataType.toLowerCase();
  const name = oldCol.name.toLowerCase();

  switch (target.type) {
    case "date":
    case "timestamp":
      if (!/(date|time|timestamp)/.test(oldType)) {
        return { kind: "date_conversion", description: "تحويل النصّ إلى تاريخ قياسي (ISO-8601)." };
      }
      return NONE;

    case "email":
      return { kind: "email_validation", description: "التحقّق من صحّة البريد وتطبيعه (lowercase + trim)." };

    case "phone":
      return { kind: "phone_formatting", description: "تنسيق الهاتف لصيغة دولية موحّدة (E.164)." };

    case "currency":
      if (/(text|char|varchar|mixed)/.test(oldType)) {
        return { kind: "currency_conversion", description: "استخراج القيمة الرقمية وتوحيد العملة." };
      }
      return { kind: "number_parsing", description: "تطبيع القيمة العددية." };

    case "boolean":
      return {
        kind: "boolean_mapping",
        description: "تحويل القيم إلى منطقي.",
        valueMap: { "1": "true", "0": "false", yes: "true", no: "false", y: "true", n: "false", active: "true", inactive: "false", نعم: "true", لا: "false" },
      };

    case "enum": {
      const isStatus = /(status|state|حالة)/.test(name);
      const targetVals = target.enumValues ?? [];
      return {
        kind: isStatus ? "status_mapping" : "enum_mapping",
        description: isStatus ? "تطبيع الحالة إلى قيم النظام الجديد القياسية." : "تطبيع التعداد إلى القيم القياسية.",
        valueMap: targetVals.length > 0 ? Object.fromEntries(targetVals.map((v) => [v, v])) : undefined,
      };
    }

    case "integer":
    case "decimal":
      if (/(text|char|varchar|mixed)/.test(oldType)) {
        return { kind: "number_parsing", description: "تحويل النصّ إلى رقم." };
      }
      return NONE;

    case "text":
      if (/(name|title|اسم)/.test(name)) return { kind: "trim", description: "إزالة المسافات الزائدة." };
      if (/(country|دولة|بلد)/.test(name)) return { kind: "country_normalization", description: "توحيد اسم الدولة/رمزها." };
      if (/(address|عنوان)/.test(name)) return { kind: "address_parsing", description: "تفكيك/تنظيف العنوان." };
      if (oldType === "mixed") return { kind: "text_cleaning", description: "تنظيف قيم غير متسقة." };
      return NONE;

    default:
      return NONE;
  }
}

export const TRANSFORMATION_LABELS: Record<TransformationKind, string> = {
  none: "بلا تحويل",
  trim: "إزالة مسافات",
  uppercase: "أحرف كبيرة",
  lowercase: "أحرف صغيرة",
  text_cleaning: "تنظيف نصّ",
  date_conversion: "تحويل تاريخ",
  currency_conversion: "تحويل عملة",
  boolean_mapping: "تحويل منطقي",
  enum_mapping: "تطبيع تعداد",
  status_mapping: "تطبيع حالة",
  unit_conversion: "تحويل وحدة",
  encoding_conversion: "تحويل ترميز",
  phone_formatting: "تنسيق هاتف",
  email_validation: "تحقّق بريد",
  country_normalization: "توحيد دولة",
  address_parsing: "تفكيك عنوان",
  number_parsing: "تحويل رقم",
};
