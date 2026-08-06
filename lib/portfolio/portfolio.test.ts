import { describe, it, expect } from "vitest";
import { computeProjectHealth, type HealthSignals } from "./health";
import { computeUserWorkload, WEEKLY_CAPACITY_HOURS } from "./capacity";

const base: HealthSignals = {
  overallProgress: 80, blockedTasks: 0, overdueTasks: 0, criticalOverdueTasks: 0,
  delayedMilestones: 0, openCriticalIncidents: 0, engineeringQaFailing: false, totalTasks: 10,
};

describe("project health", () => {
  it("مشروع سليم = أخضر", () => {
    const r = computeProjectHealth(base);
    expect(r.color).toBe("green");
    expect(r.score).toBe(80);
  });
  it("حوادث حرجة تخفض الدرجة للأحمر", () => {
    const r = computeProjectHealth({ ...base, openCriticalIncidents: 3 });
    expect(r.score).toBeLessThan(50);
    expect(r.color).toBe("red");
  });
  it("مهام حرجة متأخرة + مراحل متأخرة تخصم", () => {
    const r = computeProjectHealth({ ...base, criticalOverdueTasks: 1, delayedMilestones: 1 });
    expect(r.score).toBe(80 - 12 - 10);
    expect(r.reasons.length).toBeGreaterThanOrEqual(2);
  });
  it("مشروع بدون مهام = محايد", () => {
    expect(computeProjectHealth({ ...base, totalTasks: 0, overallProgress: 0 }).score).toBe(60);
  });
  it("الدرجة لا تنزل تحت الصفر", () => {
    expect(computeProjectHealth({ ...base, overallProgress: 10, openCriticalIncidents: 5 }).score).toBe(0);
  });
});

describe("user workload / capacity", () => {
  it("يتجاهل المهام المنتهية", () => {
    const w = computeUserWorkload([{ status: "completed", estimated_hours: 100 }, { status: "in_progress", estimated_hours: 10 }]);
    expect(w.openTasks).toBe(1);
    expect(w.estimatedHours).toBe(10);
  });
  it("افتراضي 4 ساعات للمهمة بدون تقدير", () => {
    const w = computeUserWorkload([{ status: "backlog", estimated_hours: null }]);
    expect(w.estimatedHours).toBe(4);
  });
  it("يكتشف التحميل الزائد", () => {
    const w = computeUserWorkload([{ status: "in_progress", estimated_hours: WEEKLY_CAPACITY_HOURS + 5 }]);
    expect(w.overloaded).toBe(true);
    expect(w.workloadPct).toBeGreaterThan(100);
  });
});
