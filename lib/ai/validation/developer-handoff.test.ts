import { describe, it, expect } from "vitest";
import { validateDeveloperHandoffGeneration } from "./developer-handoff";

const valid = {
  project_overview: "نظام إدارة عيادات صغير لعميل واحد.",
  setup_steps: ["npm install", "cp .env.example .env.local", "npm run dev"],
  review_focus_areas: [
    { area: "Authentication", priority: "high", reason: "Missing feature per Gap Report" },
    { area: "Performance", priority: "medium", reason: "Bundle size not measured" },
  ],
  review_acceptance_criteria: [
    "All High priority areas reviewed",
    "All Critical bugs logged",
  ],
};

describe("validateDeveloperHandoffGeneration", () => {
  it("يقبل رد كامل وصحيح", () => {
    const result = validateDeveloperHandoffGeneration(JSON.stringify(valid));
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.data.setup_steps).toHaveLength(3);
      expect(result.data.review_focus_areas[0].priority).toBe("high");
    }
  });

  it("يرفض رد فارغ", () => {
    expect(validateDeveloperHandoffGeneration("").ok).toBe(false);
  });

  it("يرفض JSON غير صالح", () => {
    expect(validateDeveloperHandoffGeneration("{{").ok).toBe(false);
  });

  it("يرفض project_overview فارغ", () => {
    const bad = { ...valid, project_overview: "" };
    expect(validateDeveloperHandoffGeneration(JSON.stringify(bad)).ok).toBe(false);
  });

  it("يرفض setup_steps فارغة", () => {
    const bad = { ...valid, setup_steps: [] };
    expect(validateDeveloperHandoffGeneration(JSON.stringify(bad)).ok).toBe(false);
  });

  it("يرفض priority غير صالحة", () => {
    const bad = { ...valid, review_focus_areas: [{ area: "X", priority: "urgent", reason: "y" }] };
    expect(validateDeveloperHandoffGeneration(JSON.stringify(bad)).ok).toBe(false);
  });

  it("يرفض review_focus_areas فارغة", () => {
    const bad = { ...valid, review_focus_areas: [] };
    expect(validateDeveloperHandoffGeneration(JSON.stringify(bad)).ok).toBe(false);
  });

  it("يرفض عنصر review_focus_areas بدون reason", () => {
    const bad = { ...valid, review_focus_areas: [{ area: "X", priority: "high", reason: "" }] };
    expect(validateDeveloperHandoffGeneration(JSON.stringify(bad)).ok).toBe(false);
  });

  it("يرفض مفتاح إضافي غير متوقع", () => {
    const bad = { ...valid, extra: "x" };
    expect(validateDeveloperHandoffGeneration(JSON.stringify(bad)).ok).toBe(false);
  });

  it("يرفض review_acceptance_criteria فارغة", () => {
    const bad = { ...valid, review_acceptance_criteria: [] };
    expect(validateDeveloperHandoffGeneration(JSON.stringify(bad)).ok).toBe(false);
  });
});
