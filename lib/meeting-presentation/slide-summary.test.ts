import { describe, expect, it } from "vitest";
import { getSlideSummary } from "./slide-summary";

describe("getSlideSummary", () => {
  it("يرجّع عنوان الشريحة ونقاط فاضية لو المحتوى غير موجود", () => {
    const result = getSlideSummary("cover", undefined);
    expect(result.heading).toBe("غلاف المشروع");
    expect(result.bullets).toEqual([]);
  });

  it("يستخرج ملخص سليم من شريحة cover", () => {
    const result = getSlideSummary("cover", {
      project_name: "مشروع أ",
      client_name: "عميل ب",
      meeting_date: null,
      pm_name: "PM",
      current_phase: "PRD",
      status: "جاري",
      progress_percent: 40,
    });
    expect(result.bullets).toEqual(["مشروع أ", "عميل ب", "PRD — جاري"]);
  });

  it("يستخرج عناوين الأهداف من شريحة business_goals", () => {
    const result = getSlideSummary("business_goals", {
      goals: [
        { title: "هدف أ", priority: "high", progress_percent: 10, expected_outcome: "..." },
        { title: "هدف ب", priority: "low", progress_percent: 20, expected_outcome: "..." },
      ],
      kpis: [],
    });
    expect(result.bullets).toEqual(["هدف أ", "هدف ب"]);
  });

  it("يستخرج نصوص الأسئلة من شريحة open_questions", () => {
    const result = getSlideSummary("open_questions", {
      questions: [{ question: "هل الميزانية ثابتة؟", context: "..." }],
    });
    expect(result.bullets).toEqual(["هل الميزانية ثابتة؟"]);
  });
});
