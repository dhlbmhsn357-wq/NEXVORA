import { describe, expect, it } from "vitest";
import { validateDiscoveryFormGeneration } from "./discovery-form-generation";

function validForm(overrides: Record<string, unknown> = {}) {
  return JSON.stringify({
    template: { name: "نموذج ERP تصنيع", description: "فورم مخصص", estimated_project_size: "large", tags: ["erp", "تصنيع"] },
    sections: [
      {
        title: "نظرة عامة",
        questions: [
          { ref: "q1", question: "فيه أكتر من مخزن؟", type: "yes_no", required: true, conditional: null },
          { ref: "q2", question: "إزاي بتتزامن المخازن؟", type: "long_text", required: false, conditional: { dependsOnRef: "q1", operator: "equals", value: true } },
        ],
      },
    ],
    ...overrides,
  });
}

describe("validateDiscoveryFormGeneration", () => {
  it("رد فارغ / JSON غير صالح → فشل", () => {
    expect(validateDiscoveryFormGeneration(null, "standard").ok).toBe(false);
    expect(validateDiscoveryFormGeneration("not json", "standard").ok).toBe(false);
  });

  it("sections فاضية → فشل", () => {
    expect(validateDiscoveryFormGeneration(JSON.stringify({ template: {}, sections: [] }), "standard").ok).toBe(false);
  });

  it("فورم صالح كامل → نجاح مع الحفاظ على conditional وربطه بـ ref سابق", () => {
    const result = validateDiscoveryFormGeneration(validForm(), "standard");
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.data.questions).toHaveLength(2);
      expect(result.data.questions[0].category).toBe("نظرة عامة");
      expect(result.data.questions[1].conditional).toEqual({ dependsOnRef: "q1", operator: "equals", value: true });
    }
  });

  it("نوع غير صالح → يُسقط السؤال", () => {
    const raw = JSON.stringify({
      template: { name: "x", description: "y" },
      sections: [{ title: "s", questions: [{ ref: "q1", question: "سؤال", type: "made_up_type" }] }],
    });
    expect(validateDiscoveryFormGeneration(raw, "standard").ok).toBe(false);
  });

  it("نوع يتطلّب خيارات بلا options → يُسقط", () => {
    const raw = JSON.stringify({
      template: { name: "x", description: "y" },
      sections: [
        { title: "s", questions: [
          { ref: "q1", question: "مع خيارات", type: "multiple_choice", options: [] },
          { ref: "q2", question: "بدون خيارات", type: "short_text" },
        ] },
      ],
    });
    const result = validateDiscoveryFormGeneration(raw, "standard");
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.data.questions).toHaveLength(1);
      expect(result.data.questions[0].ref).toBe("q2");
    }
  });

  it("حارس الهلوسة: conditional يشير لـ ref غير موجود/لاحق → يُسقط الشرط فقط", () => {
    const raw = JSON.stringify({
      template: { name: "x", description: "y" },
      sections: [
        { title: "s", questions: [
          { ref: "q1", question: "أول", type: "short_text", conditional: { dependsOnRef: "q_future", operator: "equals", value: "x" } },
        ] },
      ],
    });
    const result = validateDiscoveryFormGeneration(raw, "standard");
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.data.questions[0].conditional).toBeNull();
  });

  it("العمق يفرض حدًا أقصى للأسئلة (quick → 20)", () => {
    const questions = Array.from({ length: 40 }, (_, i) => ({ ref: `q${i}`, question: `س ${i}`, type: "short_text" }));
    const raw = JSON.stringify({ template: { name: "x", description: "y" }, sections: [{ title: "s", questions }] });
    const result = validateDiscoveryFormGeneration(raw, "quick");
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.data.questions.length).toBeLessThanOrEqual(20);
  });

  it("مغلّف في code fence → لسه بيتحلل", () => {
    const wrapped = "```json\n" + validForm() + "\n```";
    expect(validateDiscoveryFormGeneration(wrapped, "standard").ok).toBe(true);
  });
});
