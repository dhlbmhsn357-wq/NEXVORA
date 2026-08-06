import { describe, it, expect } from "vitest";
import { verifyData, verifyBusiness, buildFunctionalScenarios } from "./verification-engine";
import { buildHealthReport } from "./health-check";
import { validateKpis } from "./kpi-validation";
import { buildGoLiveChecklist, computeFinalScore, type ChecklistInput } from "./go-live-checklist";
import { buildCertificate } from "./certificate";
import { buildLessons } from "./lessons-learned";
import type { HealthInput } from "./verification-types";

const healthOk: HealthInput = { databaseOk: true, apiOk: true, storageOk: true, queuesOk: true, workersActive: true, cacheOk: true, indexesOk: true, avgQueryMs: 120 };
const checklistAllDone: ChecklistInput = { migrationCompleted: true, verificationPassed: true, businessApproved: true, branchesApproved: true, performancePassed: true, healthPassed: true, rollbackArchived: true, backupsSaved: true, documentationComplete: true };

describe("Data Verification", () => {
  it("يكشف التطابق والفروق", () => {
    const r = verifyData([
      { entity: "customers", label: "العملاء", sourceCount: 100, productionCount: 100 },
      { entity: "invoices", label: "الفواتير", sourceCount: 300, productionCount: 298 },
    ]);
    expect(r.checks[0].matched).toBe(true);
    expect(r.checks[1].matched).toBe(false);
    expect(r.fullyMatched).toBe(false);
    expect(r.matchedCount).toBe(1);
  });
  it("fullyMatched عند تطابق الكل", () => {
    const r = verifyData([{ entity: "a", label: "a", sourceCount: 5, productionCount: 5 }]);
    expect(r.fullyMatched).toBe(true);
  });
});

describe("Business Verification", () => {
  it("ينجح عند نظافة كل الإشارات", () => {
    const items = verifyBusiness({ dataFullyMatched: true, brokenRelations: 0, businessFailures: 0, dataLossCount: 0, criticalIssues: 0 });
    expect(items.filter((i) => i.state === "fail")).toHaveLength(0);
    expect(items.find((i) => i.key === "workflow")?.state).toBe("pending");
  });
  it("يفشل عند علاقات مكسورة", () => {
    const items = verifyBusiness({ dataFullyMatched: false, brokenRelations: 3, businessFailures: 1, dataLossCount: 2, criticalIssues: 1 });
    expect(items.find((i) => i.key === "relationships")?.state).toBe("fail");
  });
  it("يولّد ٨ سيناريوهات وظيفية معلّقة", () => {
    const s = buildFunctionalScenarios();
    expect(s).toHaveLength(8);
    expect(s.every((x) => x.state === "pending")).toBe(true);
  });
});

describe("Health Check", () => {
  it("ينجح عند صحة كاملة", () => {
    const r = buildHealthReport(healthOk);
    expect(r.passed).toBe(true);
    expect(r.score).toBe(100);
  });
  it("يفشل عند غياب قاعدة البيانات (حاجز)", () => {
    expect(buildHealthReport({ ...healthOk, databaseOk: false }).passed).toBe(false);
  });
  it("يعلّم الأداء المرتفع", () => {
    const r = buildHealthReport({ ...healthOk, avgQueryMs: 900 });
    expect(r.components.find((c) => c.key === "performance")?.ok).toBe(false);
  });
});

describe("KPI Validation", () => {
  it("يميّز الحفاظ/التحسّن/التدهور/المفقود", () => {
    const r = validateKpis([
      { key: "revenue", label: "الإيرادات", before: 1000, after: 1000 },
      { key: "orders", label: "الطلبات", before: 200, after: 260 },
      { key: "profit", label: "الأرباح", before: 500, after: 300 },
      { key: "inventory", label: "المخزون", before: 800, after: 0 },
    ]);
    expect(r.checks[0].verdict).toBe("preserved");
    expect(r.checks[1].verdict).toBe("improved");
    expect(r.checks[2].verdict).toBe("degraded");
    expect(r.checks[3].verdict).toBe("missing");
    expect(r.passed).toBe(false);
  });
});

describe("Go Live Checklist + Final Score", () => {
  it("جاهز عند اكتمال كل البنود الحاجزة", () => {
    const cl = buildGoLiveChecklist(checklistAllDone);
    expect(cl.ready).toBe(true);
    expect(cl.blockers).toHaveLength(0);
  });
  it("محظور عند غياب اعتماد الفروع", () => {
    const cl = buildGoLiveChecklist({ ...checklistAllDone, branchesApproved: false });
    expect(cl.ready).toBe(false);
    expect(cl.blockers.length).toBeGreaterThan(0);
  });
  it("يحسب درجات التحقّق والقبول والنهائية", () => {
    const s = computeFinalScore({ dataMatchRatio: 1, businessPassRatio: 1, departmentsApprovedRatio: 1, branchesApprovedRatio: 1, healthScore: 100, kpiPassRatio: 1, openIssues: 0 });
    expect(s.finalMigrationScore).toBeGreaterThanOrEqual(95);
    expect(s.goLiveStatus).toBe("ready");
  });
  it("conditional عند وجود مشكلات مفتوحة", () => {
    const s = computeFinalScore({ dataMatchRatio: 1, businessPassRatio: 1, departmentsApprovedRatio: 1, branchesApprovedRatio: 1, healthScore: 100, kpiPassRatio: 1, openIssues: 2 });
    expect(s.goLiveStatus).toBe("conditional");
  });
});

describe("Certificate", () => {
  const score = computeFinalScore({ dataMatchRatio: 1, businessPassRatio: 1, departmentsApprovedRatio: 1, branchesApprovedRatio: 1, healthScore: 100, kpiPassRatio: 1, openIssues: 0 });
  it("يُصدر الشهادة عند الجاهزية الكاملة", () => {
    const r = buildCertificate({ projectName: "P", migrationVersion: "v1", checklist: buildGoLiveChecklist(checklistAllDone), score, approvers: [{ role: "owner", scope: "go_live" }] });
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.data.finalMigrationScore).toBeGreaterThanOrEqual(95);
  });
  it("يرفض الإصدار عند نقص بند حاجز", () => {
    const r = buildCertificate({ projectName: "P", migrationVersion: "v1", checklist: buildGoLiveChecklist({ ...checklistAllDone, healthPassed: false }), score, approvers: [] });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.blockers.length).toBeGreaterThan(0);
  });
});

describe("Lessons Learned", () => {
  it("يولّد دروسًا وملخّصًا", () => {
    const r = buildLessons({ domain: "erp", dataMismatches: 1, brokenRelations: 0, businessFailures: 0, openIssues: 0, reviewTasks: 0, chunkSize: 1000, workerCount: 4, durationMin: 12, finalScore: 96 });
    expect(r.lessons.length).toBeGreaterThan(0);
    expect(r.lessons.some((l) => l.category === "best_practice")).toBe(true);
    expect(r.summary).toContain("erp");
  });
});
