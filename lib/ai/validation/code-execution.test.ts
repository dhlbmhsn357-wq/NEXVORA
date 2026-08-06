import { describe, expect, it } from "vitest";
import { validateExecutionPlan, validateFixPrompt } from "./code-execution";

describe("validateExecutionPlan", () => {
  it("يرفض رد فارغ", () => {
    expect(validateExecutionPlan(null).ok).toBe(false);
    expect(validateExecutionPlan("").ok).toBe(false);
  });

  it("يرفض JSON غير صالح", () => {
    expect(validateExecutionPlan("{غير صالح").ok).toBe(false);
  });

  it("يرفض مصفوفة tasks فاضية", () => {
    const result = validateExecutionPlan(JSON.stringify({ tasks: [] }));
    expect(result.ok).toBe(false);
  });

  it("يرفض مهمة ناقصة حقول", () => {
    const result = validateExecutionPlan(JSON.stringify({ tasks: [{ title: "أ" }] }));
    expect(result.ok).toBe(false);
  });

  it("يقبل خطة صحيحة بمهمة واحدة أو أكتر", () => {
    const result = validateExecutionPlan(
      JSON.stringify({
        tasks: [
          { title: "إنشاء جدول", description: "وصف تفصيلي", target_file_hints: ["supabase/migrations/x.sql"] },
          { title: "بناء API", description: "وصف تاني", target_file_hints: [] },
        ],
      })
    );
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.data).toHaveLength(2);
  });
});

describe("validateFixPrompt", () => {
  it("يرفض رد فارغ", () => {
    expect(validateFixPrompt(null).ok).toBe(false);
  });

  it("يرفض لو fix_prompt فاضي", () => {
    const result = validateFixPrompt(JSON.stringify({ fix_prompt: "", target_file_hints: [] }));
    expect(result.ok).toBe(false);
  });

  it("يقبل رد صحيح", () => {
    const result = validateFixPrompt(JSON.stringify({ fix_prompt: "أصلح كذا", target_file_hints: ["a.ts"] }));
    expect(result.ok).toBe(true);
  });
});
