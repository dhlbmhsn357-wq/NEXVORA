import { describe, expect, it } from "vitest";
import { validateProjectAnalysis } from "./project-analysis";

const validPayload = {
  root_problem: "العميل بيدير الطلبات يدويًا عبر واتساب",
  target_users: ["فريق المبيعات", "مدير العمليات"],
  opportunities: ["أتمتة استقبال الطلبات"],
  risks: ["مقاومة الفريق للتغيير"],
  meeting_questions: ["كام طلب بتستقبلوا في اليوم تقريبًا؟"],
};

describe("validateProjectAnalysis", () => {
  it("accepts a well-formed response", () => {
    const result = validateProjectAnalysis(JSON.stringify(validPayload));
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.data.root_problem).toBe(validPayload.root_problem);
      expect(result.data.meeting_questions).toHaveLength(1);
    }
  });

  it("rejects null/empty responses", () => {
    expect(validateProjectAnalysis(null).ok).toBe(false);
    expect(validateProjectAnalysis("").ok).toBe(false);
    expect(validateProjectAnalysis("   ").ok).toBe(false);
  });

  it("rejects invalid JSON", () => {
    const result = validateProjectAnalysis("this is not json {");
    expect(result.ok).toBe(false);
  });

  it("rejects JSON wrapped in markdown code fences (strict, no leniency)", () => {
    const wrapped = "```json\n" + JSON.stringify(validPayload) + "\n```";
    const result = validateProjectAnalysis(wrapped);
    expect(result.ok).toBe(false);
  });

  it("rejects a response missing a required key", () => {
    const { meeting_questions, ...missingKey } = validPayload;
    void meeting_questions;
    const result = validateProjectAnalysis(JSON.stringify(missingKey));
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.reason).toContain("meeting_questions");
  });

  it("rejects a response with extra keys", () => {
    const withExtra = { ...validPayload, confidence_score: 0.9 };
    const result = validateProjectAnalysis(JSON.stringify(withExtra));
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.reason).toContain("confidence_score");
  });

  it("rejects wrong types (root_problem as number)", () => {
    const bad = { ...validPayload, root_problem: 123 };
    const result = validateProjectAnalysis(JSON.stringify(bad));
    expect(result.ok).toBe(false);
  });

  it("rejects an array instead of an object", () => {
    const result = validateProjectAnalysis(JSON.stringify([validPayload]));
    expect(result.ok).toBe(false);
  });

  it("rejects empty meeting_questions (must have at least one)", () => {
    const bad = { ...validPayload, meeting_questions: [] };
    const result = validateProjectAnalysis(JSON.stringify(bad));
    expect(result.ok).toBe(false);
  });

  it("rejects arrays containing empty strings", () => {
    const bad = { ...validPayload, risks: ["مخاطرة حقيقية", "  "] };
    const result = validateProjectAnalysis(JSON.stringify(bad));
    expect(result.ok).toBe(false);
  });
});
