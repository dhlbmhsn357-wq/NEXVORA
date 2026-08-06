import { describe, expect, it } from "vitest";
import {
  computeCategoryScore,
  computeFindingKey,
  validateCategoryReview,
  verifyFindingsGrounding,
  type ParsedStaticFinding,
} from "./static-review";
import type { RepoFile } from "@/lib/github/repo-reader";

function baseFinding(overrides: Partial<ParsedStaticFinding> = {}): ParsedStaticFinding {
  return {
    title: "دالة طويلة جدًا",
    severity: "medium",
    description: "وصف",
    impact: "أثر",
    file_path: "app/foo.ts",
    component_name: null,
    function_name: null,
    class_name: null,
    line_start: 1,
    line_end: 2,
    code_snippet: "const x = 1;",
    root_cause: "سبب",
    recommended_fix: "حل",
    patch_suggestion: "",
    validation_steps: [],
    confidence_score: 90,
    ...overrides,
  };
}

describe("computeFindingKey", () => {
  it("نفس المدخلات بترجع نفس المفتاح دايمًا (Deterministic)", () => {
    expect(computeFindingKey("clean_code", "app/foo.ts", "Long Function")).toBe(
      computeFindingKey("clean_code", "app/foo.ts", "Long Function")
    );
  });

  it("اختلاف حالة الأحرف/المسافات في العنوان مايأثرش على المفتاح (Normalized)", () => {
    expect(computeFindingKey("clean_code", "app/foo.ts", "Long   Function")).toBe(
      computeFindingKey("clean_code", "app/foo.ts", "long function")
    );
  });

  it("اختلاف المحور أو الملف بيدي مفتاح مختلف", () => {
    const a = computeFindingKey("clean_code", "app/foo.ts", "Long Function");
    const b = computeFindingKey("solid", "app/foo.ts", "Long Function");
    const c = computeFindingKey("clean_code", "app/bar.ts", "Long Function");
    expect(a).not.toBe(b);
    expect(a).not.toBe(c);
  });
});

describe("computeCategoryScore", () => {
  it("يرجّع 100 لو مفيش أي findings", () => {
    expect(computeCategoryScore([])).toBe(100);
  });

  it("Critical واحد بينزّل الدرجة أكتر من Info واحد", () => {
    const criticalScore = computeCategoryScore([{ severity: "critical" }]);
    const infoScore = computeCategoryScore([{ severity: "info" }]);
    expect(criticalScore).toBeLessThan(infoScore);
  });

  it("مايرجعش أقل من صفر حتى مع Findings كتير جدًا", () => {
    const many = Array.from({ length: 20 }, () => ({ severity: "critical" as const }));
    expect(computeCategoryScore(many)).toBe(0);
  });
});

describe("verifyFindingsGrounding", () => {
  const files: RepoFile[] = [{ path: "app/foo.ts", content: "function foo() {\n  const x = 1;\n  return x;\n}" }];

  it("يحتفظ بـ Finding لو الـ code_snippet موجود حرفيًا في الملف", () => {
    const result = verifyFindingsGrounding([baseFinding({ code_snippet: "const x = 1;" })], files);
    expect(result.grounded).toHaveLength(1);
    expect(result.droppedCount).toBe(0);
  });

  it("يشيل Finding لو code_snippet مش موجود في الملف (مُختلَق)", () => {
    const result = verifyFindingsGrounding([baseFinding({ code_snippet: "const y = 999;" })], files);
    expect(result.grounded).toHaveLength(0);
    expect(result.droppedCount).toBe(1);
  });

  it("يشيل Finding لو file_path مش من ضمن الملفات المرفقة أصلًا", () => {
    const result = verifyFindingsGrounding([baseFinding({ file_path: "app/does-not-exist.ts" })], files);
    expect(result.grounded).toHaveLength(0);
  });
});

describe("validateCategoryReview", () => {
  it("يرفض رد فاضي", () => {
    expect(validateCategoryReview(null).ok).toBe(false);
    expect(validateCategoryReview("").ok).toBe(false);
  });

  it("يرفض JSON غير صالح", () => {
    expect(validateCategoryReview("not json").ok).toBe(false);
  });

  it("يقبل رد صالح بالكامل", () => {
    const raw = JSON.stringify({
      summary: "ملخص",
      findings: [baseFinding()],
    });
    const result = validateCategoryReview(raw);
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.data.findings).toHaveLength(1);
      expect(result.data.summary).toBe("ملخص");
    }
  });

  it("يرفض Finding من غير code_snippet", () => {
    const raw = JSON.stringify({
      summary: "ملخص",
      findings: [{ ...baseFinding(), code_snippet: "" }],
    });
    expect(validateCategoryReview(raw).ok).toBe(false);
  });

  it("يرفض severity غير صالح", () => {
    const raw = JSON.stringify({
      summary: "ملخص",
      findings: [{ ...baseFinding(), severity: "catastrophic" }],
    });
    expect(validateCategoryReview(raw).ok).toBe(false);
  });
});
