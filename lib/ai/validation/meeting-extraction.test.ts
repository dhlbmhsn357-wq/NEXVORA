import { describe, expect, it } from "vitest";
import { validateMeetingExtraction } from "./meeting-extraction";

const validPayload = {
  decisions: ["تم الاتفاق على استخدام Next.js"],
  risks: ["الميزانية قد لا تكفي المرحلة الثانية"],
  requests: ["العميل طلب لوحة تحكم للمشرفين"],
  questions: ["هل يوجد نظام دفع حالي؟"],
  deadlines: ["تسليم النسخة الأولى الأسبوع القادم"],
};

describe("validateMeetingExtraction", () => {
  it("accepts a well-formed response", () => {
    const result = validateMeetingExtraction(JSON.stringify(validPayload));
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.data.decisions).toHaveLength(1);
    }
  });

  it("accepts empty arrays for categories with nothing to report", () => {
    const payload = { ...validPayload, deadlines: [], risks: [] };
    const result = validateMeetingExtraction(JSON.stringify(payload));
    expect(result.ok).toBe(true);
  });

  it("rejects null/empty responses", () => {
    expect(validateMeetingExtraction(null).ok).toBe(false);
    expect(validateMeetingExtraction("").ok).toBe(false);
  });

  it("rejects invalid JSON", () => {
    expect(validateMeetingExtraction("not json").ok).toBe(false);
  });

  // السلوك الجديد (Phase 4A resilience): مرن ضد اختلافات الـ AI التجميلية.
  it("treats a missing key as an empty array (no longer rejects)", () => {
    const { deadlines, ...missingKey } = validPayload;
    void deadlines;
    const result = validateMeetingExtraction(JSON.stringify(missingKey));
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.data.deadlines).toEqual([]);
  });

  it("ignores extra keys instead of rejecting", () => {
    const withExtra = { ...validPayload, summary: "ملخص إضافي", notes: ["x"] };
    const result = validateMeetingExtraction(JSON.stringify(withExtra));
    expect(result.ok).toBe(true);
  });

  it("rejects wrong types (decisions as a string instead of an array)", () => {
    const bad = { ...validPayload, decisions: "قرار واحد بس" };
    expect(validateMeetingExtraction(JSON.stringify(bad)).ok).toBe(false);
  });

  it("filters out empty/non-string items instead of rejecting", () => {
    const payload = { ...validPayload, requests: ["طلب حقيقي", "   ", 5, null] };
    const result = validateMeetingExtraction(JSON.stringify(payload));
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.data.requests).toEqual(["طلب حقيقي"]);
  });

  it("strips code fences", () => {
    const wrapped = "```json\n" + JSON.stringify(validPayload) + "\n```";
    expect(validateMeetingExtraction(wrapped).ok).toBe(true);
  });
});
