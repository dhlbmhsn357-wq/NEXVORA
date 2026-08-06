import { describe, expect, it } from "vitest";
import { validateBrainReviewValidation } from "./brain-review-validation";

const validKeys = new Set(["business_goals::زيادة المبيعات", "risks::انقطاع الشبكة", "functional_requirements::تسجيل دخول"]);

function payload(overrides: Record<string, unknown> = {}) {
  return JSON.stringify({
    business_readiness: 80,
    architecture_readiness: 70,
    technical_readiness: 60,
    ai_confidence: 75,
    issues: [
      {
        type: "missing_requirement",
        severity: "high",
        category: "أمان",
        description: "مفيش صلاحيات معرّفة",
        related_keys: ["business_goals::زيادة المبيعات"],
      },
    ],
    dependency_pairs: [{ from_key: "functional_requirements::تسجيل دخول", to_key: "business_goals::زيادة المبيعات", relation_type: "depends_on" }],
    ...overrides,
  });
}

describe("validateBrainReviewValidation", () => {
  it("يرفض رد فارغ", () => {
    expect(validateBrainReviewValidation(null, validKeys).ok).toBe(false);
  });

  it("يرفض JSON غير صالح", () => {
    expect(validateBrainReviewValidation("{غير صالح", validKeys).ok).toBe(false);
  });

  it("يقبل رد صالح ويطبّع القيم", () => {
    const r = validateBrainReviewValidation(payload(), validKeys);
    expect(r.ok).toBe(true);
    if (r.ok) {
      expect(r.data.business_readiness).toBe(80);
      expect(r.data.issues).toHaveLength(1);
      expect(r.data.dependency_pairs).toHaveLength(1);
    }
  });

  it("يقصّ الدرجات خارج المدى 0-100", () => {
    const r = validateBrainReviewValidation(payload({ business_readiness: 500, ai_confidence: -10 }), validKeys);
    expect(r.ok).toBe(true);
    if (r.ok) {
      expect(r.data.business_readiness).toBe(100);
      expect(r.data.ai_confidence).toBe(0);
    }
  });

  it("يتجاهل issue بـ type غير معروف", () => {
    const r = validateBrainReviewValidation(
      payload({ issues: [{ type: "not_a_real_type", severity: "high", category: "x", description: "y", related_keys: [] }] }),
      validKeys
    );
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.data.issues).toHaveLength(0);
  });

  it("يسقط related_keys اللي مش من المفاتيح الحقيقية (منع Hallucination)", () => {
    const r = validateBrainReviewValidation(
      payload({ issues: [{ type: "missing_requirement", severity: "high", category: "x", description: "y", related_keys: ["مفتاح_مختلق"] }] }),
      validKeys
    );
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.data.issues[0].related_object_keys).toEqual([]);
  });

  it("يسقط dependency_pairs اللي بتشاور على مفاتيح مش حقيقية", () => {
    const r = validateBrainReviewValidation(
      payload({ dependency_pairs: [{ from_key: "مفتاح_وهمي", to_key: "business_goals::زيادة المبيعات", relation_type: "depends_on" }] }),
      validKeys
    );
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.data.dependency_pairs).toHaveLength(0);
  });

  it("يسقط dependency_pairs بنفس from/to (self-reference)", () => {
    const r = validateBrainReviewValidation(
      payload({ dependency_pairs: [{ from_key: "business_goals::زيادة المبيعات", to_key: "business_goals::زيادة المبيعات", relation_type: "depends_on" }] }),
      validKeys
    );
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.data.dependency_pairs).toHaveLength(0);
  });
});
