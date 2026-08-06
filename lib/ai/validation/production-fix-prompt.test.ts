import { describe, expect, it } from "vitest";
import { validateProductionFixPromptGeneration } from "./production-fix-prompt";

function makePrompt(overrides: Record<string, unknown> = {}) {
  return {
    area: "database",
    title: "إصلاح فهرس مفقود",
    problem: "استعلام بطيء بسبب فهرس مفقود",
    context: "الجدول orders يكبر بسرعة",
    evidence: "زمن الاستجابة 4 ثواني",
    expected_result: "استجابة أقل من 200ms",
    acceptance_criteria: ["الاستعلام أسرع من 200ms"],
    files: ["migrations/xyz.sql"],
    dependencies: [],
    priority: "high",
    risks: "لا يوجد",
    testing_plan: "اختبار الحمل",
    rollback: "حذف الفهرس",
    ...overrides,
  };
}

describe("validateProductionFixPromptGeneration", () => {
  it("رد فارغ → فشل", () => {
    expect(validateProductionFixPromptGeneration(null).ok).toBe(false);
    expect(validateProductionFixPromptGeneration("").ok).toBe(false);
  });

  it("JSON غير صالح → فشل", () => {
    expect(validateProductionFixPromptGeneration("not json").ok).toBe(false);
  });

  it("prompts فاضية → فشل", () => {
    expect(validateProductionFixPromptGeneration(JSON.stringify({ prompts: [] })).ok).toBe(false);
  });

  it("area غير صالح → فشل", () => {
    const result = validateProductionFixPromptGeneration(JSON.stringify({ prompts: [makePrompt({ area: "invalid_area" })] }));
    expect(result.ok).toBe(false);
  });

  it("title مفقود → فشل", () => {
    const result = validateProductionFixPromptGeneration(JSON.stringify({ prompts: [makePrompt({ title: "" })] }));
    expect(result.ok).toBe(false);
  });

  it("prompt صالح كامل → نجاح مع كل الحقول", () => {
    const result = validateProductionFixPromptGeneration(JSON.stringify({ prompts: [makePrompt()] }));
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.data).toHaveLength(1);
      expect(result.data[0].area).toBe("database");
      expect(result.data[0].content.acceptance_criteria).toEqual(["الاستعلام أسرع من 200ms"]);
    }
  });

  it("priority غير صالح → يرجع للـ medium الافتراضي", () => {
    const result = validateProductionFixPromptGeneration(JSON.stringify({ prompts: [makePrompt({ priority: "urgent" })] }));
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.data[0].content.priority).toBe("medium");
  });

  it("أكتر من 6 prompts → يُقتصر على أول 6 (MAX_PROMPTS)", () => {
    const prompts = Array.from({ length: 10 }, (_, i) => makePrompt({ title: `Prompt ${i}` }));
    const result = validateProductionFixPromptGeneration(JSON.stringify({ prompts }));
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.data).toHaveLength(6);
  });

  it("مغلّف في code fence ```json ... ``` → لسه بيتحلل صح", () => {
    const wrapped = "```json\n" + JSON.stringify({ prompts: [makePrompt()] }) + "\n```";
    expect(validateProductionFixPromptGeneration(wrapped).ok).toBe(true);
  });
});
