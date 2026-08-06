import { describe, expect, it } from "vitest";
import { hasBlockingFindings, countBySeverity } from "./severity-gate";

describe("hasBlockingFindings", () => {
  it("يرجّع true لو فيه Finding واحد بشدة critical", () => {
    expect(hasBlockingFindings([{ severity: "critical" }])).toBe(true);
  });

  it("يرجّع true لو فيه Finding واحد بشدة high", () => {
    expect(hasBlockingFindings([{ severity: "low" }, { severity: "high" }])).toBe(true);
  });

  it("يرجّع true لو فيه Finding واحد بشدة medium", () => {
    expect(hasBlockingFindings([{ severity: "medium" }])).toBe(true);
  });

  it("يرجّع false لو كل الـ Findings low/info بس", () => {
    expect(hasBlockingFindings([{ severity: "low" }, { severity: "info" }])).toBe(false);
  });

  it("يرجّع false لمصفوفة فاضية", () => {
    expect(hasBlockingFindings([])).toBe(false);
  });

  it("بيقرأ impact بدل severity لو severity مش موجود (Accessibility Violations)", () => {
    expect(hasBlockingFindings([{ impact: "critical" }])).toBe(true);
    expect(hasBlockingFindings([{ impact: "minor" }])).toBe(false);
  });

  it("مش حساس لحالة الأحرف (Case-Insensitive)", () => {
    expect(hasBlockingFindings([{ severity: "CRITICAL" }])).toBe(true);
  });
});

describe("countBySeverity", () => {
  it("يحسب عدد كل شدة صح", () => {
    const counts = countBySeverity([{ severity: "high" }, { severity: "high" }, { severity: "low" }]);
    expect(counts).toEqual({ high: 2, low: 1 });
  });

  it("مصفوفة فاضية ترجّع كائن فاضي", () => {
    expect(countBySeverity([])).toEqual({});
  });
});
