import { describe, expect, it } from "vitest";
import { computeHealthScore, computePerformanceScore, computeOverallStatus } from "./scoring";
import type { PageCheckResult } from "./check-runner";

function makeResult(overrides: Partial<PageCheckResult> = {}): PageCheckResult {
  return {
    url: "https://example.com",
    httpStatus: 200,
    responseTimeMs: 500,
    pageLoadTimeMs: 800,
    lcpMs: 1200,
    cls: null,
    consoleErrors: [],
    networkErrors: [],
    reachable: true,
    ...overrides,
  };
}

describe("computeHealthScore", () => {
  it("يرجّع 100 لو مفيش حوادث مفتوحة", () => {
    expect(computeHealthScore([])).toBe(100);
  });

  it("يخصم بالوزن الصحيح لكل مستوى خطورة", () => {
    expect(computeHealthScore(["critical"])).toBe(75);
    expect(computeHealthScore(["high"])).toBe(88);
    expect(computeHealthScore(["medium"])).toBe(95);
    expect(computeHealthScore(["low"])).toBe(98);
    expect(computeHealthScore(["info"])).toBe(100); // 100 - 0.5 يترّند لـ 100 بالتقريب (99.5 → 100)
  });

  it("يجمع الخصومات من عدة حوادث مع بعض", () => {
    expect(computeHealthScore(["critical", "critical"])).toBe(50);
  });

  it("لا ينزل تحت الصفر مهما زادت الحوادث", () => {
    expect(computeHealthScore(["critical", "critical", "critical", "critical", "critical"])).toBe(0);
  });
});

describe("computePerformanceScore", () => {
  it("يرجّع 0 لو مفيش صفحات قابلة للوصول أصلًا", () => {
    expect(computePerformanceScore([makeResult({ reachable: false })])).toBe(0);
  });

  it("يرجّع 100 لمتوسط زمن استجابة 500ms أو أقل", () => {
    expect(computePerformanceScore([makeResult({ responseTimeMs: 500 })])).toBe(100);
    expect(computePerformanceScore([makeResult({ responseTimeMs: 200 })])).toBe(100);
  });

  it("يرجّع 0 لمتوسط زمن استجابة 5000ms أو أكتر", () => {
    expect(computePerformanceScore([makeResult({ responseTimeMs: 5000 })])).toBe(0);
    expect(computePerformanceScore([makeResult({ responseTimeMs: 8000 })])).toBe(0);
  });

  it("يحسب انحدار خطي بين 500ms و 5000ms", () => {
    // نص المسافة بين 500 و 5000 (2750ms) → المفروض نص الدرجة تقريبًا
    expect(computePerformanceScore([makeResult({ responseTimeMs: 2750 })])).toBe(50);
  });

  it("يتجاهل الصفحات غير القابلة للوصول من حساب المتوسط", () => {
    const results = [makeResult({ responseTimeMs: 500 }), makeResult({ reachable: false, responseTimeMs: 9999 })];
    expect(computePerformanceScore(results)).toBe(100);
  });
});

describe("computeOverallStatus", () => {
  it("يرجّع down لو كل الصفحات مش قابلة للوصول", () => {
    expect(computeOverallStatus([makeResult({ reachable: false }), makeResult({ reachable: false })])).toBe("down");
  });

  it("يرجّع degraded لو صفحة واحدة بس مش قابلة للوصول", () => {
    expect(computeOverallStatus([makeResult(), makeResult({ reachable: false })])).toBe("degraded");
  });

  it("يرجّع degraded لو فيه صفحة بطيئة (أعلى من 3000ms)", () => {
    expect(computeOverallStatus([makeResult({ responseTimeMs: 3500 })])).toBe("degraded");
  });

  it("يرجّع healthy لو كل الصفحات سليمة وسريعة", () => {
    expect(computeOverallStatus([makeResult(), makeResult()])).toBe("healthy");
  });

  it("يرجّع healthy لمصفوفة فاضية (لا يوجد أي دليل على مشكلة)", () => {
    expect(computeOverallStatus([])).toBe("healthy");
  });
});
