import { describe, it, expect } from "vitest";
import type { TransformRule, RuleKind } from "@/lib/transformation/rule-types";
import { RULE_STAGE } from "@/lib/transformation/rule-types";
import type { BusinessRule } from "@/lib/transformation/business-rules";
import type { SimulationPlan, EntityPlan, RelationshipSpec, DigitalTwin, EntityBreakdown } from "./simulation-types";
import { createTwin, loadRow, hasKey, duplicateKeys } from "./digital-twin";
import { deriveExpectations, validateRow } from "./validators";
import { replayMigration } from "./replay-engine";
import { analyzeDifferences } from "./difference-analyzer";
import { validateRelationships, detectCircular } from "./relationship-validator";
import { validateBusiness } from "./business-validator";
import { simulatePerformance, pickStrategy, heavyRuleCount } from "./performance-simulator";
import { simulateFailures } from "./failure-simulator";
import { simulateRollback } from "./rollback-simulator";
import { predictRisks } from "./risk-engine";
import { computeApprovalScore } from "./approval-score";
import { buildRecommendations } from "./recommendations";
import { runSimulationReport } from "./simulation-report";

// ── مصانع مساعدة ──
function rule(targetField: string, kind: RuleKind, sourceFields: string[] = [targetField], config: Record<string, unknown> = {}): TransformRule {
  return { id: `r_${targetField}`, targetField, sourceFields, kind, stage: RULE_STAGE[kind], config, confidence: 95, reason: "", enabled: true };
}
function entity(name: string, keyField: string | null, rows: Array<Record<string, string>>, rules: TransformRule[]): EntityPlan {
  return { entity: name, label: name, keyField, rules, rows };
}
function plan(entities: EntityPlan[], relationships: RelationshipSpec[] = [], businessRules: BusinessRule[] = []): SimulationPlan {
  return { entities, businessRules, relationships, domain: "generic" };
}

describe("Digital Twin", () => {
  it("يحمّل الصفوف ويفهرس المفاتيح", () => {
    const twin = createTwin([entity("customers", "id", [], [])], [], "generic");
    loadRow(twin, "customers", { id: "1", name: "أحمد" });
    loadRow(twin, "customers", { id: "2", name: "سارة" });
    loadRow(twin, "customers", { id: "1", name: "مكرر" });
    expect(hasKey(twin, "customers", "1")).toBe(true);
    expect(hasKey(twin, "customers", "9")).toBe(false);
    const te = twin.entities.get("customers")!;
    expect(te.rows.length).toBe(3);
    expect(duplicateKeys(te)).toEqual([{ value: "1", count: 2 }]);
  });
});

describe("Validators", () => {
  it("يشتقّ التوقّعات من أنواع القواعد", () => {
    const exps = deriveExpectations([rule("email", "email_format"), rule("age", "convert_currency"), rule("id", "copy")]);
    expect(exps.find((e) => e.field === "email")?.type).toBe("email");
    expect(exps.find((e) => e.field === "age")?.type).toBe("number");
    expect(exps.find((e) => e.field === "id")?.identity).toBe(true);
  });
  it("يكشف فقدان البيانات والبريد غير الصالح", () => {
    const exps = deriveExpectations([rule("email", "email_format", ["email"]), rule("name", "copy", ["name"])]);
    const issues = validateRow(exps, { email: "a@b.com", name: "أحمد" }, { email: "غير-صالح", name: "" });
    expect(issues.some((i) => i.issueType === "invalid_email")).toBe(true);
    expect(issues.some((i) => i.issueType === "data_loss" && i.field === "name")).toBe(true);
  });
});

describe("Replay Engine", () => {
  it("يعيد التنفيذ ويملأ الـTwin ويحسب المصائر", () => {
    const p = plan([entity("customers", "id", [{ id: "1", name: "أ" }, { id: "2", name: "ب" }], [rule("id", "copy"), rule("name", "copy")])]);
    const res = replayMigration(p);
    expect(res.outcomes.migrated).toBe(2);
    expect(res.twin.entities.get("customers")!.rows.length).toBe(2);
    expect(res.steps.length).toBeGreaterThan(5);
  });

  it("يكشف العلاقات المكسورة أثناء الإعادة", () => {
    const rel: RelationshipSpec = { fromEntity: "orders", toEntity: "customers", kind: "parent_child", viaColumns: ["customer_id"], confidence: 80 };
    const p = plan(
      [
        entity("customers", "id", [{ id: "1" }, { id: "2" }], [rule("id", "copy")]),
        entity("orders", "id", [{ id: "10", customer_id: "1" }, { id: "11", customer_id: "99" }], [rule("id", "copy"), rule("customer_id", "copy")]),
      ],
      [rel]
    );
    const res = replayMigration(p);
    expect(res.issues.some((i) => i.issueType === "broken_relation")).toBe(true);
  });
});

describe("Difference Analyzer", () => {
  it("يميّز الفرق المتوقّع من غير المتوقّع", () => {
    const byEntity: EntityBreakdown[] = [
      { entity: "a", label: "a", sourceRows: 10, targetRows: 8, migrated: 8, skipped: 2, archived: 0, failed: 0 },
      { entity: "b", label: "b", sourceRows: 10, targetRows: 5, migrated: 5, skipped: 0, archived: 0, failed: 0 },
    ];
    const diff = analyzeDifferences(byEntity);
    expect(diff.counts[0].expected).toBe(true);
    expect(diff.counts[1].expected).toBe(false);
    expect(diff.unexpectedCount).toBe(1);
  });
});

describe("Relationship Validator", () => {
  it("يحسب المراجع المكسورة", () => {
    const twin: DigitalTwin = createTwin(
      [entity("customers", "id", [], []), entity("orders", "id", [], [])],
      [{ fromEntity: "orders", toEntity: "customers", kind: "parent_child", viaColumns: ["customer_id"], confidence: 80 }],
      "generic"
    );
    loadRow(twin, "customers", { id: "1" });
    loadRow(twin, "orders", { id: "10", customer_id: "1" });
    loadRow(twin, "orders", { id: "11", customer_id: "77" });
    const rep = validateRelationships(twin);
    expect(rep.totalBroken).toBe(1);
    expect(rep.passed).toBe(false);
  });
  it("يكتشف الدورات", () => {
    const cycles = detectCircular([
      { fromEntity: "a", toEntity: "b", kind: "parent_child", viaColumns: [], confidence: 50 },
      { fromEntity: "b", toEntity: "a", kind: "parent_child", viaColumns: [], confidence: 50 },
    ]);
    expect(cycles.length).toBeGreaterThan(0);
  });
});

describe("Business Validator", () => {
  it("يكشف تسرّب عدد السجلات وانهيار الإجمالي المالي", () => {
    const twin = createTwin([entity("invoices", "id", [], [])], [], "generic");
    loadRow(twin, "invoices", { id: "1", amount: "0" });
    loadRow(twin, "invoices", { id: "2", amount: "0" });
    const p = plan([entity("invoices", "id", [{ id: "1", amount: "100" }, { id: "2", amount: "200" }], [])]);
    const byEntity: EntityBreakdown[] = [{ entity: "invoices", label: "invoices", sourceRows: 2, targetRows: 2, migrated: 2, skipped: 0, archived: 0, failed: 0 }];
    const rep = validateBusiness(p, twin, byEntity);
    expect(rep.checks.some((c) => c.key.startsWith("money:") && !c.passed)).toBe(true);
  });
});

describe("Performance / Failure / Rollback", () => {
  it("يستقرئ سيناريوهات الأداء ويقترح إستراتيجية", () => {
    const perf = simulatePerformance({ entities: [], totalSourceRows: 1000, avgRowBytes: 300, heavyRules: 2, totalRules: 10 });
    expect(perf.scenarios.length).toBe(4);
    expect(perf.strategy.batchSize).toBeGreaterThan(0);
    expect(pickStrategy(8192, 30).batchSize).toBeLessThan(pickStrategy(100, 0).batchSize);
  });
  it("يحاكي الأعطال ويؤكّد الصمود مع طابور متعادل", () => {
    const rep = simulateFailures({ hasCheckpointQueue: true, idempotent: true, batched: true });
    expect(rep.scenarios.length).toBe(8);
    expect(rep.resilient).toBe(true);
  });
  it("يحاكي تراجعًا آمنًا بلا فقدان", () => {
    const twin = createTwin([entity("a", "id", [], [])], [], "generic");
    loadRow(twin, "a", { id: "1" });
    const rb = simulateRollback(twin);
    expect(rb.success).toBe(true);
    expect(rb.dataLoss).toBe(false);
  });
});

describe("Risk + Approval Score (Blocking Rules)", () => {
  const relBroken = { checks: [], totalBroken: 3, totalOrphans: 1, circularChains: [] as string[][], passed: false };
  const bizOk = { checks: [], failures: 0, passed: true };

  it("يرفع المخاطر عند العلاقات المكسورة", () => {
    const perf = simulatePerformance({ entities: [], totalSourceRows: 100, avgRowBytes: 200, heavyRules: 0, totalRules: 3 });
    const risk = predictRisks({
      outcomes: { migrated: 100, skipped: 0, archived: 0, failed: 0 },
      byEntity: [{ entity: "a", label: "a", sourceRows: 100, targetRows: 100, migrated: 100, skipped: 0, archived: 0, failed: 0 }],
      issues: [], relationships: { ...relBroken, checks: [] }, business: bizOk, performance: perf, domain: "generic",
    });
    expect(risk.riskScore).toBeGreaterThan(0);
    expect(risk.risks.some((r) => r.key === "broken_relations")).toBe(true);
  });

  it("يمنع الاعتماد عند العلاقات المكسورة (Blocking Rule)", () => {
    const perf = simulatePerformance({ entities: [], totalSourceRows: 100, avgRowBytes: 200, heavyRules: 0, totalRules: 3 });
    const risk = predictRisks({
      outcomes: { migrated: 100, skipped: 0, archived: 0, failed: 0 },
      byEntity: [{ entity: "a", label: "a", sourceRows: 100, targetRows: 100, migrated: 100, skipped: 0, archived: 0, failed: 0 }],
      issues: [], relationships: { ...relBroken, checks: [] }, business: bizOk, performance: perf, domain: "generic",
    });
    const score = computeApprovalScore({
      outcomes: { migrated: 100, skipped: 0, archived: 0, failed: 0 },
      byEntity: [{ entity: "a", label: "a", sourceRows: 100, targetRows: 100, migrated: 100, skipped: 0, archived: 0, failed: 0 }],
      issues: [], relationships: { ...relBroken, checks: [] }, business: bizOk, risk,
      rollback: { success: true, estimatedSeconds: 1, dataLoss: false, coverage: 100, entities: [], notes: [] },
    });
    expect(score.blocked).toBe(true);
    expect(score.verdict).toBe("not_ready");
    expect(score.blockers.length).toBeGreaterThan(0);
  });

  it("يعتمد المحاكاة النظيفة", () => {
    const clean = { checks: [], totalBroken: 0, totalOrphans: 0, circularChains: [] as string[][], passed: true };
    const perf = simulatePerformance({ entities: [], totalSourceRows: 100, avgRowBytes: 200, heavyRules: 0, totalRules: 3 });
    const risk = predictRisks({
      outcomes: { migrated: 100, skipped: 0, archived: 0, failed: 0 },
      byEntity: [{ entity: "a", label: "a", sourceRows: 100, targetRows: 100, migrated: 100, skipped: 0, archived: 0, failed: 0 }],
      issues: [], relationships: clean, business: bizOk, performance: perf, domain: "generic",
    });
    const score = computeApprovalScore({
      outcomes: { migrated: 100, skipped: 0, archived: 0, failed: 0 },
      byEntity: [{ entity: "a", label: "a", sourceRows: 100, targetRows: 100, migrated: 100, skipped: 0, archived: 0, failed: 0 }],
      issues: [], relationships: clean, business: bizOk, risk,
      rollback: { success: true, estimatedSeconds: 1, dataLoss: false, coverage: 100, entities: [], notes: [] },
    });
    expect(score.blocked).toBe(false);
    expect(score.score).toBeGreaterThanOrEqual(90);
  });
});

describe("Recommendations + End-to-End Report", () => {
  it("يولّد توصيات مرتّبة", () => {
    const perf = simulatePerformance({ entities: [], totalSourceRows: 100, avgRowBytes: 200, heavyRules: 0, totalRules: 3 });
    const recs = buildRecommendations({
      byEntity: [{ entity: "a", label: "a", sourceRows: 9000, targetRows: 9000, migrated: 9000, skipped: 0, archived: 0, failed: 0 }],
      issues: [], relationships: { checks: [], totalBroken: 0, totalOrphans: 0, circularChains: [], passed: true },
      business: { checks: [], failures: 0, passed: true }, risk: predictRisks({
        outcomes: { migrated: 9000, skipped: 0, archived: 0, failed: 0 },
        byEntity: [{ entity: "a", label: "a", sourceRows: 9000, targetRows: 9000, migrated: 9000, skipped: 0, archived: 0, failed: 0 }],
        issues: [], relationships: { checks: [], totalBroken: 0, totalOrphans: 0, circularChains: [], passed: true }, business: { checks: [], failures: 0, passed: true }, performance: perf, domain: "generic",
      }), performance: perf,
    });
    expect(recs.length).toBeGreaterThan(0);
    expect(recs[0].order).toBe(1);
  });

  it("ينتج تقريرًا شاملًا متماسكًا (Digital Twin end-to-end)", () => {
    const rel: RelationshipSpec = { fromEntity: "orders", toEntity: "customers", kind: "parent_child", viaColumns: ["customer_id"], confidence: 80 };
    const p = plan(
      [
        entity("customers", "id", [{ id: "1", email: "a@b.com" }, { id: "2", email: "c@d.com" }], [rule("id", "copy"), rule("email", "email_format", ["email"])]),
        entity("orders", "id", [{ id: "10", customer_id: "1", amount: "100" }, { id: "11", customer_id: "2", amount: "50" }], [rule("id", "copy"), rule("customer_id", "copy"), rule("amount", "copy")]),
      ],
      [rel]
    );
    const report = runSimulationReport(p);
    expect(report.summary.totalSourceRows).toBe(4);
    expect(report.approval.score).toBeGreaterThanOrEqual(0);
    expect(report.approval.score).toBeLessThanOrEqual(100);
    expect(report.steps.length).toBeGreaterThan(5);
    expect(report.performance.scenarios.length).toBe(4);
    expect(report.failure.scenarios.length).toBe(8);
    expect(report.rollback.success).toBe(true);
    expect(Array.isArray(report.recommendations)).toBe(true);
  });

  it("heavyRuleCount يعدّ القواعد الثقيلة", () => {
    expect(heavyRuleCount([entity("a", null, [], [rule("t", "formula"), rule("x", "copy")])])).toBe(1);
  });
});
