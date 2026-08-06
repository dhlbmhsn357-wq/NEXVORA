import { describe, expect, it } from "vitest";
import { normalizePhone, waMeLink } from "./phone";

describe("normalizePhone", () => {
  it("يرجّع فشل للفراغ/undefined/null", () => {
    expect(normalizePhone("", "EG").ok).toBe(false);
    expect(normalizePhone(null, "EG").ok).toBe(false);
  });

  it("يقبل رقم دولي بـ + ويشيله", () => {
    const r = normalizePhone("+20 100 123 4567", "EG");
    if (!r.ok) throw new Error(r.reason);
    expect(r.e164).toBe("201001234567");
  });

  it("يشيل 00 ويعتبرها كود دولي دولي", () => {
    const r = normalizePhone("0020 100 123 4567", "SA");
    if (!r.ok) throw new Error(r.reason);
    expect(r.e164).toBe("201001234567");
  });

  it("يضيف كود الدولة الافتراضي لرقم محلي مصري ويشيل الصفر", () => {
    const r = normalizePhone("01001234567", "EG");
    if (!r.ok) throw new Error(r.reason);
    expect(r.e164).toBe("201001234567");
  });

  it("يضيف كود السعودية للرقم السعودي بدون كود", () => {
    const r = normalizePhone("0512345678", "SA");
    if (!r.ok) throw new Error(r.reason);
    expect(r.e164).toBe("966512345678");
  });

  it("لا يضيف كود دولة لو الرقم يبدأ بكود معروف", () => {
    const r = normalizePhone("971501234567", "EG"); // UAE
    if (!r.ok) throw new Error(r.reason);
    expect(r.e164).toBe("971501234567");
  });

  it("يرفض رقم قصير جدًا", () => {
    expect(normalizePhone("123", "EG").ok).toBe(false);
  });

  it("waMeLink يبني الرابط الصحيح", () => {
    expect(waMeLink("201001234567")).toBe("https://wa.me/201001234567");
    expect(waMeLink("201001234567", "مرحبا")).toContain("?text=");
  });
});
