import { describe, expect, it } from "vitest";
import {
  generateDiscoveryToken,
  computeExpiresAt,
  evaluateLinkState,
} from "./token";

const NOW = 1_700_000_000_000; // ثابت للاختبار

describe("generateDiscoveryToken", () => {
  it("ينتج رمزًا قصيرًا فريدًا بلا أحرف ملتبسة", () => {
    const a = generateDiscoveryToken();
    const b = generateDiscoveryToken();
    // 12 حرفًا من أبجدية آمنة (بدون 0/O/1/I/l)
    expect(a).toMatch(/^[2-9A-HJ-NP-Za-km-z]{12}$/);
    expect(a).not.toBe(b);
  });
  it("لا تصادم عبر توليد كثيف", () => {
    const set = new Set(Array.from({ length: 5000 }, () => generateDiscoveryToken()));
    expect(set.size).toBe(5000);
  });
});

describe("computeExpiresAt", () => {
  it("يرجّع null للأبد", () => {
    expect(computeExpiresAt(null, NOW)).toBeNull();
  });
  it("يحسب التاريخ المستقبلي بعدد الأيام", () => {
    const iso = computeExpiresAt(7, NOW);
    expect(iso).toBe(new Date(NOW + 7 * 86_400_000).toISOString());
  });
});

describe("evaluateLinkState", () => {
  it("submitted يسبق أي اعتبار آخر", () => {
    expect(evaluateLinkState({ status: "submitted", expires_at: null }, NOW)).toBe("submitted");
  });
  it("cancelled يُرجَع كما هو", () => {
    expect(evaluateLinkState({ status: "cancelled", expires_at: null }, NOW)).toBe("cancelled");
  });
  it("status=expired يُرجَع expired", () => {
    expect(evaluateLinkState({ status: "expired", expires_at: null }, NOW)).toBe("expired");
  });
  it("انتهاء الوقت يجعل الحالة expired حتى لو العمود opened", () => {
    const past = new Date(NOW - 1000).toISOString();
    expect(evaluateLinkState({ status: "opened", expires_at: past }, NOW)).toBe("expired");
  });
  it("رابط مفتوح غير منتهٍ = ok", () => {
    const future = new Date(NOW + 86_400_000).toISOString();
    expect(evaluateLinkState({ status: "opened", expires_at: future }, NOW)).toBe("ok");
  });
  it("رابط بلا انتهاء = ok", () => {
    expect(evaluateLinkState({ status: "pending", expires_at: null }, NOW)).toBe("ok");
  });
});
