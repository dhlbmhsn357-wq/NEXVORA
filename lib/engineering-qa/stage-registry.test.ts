import { describe, expect, it } from "vitest";
import { STAGE_REGISTRY, getStageDefinition, runPlaceholderStage } from "./stage-registry";
import { CONTINUABLE_STAGE_KEYS } from "./continuable-stages";

describe("STAGE_REGISTRY", () => {
  it("يحتوي على الاتناشر محور (التسعة الأصليين + Architecture/Code Quality/PRD Compliance اللي أضيفوا في EngQA-Merge)", () => {
    expect(STAGE_REGISTRY).toHaveLength(12);
  });

  it("كل مفتاح فريد بدون تكرار", () => {
    const keys = STAGE_REGISTRY.map((s) => s.key);
    expect(new Set(keys).size).toBe(keys.length);
  });

  it("execution_order متسلسل من 1 بدون فجوات أو تكرار", () => {
    const orders = STAGE_REGISTRY.map((s) => s.order).sort((a, b) => a - b);
    expect(orders).toEqual(Array.from({ length: STAGE_REGISTRY.length }, (_, i) => i + 1));
  });

  it("static_code_audit وsecurity_audit وdatabase_audit وarchitecture_audit وcode_quality_audit وperformance_audit وprd_compliance_audit وfunctional_audit بس عندهم run() حقيقي — الباقي (ui_ux_audit/regression_testing/ai_code_smell_detection/production_certification) لسه Placeholder", () => {
    const withRun = STAGE_REGISTRY.filter((s) => s.run !== undefined).map((s) => s.key);
    expect(withRun).toEqual([
      "static_code_audit",
      "security_audit",
      "database_audit",
      "architecture_audit",
      "code_quality_audit",
      "performance_audit",
      "prd_compliance_audit",
      "functional_audit",
    ]);
  });

  it("الـ 8 مراحل ذات المحرك الفرعي مُعرَّفة كـ continuable (جسر لمحرك فرعي مستقل)", () => {
    for (const key of [
      "static_code_audit",
      "security_audit",
      "database_audit",
      "architecture_audit",
      "code_quality_audit",
      "performance_audit",
      "prd_compliance_audit",
      "functional_audit",
    ]) {
      expect(STAGE_REGISTRY.find((s) => s.key === key)?.continuable).toBe(true);
    }
  });

  it("continuable-stages.ts (النسخة الثابتة Client-safe) متطابقة تمامًا مع علامات continuable الفعلية هنا", () => {
    const actual = STAGE_REGISTRY.filter((s) => s.continuable).map((s) => s.key).sort();
    expect([...CONTINUABLE_STAGE_KEYS].sort()).toEqual(actual);
  });
});

describe("getStageDefinition", () => {
  it("يرجّع تعريف المحور الصحيح بالمفتاح", () => {
    expect(getStageDefinition("security_audit")?.label).toContain("Security");
  });

  it("يرجّع null لمفتاح غير موجود", () => {
    expect(getStageDefinition("not_a_real_stage")).toBeNull();
  });
});

describe("runPlaceholderStage", () => {
  it("يرجّع نتيجة صريحة 'لسه معملهاش فحص' — مش بيانات وهمية بتتظاهر إنها حقيقية", () => {
    return runPlaceholderStage().then((result) => {
      expect(result.score).toBeNull();
      expect(result.findingsJson).toEqual([]);
      expect(result.recommendationsJson).toEqual([]);
      expect(result.summary.length).toBeGreaterThan(0);
    });
  });
});
