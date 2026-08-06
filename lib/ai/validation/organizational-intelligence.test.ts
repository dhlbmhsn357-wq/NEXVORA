import { describe, expect, it } from "vitest";
import { validateKnowledgeExtraction, validateRecommendations, validatePromptSuggestion, validateProductAdvisor } from "./organizational-intelligence";

function validKnowledgePayload(overrides: Record<string, unknown> = {}) {
  return JSON.stringify({
    knowledge: [
      {
        category: "performance_lesson",
        title: "Caching CDN يقلّل زمن الاستجابة",
        content: "إضافة caching على مستوى CDN قلّلت زمن الاستجابة بشكل ملحوظ في مشاريع مشابهة.",
        confidence_score: 75,
        evidence: [{ source_type: "production_monitoring", detail: "حادثة بطء استجابة تكرّرت واتحلّت بإضافة caching." }],
        ...overrides,
      },
    ],
    decisions: [],
  });
}

describe("validateKnowledgeExtraction", () => {
  it("يرفض رد فاضي أو JSON غير صالح", () => {
    expect(validateKnowledgeExtraction(null).ok).toBe(false);
    expect(validateKnowledgeExtraction("not json").ok).toBe(false);
  });

  it("يقبل knowledge فاضية (مفيش معرفة كافية)", () => {
    const result = validateKnowledgeExtraction(JSON.stringify({ knowledge: [] }));
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.data.knowledge).toEqual([]);
  });

  it("يقبل عنصر معرفة صالح كامل", () => {
    const result = validateKnowledgeExtraction(validKnowledgePayload());
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.data.knowledge).toHaveLength(1);
      expect(result.data.knowledge[0].category).toBe("performance_lesson");
    }
  });

  it("يرفض category غير مدعوم", () => {
    expect(validateKnowledgeExtraction(validKnowledgePayload({ category: "not_real" })).ok).toBe(false);
  });

  it("يرفض عنصر بدون evidence", () => {
    expect(validateKnowledgeExtraction(validKnowledgePayload({ evidence: [] })).ok).toBe(false);
  });

  it("يرفض evidence.source_type غير مدعوم", () => {
    expect(validateKnowledgeExtraction(validKnowledgePayload({ evidence: [{ source_type: "unknown", detail: "x" }] })).ok).toBe(false);
  });

  it("يرفض confidence_score خارج النطاق", () => {
    expect(validateKnowledgeExtraction(validKnowledgePayload({ confidence_score: 150 })).ok).toBe(false);
  });

  it("يقبل decisions صالحة ويرفض outcome غير مدعوم", () => {
    const validPayload = JSON.parse(validKnowledgePayload());
    validPayload.decisions = [{ decision_title: "استخدام Supabase", outcome: "succeeded" }];
    const result = validateKnowledgeExtraction(JSON.stringify(validPayload));
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.data.decisions[0].outcome).toBe("succeeded");

    validPayload.decisions = [{ decision_title: "x", outcome: "maybe" }];
    expect(validateKnowledgeExtraction(JSON.stringify(validPayload)).ok).toBe(false);
  });
});

describe("validateRecommendations", () => {
  function validPayload(overrides: Record<string, unknown> = {}) {
    return JSON.stringify({
      recommendations: [
        {
          category: "architecture",
          recommendation: "استخدم نفس بنية RBAC ثلاثية الأدوار",
          rationale: "نجحت في مشروع مشابه سابق",
          confidence_score: 80,
          supporting_project_indexes: [0],
          ...overrides,
        },
      ],
    });
  }

  it("يرفض رد فاضي", () => {
    expect(validateRecommendations(null, 1).ok).toBe(false);
  });

  it("يقبل توصية صالحة بفهرس مشروع داعم صحيح", () => {
    const result = validateRecommendations(validPayload(), 2);
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.data).toHaveLength(1);
  });

  it("يرفض توصية بدون supporting_project_indexes", () => {
    expect(validateRecommendations(validPayload({ supporting_project_indexes: [] }), 2).ok).toBe(false);
  });

  it("يرفض فهرس مشروع خارج النطاق المتاح", () => {
    expect(validateRecommendations(validPayload({ supporting_project_indexes: [5] }), 2).ok).toBe(false);
  });

  it("يرفض category غير مدعوم", () => {
    expect(validateRecommendations(validPayload({ category: "not_real" }), 2).ok).toBe(false);
  });
});

describe("validatePromptSuggestion", () => {
  it("يرفض رد فاضي أو JSON غير صالح", () => {
    expect(validatePromptSuggestion(null).ok).toBe(false);
    expect(validatePromptSuggestion("nonsense").ok).toBe(false);
  });

  it("يقبل رد صالح", () => {
    const result = validatePromptSuggestion(JSON.stringify({ suggestion: "أضف مثال لمتطلب أمني واضح", rationale: "قلّل الغموض", confidence_score: 60 }));
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.data.suggestion).toContain("أمني");
  });

  it("يرفض suggestion مفقود", () => {
    expect(validatePromptSuggestion(JSON.stringify({ confidence_score: 50 })).ok).toBe(false);
  });

  it("يرفض confidence_score خارج النطاق", () => {
    expect(validatePromptSuggestion(JSON.stringify({ suggestion: "x", confidence_score: -5 })).ok).toBe(false);
  });
});

describe("validateProductAdvisor", () => {
  it("يرفض رد فاضي أو JSON غير صالح", () => {
    expect(validateProductAdvisor(null).ok).toBe(false);
    expect(validateProductAdvisor("nonsense").ok).toBe(false);
  });

  it("يقبل رد فيه بعض الحقول بس ويحوّل الباقي لقيم افتراضية آمنة", () => {
    const result = validateProductAdvisor(JSON.stringify({ strengths: ["نقطة قوة واحدة"], business_impact: "أثر إيجابي متوقّع" }));
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.data.strengths).toEqual(["نقطة قوة واحدة"]);
      expect(result.data.weaknesses).toEqual([]);
      expect(result.data.business_impact).toBe("أثر إيجابي متوقّع");
      expect(result.data.technical_impact).toBe("");
    }
  });

  it("يتجاهل عناصر مصفوفة غير نصية بدل ما يفشل بالكامل", () => {
    const result = validateProductAdvisor(JSON.stringify({ risks: ["خطر حقيقي", 123, null, "خطر تاني"] }));
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.data.risks).toEqual(["خطر حقيقي", "خطر تاني"]);
  });
});
