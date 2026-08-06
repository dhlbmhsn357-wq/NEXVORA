import { describe, expect, it } from "vitest";
import { validateExecutionPlan, validateStageContent } from "./prototype-prompt-pipeline";

function makeModule(index: number, dependsOn: number[] = []) {
  return { index, title: `موديول ${index}`, summary: `وصف الموديول ${index}`, depends_on: dependsOn };
}

function makeSmallPlanPayload(moduleCount = 7) {
  const modules = Array.from({ length: moduleCount }, (_, i) =>
    makeModule(i + 1, i === 0 ? [] : [i])
  );
  return { project_size: "small", execution_summary: "استراتيجية بناء المشروع بالكامل.", modules };
}

describe("validateExecutionPlan", () => {
  it("accepts a well-formed small plan (6-8 modules)", () => {
    const result = validateExecutionPlan(JSON.stringify(makeSmallPlanPayload(7)));
    expect(result.ok).toBe(true);
  });

  it("accepts a well-formed enterprise plan (16-20 modules)", () => {
    const modules = Array.from({ length: 18 }, (_, i) => makeModule(i + 1, i === 0 ? [] : [i]));
    const payload = { project_size: "enterprise", execution_summary: "خطة مشروع كبير.", modules };
    expect(validateExecutionPlan(JSON.stringify(payload)).ok).toBe(true);
  });

  it("rejects null/empty/invalid JSON", () => {
    expect(validateExecutionPlan(null).ok).toBe(false);
    expect(validateExecutionPlan("not json").ok).toBe(false);
  });

  it("rejects an invalid project_size value", () => {
    const payload = { ...makeSmallPlanPayload(), project_size: "huge" };
    expect(validateExecutionPlan(JSON.stringify(payload)).ok).toBe(false);
  });

  it("rejects a module count outside the range for the chosen size", () => {
    // "small" لازم يكون بين 6 و8 موديولات — 3 برا النطاق
    const payload = makeSmallPlanPayload(3);
    const result = validateExecutionPlan(JSON.stringify(payload));
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.reason).toContain("خارج النطاق");
  });

  it("rejects modules with a non-sequential index", () => {
    const payload = makeSmallPlanPayload(7);
    payload.modules[3].index = 99;
    expect(validateExecutionPlan(JSON.stringify(payload)).ok).toBe(false);
  });

  it("rejects a module whose depends_on references a later module", () => {
    const payload = makeSmallPlanPayload(7);
    payload.modules[1].depends_on = [5]; // موديول 2 بيعتمد على موديول 5 (جاي بعده) — غير منطقي
    expect(validateExecutionPlan(JSON.stringify(payload)).ok).toBe(false);
  });

  it("rejects a module missing a title or summary", () => {
    const payload = makeSmallPlanPayload(7);
    payload.modules[2].title = "";
    expect(validateExecutionPlan(JSON.stringify(payload)).ok).toBe(false);
  });

  it("rejects a missing execution_summary", () => {
    const payload = { ...makeSmallPlanPayload(), execution_summary: "" };
    expect(validateExecutionPlan(JSON.stringify(payload)).ok).toBe(false);
  });

  it("rejects an empty modules array", () => {
    const payload = { ...makeSmallPlanPayload(), modules: [] };
    expect(validateExecutionPlan(JSON.stringify(payload)).ok).toBe(false);
  });
});

describe("validateStageContent", () => {
  const longContent = "## Context\n" + "هذا محتوى كامل لمرحلة واحدة في السلسلة. ".repeat(20);

  it("accepts substantial markdown content", () => {
    const result = validateStageContent(longContent);
    expect(result.ok).toBe(true);
  });

  it("rejects null or empty content", () => {
    expect(validateStageContent(null).ok).toBe(false);
    expect(validateStageContent("   ").ok).toBe(false);
  });

  it("rejects suspiciously short content (likely truncated/failed generation)", () => {
    expect(validateStageContent("## Context\nقصير جدًا.").ok).toBe(false);
  });

  it("trims surrounding whitespace on success", () => {
    const result = validateStageContent(`  \n${longContent}\n  `);
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.content.startsWith("##")).toBe(true);
      expect(result.content.endsWith(longContent.trim().slice(-1))).toBe(true);
    }
  });
});
