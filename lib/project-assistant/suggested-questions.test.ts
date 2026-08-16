import { describe, it, expect } from "vitest";
import { getSuggestedQuestions } from "./suggested-questions";

const richSummary = [
  { domain: "decision", count: 3 },
  { domain: "requirement", count: 5 },
  { domain: "business_rule", count: 2 },
  { domain: "acceptance_criteria", count: 4 },
];

describe("getSuggestedQuestions", () => {
  it("returns between 4 and 6 questions when knowledge is rich", () => {
    const qs = getSuggestedQuestions("owner", "general", richSummary);
    expect(qs.length).toBeGreaterThanOrEqual(4);
    expect(qs.length).toBeLessThanOrEqual(6);
  });

  it("leans business for owner/admin with viewpoint='general'", () => {
    const qs = getSuggestedQuestions("owner", "general", richSummary);
    expect(qs).toContain("ما الذي تم اعتماده حتى الآن؟");
  });

  it("leans developer for member with viewpoint='general'", () => {
    const qs = getSuggestedQuestions("member", "general", richSummary);
    expect(qs).toContain("ما قواعد هذا الجزء من النظام؟");
  });

  it("explicit viewpoint overrides role-based default", () => {
    const qs = getSuggestedQuestions("member", "business", richSummary);
    expect(qs).toContain("ما الذي تم اعتماده حتى الآن؟");
  });

  it("filters out domain-specific questions when that domain has zero knowledge", () => {
    const emptySummary = [{ domain: "discovery", count: 1 }];
    const qs = getSuggestedQuestions("member", "developer", emptySummary);
    expect(qs).not.toContain("ما Acceptance Criteria لهذه الخاصية؟");
    expect(qs).not.toContain("ما قواعد هذا الجزء من النظام؟");
  });

  it("never exceeds 6 and never returns duplicate text", () => {
    const qs = getSuggestedQuestions("owner", "business", richSummary);
    expect(new Set(qs).size).toBe(qs.length);
    expect(qs.length).toBeLessThanOrEqual(6);
  });
});
