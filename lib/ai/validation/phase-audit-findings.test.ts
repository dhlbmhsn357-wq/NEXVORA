import { describe, expect, it } from "vitest";
import {
  computePhaseCategoryScore,
  computePhaseFindingKey,
  validatePhaseCategoryReview,
  verifyPhaseFindingsGrounding,
  type ParsedPhaseFinding,
} from "./phase-audit-findings";
import type { RepoFile } from "@/lib/github/repo-reader";

function baseFinding(overrides: Partial<ParsedPhaseFinding> = {}): ParsedPhaseFinding {
  return {
    title: "Hardcoded API key",
    severity: "critical",
    description: "وصف",
    impact: "أثر",
    file_path: "lib/config.ts",
    component_name: null,
    function_name: null,
    class_name: null,
    line_start: 1,
    line_end: 1,
    code_snippet: 'const key = "test";',
    root_cause: "سبب",
    attack_scenario: "سيناريو",
    recommended_fix: "حل",
    patch_suggestion: "",
    validation_steps: [],
    reference_links: [],
    confidence_score: 95,
    ...overrides,
  };
}

describe("computePhaseFindingKey", () => {
  it("نفس المدخلات بترجع نفس المفتاح", () => {
    expect(computePhaseFindingKey("secrets", "lib/config.ts", "Hardcoded Key")).toBe(
      computePhaseFindingKey("secrets", "lib/config.ts", "Hardcoded Key")
    );
  });

  it("اختلاف المحور بيدي مفتاح مختلف حتى لو نفس الملف والعنوان", () => {
    const a = computePhaseFindingKey("secrets", "lib/config.ts", "X");
    const b = computePhaseFindingKey("authentication", "lib/config.ts", "X");
    expect(a).not.toBe(b);
  });
});

describe("computePhaseCategoryScore", () => {
  it("يرجّع 100 لمصفوفة فاضية", () => {
    expect(computePhaseCategoryScore([])).toBe(100);
  });

  it("Critical أعلى تأثيرًا من Info", () => {
    expect(computePhaseCategoryScore([{ severity: "critical" }])).toBeLessThan(computePhaseCategoryScore([{ severity: "info" }]));
  });

  it("لا يقل عن صفر", () => {
    const many = Array.from({ length: 20 }, () => ({ severity: "critical" as const }));
    expect(computePhaseCategoryScore(many)).toBe(0);
  });
});

describe("verifyPhaseFindingsGrounding", () => {
  const files: RepoFile[] = [{ path: "lib/config.ts", content: 'export const key = "test";' }];

  it("يحتفظ بالـ Finding لو الدليل موجود حرفيًا", () => {
    const result = verifyPhaseFindingsGrounding([baseFinding({ code_snippet: 'const key = "test";' })], files);
    expect(result.grounded).toHaveLength(1);
  });

  it("يشيل الـ Finding لو الدليل مُختلَق", () => {
    const result = verifyPhaseFindingsGrounding([baseFinding({ code_snippet: "totally made up code" })], files);
    expect(result.grounded).toHaveLength(0);
    expect(result.droppedCount).toBe(1);
  });
});

describe("validatePhaseCategoryReview", () => {
  it("يرفض رد فاضي أو JSON غير صالح", () => {
    expect(validatePhaseCategoryReview(null).ok).toBe(false);
    expect(validatePhaseCategoryReview("nonsense").ok).toBe(false);
  });

  it("يقبل رد صالح كامل بما فيه attack_scenario وreference_links", () => {
    const raw = JSON.stringify({ summary: "ملخص", findings: [baseFinding()] });
    const result = validatePhaseCategoryReview(raw);
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.data.findings[0].attack_scenario).toBe("سيناريو");
  });

  it("يرفض Finding بدون code_snippet", () => {
    const raw = JSON.stringify({ summary: "ملخص", findings: [{ ...baseFinding(), code_snippet: "" }] });
    expect(validatePhaseCategoryReview(raw).ok).toBe(false);
  });

  it("severity=info مقبول (خامس مستوى إضافي عن Engineering Audit)", () => {
    const raw = JSON.stringify({ summary: "ملخص", findings: [baseFinding({ severity: "info" })] });
    expect(validatePhaseCategoryReview(raw).ok).toBe(true);
  });
});
