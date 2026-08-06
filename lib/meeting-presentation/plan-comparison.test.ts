import { describe, expect, it } from "vitest";
import { buildPlanSnapshot, compareMeetingPlanToTranscript, isPlanItemDiscussed } from "./plan-comparison";
import type { MeetingExtraction, MeetingPresentationSlides } from "@/lib/types/database";

function extraction(overrides: Partial<MeetingExtraction> = {}): MeetingExtraction {
  return { decisions: [], risks: [], requests: [], questions: [], deadlines: [], ...overrides };
}

describe("buildPlanSnapshot", () => {
  it("بيجمع key_points من executive_summary وعناوين الأهداف من business_goals في agenda، والأسئلة من open_questions", () => {
    const slides: MeetingPresentationSlides = {
      executive_summary: { summary: "...", key_points: ["نقطة أ"] },
      business_goals: { goals: [{ title: "هدف ب", priority: "medium", progress_percent: 0, expected_outcome: "..." }], kpis: [] },
      open_questions: { questions: [{ question: "سؤال ج", context: "..." }] },
    };
    const plan = buildPlanSnapshot(slides);
    expect(plan.agenda).toEqual(["نقطة أ", "هدف ب"]);
    expect(plan.questions).toEqual(["سؤال ج"]);
    expect(plan.openDecisions).toEqual([]);
  });

  it("شرائح فاضية أو غير موجودة بترجع مصفوفات فاضية بدون كسر", () => {
    const plan = buildPlanSnapshot({});
    expect(plan).toEqual({ agenda: [], questions: [], openDecisions: [] });
  });
});

describe("isPlanItemDiscussed", () => {
  it("عنصر خطة له تشابه كافي مع بند في النص المستخرج → تمت مناقشته", () => {
    expect(isPlanItemDiscussed("مناقشة نطاق العمل مع العميل", ["تم الاتفاق على نطاق العمل النهائي"])).toBe(true);
  });

  it("عنصر خطة بدون أي تشابه حقيقي مع النص المستخرج → لم تتم مناقشته", () => {
    expect(isPlanItemDiscussed("مراجعة الميزانية التسويقية", ["تم الاتفاق على موعد التسليم القادم"])).toBe(false);
  });

  it("نص خطة فاضي بعد إزالة الكلمات الشائعة → مش مناقَش أبدًا (مفيش رمز حقيقي للمقارنة)", () => {
    expect(isPlanItemDiscussed("في من على", ["أي نص تاني هنا"])).toBe(false);
  });

  it("مصفوفة نص مستخرج فاضية → مفيش تطابق ممكن، النتيجة دايمًا false", () => {
    expect(isPlanItemDiscussed("أي بند من الخطة", [])).toBe(false);
  });
});

describe("compareMeetingPlanToTranscript", () => {
  it("يصنّف بنود الأجندة والقرارات المفتوحة بين تمت مناقشته ولم تتم، ويجمع الأسئلة المفتوحة من الخطة والاستخراج معًا", () => {
    const plan = { agenda: ["مراجعة نطاق العمل"], questions: ["هل الميزانية ثابتة؟"], openDecisions: ["جدولة حملة تسويقية خارجية"] };
    const data = extraction({
      decisions: ["تم اعتماد نطاق العمل كما هو مقترح"],
      questions: ["هل فيه موعد نهائي جديد؟"],
    });

    const result = compareMeetingPlanToTranscript(plan, data);

    expect(result.discussed).toContain("مراجعة نطاق العمل");
    expect(result.notDiscussed).toContain("جدولة حملة تسويقية خارجية");
    expect(result.openQuestions).toContain("هل الميزانية ثابتة؟");
    expect(result.openQuestions).toContain("هل فيه موعد نهائي جديد؟");
  });

  it("سؤال خطة اتناقش فعليًا (تطابق مع الاستخراج) بيتشال من الأسئلة المفتوحة", () => {
    const plan = { agenda: [], questions: ["هل هنستخدم Stripe للدفع؟"], openDecisions: [] };
    const data = extraction({ decisions: ["تقرر استخدام Stripe للدفع فعليًا"] });

    const result = compareMeetingPlanToTranscript(plan, data);
    expect(result.openQuestions).not.toContain("هل هنستخدم Stripe للدفع؟");
  });

  it("خطة فاضية تمامًا مع استخراج فيه بيانات → لا يوجد تصنيف ولا أسئلة (غير الأسئلة الجديدة من الاستخراج نفسه)", () => {
    const plan = { agenda: [], questions: [], openDecisions: [] };
    const data = extraction({ decisions: ["قرار ما"], questions: ["سؤال جديد أثناء الاجتماع"] });

    const result = compareMeetingPlanToTranscript(plan, data);
    expect(result.discussed).toEqual([]);
    expect(result.notDiscussed).toEqual([]);
    expect(result.openQuestions).toEqual(["سؤال جديد أثناء الاجتماع"]);
  });
});
