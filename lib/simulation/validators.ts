/**
 * متحقّقات المحاكاة — **وحدة نقية بلا I/O**.
 *
 * تشتقّ توقّعات الحقول حتميًا من قواعد التحويل (المرحلة ٤)، ثم تتحقّق من
 * صفّ الهدف بعد التحويل: حقول مطلوبة، أنواع (بريد/هاتف/تاريخ/رقم)، تعداد،
 * وفقدان بيانات (مصدر مملوء → هدف فارغ). تُستخدم داخل محرّك الإعادة.
 */

import type { Row, TransformRule, RuleKind } from "@/lib/transformation/rule-types";
import type { FieldExpectation } from "./simulation-types";

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const DATE_RE = /^\d{4}-\d{2}-\d{2}([ T]\d{2}:\d{2}(:\d{2})?)?$/;
const IDENTITY_HINT = /(^id$|_id$|^uuid$|email|code$|^sku$|reference$)/i;

/** نوع الحقل المتوقَّع حسب نوع قاعدة التحويل. */
const KIND_TO_TYPE: Partial<Record<RuleKind, FieldExpectation["type"]>> = {
  email_format: "email",
  phone_format: "phone",
  convert_date: "date",
  convert_currency: "number",
  calculated: "number",
  formula: "number",
  boolean_mapping: "boolean",
  status_mapping: "enum",
  enum_mapping: "enum",
};

/** يشتقّ توقّعات الحقول من قواعد كيان (حتمي). */
export function deriveExpectations(rules: TransformRule[]): FieldExpectation[] {
  const out: FieldExpectation[] = [];
  const seen = new Set<string>();
  for (const r of rules) {
    if (seen.has(r.targetField)) continue;
    seen.add(r.targetField);
    const type = KIND_TO_TYPE[r.kind] ?? "text";
    const enumValues = type === "enum" ? Object.values((r.config?.map as Record<string, string>) ?? {}) : undefined;
    out.push({
      field: r.targetField,
      type,
      identity: IDENTITY_HINT.test(r.targetField),
      enumValues: enumValues && enumValues.length ? [...new Set(enumValues)] : undefined,
      sourceField: r.sourceFields[0],
    });
  }
  return out;
}

export interface RowValidationIssue {
  field: string;
  issueType: "missing_required" | "invalid_email" | "invalid_phone" | "invalid_date" | "invalid_number" | "enum_violation" | "data_loss" | "empty_output";
  oldValue: string;
  newValue: string;
}

function isNumber(v: string): boolean {
  const n = Number(v.replace(/[,\s]/g, ""));
  return Number.isFinite(n);
}

function digitCount(v: string): number {
  return (v.match(/\d/g) ?? []).length;
}

/** يتحقّق من صفّ الهدف مقابل التوقّعات + كشف فقدان البيانات مقابل المصدر. */
export function validateRow(expectations: FieldExpectation[], input: Row, output: Row): RowValidationIssue[] {
  const issues: RowValidationIssue[] = [];
  for (const exp of expectations) {
    const newVal = (output[exp.field] ?? "").trim();
    const oldVal = (input[exp.sourceField ?? exp.field] ?? "").trim();

    // فقدان بيانات: المصدر مملوء والهدف فارغ.
    if (oldVal && !newVal) {
      issues.push({ field: exp.field, issueType: exp.identity ? "missing_required" : "data_loss", oldValue: oldVal, newValue: newVal });
      continue;
    }
    if (!newVal) {
      if (exp.identity) issues.push({ field: exp.field, issueType: "missing_required", oldValue: oldVal, newValue: newVal });
      continue;
    }

    switch (exp.type) {
      case "email":
        if (!EMAIL_RE.test(newVal)) issues.push({ field: exp.field, issueType: "invalid_email", oldValue: oldVal, newValue: newVal });
        break;
      case "phone":
        if (digitCount(newVal) < 7) issues.push({ field: exp.field, issueType: "invalid_phone", oldValue: oldVal, newValue: newVal });
        break;
      case "date":
        if (!DATE_RE.test(newVal) && Number.isNaN(Date.parse(newVal))) issues.push({ field: exp.field, issueType: "invalid_date", oldValue: oldVal, newValue: newVal });
        break;
      case "number":
        if (!isNumber(newVal)) issues.push({ field: exp.field, issueType: "invalid_number", oldValue: oldVal, newValue: newVal });
        break;
      case "enum":
        if (exp.enumValues && exp.enumValues.length && !exp.enumValues.includes(newVal)) {
          issues.push({ field: exp.field, issueType: "enum_violation", oldValue: oldVal, newValue: newVal });
        }
        break;
      default:
        break;
    }
  }
  return issues;
}
