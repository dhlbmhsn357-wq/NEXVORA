import { describe, expect, it } from "vitest";
import { generateCandidatesFromPageCheck, generateCandidatesFromChecks } from "./candidates";
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

describe("generateCandidatesFromPageCheck", () => {
  it("لا يولّد أي مرشح لصفحة سليمة تمامًا", () => {
    expect(generateCandidatesFromPageCheck(makeResult())).toEqual([]);
  });

  it("يولّد unreachable لما الصفحة تفشل بدون أي HTTP status", () => {
    const candidates = generateCandidatesFromPageCheck(makeResult({ reachable: false, httpStatus: null }));
    expect(candidates).toHaveLength(1);
    expect(candidates[0].type).toBe("unreachable");
  });

  it("يولّد http_error لما الصفحة ترجّع status لكن مش reachable", () => {
    const candidates = generateCandidatesFromPageCheck(makeResult({ reachable: false, httpStatus: 500 }));
    expect(candidates).toHaveLength(1);
    expect(candidates[0].type).toBe("http_error");
    expect(candidates[0].detail).toContain("500");
  });

  it("يولّد slow_response لما زمن الاستجابة أعلى من العتبة (3000ms)", () => {
    const candidates = generateCandidatesFromPageCheck(makeResult({ responseTimeMs: 3500 }));
    expect(candidates).toHaveLength(1);
    expect(candidates[0].type).toBe("slow_response");
  });

  it("لا يولّد slow_response عند العتبة بالظبط (حد >  فقط)", () => {
    const candidates = generateCandidatesFromPageCheck(makeResult({ responseTimeMs: 3000 }));
    expect(candidates).toEqual([]);
  });

  it("يولّد slow_lcp لما LCP أعلى من العتبة (4000ms)", () => {
    const candidates = generateCandidatesFromPageCheck(makeResult({ lcpMs: 4500 }));
    expect(candidates).toHaveLength(1);
    expect(candidates[0].type).toBe("slow_lcp");
  });

  it("لا يولّد slow_lcp لما lcpMs يكون null (مش متاح للقياس)", () => {
    const candidates = generateCandidatesFromPageCheck(makeResult({ lcpMs: null, responseTimeMs: 500 }));
    expect(candidates).toEqual([]);
  });

  it("يولّد مرشح console_error واحد لكل خطأ في الكونسول", () => {
    const candidates = generateCandidatesFromPageCheck(
      makeResult({ consoleErrors: ["TypeError: x is not a function", "ReferenceError: y is not defined"] })
    );
    expect(candidates.filter((c) => c.type === "console_error")).toHaveLength(2);
  });

  it("يولّد مرشح network_error واحد لكل خطأ شبكة", () => {
    const candidates = generateCandidatesFromPageCheck(makeResult({ networkErrors: ["Failed to load /api/data (500)"] }));
    expect(candidates.filter((c) => c.type === "network_error")).toHaveLength(1);
  });

  it("يجمع كل أنواع المشاكل مع بعض لو حصلت في نفس الصفحة", () => {
    const candidates = generateCandidatesFromPageCheck(
      makeResult({ responseTimeMs: 4000, lcpMs: 5000, consoleErrors: ["err1"] })
    );
    expect(candidates).toHaveLength(3);
    expect(candidates.map((c) => c.type).sort()).toEqual(["console_error", "slow_lcp", "slow_response"]);
  });
});

describe("generateCandidatesFromChecks", () => {
  it("يجمع المرشحات من كل الصفحات المفحوصة سويًا (flatMap)", () => {
    const results = [
      makeResult({ url: "https://example.com/", responseTimeMs: 4000 }),
      makeResult({ url: "https://example.com/about", reachable: false, httpStatus: null }),
      makeResult({ url: "https://example.com/contact" }),
    ];
    const candidates = generateCandidatesFromChecks(results);
    expect(candidates).toHaveLength(2);
    expect(candidates.map((c) => c.url)).toEqual(["https://example.com/", "https://example.com/about"]);
  });

  it("يرجّع مصفوفة فاضية لو مفيش صفحات اتفحصت", () => {
    expect(generateCandidatesFromChecks([])).toEqual([]);
  });
});
