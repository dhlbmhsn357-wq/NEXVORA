import { describe, expect, it } from "vitest";
import { detectRegression } from "./regression";

describe("detectRegression", () => {
  it("لا يعتبرها regression لو مفيش فحص سابق للمقارنة", () => {
    const result = detectRegression(50, null);
    expect(result.isRegression).toBe(false);
    expect(result.healthScoreDiff).toBeNull();
  });

  it("لا يعتبرها regression لو الدرجة تحسّنت", () => {
    const result = detectRegression(90, 70);
    expect(result.isRegression).toBe(false);
    expect(result.healthScoreDiff).toBe(20);
  });

  it("لا يعتبرها regression لانخفاض بسيط تحت العتبة (15)", () => {
    const result = detectRegression(80, 90);
    expect(result.isRegression).toBe(false);
    expect(result.healthScoreDiff).toBe(-10);
  });

  it("يعتبرها regression بالظبط عند العتبة (انخفاض 15)", () => {
    const result = detectRegression(75, 90);
    expect(result.isRegression).toBe(true);
    expect(result.healthScoreDiff).toBe(-15);
  });

  it("يعتبرها regression لانخفاض أكبر من العتبة", () => {
    const result = detectRegression(40, 90);
    expect(result.isRegression).toBe(true);
    expect(result.healthScoreDiff).toBe(-50);
  });

  it("يرجّع نفس الدرجة (diff = 0) بدون regression لو مفيش تغيير", () => {
    const result = detectRegression(80, 80);
    expect(result.isRegression).toBe(false);
    expect(result.healthScoreDiff).toBe(0);
  });
});
