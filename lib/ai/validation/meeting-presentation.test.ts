import { describe, expect, it } from "vitest";
import { validateMeetingPresentation, validateMeetingPresentationSlide } from "./meeting-presentation";
import { MEETING_PRESENTATION_SLIDE_KEYS } from "@/lib/ai/prompts/meeting-presentation";

function validSlideFixture(key: string): unknown {
  switch (key) {
    case "cover":
      return { project_name: "م", client_name: "ع", meeting_date: null, pm_name: "PM", current_phase: "PRD", status: "جاري", progress_percent: 40 };
    case "executive_summary":
      return { summary: "ملخص", key_points: ["نقطة"] };
    case "business_problem":
      return { problem_statement: "مشكلة", timeline: [{ label: "بداية", date: null }], pain_points: [{ title: "بطء", severity: "high" }], business_impact: "أثر" };
    case "business_goals":
      return { goals: [{ title: "هدف", priority: "high", progress_percent: 50, expected_outcome: "نتيجة" }], kpis: [{ name: "KPI", target: "90%" }] };
    case "current_workflow":
    case "future_workflow":
      return key === "current_workflow"
        ? { steps: [{ title: "خطوة", description: "وصف" }] }
        : { steps: [{ title: "خطوة", description: "وصف" }], improvements: ["تحسين"] };
    case "actors":
      return { actors: [{ name: "مستخدم", responsibilities: ["مسؤولية"], permissions: ["صلاحية"], pain_points: ["ألم"] }] };
    case "modules":
      return { modules: [{ name: "وحدة", purpose: "غرض", priority: "medium", complexity: "M", dependencies: [] }] };
    case "screens":
      return { screens: [{ name: "شاشة", goal: "هدف", functions: ["وظيفة"] }] };
    case "architecture":
      return { frontend: "Next.js", backend: "Node", database: "Postgres", storage: "S3", authentication: "Supabase Auth", integrations: [] };
    case "timeline":
      return { milestones: [{ title: "معلم", date: null, progress_percent: 20 }] };
    case "risks":
      return { risks: [{ title: "خطر", probability: "low", impact: "medium", mitigation: "تخفيف" }] };
    case "open_questions":
      return { questions: [{ question: "سؤال؟", context: "سياق" }] };
    case "client_decisions":
      return { decisions: [{ decision: "قرار", date: null, rationale: "سبب" }] };
    case "final_summary":
      return { next_steps: ["خطوة"], meeting_objectives: ["هدف"], closing_note: "ملاحظة" };
    default:
      throw new Error(`unhandled ${key}`);
  }
}

function fullValidDeck(): Record<string, unknown> {
  const deck: Record<string, unknown> = {};
  for (const key of MEETING_PRESENTATION_SLIDE_KEYS) deck[key] = validSlideFixture(key);
  return deck;
}

describe("validateMeetingPresentation", () => {
  it("يرفض رد فارغ", () => {
    expect(validateMeetingPresentation(null).ok).toBe(false);
    expect(validateMeetingPresentation("").ok).toBe(false);
  });

  it("يرفض JSON غير صالح", () => {
    const result = validateMeetingPresentation("{ليس json صحيح");
    expect(result.ok).toBe(false);
  });

  it("يرفض ديك كامل وشرائح ناقصة", () => {
    const deck = fullValidDeck();
    delete deck.cover;
    const result = validateMeetingPresentation(JSON.stringify(deck));
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.reason).toContain("cover");
  });

  it("يرفض مفاتيح إضافية غير مسموحة", () => {
    const deck = { ...fullValidDeck(), extra_slide: {} };
    const result = validateMeetingPresentation(JSON.stringify(deck));
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.reason).toContain("extra_slide");
  });

  it("يرفض شريحة بقيمة enum غير صحيحة (severity غلط في business_problem)", () => {
    const deck = fullValidDeck();
    deck.business_problem = { ...validSlideFixture("business_problem") as object, pain_points: [{ title: "بطء", severity: "غير_صحيح" }] };
    const result = validateMeetingPresentation(JSON.stringify(deck));
    expect(result.ok).toBe(false);
  });

  it("يقبل ديك كامل صحيح — كل الـ 15 شريحة بأشكالها البنيوية الصحيحة", () => {
    const result = validateMeetingPresentation(JSON.stringify(fullValidDeck()));
    expect(result.ok).toBe(true);
    if (result.ok) expect(Object.keys(result.data)).toHaveLength(MEETING_PRESENTATION_SLIDE_KEYS.length);
  });
});

describe("validateMeetingPresentationSlide", () => {
  it("يقبل شريحة واحدة صحيحة بمفتاحها المطلوب", () => {
    const result = validateMeetingPresentationSlide(JSON.stringify({ risks: validSlideFixture("risks") }), "risks");
    expect(result.ok).toBe(true);
  });

  it("يرفض لو المفتاح مش نفس الشريحة المطلوبة", () => {
    const result = validateMeetingPresentationSlide(JSON.stringify({ timeline: validSlideFixture("timeline") }), "risks");
    expect(result.ok).toBe(false);
  });

  it("يرفض لو فيه أكتر من مفتاح واحد", () => {
    const result = validateMeetingPresentationSlide(
      JSON.stringify({ risks: validSlideFixture("risks"), timeline: validSlideFixture("timeline") }),
      "risks"
    );
    expect(result.ok).toBe(false);
  });
});
