import { describe, expect, it } from "vitest";
import {
  detectDuplicates,
  levenshteinDistance,
  nameSimilarity,
  normalizeEmailForCompare,
  type ExistingProspectForDedup,
} from "./dedup-service";

const existing: ExistingProspectForDedup[] = [
  { id: "e1", organizationName: "مدرسة النور الدولية", primaryPhoneNormalized: "201012345678", email: "info@nour.com", governorate: "القاهرة" },
  { id: "e2", organizationName: "مطعم الأصالة", primaryPhoneNormalized: "201111111111", email: null, governorate: "الجيزة" },
];

describe("levenshteinDistance / nameSimilarity", () => {
  it("مسافة 0 لنفس النص", () => {
    expect(levenshteinDistance("مدرسة", "مدرسة")).toBe(0);
  });
  it("مسافة صحيحة لفروق بسيطة", () => {
    expect(levenshteinDistance("مدرسة النور", "مدرسه النور")).toBe(1);
  });
  it("تشابه 1 لنص متطابق بعد التطبيع (حالة أحرف/مسافات)", () => {
    expect(nameSimilarity("  مدرسة النور  ", "مدرسة النور")).toBe(1);
  });
  it("تشابه منخفض لنصوص مختلفة تمامًا", () => {
    expect(nameSimilarity("مدرسة النور", "مطعم الأصالة")).toBeLessThan(0.5);
  });
});

describe("normalizeEmailForCompare", () => {
  it("lowercase + trim", () => {
    expect(normalizeEmailForCompare("  Info@NOUR.com  ")).toBe("info@nour.com");
  });
  it("null/فارغ → null", () => {
    expect(normalizeEmailForCompare(null)).toBeNull();
    expect(normalizeEmailForCompare("   ")).toBeNull();
  });
});

describe("detectDuplicates — أولوية phone > email > name، بدون حذف تلقائي", () => {
  it("تطابق بالهاتف → matchType phone، ثقة 1", () => {
    const result = detectDuplicates(
      [{ organizationName: "اسم مختلف تمامًا", primaryPhoneNormalized: "201012345678", email: null, governorate: null }],
      existing
    );
    expect(result).toHaveLength(1);
    expect(result[0].matchType).toBe("phone");
    expect(result[0].matchedExistingProspectId).toBe("e1");
    expect(result[0].confidence).toBe(1);
  });

  it("تطابق بالبريد (case-insensitive) لو مفيش تطابق هاتف → matchType email", () => {
    const result = detectDuplicates(
      [{ organizationName: "اسم آخر", primaryPhoneNormalized: "201099999999", email: "INFO@nour.com", governorate: null }],
      existing
    );
    expect(result).toHaveLength(1);
    expect(result[0].matchType).toBe("email");
    expect(result[0].matchedExistingProspectId).toBe("e1");
  });

  it("تطابق اسم متقارب جدًا داخل نفس المحافظة → matchType name", () => {
    const result = detectDuplicates(
      [{ organizationName: "مدرسة النور الدوليه", primaryPhoneNormalized: null, email: null, governorate: "القاهرة" }],
      existing
    );
    expect(result).toHaveLength(1);
    expect(result[0].matchType).toBe("name");
    expect(result[0].matchedExistingProspectId).toBe("e1");
    expect(result[0].confidence).toBeGreaterThan(0.8);
  });

  it("اسم متقارب لكن في محافظة مختلفة → لا يُعتبر تكرارًا", () => {
    const result = detectDuplicates(
      [{ organizationName: "مدرسة النور الدوليه", primaryPhoneNormalized: null, email: null, governorate: "الإسكندرية" }],
      existing
    );
    expect(result).toHaveLength(0);
  });

  it("لا تطابق على الإطلاق → قائمة فارغة", () => {
    const result = detectDuplicates(
      [{ organizationName: "جهة جديدة كليًا", primaryPhoneNormalized: "201000000000", email: "new@x.com", governorate: null }],
      existing
    );
    expect(result).toHaveLength(0);
  });

  it("الهاتف أعلى أولوية من الاسم حتى لو الاسم متطابق حرفيًا مع جهة أخرى", () => {
    const result = detectDuplicates(
      [{ organizationName: "مطعم الأصالة", primaryPhoneNormalized: "201012345678", email: null, governorate: "الجيزة" }],
      existing
    );
    expect(result[0].matchType).toBe("phone");
    expect(result[0].matchedExistingProspectId).toBe("e1");
  });

  it("لا يحذف أو يعدّل أي بيانات — الدالة pure وترجّع مصفوفة جديدة فقط", () => {
    const rows = [{ organizationName: "س", primaryPhoneNormalized: "201012345678", email: null, governorate: null }];
    const before = JSON.stringify(existing);
    detectDuplicates(rows, existing);
    expect(JSON.stringify(existing)).toBe(before);
  });
});
