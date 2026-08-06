import type { Row, TransformRule, PipelineStage } from "./rule-types";
import { STAGE_ORDER, RULE_STAGE } from "./rule-types";
import { applyRule, type OpContext } from "./operations";
import { evaluateCondition } from "./condition-engine";
import { decideRow, type BusinessRule, type RowDecision } from "./business-rules";

/**
 * محرّك الـPipeline — **وحدة نقية بلا I/O**.
 *
 * يرتّب القواعد في مراحل (Extract → Normalize → Merge/Split → Convert →
 * Compute → Validate → Business → Ready)، وينفّذها على صفّ **واحد** منتجًا
 * صفًّا جديدًا + أثرًا كاملًا للمعاينة (قديم→جديد+قاعدة+سبب+ثقة). **يُشغَّل
 * على عيّنة للمعاينة فقط، لا على Production.**
 */

export interface PipelineStageGroup {
  stage: PipelineStage;
  rules: TransformRule[];
}

export function buildPipeline(rules: TransformRule[]): PipelineStageGroup[] {
  const byStage = new Map<PipelineStage, TransformRule[]>();
  for (const r of rules) {
    const stage = r.stage ?? RULE_STAGE[r.kind];
    const arr = byStage.get(stage) ?? [];
    arr.push(r);
    byStage.set(stage, arr);
  }
  return STAGE_ORDER.map((stage) => ({ stage, rules: byStage.get(stage) ?? [] })).filter((g) => g.rules.length > 0);
}

export interface FieldTrace {
  targetField: string;
  ruleId: string;
  ruleKind: string;
  oldValue: string;
  newValue: string;
  reason: string;
  confidence: number;
  skipped: boolean;
  note?: string;
}

export interface RowTransformResult {
  input: Row;
  output: Row;
  traces: FieldTrace[];
  decision: RowDecision;
}

/** ينفّذ كل القواعد على صفّ واحد (مرتّبة بالمراحل) مع أثر المعاينة. */
export function transformRow(rules: TransformRule[], businessRules: BusinessRule[], row: Row, ctx: OpContext = {}): RowTransformResult {
  const output: Row = { ...row };
  const traces: FieldTrace[] = [];
  const pipeline = buildPipeline(rules.filter((r) => r.enabled));

  for (const group of pipeline) {
    for (const rule of group.rules) {
      const oldValue = output[rule.targetField] ?? output[rule.sourceFields[0]] ?? "";
      if (rule.condition && !evaluateCondition(rule.condition, output)) {
        traces.push({ targetField: rule.targetField, ruleId: rule.id, ruleKind: rule.kind, oldValue, newValue: oldValue, reason: `الشرط غير متحقّق — تُخطَّى.`, confidence: rule.confidence, skipped: true });
        continue;
      }
      const res = applyRule(rule, output, ctx);
      output[rule.targetField] = res.value;
      traces.push({ targetField: rule.targetField, ruleId: rule.id, ruleKind: rule.kind, oldValue, newValue: res.value, reason: rule.reason, confidence: rule.confidence, skipped: false, note: res.note });
    }
  }

  const decision = decideRow(businessRules, output);
  return { input: row, output, traces, decision };
}

/** معاينة على عيّنة صفوف (سقف للأداء). */
export function previewPipeline(rules: TransformRule[], businessRules: BusinessRule[], rows: Row[], maxRows = 50): RowTransformResult[] {
  return rows.slice(0, maxRows).map((row, i) => transformRow(rules, businessRules, row, { seq: i }));
}
