import { describe, it, expect } from "vitest";
import { validatePrdIncrementSection } from "./prd-increment";

function payload(overrides: Record<string, unknown> = {}): string {
  return JSON.stringify({
    summary: "الزيادة بتضيف تكامل مع بوابة الدفع.",
    scope_added: ["بوابة الدفع"],
    functional_requirements: ["إتمام الدفع بالبطاقة"],
    non_functional_requirements: ["تشفير بيانات البطاقة"],
    user_stories: [{ role: "بصفتي عميل", want: "أريد أدفع بالبطاقة", benefit: "حتى أتم الطلب" }],
    acceptance_criteria: [
      { given: "بافتراض وجود طلب", when: "عندما أدفع", then: "فإن الطلب يتأكد" },
    ],
    impact_on_existing: ["قسم المتطلبات الوظيفية: خطوة الدفع بقت إجبارية"],
    risks_assumptions: ["توفر حساب لدى البوابة"],
    test_focus: ["دفع ناجح", "دفع مرفوض"],
    ...overrides,
  });
}

describe("validatePrdIncrementSection — الحالات الصحيحة", () => {
  it("يقبل قسمًا كاملًا", () => {
    const r = validatePrdIncrementSection(payload());
    expect(r.ok).toBe(true);
    if (r.ok) {
      expect(r.data.summary).toContain("بوابة الدفع");
      expect(r.data.test_focus).toHaveLength(2);
    }
  });

  it("يقبل قسمًا بمصفوفات فاضية طالما فيه محتوى فعلي", () => {
    const r = validatePrdIncrementSection(
      payload({
        non_functional_requirements: [],
        user_stories: [],
        acceptance_criteria: [],
        risks_assumptions: [],
        test_focus: [],
      })
    );
    expect(r.ok).toBe(true);
  });

  it("يعتبر المفتاح الغائب مصفوفة فاضية بدل ما يرفض", () => {
    const raw = JSON.stringify({
      summary: "زيادة صغيرة.",
      functional_requirements: ["متطلب جديد"],
    });
    const r = validatePrdIncrementSection(raw);
    expect(r.ok).toBe(true);
    if (r.ok) {
      expect(r.data.test_focus).toEqual([]);
      expect(r.data.user_stories).toEqual([]);
    }
  });

  it("يقبل JSON داخل code fences", () => {
    const r = validatePrdIncrementSection("```json\n" + payload() + "\n```");
    expect(r.ok).toBe(true);
  });

  it("يقبل JSON مسبوقًا بكلام من النموذج", () => {
    const r = validatePrdIncrementSection("تمام، دي النتيجة:\n" + payload());
    expect(r.ok).toBe(true);
  });

  it("يتسامح مع الفاصلة الزائدة قبل قوس الإغلاق", () => {
    const raw = '{"summary":"زيادة","functional_requirements":["متطلب",],}';
    const r = validatePrdIncrementSection(raw);
    expect(r.ok).toBe(true);
  });
});

describe("validatePrdIncrementSection — الحالات المرفوضة", () => {
  it("يرفض الرد الفاضي", () => {
    expect(validatePrdIncrementSection("").ok).toBe(false);
    expect(validatePrdIncrementSection(null).ok).toBe(false);
  });

  it("يرفض JSON غير صالح", () => {
    expect(validatePrdIncrementSection("{ليس JSON").ok).toBe(false);
  });

  it("يرفض الملخّص الفاضي", () => {
    const r = validatePrdIncrementSection(payload({ summary: "   " }));
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.reason).toContain("summary");
  });

  it("يرفض قسمًا بلا أي محتوى فعلي", () => {
    const r = validatePrdIncrementSection(
      payload({
        scope_added: [],
        functional_requirements: [],
        non_functional_requirements: [],
        user_stories: [],
        acceptance_criteria: [],
      })
    );
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.reason).toContain("بلا محتوى فعلي");
  });

  it("يرفض قصة مستخدم ناقصة الحقول", () => {
    const r = validatePrdIncrementSection(
      payload({ user_stories: [{ role: "بصفتي عميل", want: "أريد" }] })
    );
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.reason).toContain("user_stories");
  });

  it("يرفض معيار قبول بصيغة غير Given/When/Then", () => {
    const r = validatePrdIncrementSection(
      payload({ acceptance_criteria: [{ description: "الدفع يشتغل" }] })
    );
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.reason).toContain("acceptance_criteria");
  });

  it("يرفض مصفوفة نصوص فيها عنصر مش نص", () => {
    const r = validatePrdIncrementSection(payload({ test_focus: ["حالة", 42] }));
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.reason).toContain("test_focus");
  });
});
