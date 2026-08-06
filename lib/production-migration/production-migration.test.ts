import { describe, it, expect } from "vitest";
import type { RelationshipSpec } from "@/lib/simulation/simulation-types";
import type { TransformRule, RuleKind } from "@/lib/transformation/rule-types";
import { RULE_STAGE } from "@/lib/transformation/rule-types";
import { runPreflight } from "./preflight";
import { planDependencyOrder } from "./dependency-order";
import { planChunks, clampChunkSize, clampWorkers, totalChunks } from "./chunk-planner";
import { executeChunk } from "./execution-core";
import { classifyError, decideRecovery } from "./recovery";
import { buildRollbackPackage } from "./rollback-plan";
import { redactSecrets, buildAuditEvent } from "./audit";
import { computeSnapshot, detectAlerts } from "./monitoring";
import type { PreflightInput, OrderedEntity, EntityCount } from "./execution-types";

function rule(targetField: string, kind: RuleKind, sourceFields: string[] = [targetField]): TransformRule {
  return { id: `r_${targetField}`, targetField, sourceFields, kind, stage: RULE_STAGE[kind], config: {}, confidence: 95, reason: "", enabled: true };
}

const okInput: PreflightInput = {
  simulationApproved: true, simulationBlocked: false, migrationScore: 95, minScore: 90,
  backupExists: true, rollbackReady: true, databaseAvailable: true, storageAvailable: true,
  diskOk: true, memoryOk: true, queuesReady: true, workersReady: true, apiAvailable: true,
};

describe("Preflight", () => {
  it("يمرّ عند اكتمال كل الشروط", () => {
    const r = runPreflight(okInput);
    expect(r.passed).toBe(true);
    expect(r.checks).toHaveLength(12);
  });
  it("يمنع عند غياب المحاكاة المعتمَدة أو النسخة الاحتياطية (Blocking)", () => {
    expect(runPreflight({ ...okInput, simulationApproved: false }).passed).toBe(false);
    expect(runPreflight({ ...okInput, backupExists: false }).passed).toBe(false);
    expect(runPreflight({ ...okInput, simulationBlocked: true }).passed).toBe(false);
    expect(runPreflight({ ...okInput, migrationScore: 50 }).passed).toBe(false);
  });
  it("لا يمنع على تحذير غير حاجز (ذاكرة/عمّال)", () => {
    const r = runPreflight({ ...okInput, memoryOk: false, workersReady: false });
    expect(r.passed).toBe(true);
    expect(r.checks.some((c) => c.key === "memory_available" && !c.passed)).toBe(true);
  });
});

describe("Dependency Order", () => {
  const entities: EntityCount[] = [
    { entity: "customers", label: "العملاء", rows: 100 },
    { entity: "invoices", label: "الفواتير", rows: 300 },
    { entity: "payments", label: "المدفوعات", rows: 500 },
  ];
  const rels: RelationshipSpec[] = [
    { fromEntity: "invoices", toEntity: "customers", kind: "parent_child", viaColumns: ["customer_id"], confidence: 80 },
    { fromEntity: "payments", toEntity: "invoices", kind: "parent_child", viaColumns: ["invoice_id"], confidence: 80 },
  ];
  it("يرحّل الأب قبل الابن (Customers→Invoices→Payments)", () => {
    const plan = planDependencyOrder(entities, rels);
    const idx = (e: string) => plan.ordered.findIndex((o) => o.entity === e);
    expect(idx("customers")).toBeLessThan(idx("invoices"));
    expect(idx("invoices")).toBeLessThan(idx("payments"));
    expect(plan.ordered.find((o) => o.entity === "customers")!.level).toBe(0);
    expect(plan.ordered.find((o) => o.entity === "payments")!.level).toBe(2);
  });
  it("يكسر الدورات لضمان التقدّم", () => {
    const cyc: RelationshipSpec[] = [
      { fromEntity: "a", toEntity: "b", kind: "parent_child", viaColumns: [], confidence: 50 },
      { fromEntity: "b", toEntity: "a", kind: "parent_child", viaColumns: [], confidence: 50 },
    ];
    const plan = planDependencyOrder([{ entity: "a", label: "a", rows: 1 }, { entity: "b", label: "b", rows: 1 }], cyc);
    expect(plan.brokenCycles.length).toBeGreaterThan(0);
    expect(plan.ordered).toHaveLength(2);
  });
});

describe("Chunk Planner", () => {
  it("يقسّم الصفوف لدفعات ويحترم الحدود", () => {
    expect(clampChunkSize(50)).toBe(100);
    expect(clampChunkSize(99999)).toBe(10000);
    expect(clampWorkers(999)).toBe(12);
    const ordered: OrderedEntity[] = [{ entity: "a", label: "a", rows: 2500, level: 0, order: 1 }];
    const tasks = planChunks(ordered, 1000);
    expect(tasks).toHaveLength(3);
    expect(tasks[0].rowStart).toBe(0);
    expect(tasks[2].rowEnd).toBe(2500);
    expect(totalChunks(ordered, 1000)).toBe(3);
  });
  it("ينشئ دفعة واحدة على الأقل لكيان فارغ", () => {
    const tasks = planChunks([{ entity: "a", label: "a", rows: 0, level: 0, order: 1 }], 1000);
    expect(tasks).toHaveLength(1);
  });
});

describe("Execution Core", () => {
  it("ينفّذ دفعة ويتحقّق من تطابق العدد", () => {
    const rules = [rule("id", "copy"), rule("name", "copy")];
    const res = executeChunk(rules, [], [{ id: "1", name: "أ" }, { id: "2", name: "ب" }]);
    expect(res.migrated).toBe(2);
    expect(res.loaded).toHaveLength(2);
    expect(res.countMatch).toBe(true);
  });
});

describe("Recovery", () => {
  it("يصنّف الأخطاء ويقرّر الاستجابة", () => {
    expect(classifyError("connection timeout")).toBe("transient");
    expect(classifyError("duplicate key value violates unique constraint")).toBe("constraint");
    expect(classifyError("out of memory")).toBe("resource");
    expect(decideRecovery("deadlock detected", 0, 3).action).toBe("retry");
    expect(decideRecovery("deadlock detected", 3, 3).action).toBe("review");
    expect(decideRecovery("duplicate key", 0, 3).action).toBe("review");
    expect(decideRecovery("something weird", 0, 3).errorClass).toBe("unknown");
  });
});

describe("Rollback Package", () => {
  it("يحذف الأبناء قبل الآباء (ترتيب عكسي)", () => {
    const ordered: OrderedEntity[] = [
      { entity: "customers", label: "c", rows: 100, level: 0, order: 1 },
      { entity: "invoices", label: "i", rows: 300, level: 1, order: 2 },
      { entity: "payments", label: "p", rows: 500, level: 2, order: 3 },
    ];
    const pkg = buildRollbackPackage(ordered, { customers: 100, invoices: 300, payments: 500 });
    expect(pkg.reverseOrder[0]).toBe("payments");
    expect(pkg.reverseOrder[2]).toBe("customers");
    expect(pkg.steps[0].rowCount).toBe(500);
  });
});

describe("Audit / Security", () => {
  it("ينقّي الأسرار بعمق", () => {
    const redacted = redactSecrets({ user: "ali", password: "x", nested: { api_key: "k", ok: "v" }, arr: [{ token: "t" }] }) as Record<string, unknown>;
    expect(redacted.user).toBe("ali");
    expect(redacted.password).toBe("[REDACTED]");
    expect((redacted.nested as Record<string, unknown>).api_key).toBe("[REDACTED]");
    expect((redacted.nested as Record<string, unknown>).ok).toBe("v");
    expect(((redacted.arr as unknown[])[0] as Record<string, unknown>).token).toBe("[REDACTED]");
  });
  it("يبني حدث تدقيق منقّى", () => {
    const ev = buildAuditEvent("execution_started", "u1", { connection_string: "postgres://x", chunk: 5 });
    expect(ev.detail.connection_string).toBe("[REDACTED]");
    expect(ev.detail.chunk).toBe(5);
  });
});

describe("Monitoring", () => {
  it("يحسب لقطة التقدّم والسرعة والزمن المتبقّي", () => {
    const snap = computeSnapshot({ totalRows: 1000, processedRows: 400, elapsedSeconds: 10, currentEntity: "a", currentChunk: 2, errors: 0, warnings: 1, retries: 0, completedChunks: 2, totalChunksCount: 5 });
    expect(snap.progress).toBe(40);
    expect(snap.speedRowsPerSec).toBe(40);
    expect(snap.remainingRows).toBe(600);
    expect(snap.estimatedFinishSeconds).toBe(15);
  });
  it("يكتشف تنبيه ارتفاع الأخطاء (critical)", () => {
    const alerts = detectAlerts({ totalRows: 1000, processedRows: 100, elapsedSeconds: 5, currentEntity: "a", currentChunk: 1, errors: 3, warnings: 0, retries: 0, completedChunks: 2, totalChunksCount: 5 });
    expect(alerts.some((a) => a.severity === "critical")).toBe(true);
  });
});
