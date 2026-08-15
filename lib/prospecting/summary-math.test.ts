import { describe, expect, it } from "vitest";
import { computeConversionRate } from "./summary-math";

describe("computeConversionRate", () => {
  it("يحسب النسبة الصحيحة عند وجود قيم", () => {
    expect(computeConversionRate(5, 20)).toBe(0.25);
  });
  it("قسمة على صفر → null (ليس NaN/Infinity)", () => {
    const r = computeConversionRate(0, 0);
    expect(r).toBeNull();
    expect(Number.isNaN(r)).toBe(false);
  });
  it("مُحوَّل بدون تواصل مؤكد (بيانات غير متسقة) → null", () => {
    expect(computeConversionRate(3, 0)).toBeNull();
  });
  it("لا محوَّلين بعد → 0", () => {
    expect(computeConversionRate(0, 10)).toBe(0);
  });
});
