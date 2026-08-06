import { describe, expect, it } from "vitest";
import { validateMeetingExtractionV2 } from "./meeting-extraction-v2";

function validFixture() {
  return JSON.stringify({
    decisions: [{ text: "قرار 1", confidence_score: 90, evidence_quote: "قلنا كذا", speaker_guess: "PM" }],
    functional_requirements: [],
    non_functional_requirements: [],
    business_rules: [],
    pain_points: [],
    risks: [],
    constraints: [],
    questions: [],
    ideas: [],
    tasks: [],
    dependencies: [],
    conflicts: [],
    missing_information: [],
    overall_confidence: 80,
  });
}

describe("validateMeetingExtractionV2", () => {
  it("يرفض رد فارغ", () => {
    expect(validateMeetingExtractionV2(null).ok).toBe(false);
    expect(validateMeetingExtractionV2("").ok).toBe(false);
  });

  it("يرفض JSON غير صالح", () => {
    expect(validateMeetingExtractionV2("{غير صالح").ok).toBe(false);
  });

  it("يقبل رد صحيح بكل الفئات الـ13", () => {
    const result = validateMeetingExtractionV2(validFixture());
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.data.decisions).toHaveLength(1);
      expect(result.data.decisions[0].confidence_score).toBe(90);
      expect(result.data.overall_confidence).toBe(80);
    }
  });

  it("مفتاح غايب يُعتبر مصفوفة فاضية بدل رفض الرد كله", () => {
    const raw = JSON.stringify({ decisions: [{ text: "x", confidence_score: 50, evidence_quote: null, speaker_guess: null }] });
    const result = validateMeetingExtractionV2(raw);
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.data.risks).toEqual([]);
      expect(result.data.tasks).toEqual([]);
    }
  });

  it("عنصر بلا text يتجاهل بدل ما يكسر الاستخراج كله", () => {
    const raw = JSON.stringify({ decisions: [{ text: "", confidence_score: 50 }, { text: "قرار صالح", confidence_score: 60 }] });
    const result = validateMeetingExtractionV2(raw);
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.data.decisions).toHaveLength(1);
  });

  it("confidence_score بيتقص بين 0-100 حتى لو الـ AI رجّع رقم خارج النطاق", () => {
    const raw = JSON.stringify({ decisions: [{ text: "x", confidence_score: 150 }] });
    const result = validateMeetingExtractionV2(raw);
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.data.decisions[0].confidence_score).toBe(100);
  });

  it("يتقبّل الرد ملفوف في Markdown code fence", () => {
    const wrapped = "```json\n" + validFixture() + "\n```";
    expect(validateMeetingExtractionV2(wrapped).ok).toBe(true);
  });
});
