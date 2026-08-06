import { describe, expect, it } from "vitest";
import { buildProjectAnalysisPrompt } from "./project-analysis";

describe("buildProjectAnalysisPrompt", () => {
  it("includes answered discovery questions with their Arabic labels", () => {
    const prompt = buildProjectAnalysisPrompt({
      projectType: "website",
      discoveryAnswers: { business_activity: "بيع أثاث أونلاين" },
      brainEntries: [],
    });

    expect(prompt).toContain("ما نشاط شركتك؟");
    expect(prompt).toContain("بيع أثاث أونلاين");
  });

  it("skips unanswered questions", () => {
    const prompt = buildProjectAnalysisPrompt({
      projectType: "website",
      discoveryAnswers: {},
      brainEntries: [],
    });

    expect(prompt).toContain("لا توجد إجابات مسجّلة بعد");
    expect(prompt).not.toContain("ما نشاط شركتك؟:");
  });

  it("includes brain entries with their type label", () => {
    const prompt = buildProjectAnalysisPrompt({
      projectType: "saas",
      discoveryAnswers: {},
      brainEntries: [{ entry_type: "risk", content: "الميزانية محدودة جدًا" }],
    });

    expect(prompt).toContain("[مخاطرة]");
    expect(prompt).toContain("الميزانية محدودة جدًا");
  });

  it("shows a placeholder when there are no brain entries", () => {
    const prompt = buildProjectAnalysisPrompt({
      projectType: "saas",
      discoveryAnswers: {},
      brainEntries: [],
    });

    expect(prompt).toContain("لا توجد مدخلات في Project Brain بعد");
  });

  it("always instructs the model to return JSON only with the exact schema", () => {
    const prompt = buildProjectAnalysisPrompt({
      projectType: "mobile_app",
      discoveryAnswers: {},
      brainEntries: [],
    });

    expect(prompt).toContain('"root_problem"');
    expect(prompt).toContain('"target_users"');
    expect(prompt).toContain('"opportunities"');
    expect(prompt).toContain('"risks"');
    expect(prompt).toContain('"meeting_questions"');
    expect(prompt).toContain("JSON فقط");
  });
});
