import { describe, expect, it } from "vitest";
import { validateProjectBrainSync } from "./project-brain-sync";

const validPayload = {
  summary: "مشروع موقع إلكتروني لشركة أثاث، في مرحلة التصميم الأولي.",
  key_facts: ["العميل شركة أثاث محلية", "الميزانية متوسطة"],
  pain_points: ["لا يوجد نظام لإدارة الطلبات حاليًا"],
  decisions_log: [{ content: "تم اختيار Next.js كإطار عمل", source: "اجتماع بتاريخ 18 يوليو 2026" }],
  open_questions: [{ question: "هل يوجد نظام دفع حالي؟", answered: false }],
};

describe("validateProjectBrainSync", () => {
  it("accepts a well-formed response", () => {
    const result = validateProjectBrainSync(JSON.stringify(validPayload));
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.data.decisions_log[0].source).toContain("اجتماع");
    }
  });

  it("accepts empty arrays for categories with nothing to report", () => {
    const payload = { ...validPayload, pain_points: [], open_questions: [] };
    expect(validateProjectBrainSync(JSON.stringify(payload)).ok).toBe(true);
  });

  it("rejects null/empty responses", () => {
    expect(validateProjectBrainSync(null).ok).toBe(false);
    expect(validateProjectBrainSync("").ok).toBe(false);
  });

  it("rejects invalid JSON", () => {
    expect(validateProjectBrainSync("not json").ok).toBe(false);
  });

  it("rejects a response missing a required key", () => {
    const { summary, ...missingKey } = validPayload;
    void summary;
    expect(validateProjectBrainSync(JSON.stringify(missingKey)).ok).toBe(false);
  });

  it("rejects a response with extra keys", () => {
    const withExtra = { ...validPayload, sentiment: "positive" };
    expect(validateProjectBrainSync(JSON.stringify(withExtra)).ok).toBe(false);
  });

  it("rejects decisions_log items missing a source field", () => {
    const bad = { ...validPayload, decisions_log: [{ content: "قرار بدون مصدر" }] };
    expect(validateProjectBrainSync(JSON.stringify(bad)).ok).toBe(false);
  });

  it("rejects decisions_log as bare strings instead of objects", () => {
    const bad = { ...validPayload, decisions_log: ["قرار كنص خام"] };
    expect(validateProjectBrainSync(JSON.stringify(bad)).ok).toBe(false);
  });

  it("rejects open_questions items with a non-boolean answered field", () => {
    const bad = { ...validPayload, open_questions: [{ question: "سؤال", answered: "no" }] };
    expect(validateProjectBrainSync(JSON.stringify(bad)).ok).toBe(false);
  });

  it("rejects summary that is empty or whitespace-only", () => {
    const bad = { ...validPayload, summary: "   " };
    expect(validateProjectBrainSync(JSON.stringify(bad)).ok).toBe(false);
  });
});
