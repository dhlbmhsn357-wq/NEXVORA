import { describe, expect, it } from "vitest";
import { evaluateCondition, isQuestionVisible, visibleQuestions } from "./conditional";
import type { DiscoveryQuestion, DiscoveryQuestionConditional } from "@/lib/types/database";

function q(partial: Partial<DiscoveryQuestion> & { id: string }): DiscoveryQuestion {
  return {
    id: partial.id,
    template_id: "t1",
    question: partial.question ?? "سؤال",
    description: null,
    type: partial.type ?? "short_text",
    required: partial.required ?? false,
    placeholder: null,
    options: partial.options ?? [],
    help_text: null,
    sort_order: partial.sort_order ?? 0,
    ai_weight: 1,
    category: partial.category ?? null,
    validation: {},
    conditional: partial.conditional ?? null,
    created_at: "",
    updated_at: "",
  };
}

const known = new Set(["a", "b"]);

describe("evaluateCondition", () => {
  it("exists → يظهر لو فيه إجابة", () => {
    const c: DiscoveryQuestionConditional = { dependsOn: "a", operator: "exists" };
    expect(evaluateCondition(c, { a: "نعم" }, known)).toBe(true);
    expect(evaluateCondition(c, {}, known)).toBe(false);
  });

  it("not_exists → يظهر لو مفيش إجابة", () => {
    const c: DiscoveryQuestionConditional = { dependsOn: "a", operator: "not_exists" };
    expect(evaluateCondition(c, {}, known)).toBe(true);
    expect(evaluateCondition(c, { a: "x" }, known)).toBe(false);
  });

  it("equals → مقارنة نصية/بوليان مرنة", () => {
    const c: DiscoveryQuestionConditional = { dependsOn: "a", operator: "equals", value: "نعم" };
    expect(evaluateCondition(c, { a: "نعم" }, known)).toBe(true);
    expect(evaluateCondition(c, { a: "لا" }, known)).toBe(false);
    const cBool: DiscoveryQuestionConditional = { dependsOn: "a", operator: "equals", value: true };
    expect(evaluateCondition(cBool, { a: true }, known)).toBe(true);
    expect(evaluateCondition(cBool, { a: "نعم" }, known)).toBe(true);
  });

  it("not_equals → عكس equals، ويظهر لو فاضي", () => {
    const c: DiscoveryQuestionConditional = { dependsOn: "a", operator: "not_equals", value: "نعم" };
    expect(evaluateCondition(c, { a: "لا" }, known)).toBe(true);
    expect(evaluateCondition(c, { a: "نعم" }, known)).toBe(false);
    expect(evaluateCondition(c, {}, known)).toBe(true);
  });

  it("includes → يشتغل مع المصفوفات والقيمة المفردة", () => {
    const c: DiscoveryQuestionConditional = { dependsOn: "a", operator: "includes", value: "مخزون" };
    expect(evaluateCondition(c, { a: ["مخزون", "فواتير"] }, known)).toBe(true);
    expect(evaluateCondition(c, { a: ["فواتير"] }, known)).toBe(false);
    expect(evaluateCondition(c, { a: "مخزون" }, known)).toBe(true);
  });

  it("fail-open: لو السؤال المُعتمَد عليه غير معروف → يظهر", () => {
    const c: DiscoveryQuestionConditional = { dependsOn: "ghost", operator: "equals", value: "x" };
    expect(evaluateCondition(c, {}, known)).toBe(true);
  });
});

describe("isQuestionVisible", () => {
  it("سؤال بلا conditional يظهر دائمًا", () => {
    expect(isQuestionVisible(q({ id: "z" }), {}, known)).toBe(true);
  });

  it("سؤال شرطي يظهر/يختفي حسب الإجابة", () => {
    const question = q({ id: "b", conditional: { dependsOn: "a", operator: "equals", value: "نعم" } });
    expect(isQuestionVisible(question, { a: "نعم" }, known)).toBe(true);
    expect(isQuestionVisible(question, { a: "لا" }, known)).toBe(false);
  });
});

describe("visibleQuestions", () => {
  it("يرشّح المخفية ويحافظ على الترتيب", () => {
    const list = [
      q({ id: "a", question: "فيه مخزون؟", type: "yes_no", sort_order: 1 }),
      q({ id: "b", question: "أسئلة المخزون", sort_order: 2, conditional: { dependsOn: "a", operator: "equals", value: true } }),
      q({ id: "c", question: "سؤال عام", sort_order: 3 }),
    ];
    expect(visibleQuestions(list, { a: false }).map((x) => x.id)).toEqual(["a", "c"]);
    expect(visibleQuestions(list, { a: true }).map((x) => x.id)).toEqual(["a", "b", "c"]);
  });
});
