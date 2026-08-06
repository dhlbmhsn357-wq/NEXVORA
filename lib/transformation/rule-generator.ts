import type { TransformRule, RuleKind } from "./rule-types";
import { RULE_STAGE } from "./rule-types";
import { clampConfidence } from "./confidence";

/**
 * مولّد قواعد التحويل — **وحدة نقية بلا I/O**.
 *
 * يشتقّ قواعد التحويل تلقائيًا من مخرَجات المرحلة ٢ (Mapping الحقول) و٣
 * (قواعد التحويل المطلوبة). لكل حقل مُطابَق → قاعدة (rename/convert_date/
 * phone_format/...). القواعد منخفضة الثقة تُعلَّم للمراجعة. حتمي بالكامل.
 */

/** شكل مطابقة حقل من المرحلة ٢ (بلا اعتماد مباشر على DB). */
export interface FieldMappingInput {
  oldObject: string;
  oldField: string;
  newEntity: string;
  newField: string | null;
  kind: string; // direct | split | merge | multi_source | unmapped
  transformationKind?: string; // من inferTransformation بالمرحلة ٣
  confidence: number;
}

/** يترجم نوع تحويل المرحلة ٣ إلى RuleKind. */
const TRANSFORM_TO_RULE: Record<string, RuleKind> = {
  none: "copy",
  trim: "trim",
  uppercase: "uppercase",
  lowercase: "lowercase",
  text_cleaning: "text_clean",
  date_conversion: "convert_date",
  currency_conversion: "convert_currency",
  number_parsing: "convert_currency",
  boolean_mapping: "boolean_mapping",
  enum_mapping: "enum_mapping",
  status_mapping: "status_mapping",
  unit_conversion: "convert_units",
  encoding_conversion: "encoding",
  phone_formatting: "phone_format",
  email_validation: "email_format",
  country_normalization: "replace_values",
  address_parsing: "address_format",
};

export function generateRules(mappings: FieldMappingInput[]): TransformRule[] {
  const rules: TransformRule[] = [];
  let i = 0;

  for (const m of mappings) {
    if (!m.newField || m.kind === "unmapped") continue;
    const id = `tr_${++i}`;

    let kind: RuleKind;
    const sourceFields = [m.oldField];
    const config: Record<string, unknown> = {};

    if (m.kind === "merge" || m.kind === "multi_source") {
      kind = "merge";
      config.separator = " ";
    } else if (m.kind === "split") {
      kind = "split";
      config.separator = " ";
      config.index = 0;
    } else {
      kind = TRANSFORM_TO_RULE[m.transformationKind ?? "none"] ?? "copy";
      // rename لو تغيّر اسم الحقل بلا تحويل.
      if (kind === "copy" && m.oldField.toLowerCase() !== m.newField.toLowerCase()) kind = "rename";
    }

    if (kind === "replace_values") config.map = {};
    if (kind === "status_mapping" || kind === "enum_mapping") config.map = {};

    const confidence = clampConfidence(m.confidence);
    rules.push({
      id,
      targetField: m.newField,
      sourceFields,
      kind,
      stage: RULE_STAGE[kind],
      config,
      confidence,
      reason: `${m.oldObject}.${m.oldField} → ${m.newEntity}.${m.newField} (${kind}) — مشتقّة من Mapping المرحلة ٢.`,
      enabled: true,
    });
  }

  return rules;
}

/** إحصاء القواعد حسب النوع (للتقرير). */
export function countRulesByKind(rules: TransformRule[]): Record<string, number> {
  const out: Record<string, number> = {};
  for (const r of rules) out[r.kind] = (out[r.kind] ?? 0) + 1;
  return out;
}
