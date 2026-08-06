import { describe, it, expect } from "vitest";
import { validateSupportTriage } from "./support-triage";

const validEscalation = {
  reply_to_customer: "تم استلام طلبك.",
  classification: "bug",
  ready_to_resolve_directly: false,
  ready_to_escalate: true,
  structured_summary: {
    problem_description: "الصفحة الرئيسية بترجع خطأ 500",
    started_when: "من ساعتين",
    reproduction_steps: null,
    current_result: null,
    expected_result: null,
    priority: "high",
  },
  related_prd_section: null,
  related_brain_fact: null,
  ai_diagnosis: { probable_cause: "خطأ في الاتصال بقاعدة البيانات", suggested_fix: "زيادة connection pool", confidence: 70 },
};

const validDirectResolve = {
  reply_to_customer: "أيوه، الميزة دي مدعومة زي ما مذكور في المتطلبات.",
  classification: "usage_question",
  ready_to_resolve_directly: true,
  ready_to_escalate: false,
  structured_summary: null,
  related_prd_section: "Authentication section",
  related_brain_fact: null,
  ai_diagnosis: null,
};

describe("validateSupportTriage", () => {
  it("يقبل رد تصعيد كامل وصحيح", () => {
    const result = validateSupportTriage(JSON.stringify(validEscalation));
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.data.readyToEscalate).toBe(true);
      expect(result.data.structuredSummary?.problem_description).toContain("500");
      expect(result.data.structuredSummary?.attachments).toEqual([]);
    }
  });

  it("يقبل رد حل مباشر وصحيح", () => {
    const result = validateSupportTriage(JSON.stringify(validDirectResolve));
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.data.readyToResolveDirectly).toBe(true);
  });

  it("يرفض JSON غير صالح", () => {
    const result = validateSupportTriage("not json");
    expect(result.ok).toBe(false);
  });

  it("يرفض رد فارغ", () => {
    const result = validateSupportTriage("");
    expect(result.ok).toBe(false);
  });

  it("يرفض ready_to_resolve_directly مع تصنيف bug — لازم يتصعّد", () => {
    const bad = { ...validDirectResolve, classification: "bug", ready_to_resolve_directly: true, ready_to_escalate: false };
    const result = validateSupportTriage(JSON.stringify(bad));
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.reason).toMatch(/غير مسموح/);
  });

  it("يرفض ready_to_resolve وready_to_escalate معًا (تناقض)", () => {
    const bad = { ...validEscalation, ready_to_resolve_directly: true, ready_to_escalate: true };
    const result = validateSupportTriage(JSON.stringify(bad));
    expect(result.ok).toBe(false);
  });

  it("يرفض تصعيد بدون structured_summary", () => {
    const bad = { ...validEscalation, structured_summary: null };
    const result = validateSupportTriage(JSON.stringify(bad));
    expect(result.ok).toBe(false);
  });

  it("يرفض تصعيد بـ structured_summary.problem_description فارغ", () => {
    const bad = { ...validEscalation, structured_summary: { ...validEscalation.structured_summary, problem_description: "" } };
    const result = validateSupportTriage(JSON.stringify(bad));
    expect(result.ok).toBe(false);
  });

  it("يرفض priority غير صالحة", () => {
    const bad = { ...validEscalation, structured_summary: { ...validEscalation.structured_summary, priority: "urgent" } };
    const result = validateSupportTriage(JSON.stringify(bad));
    expect(result.ok).toBe(false);
  });

  it("يرفض classification غير معروف", () => {
    const bad = { ...validEscalation, classification: "other" };
    const result = validateSupportTriage(JSON.stringify(bad));
    expect(result.ok).toBe(false);
  });

  it("يرفض تصعيد بدون ai_diagnosis", () => {
    const bad = { ...validEscalation, ai_diagnosis: null };
    const result = validateSupportTriage(JSON.stringify(bad));
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.reason).toMatch(/ai_diagnosis/);
  });

  it("يرفض حل مباشر (مش تصعيد) لو ai_diagnosis غير null", () => {
    const bad = { ...validDirectResolve, ai_diagnosis: { probable_cause: "x", suggested_fix: "y", confidence: 50 } };
    const result = validateSupportTriage(JSON.stringify(bad));
    expect(result.ok).toBe(false);
  });

  it("يرفض مفتاح إضافي غير متوقع", () => {
    const bad = { ...validEscalation, extra_field: "x" };
    const result = validateSupportTriage(JSON.stringify(bad));
    expect(result.ok).toBe(false);
  });

  it("يرفض ready_to_resolve بدون classification (فهم مش مكتمل)", () => {
    const bad = { ...validDirectResolve, classification: null };
    const result = validateSupportTriage(JSON.stringify(bad));
    expect(result.ok).toBe(false);
  });

  it("يقبل رد سؤال توضيحي (لا حل ولا تصعيد)", () => {
    const clarify = {
      reply_to_customer: "ممكن توضحلي إمتى بدأت المشكلة؟",
      classification: null,
      ready_to_resolve_directly: false,
      ready_to_escalate: false,
      structured_summary: null,
      related_prd_section: null,
      related_brain_fact: null,
      ai_diagnosis: null,
    };
    const result = validateSupportTriage(JSON.stringify(clarify));
    expect(result.ok).toBe(true);
  });
});
