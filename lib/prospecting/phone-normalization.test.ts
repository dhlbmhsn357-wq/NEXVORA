import { describe, expect, it } from "vitest";
import { normalizeEgyptianPhone } from "./phone-normalization";

describe("normalizeEgyptianPhone — أرقام صالحة", () => {
  it("01012345678 → صالح، 201012345678", () => {
    const r = normalizeEgyptianPhone("01012345678");
    expect(r.isValid).toBe(true);
    expect(r.normalized).toBe("201012345678");
    expect(r.raw).toBe("01012345678");
  });

  it("+201012345678 → صالح، 201012345678", () => {
    const r = normalizeEgyptianPhone("+201012345678");
    expect(r.isValid).toBe(true);
    expect(r.normalized).toBe("201012345678");
  });

  it("201012345678 → صالح، 201012345678", () => {
    const r = normalizeEgyptianPhone("201012345678");
    expect(r.isValid).toBe(true);
    expect(r.normalized).toBe("201012345678");
  });

  it("00201012345678 → صالح، 201012345678", () => {
    const r = normalizeEgyptianPhone("00201012345678");
    expect(r.isValid).toBe(true);
    expect(r.normalized).toBe("201012345678");
  });

  it("0101 234 5678 (بعد إزالة المسافات) → صالح، 201012345678", () => {
    const r = normalizeEgyptianPhone("0101 234 5678");
    expect(r.isValid).toBe(true);
    expect(r.normalized).toBe("201012345678");
  });

  it("يدعم كل بادئات الموبايل المصري الصالحة: 010/011/012/015", () => {
    for (const prefix of ["010", "011", "012", "015"]) {
      const r = normalizeEgyptianPhone(`${prefix}12345678`);
      expect(r.isValid, `prefix ${prefix}`).toBe(true);
      expect(r.normalized).toBe(`20${prefix.slice(1)}12345678`);
    }
  });

  it("يزيل الشرطات والأقواس والنقاط", () => {
    const r = normalizeEgyptianPhone("(010) 123-45-678");
    expect(r.isValid).toBe(true);
    expect(r.normalized).toBe("201012345678");
  });
});

describe("normalizeEgyptianPhone — أرقام غير صالحة", () => {
  it("رقم أرضي (يبدأ بـ 02) → غير صالح", () => {
    const r = normalizeEgyptianPhone("0223456789");
    expect(r.isValid).toBe(false);
    expect(r.normalized).toBeNull();
  });

  it("رقم ناقص الخانات → غير صالح", () => {
    const r = normalizeEgyptianPhone("010123456");
    expect(r.isValid).toBe(false);
    expect(r.normalized).toBeNull();
  });

  it("رقم زائد الخانات → غير صالح", () => {
    const r = normalizeEgyptianPhone("010123456789");
    expect(r.isValid).toBe(false);
    expect(r.normalized).toBeNull();
  });

  it("بادئة موبايل غير موجودة (013) → غير صالح", () => {
    const r = normalizeEgyptianPhone("01312345678");
    expect(r.isValid).toBe(false);
    expect(r.normalized).toBeNull();
  });

  it("نص فارغ → غير صالح", () => {
    const r = normalizeEgyptianPhone("");
    expect(r.isValid).toBe(false);
    expect(r.normalized).toBeNull();
  });

  it("نص غير رقمي → غير صالح", () => {
    const r = normalizeEgyptianPhone("ابراهيم محمد");
    expect(r.isValid).toBe(false);
    expect(r.normalized).toBeNull();
  });

  it("رقم يحتوي أحرف مختلطة بأرقام → غير صالح", () => {
    const r = normalizeEgyptianPhone("0101234567a");
    expect(r.isValid).toBe(false);
    expect(r.normalized).toBeNull();
  });

  it("الرقم الأصلي (raw) لا يتغيّر أبدًا حتى لو غير صالح", () => {
    const r = normalizeEgyptianPhone("  013-999  ");
    expect(r.raw).toBe("  013-999  ");
  });
});
