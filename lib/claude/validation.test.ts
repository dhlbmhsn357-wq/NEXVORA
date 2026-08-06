import { describe, expect, it } from "vitest";
import { validateClaudeTaskResult } from "./validation";

describe("validateClaudeTaskResult", () => {
  it("يرفض رد فارغ", () => {
    expect(validateClaudeTaskResult(null).ok).toBe(false);
  });

  it("يرفض JSON غير صالح", () => {
    expect(validateClaudeTaskResult("مش JSON").ok).toBe(false);
  });

  it("يرفض لو files فاضية", () => {
    const result = validateClaudeTaskResult(JSON.stringify({ summary: "تم", files: [] }));
    expect(result.ok).toBe(false);
  });

  it("يرفض action غير معروف", () => {
    const result = validateClaudeTaskResult(JSON.stringify({ summary: "تم", files: [{ path: "a.ts", action: "rename", content: "x" }] }));
    expect(result.ok).toBe(false);
  });

  it("يرفض update/create من غير content", () => {
    const result = validateClaudeTaskResult(JSON.stringify({ summary: "تم", files: [{ path: "a.ts", action: "update" }] }));
    expect(result.ok).toBe(false);
  });

  it("يقبل delete من غير content", () => {
    const result = validateClaudeTaskResult(JSON.stringify({ summary: "تم", files: [{ path: "a.ts", action: "delete" }] }));
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.data.files[0].content).toBeNull();
  });

  it("يقبل create/update بـ content صحيح", () => {
    const result = validateClaudeTaskResult(
      JSON.stringify({ summary: "تم", files: [{ path: "a.ts", action: "create", content: "export const x = 1;" }] })
    );
    expect(result.ok).toBe(true);
  });
});
