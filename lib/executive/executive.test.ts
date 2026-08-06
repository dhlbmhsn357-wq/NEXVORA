import { describe, it, expect } from "vitest";
import { computeCompanyHealth, bandFor, pct, HEALTH_DIMENSIONS } from "./health";
import { deriveExecutiveAlerts, ALERT_THRESHOLDS } from "./alerts";

describe("company health", () => {
  it("dimension weights sum to 1", () => {
    const sum = HEALTH_DIMENSIONS.reduce((a, d) => a + d.weight, 0);
    expect(Math.round(sum * 1000) / 1000).toBe(1);
  });

  it("bandFor thresholds", () => {
    expect(bandFor(75)).toBe("green");
    expect(bandFor(74)).toBe("yellow");
    expect(bandFor(50)).toBe("yellow");
    expect(bandFor(49)).toBe("red");
  });

  it("all-100 → 100 green, all-0 → 0 red", () => {
    const allHigh = Object.fromEntries(HEALTH_DIMENSIONS.map((d) => [d.key, 100]));
    const allLow = Object.fromEntries(HEALTH_DIMENSIONS.map((d) => [d.key, 0]));
    expect(computeCompanyHealth(allHigh).score).toBe(100);
    expect(computeCompanyHealth(allHigh).band).toBe("green");
    expect(computeCompanyHealth(allLow).score).toBe(0);
    expect(computeCompanyHealth(allLow).band).toBe("red");
  });

  it("missing dimensions default to neutral 60", () => {
    const r = computeCompanyHealth({});
    expect(r.score).toBe(60);
    expect(r.breakdown.every((d) => d.score === 60)).toBe(true);
  });

  it("clamps out-of-range scores", () => {
    const r = computeCompanyHealth({ projectSuccess: 250, riskControl: -50 });
    const ps = r.breakdown.find((d) => d.key === "projectSuccess")!;
    const rc = r.breakdown.find((d) => d.key === "riskControl")!;
    expect(ps.score).toBe(100);
    expect(rc.score).toBe(0);
  });

  it("weakest lists the lowest sub-60 dimensions", () => {
    const r = computeCompanyHealth({ projectSuccess: 20, teamCapacity: 30, engineeringQuality: 90 });
    expect(r.weakest[0].key).toBe("projectSuccess");
    expect(r.weakest.some((w) => w.key === "engineeringQuality")).toBe(false);
  });

  it("pct is divide-by-zero safe", () => {
    expect(pct(0, 0)).toBe(0);
    expect(pct(3, 4)).toBe(75);
  });
});

describe("executive alerts", () => {
  const okHealth = computeCompanyHealth(Object.fromEntries(HEALTH_DIMENSIONS.map((d) => [d.key, 90])));

  it("no alerts when everything is healthy", () => {
    const alerts = deriveExecutiveAlerts(okHealth, {
      healthScore: 90, qaFailRatePct: 0, supportBacklog: 0, overloadedEmployees: 0,
      openCriticalIncidents: 0, delayedProjectsPct: 0, automationFailRatePct: 0,
    });
    expect(alerts).toHaveLength(0);
  });

  it("fires critical alerts for low health and open incidents, sorted critical-first", () => {
    const lowHealth = computeCompanyHealth(Object.fromEntries(HEALTH_DIMENSIONS.map((d) => [d.key, 30])));
    const alerts = deriveExecutiveAlerts(lowHealth, {
      healthScore: 40, qaFailRatePct: 50, supportBacklog: 10, overloadedEmployees: 3,
      openCriticalIncidents: 2, delayedProjectsPct: 40, automationFailRatePct: 30,
    });
    expect(alerts.length).toBeGreaterThanOrEqual(4);
    expect(alerts[0].severity).toBe("critical");
    expect(alerts.map((a) => a.key)).toContain("company-health-low");
    expect(alerts.map((a) => a.key)).toContain("critical-incidents-open");
  });

  it("respects each documented threshold boundary", () => {
    const alerts = deriveExecutiveAlerts(okHealth, {
      healthScore: 100,
      qaFailRatePct: ALERT_THRESHOLDS.qaFailRatePct,
      supportBacklog: ALERT_THRESHOLDS.supportBacklog,
      overloadedEmployees: 0,
      openCriticalIncidents: 0,
      delayedProjectsPct: 0,
      automationFailRatePct: 0,
    });
    const keys = alerts.map((a) => a.key);
    expect(keys).toContain("qa-fail-rate-high");
    expect(keys).toContain("support-backlog-high");
    expect(keys).not.toContain("company-health-low");
  });
});
