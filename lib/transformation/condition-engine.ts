import type { Row, RuleCondition } from "./rule-types";

/**
 * محرّك الشروط — **وحدة نقية بلا I/O**.
 *
 * يقيّم شروط IF/THEN/ELSE ومركّبات AND/OR على صفّ بيانات. أساس القواعد
 * الشرطية وقواعد العمل («إذا كان العميل غير نشط → لا تُرحِّل اشتراكه»).
 */

export function evaluateCondition(cond: RuleCondition, row: Row): boolean {
  const raw = (row[cond.field] ?? "").trim();
  switch (cond.operator) {
    case "eq": return raw.toLowerCase() === (cond.value ?? "").toLowerCase();
    case "neq": return raw.toLowerCase() !== (cond.value ?? "").toLowerCase();
    case "gt": return num(raw) > num(cond.value);
    case "lt": return num(raw) < num(cond.value);
    case "contains": return raw.toLowerCase().includes((cond.value ?? "").toLowerCase());
    case "empty": return raw === "";
    case "not_empty": return raw !== "";
    case "in": return (cond.values ?? []).map((v) => v.toLowerCase()).includes(raw.toLowerCase());
    default: return false;
  }
}

export type LogicOp = "and" | "or";

export interface CompositeCondition {
  op: LogicOp;
  conditions: RuleCondition[];
}

export function evaluateComposite(comp: CompositeCondition, row: Row): boolean {
  if (comp.conditions.length === 0) return true;
  return comp.op === "and" ? comp.conditions.every((c) => evaluateCondition(c, row)) : comp.conditions.some((c) => evaluateCondition(c, row));
}

function num(v: string | undefined): number {
  const n = parseFloat((v ?? "").replace(/[^\d.-]/g, ""));
  return Number.isFinite(n) ? n : 0;
}

export function describeCondition(cond: RuleCondition): string {
  const ops: Record<RuleCondition["operator"], string> = {
    eq: "=", neq: "≠", gt: ">", lt: "<", contains: "يحتوي", empty: "فارغ", not_empty: "غير فارغ", in: "ضمن",
  };
  return `${cond.field} ${ops[cond.operator]} ${cond.value ?? (cond.values ? cond.values.join("،") : "")}`.trim();
}
