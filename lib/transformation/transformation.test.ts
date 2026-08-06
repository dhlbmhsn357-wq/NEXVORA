import { describe, it, expect } from "vitest";
import { evaluateFormula } from "./formula-engine";
import { evaluateCondition, evaluateComposite } from "./condition-engine";
import { applyRule } from "./operations";
import { generateRules, countRulesByKind, type FieldMappingInput } from "./rule-generator";
import { transformRow, previewPipeline, buildPipeline } from "./pipeline";
import { decideRow, defaultBusinessRules, type BusinessRule } from "./business-rules";
import { recommendTemplates } from "./rule-library";
import { buildGraph } from "./graph";
import { buildReport } from "./report";
import { needsReview, REVIEW_THRESHOLD } from "./confidence";
import type { TransformRule } from "./rule-types";

function rule(partial: Partial<TransformRule> & { id: string; targetField: string; kind: TransformRule["kind"] }): TransformRule {
  return { sourceFields: [partial.targetField], stage: "normalize", config: {}, confidence: 95, reason: "", enabled: true, ...partial } as TransformRule;
}

// ============================================================
describe("formula-engine", () => {
  it("يقيّم حسابًا بأولوية العمليات", () => {
    expect(evaluateFormula("2 + 3 * 4", {}).value).toBe("14");
    expect(evaluateFormula("(2 + 3) * 4", {}).value).toBe("20");
  });
  it("يستبدل مراجع الحقول", () => {
    expect(evaluateFormula("[price] * [qty]", { price: "10", qty: "3" }).value).toBe("30");
  });
  it("يدعم الدوال", () => {
    expect(evaluateFormula("round(3.14159, 2)", {}).value).toBe("3.14");
    expect(evaluateFormula("max(1, 5, 3)", {}).value).toBe("5");
  });
  it("لا يستخدم eval ويرفض الرموز الغريبة", () => {
    expect(evaluateFormula("alert(1)", {}).ok).toBe(false);
  });
  it("قسمة على صفر آمنة", () => {
    expect(evaluateFormula("5 / 0", {}).value).toBe("0");
  });
});

// ============================================================
describe("condition-engine", () => {
  it("يقيّم شروطًا مفردة", () => {
    expect(evaluateCondition({ field: "status", operator: "eq", value: "active" }, { status: "Active" })).toBe(true);
    expect(evaluateCondition({ field: "age", operator: "gt", value: "18" }, { age: "25" })).toBe(true);
    expect(evaluateCondition({ field: "email", operator: "empty" }, { email: "" })).toBe(true);
  });
  it("AND/OR مركّبة", () => {
    const comp = { op: "and" as const, conditions: [{ field: "a", operator: "eq" as const, value: "1" }, { field: "b", operator: "eq" as const, value: "2" }] };
    expect(evaluateComposite(comp, { a: "1", b: "2" })).toBe(true);
    expect(evaluateComposite(comp, { a: "1", b: "3" })).toBe(false);
  });
});

// ============================================================
describe("operations", () => {
  it("uppercase/trim/phone/date", () => {
    expect(applyRule(rule({ id: "1", targetField: "name", kind: "uppercase" }), { name: "ali" }).value).toBe("ALI");
    expect(applyRule(rule({ id: "2", targetField: "n", kind: "trim" }), { n: "  a  b  " }).value).toBe("a b");
    expect(applyRule(rule({ id: "3", targetField: "phone", kind: "phone_format" }), { phone: "0100 123 4567" }).value.startsWith("+")).toBe(true);
    expect(applyRule(rule({ id: "4", targetField: "d", kind: "convert_date" }), { d: "25/12/2023" }).value).toBe("2023-12-25");
  });
  it("merge/split", () => {
    expect(applyRule(rule({ id: "5", targetField: "full", kind: "merge", sourceFields: ["first", "last"], config: { separator: " " } }), { first: "Ali", last: "Hassan" }).value).toBe("Ali Hassan");
    expect(applyRule(rule({ id: "6", targetField: "f", kind: "split", sourceFields: ["full"], config: { separator: " ", index: 1 } }), { full: "Ali Hassan" }).value).toBe("Hassan");
  });
  it("boolean/status mapping + formula + generate_id", () => {
    expect(applyRule(rule({ id: "7", targetField: "b", kind: "boolean_mapping", sourceFields: ["b"] }), { b: "yes" }).value).toBe("true");
    expect(applyRule(rule({ id: "8", targetField: "s", kind: "status_mapping", sourceFields: ["s"], config: { map: { closed: "completed" } } }), { s: "closed" }).value).toBe("completed");
    expect(applyRule(rule({ id: "9", targetField: "total", kind: "formula", config: { expression: "[a] + [b]" } }), { a: "2", b: "3" }).value).toBe("5");
    expect(applyRule(rule({ id: "10", targetField: "id", kind: "generate_id", config: { prefix: "C" } }), {}, { seq: 4 }).value).toBe("C-5");
  });
});

// ============================================================
describe("rule-generator", () => {
  const mappings: FieldMappingInput[] = [
    { oldObject: "tbl_customer", oldField: "customer_name", newEntity: "customer", newField: "name", kind: "direct", transformationKind: "trim", confidence: 92 },
    { oldObject: "tbl_customer", oldField: "mobile", newEntity: "customer", newField: "phone", kind: "direct", transformationKind: "phone_formatting", confidence: 88 },
    { oldObject: "tbl_customer", oldField: "created_on", newEntity: "customer", newField: "created_at", kind: "direct", transformationKind: "date_conversion", confidence: 95 },
    { oldObject: "orders", oldField: "x", newEntity: "order", newField: null, kind: "unmapped", confidence: 0 },
  ];
  it("يشتقّ قواعد من Mapping المرحلة ٢", () => {
    const rules = generateRules(mappings);
    expect(rules).toHaveLength(3); // unmapped مستبعَد
    expect(rules.find((r) => r.targetField === "phone")!.kind).toBe("phone_format");
    expect(rules.find((r) => r.targetField === "created_at")!.kind).toBe("convert_date");
  });
  it("منخفض الثقة يحتاج مراجعة", () => {
    const rules = generateRules(mappings);
    expect(rules.find((r) => r.confidence === 88 && needsReview(r.confidence))).toBeTruthy();
    expect(Object.keys(countRulesByKind(rules)).length).toBeGreaterThan(0);
  });
});

// ============================================================
describe("pipeline", () => {
  it("buildPipeline يرتّب القواعد بالمراحل", () => {
    const rules = [rule({ id: "1", targetField: "phone", kind: "phone_format", stage: "normalize" }), rule({ id: "2", targetField: "total", kind: "formula", stage: "compute" })];
    const p = buildPipeline(rules);
    expect(p[0].stage).toBe("normalize");
    expect(p[p.length - 1].stage).toBe("compute");
  });
  it("transformRow ينفّذ ويرجّع أثرًا", () => {
    const rules = [rule({ id: "1", targetField: "name", kind: "uppercase", sourceFields: ["name"] })];
    const res = transformRow(rules, [], { name: "ali" });
    expect(res.output.name).toBe("ALI");
    expect(res.traces[0].oldValue).toBe("ali");
    expect(res.traces[0].newValue).toBe("ALI");
  });
  it("previewPipeline يحترم سقف الصفوف", () => {
    const rows = Array.from({ length: 100 }, (_, i) => ({ name: `n${i}` }));
    expect(previewPipeline([rule({ id: "1", targetField: "name", kind: "trim", sourceFields: ["name"] })], [], rows, 10)).toHaveLength(10);
  });
});

// ============================================================
describe("business-rules", () => {
  it("قرار الصفّ: تخطّي العميل غير النشط", () => {
    const brs: BusinessRule[] = [{ id: "b1", entity: "customer", title: "غير نشط", condition: { op: "and", conditions: [{ field: "is_active", operator: "eq", value: "false" }] }, action: "skip", confidence: 80, reason: "", enabled: true }];
    expect(decideRow(brs, { is_active: "false" }).action).toBe("skip");
    expect(decideRow(brs, { is_active: "true" }).action).toBe("migrate");
  });
  it("defaultBusinessRules يقترح حسب الكيانات", () => {
    const brs = defaultBusinessRules(["customer", "invoice"]);
    expect(brs.some((b) => b.entity === "invoice" && b.action === "archive")).toBe(true);
  });
});

// ============================================================
describe("library + graph + report + confidence", () => {
  it("recommendTemplates يجمع المجال والعامّة", () => {
    const t = recommendTemplates("accounting");
    expect(t.some((x) => x.key === "total_calc")).toBe(true);
    expect(t.some((x) => x.key === "email_norm")).toBe(true);
  });
  it("buildGraph ينشئ عُقدًا وحوافًا", () => {
    const g = buildGraph([rule({ id: "1", targetField: "phone", kind: "phone_format", sourceFields: ["mobile"] })]);
    expect(g.nodes.some((n) => n.type === "source" && n.label === "mobile")).toBe(true);
    expect(g.nodes.some((n) => n.type === "target" && n.label === "phone")).toBe(true);
    expect(g.edges.length).toBe(2);
  });
  it("buildReport يحسب التغطية والتعقيد", () => {
    const rules = [rule({ id: "1", targetField: "name", kind: "trim", confidence: 95 }), rule({ id: "2", targetField: "phone", kind: "phone_format", confidence: 80 })];
    const rep = buildReport(rules, [], 4);
    expect(rep.coverage).toBe(50); // 2 من 4
    expect(rep.stats.reviewQueue).toBe(1);
    expect(["low", "medium", "high", "very_high"]).toContain(rep.complexity);
    expect(rep.performanceEstimate).toContain("ثانية");
  });
  it("العتبة ٩٠", () => {
    expect(REVIEW_THRESHOLD).toBe(90);
    expect(needsReview(89)).toBe(true);
  });
});
