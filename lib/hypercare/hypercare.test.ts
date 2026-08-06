import { describe, it, expect } from "vitest";
import { computeHealth } from "./health-score";
import { detectBusinessAnomalies, detectTechnicalAnomalies } from "./anomaly-detection";
import { draftIncident, incidentDedupeKey } from "./incident-model";
import { buildOptimizations } from "./optimization";
import { analyzeTrends, findRecurring } from "./trend-analysis";
import { extractLesson, proposeStandard } from "./learning-engine";
import { clampDuration, windowState } from "./hypercare-window";
import { buildClosure } from "./closure";
import type { HealthSignals } from "./hypercare-types";

const healthy: HealthSignals = { databaseOk: true, apiOk: true, storageOk: true, queuesOk: true, workersActive: true, cacheOk: true, avgQueryMs: 120, errorRatePercent: 0.5, businessStable: true };

describe("Health Score", () => {
  it("درجة عالية عند صحة كاملة", () => {
    const r = computeHealth(healthy);
    expect(r.overall).toBeGreaterThanOrEqual(90);
    expect(r.status).toBe("healthy");
  });
  it("critical عند غياب قاعدة البيانات", () => {
    expect(computeHealth({ ...healthy, databaseOk: false }).status).toBe("critical");
  });
  it("degraded عند ارتفاع الأخطاء", () => {
    const r = computeHealth({ ...healthy, errorRatePercent: 8, businessStable: false });
    expect(r.overall).toBeLessThan(80);
  });
});

describe("Anomaly Detection", () => {
  it("يكشف هبوط المقاييس التجارية", () => {
    const a = detectBusinessAnomalies([
      { key: "sales", label: "المبيعات", baseline: 1000, current: 600 },
      { key: "orders", label: "الطلبات", baseline: 200, current: 205 },
    ]);
    expect(a).toHaveLength(1);
    expect(a[0].kind).toBe("business_anomaly");
    expect(a[0].deviationPercent).toBe(-40);
  });
  it("يكشف شذوذ الأداء والأخطاء والعمّال", () => {
    const a = detectTechnicalAnomalies({ ...healthy, avgQueryMs: 400, errorRatePercent: 12, workersActive: false }, 150);
    expect(a.some((x) => x.kind === "slow_queries")).toBe(true);
    expect(a.some((x) => x.kind === "error_spike" && x.severity === "critical")).toBe(true);
    expect(a.some((x) => x.kind === "broken_workflow")).toBe(true);
  });
});

describe("Incident Model", () => {
  it("يبني حادثة من شذوذ مع حلّ وثقة", () => {
    const [a] = detectBusinessAnomalies([{ key: "sales", label: "المبيعات", baseline: 1000, current: 300 }]);
    const inc = draftIncident(a);
    expect(inc.severity).toBe("critical");
    expect(inc.affectedModules.length).toBeGreaterThan(0);
    expect(inc.suggestedSolution.length).toBeGreaterThan(0);
    expect(inc.confidence).toBeGreaterThan(50);
    expect(incidentDedupeKey(a)).toContain("business_anomaly");
  });
});

describe("Optimization", () => {
  it("يقترح تحسينات من الصحة والشذوذ", () => {
    const health = computeHealth({ ...healthy, avgQueryMs: 700, errorRatePercent: 6 });
    const anomalies = detectTechnicalAnomalies({ ...healthy, avgQueryMs: 700, errorRatePercent: 6 }, 150);
    const opt = buildOptimizations(health, anomalies);
    expect(opt.length).toBeGreaterThan(0);
    expect(opt.some((o) => o.category === "indexes" || o.category === "apis")).toBe(true);
  });
});

describe("Trends + Recurring", () => {
  it("يحلّل الاتجاه", () => {
    const r = analyzeTrends([{ key: "rev", label: "الإيرادات", points: [100, 120, 140] }, { key: "err", label: "الأخطاء", points: [10, 6, 3] }]);
    expect(r[0].direction).toBe("up");
    expect(r[1].direction).toBe("down");
  });
  it("يكشف المشاكل المتكرّرة", () => {
    const rec = findRecurring(["a", "a", "b", "a", "b"], 2);
    expect(rec[0].key).toBe("a");
    expect(rec[0].count).toBe(3);
  });
});

describe("Learning Engine", () => {
  it("يستخرج درسًا ويقترح معيارًا", () => {
    const lesson = extractLesson({ title: "بطء التقارير", severity: "high", rootCause: "غياب فهرس", resolution: "أُضيف فهرس", affectedModules: ["التقارير"] });
    expect(lesson.kind).toBe("lesson");
    expect(lesson.confidence).toBeGreaterThanOrEqual(80);
    const std = proposeStandard("slow_queries", 3, "erp");
    expect(std.kind).toBe("pattern");
  });
});

describe("Window", () => {
  it("يحسب الحالة والتقدّم", () => {
    expect(clampDuration(999)).toBe(180);
    expect(windowState(15, 30, false).status).toBe("active");
    expect(windowState(29, 30, false).status).toBe("ending");
    expect(windowState(30, 30, true).status).toBe("closed");
    expect(windowState(15, 30, false).progressPercent).toBe(50);
  });
});

describe("Closure", () => {
  it("يبني تقرير إغلاق ويمنع الإغلاق عند حادثة حرجة مفتوحة", () => {
    const ok = buildClosure({ projectName: "P", hypercareDays: 30, totalIncidents: 10, resolvedIncidents: 10, optimizationsApplied: 4, knowledgeAdded: 3, finalHealthScore: 95, goLiveScore: 96, satisfactionScore: 90 }, 0);
    expect(ok.closed).toBe(true);
    const blocked = buildClosure({ projectName: "P", hypercareDays: 30, totalIncidents: 10, resolvedIncidents: 8, optimizationsApplied: 4, knowledgeAdded: 3, finalHealthScore: 70, goLiveScore: 96, satisfactionScore: 90 }, 2);
    expect(blocked.closed).toBe(false);
  });
});
