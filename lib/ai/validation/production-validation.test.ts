import { describe, expect, it } from "vitest";
import { validateJourneyGeneration, validateCategoryEnrichment } from "./production-validation";

function validJourneysPayload() {
  return JSON.stringify({
    journeys: [
      {
        journey_key: "login-happy-path",
        name: "تسجيل دخول ناجح",
        goal: "التأكد من نجاح تسجيل الدخول",
        steps: [
          { type: "navigate", target: "/", description: "فتح الصفحة الرئيسية" },
          { type: "click", target: "تسجيل الدخول", description: "الضغط على زر تسجيل الدخول" },
          { type: "fill", target: "البريد الإلكتروني", value: "test@example.com", inputKind: "valid", description: "إدخال البريد" },
          { type: "expect_text", target: "لوحة التحكم", description: "التأكد من ظهور لوحة التحكم" },
        ],
      },
    ],
  });
}

describe("validateJourneyGeneration", () => {
  it("يرفض رد فاضي أو JSON غير صالح", () => {
    expect(validateJourneyGeneration(null).ok).toBe(false);
    expect(validateJourneyGeneration("nonsense").ok).toBe(false);
  });

  it("يقبل رد صالح كامل", () => {
    const result = validateJourneyGeneration(validJourneysPayload());
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.data).toHaveLength(1);
      expect(result.data[0].steps).toHaveLength(4);
    }
  });

  it("يرفض journeys فاضية", () => {
    expect(validateJourneyGeneration(JSON.stringify({ journeys: [] })).ok).toBe(false);
  });

  it("يرفض journey_key مكرر", () => {
    const payload = JSON.stringify({
      journeys: [
        { journey_key: "dup", name: "A", steps: [{ type: "navigate", description: "x" }] },
        { journey_key: "dup", name: "B", steps: [{ type: "navigate", description: "y" }] },
      ],
    });
    expect(validateJourneyGeneration(payload).ok).toBe(false);
  });

  it("يرفض step.type غير مدعوم", () => {
    const payload = JSON.stringify({
      journeys: [{ journey_key: "x", name: "X", steps: [{ type: "teleport", description: "غير مدعوم" }] }],
    });
    expect(validateJourneyGeneration(payload).ok).toBe(false);
  });

  it("يرفض inputKind غير صالح", () => {
    const payload = JSON.stringify({
      journeys: [{ journey_key: "x", name: "X", steps: [{ type: "fill", target: "a", inputKind: "not_real", description: "x" }] }],
    });
    expect(validateJourneyGeneration(payload).ok).toBe(false);
  });
});

describe("validateCategoryEnrichment", () => {
  function validPayload() {
    return JSON.stringify({
      summary: "ملخص",
      findings: [
        {
          finding_key: "broken-login",
          title: "زر تسجيل الدخول لا يعمل",
          severity: "critical",
          description: "وصف",
          impact: "أثر",
          root_cause: "سبب",
          recommended_fix: "حل",
          occurrence_count: 3,
          confidence_score: 90,
        },
      ],
    });
  }

  it("يرفض رد فاضي أو JSON غير صالح", () => {
    expect(validateCategoryEnrichment(null).ok).toBe(false);
    expect(validateCategoryEnrichment("nonsense").ok).toBe(false);
  });

  it("يقبل رد صالح مع occurrence_count (Auto Grouping)", () => {
    const result = validateCategoryEnrichment(validPayload());
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.data.findings[0].occurrence_count).toBe(3);
  });

  it("يرفض occurrence_count أقل من 1", () => {
    const payload = JSON.stringify({
      summary: "ملخص",
      findings: [{ finding_key: "x", title: "x", severity: "low", description: "x", root_cause: "x", recommended_fix: "x", occurrence_count: 0, confidence_score: 50 }],
    });
    expect(validateCategoryEnrichment(payload).ok).toBe(false);
  });

  it("يرفض severity غير صالح", () => {
    const payload = JSON.stringify({
      summary: "ملخص",
      findings: [{ finding_key: "x", title: "x", severity: "catastrophic", description: "x", root_cause: "x", recommended_fix: "x", occurrence_count: 1, confidence_score: 50 }],
    });
    expect(validateCategoryEnrichment(payload).ok).toBe(false);
  });
});
