import { describe, expect, it } from "vitest";
import { validateRecommendationsV2 } from "./recommendations-v2";

function rec(overrides: Record<string, unknown> = {}) {
  return {
    category: "architecture",
    title: "عنوان",
    recommendation: "توصية تجريبية",
    rationale: "سبب",
    priority: "high",
    severity: "medium",
    business_value: "high",
    technical_value: "medium",
    affected_modules: ["المبيعات"],
    acceptance_criteria: ["معيار"],
    implementation_notes: "ملاحظة",
    potential_risks: "خطر",
    expected_benefits: "فايدة",
    estimated_complexity: "medium",
    confidence_score: 80,
    supporting_project_indexes: [0],
    depends_on_indexes: [],
    ...overrides,
  };
}

describe("validateRecommendationsV2", () => {
  it("يرفض رد فارغ", () => {
    const r = validateRecommendationsV2(null, 0);
    expect(r.ok).toBe(false);
  });

  it("يرفض JSON غير صالح", () => {
    const r = validateRecommendationsV2("{غير صالح", 0);
    expect(r.ok).toBe(false);
  });

  it("يرفض لو recommendations مش مصفوفة", () => {
    const r = validateRecommendationsV2(JSON.stringify({ recommendations: "x" }), 0);
    expect(r.ok).toBe(false);
  });

  it("يقبل عنصر صالح ويطبّع الحقول", () => {
    const raw = JSON.stringify({ recommendations: [rec()] });
    const r = validateRecommendationsV2(raw, 0);
    expect(r.ok).toBe(true);
    if (r.ok) {
      expect(r.data).toHaveLength(1);
      expect(r.data[0].category).toBe("architecture");
      expect(r.data[0].confidence_score).toBe(80);
    }
  });

  it("يتجاهل بهدوء عنصر بـ category غير معروفة", () => {
    const raw = JSON.stringify({ recommendations: [rec({ category: "not_a_real_category" }), rec()] });
    const r = validateRecommendationsV2(raw, 0);
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.data).toHaveLength(1);
  });

  it("يتجاهل عنصر بـ recommendation فاضية", () => {
    const raw = JSON.stringify({ recommendations: [rec({ recommendation: "" })] });
    const r = validateRecommendationsV2(raw, 0);
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.data).toHaveLength(0);
  });

  it("يقصّ confidence_score خارج المدى إلى 0-100", () => {
    const raw = JSON.stringify({ recommendations: [rec({ confidence_score: 150 })] });
    const r = validateRecommendationsV2(raw, 0);
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.data[0].confidence_score).toBe(100);
  });

  it("يرفض supporting_project_indexes خارج نطاق maxProjectIndex", () => {
    const raw = JSON.stringify({ recommendations: [rec({ supporting_project_indexes: [5] })] });
    const r = validateRecommendationsV2(raw, 0);
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.data[0].supporting_project_indexes).toEqual([]);
  });

  it("يحوّل depends_on_indexes الأصلية لفهارس نهائية بعد إسقاط عنصر غير صالح", () => {
    // العنصر 0 غير صالح (category خطأ) وهيتشال. العنصر 1 بيعتمد على العنصر 2 (الفهرس الأصلي).
    // بعد الفلترة: index نهائي 0 = العنصر الأصلي 1، index نهائي 1 = العنصر الأصلي 2.
    const raw = JSON.stringify({
      recommendations: [
        rec({ category: "bad_category" }),
        rec({ depends_on_indexes: [2] }),
        rec({ recommendation: "توصية تانية" }),
      ],
    });
    const r = validateRecommendationsV2(raw, 0);
    expect(r.ok).toBe(true);
    if (r.ok) {
      expect(r.data).toHaveLength(2);
      expect(r.data[0].depends_on_indexes).toEqual([1]);
    }
  });

  it("يسقط بهدوء إشارة depends_on_indexes لعنصر اتشال أثناء التحقق", () => {
    const raw = JSON.stringify({
      recommendations: [rec({ depends_on_indexes: [1] }), rec({ category: "bad_category" })],
    });
    const r = validateRecommendationsV2(raw, 0);
    expect(r.ok).toBe(true);
    if (r.ok) {
      expect(r.data).toHaveLength(1);
      expect(r.data[0].depends_on_indexes).toEqual([]);
    }
  });

  it("يسقط إشارة self-reference في depends_on_indexes", () => {
    const raw = JSON.stringify({ recommendations: [rec({ depends_on_indexes: [0] })] });
    const r = validateRecommendationsV2(raw, 0);
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.data[0].depends_on_indexes).toEqual([]);
  });
});
