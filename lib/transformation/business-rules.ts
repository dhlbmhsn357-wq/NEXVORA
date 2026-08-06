import type { Row } from "./rule-types";
import { evaluateComposite, describeCondition, type CompositeCondition } from "./condition-engine";

/**
 * محرّك قواعد العمل — **وحدة نقية بلا I/O**.
 *
 * قواعد على مستوى **السجلّ كاملًا** تقرّر مصيره في الترحيل: ترحيل/تخطّي/
 * أرشفة. مثل: «إذا كان العميل غير نشط → لا تُرحِّل اشتراكه»، «إذا كانت
 * الفاتورة ملغية → أرشفتها».
 */

export type RowAction = "migrate" | "skip" | "archive";

export interface BusinessRule {
  id: string;
  entity: string;
  title: string;
  condition: CompositeCondition;
  action: RowAction;
  confidence: number;
  reason: string;
  enabled: boolean;
}

export interface RowDecision {
  action: RowAction;
  ruleId: string | null;
  reason: string;
}

/** يقيّم قواعد العمل على صفّ ويرجّع القرار (أول قاعدة مطابقة تفوز). */
export function decideRow(rules: BusinessRule[], row: Row): RowDecision {
  for (const r of rules) {
    if (!r.enabled) continue;
    if (evaluateComposite(r.condition, row)) {
      return { action: r.action, ruleId: r.id, reason: `${r.title}: ${r.condition.conditions.map(describeCondition).join(` ${r.condition.op === "and" ? "و" : "أو"} `)} → ${actionLabel(r.action)}` };
    }
  }
  return { action: "migrate", ruleId: null, reason: "لا قاعدة عمل مانعة — يُرحَّل." };
}

export function actionLabel(a: RowAction): string {
  return { migrate: "ترحيل", skip: "تخطّي", archive: "أرشفة" }[a];
}

/** قواعد عمل افتراضية شائعة (تُقترَح، تحتاج اعتماد). */
export function defaultBusinessRules(entities: string[]): BusinessRule[] {
  const out: BusinessRule[] = [];
  const has = (e: string) => entities.some((x) => x.toLowerCase().includes(e));
  let i = 0;
  const mk = (entity: string, title: string, condition: CompositeCondition, action: RowAction, reason: string): BusinessRule => ({
    id: `br_${++i}`, entity, title, condition, action, confidence: 70, reason, enabled: true,
  });

  if (has("customer")) out.push(mk("customer", "عميل غير نشط", { op: "and", conditions: [{ field: "is_active", operator: "eq", value: "false" }] }, "skip", "العملاء غير النشطين لا تُرحَّل اشتراكاتهم."));
  if (has("product")) out.push(mk("product", "منتج محذوف", { op: "and", conditions: [{ field: "deleted", operator: "eq", value: "true" }] }, "skip", "المنتجات المحذوفة لا تُنقَل."));
  if (has("invoice")) out.push(mk("invoice", "فاتورة ملغية", { op: "and", conditions: [{ field: "status", operator: "eq", value: "cancelled" }] }, "archive", "الفواتير الملغية تُؤرشَف لا تُرحَّل."));
  return out;
}
