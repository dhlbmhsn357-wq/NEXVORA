import { describe, it, expect } from "vitest";
import {
  stepDetailCounts,
  hasStepDetail,
  stepDetailBadgeLabel,
  groupFlowSpecificationsByFlow,
} from "./flow-step-detail";
import type { PRDFlowSpecification } from "@/lib/types/database";

describe("stepDetailCounts", () => {
  it("returns zeros for a bare step", () => {
    expect(stepDetailCounts({})).toEqual({ uiElements: 0, hasSuccessMessage: false, errorMessages: 0 });
  });

  it("counts ui elements and error messages, trims success message", () => {
    expect(
      stepDetailCounts({
        uiElements: [{ fieldName: "email", fieldType: "نص", validationRule: "إجباري" }],
        successMessage: "  تم الحفظ  ",
        errorMessages: ["بريد غير صالح", "الحقل مطلوب"],
      })
    ).toEqual({ uiElements: 1, hasSuccessMessage: true, errorMessages: 2 });
  });

  it("treats a whitespace-only success message as absent", () => {
    expect(stepDetailCounts({ successMessage: "   " }).hasSuccessMessage).toBe(false);
  });
});

describe("hasStepDetail", () => {
  it("is false when nothing is filled", () => {
    expect(hasStepDetail({})).toBe(false);
    expect(hasStepDetail({ uiElements: [], errorMessages: [] })).toBe(false);
  });

  it("is true when any single field is filled", () => {
    expect(hasStepDetail({ uiElements: [{ fieldName: "x", fieldType: "", validationRule: "" }] })).toBe(true);
    expect(hasStepDetail({ successMessage: "تم" })).toBe(true);
    expect(hasStepDetail({ errorMessages: ["خطأ"] })).toBe(true);
  });
});

describe("stepDetailBadgeLabel", () => {
  it("returns null when there is no detail", () => {
    expect(stepDetailBadgeLabel({})).toBeNull();
  });

  it("formats a single ui element in singular", () => {
    expect(stepDetailBadgeLabel({ uiElements: [{ fieldName: "x", fieldType: "", validationRule: "" }] })).toBe(
      "1 عنصر واجهة"
    );
  });

  it("formats multiple ui elements in plural and joins parts with a middle dot", () => {
    expect(
      stepDetailBadgeLabel({
        uiElements: [
          { fieldName: "a", fieldType: "", validationRule: "" },
          { fieldName: "b", fieldType: "", validationRule: "" },
        ],
        successMessage: "تم",
        errorMessages: ["خطأ واحد"],
      })
    ).toBe("2 عناصر واجهة · رسالة نجاح · 1 رسالة خطأ");
  });

  it("formats multiple error messages in plural", () => {
    expect(stepDetailBadgeLabel({ errorMessages: ["a", "b", "c"] })).toBe("3 رسائل خطأ");
  });
});

describe("groupFlowSpecificationsByFlow", () => {
  const mk = (flow_name: string, step_action: string): PRDFlowSpecification => ({
    flow_name,
    step_action,
    ui_elements: [],
    success_message: "",
    error_messages: [],
  });

  it("returns an empty array for empty input", () => {
    expect(groupFlowSpecificationsByFlow([])).toEqual([]);
  });

  it("groups consecutive and non-consecutive entries by flow_name, preserving first-seen order", () => {
    const specs = [mk("تسجيل الدخول", "خطوة 1"), mk("الدفع", "خطوة أ"), mk("تسجيل الدخول", "خطوة 2")];
    const groups = groupFlowSpecificationsByFlow(specs);
    expect(groups.map((g) => g.flowName)).toEqual(["تسجيل الدخول", "الدفع"]);
    expect(groups[0].items.map((i) => i.step_action)).toEqual(["خطوة 1", "خطوة 2"]);
    expect(groups[1].items.map((i) => i.step_action)).toEqual(["خطوة أ"]);
  });

  it("falls back to an em dash key for an empty flow_name", () => {
    const groups = groupFlowSpecificationsByFlow([mk("", "خطوة")]);
    expect(groups[0].flowName).toBe("—");
  });
});
