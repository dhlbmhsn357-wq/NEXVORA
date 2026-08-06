import { describe, expect, it } from "vitest";
import { validateClientPresentation, validateClientPresentationSlide } from "./client-presentation";

const validPayload = {
  cover: { title: "منصة إدارة الصيانة", subtitle: "حل رقمي متكامل", client_name: "شركة الأثاث" },
  agenda: { items: ["الملخص", "المشكلة", "الحل"] },
  executive_summary: { title: "الملخص التنفيذي", body: "نظرة عامة على المشروع.", highlights: ["إنجاز 1"] },
  about_company: { title: "عن الشركة", body: "شركة أثاث بعدة فروع." },
  business_problem: { title: "المشكلة", body: "الفروع كانت بتتابع الطلبات يدويًا." },
  current_situation: { title: "الوضع الحالي", body: "الوضع قبل الحل.", points: ["نقطة 1"] },
  pain_points: { title: "نقاط الألم", items: ["بطء المتابعة"] },
  our_understanding: { title: "فهمنا لأعمالك", body: "فهمنا احتياج الفروع.", points: ["ملاحظة 1"] },
  vision: { title: "رؤية الحل", body: "منصة موحّدة تربط الفروع." },
  solution: { title: "الحل", body: "منصة موحّدة لتتبع الطلبات." },
  scope: { in_scope: ["الويب"], out_of_scope: ["تطبيق الموبايل"] },
  features: { title: "أهم الميزات", features: ["تسجيل الطلبات", "متابعة الحالة"] },
  modules: { title: "وحدات النظام", items: ["وحدة الطلبات", "وحدة التقارير"] },
  workflow: { title: "سير العمل", items: ["استلام الطلب", "المتابعة", "الإغلاق"] },
  before_after: { title: "قبل وبعد", pairs: [{ before: "متابعة يدوية", after: "متابعة آلية" }] },
  departments: { title: "الأقسام المستفيدة", items: ["الصيانة", "المبيعات"] },
  user_roles: { title: "المستخدمون والأدوار", items: ["المدير — متابعة", "الفني — تنفيذ"] },
  reports: { title: "التقارير", items: ["تقرير الأداء", "لوحة المتابعة"] },
  ai_capabilities: { title: "قدرات الذكاء الاصطناعي", items: ["توصيات ذكية"] },
  timeline: { title: "الجدول الزمني", phases: [{ name: "المرحلة الأولى", duration: "٤ أسابيع", description: "..." }] },
  architecture: { title: "البنية التقنية", description: "شرح مبسّط.", components: ["الواجهة", "الخادم"] },
  risks: { title: "المخاطر", items: [{ risk: "تأخير التسليم", mitigation: "خطة احتياطية" }] },
  roi: { title: "العائد على الاستثمار", metrics: [{ name: "توفير الوقت", value: "40%", description: "..." }] },
  kpis: { title: "مؤشرات الأداء", metrics: [{ name: "رضا العملاء", value: "90%", description: "..." }] },
  roadmap: { title: "خارطة الطريق", milestones: [{ name: "الإطلاق", target_date: "الربع القادم", description: "..." }] },
  transformation: { title: "رحلة التحوّل", body: "نقلة نوعية في العمليات.", points: ["مكسب 1"] },
  next_steps: { title: "الخطوات القادمة", items: ["اختبار مع الفروع"] },
  qa: { title: "أسئلة وأجوبة", items: ["سؤال 1 وإجابته"] },
  closing: { title: "الخاتمة", body: "نتطلع لاستكمال المشروع معكم." },
};

describe("validateClientPresentation", () => {
  it("accepts a well-formed 29-slide response", () => {
    const result = validateClientPresentation(JSON.stringify(validPayload));
    expect(result.ok).toBe(true);
  });

  it("rejects before_after pairs missing the after field", () => {
    const bad = { ...validPayload, before_after: { title: "x", pairs: [{ before: "قبل" }] } };
    expect(validateClientPresentation(JSON.stringify(bad)).ok).toBe(false);
  });

  it("rejects roi metrics missing value", () => {
    const bad = { ...validPayload, roi: { title: "x", metrics: [{ name: "بند", description: "..." }] } };
    expect(validateClientPresentation(JSON.stringify(bad)).ok).toBe(false);
  });

  it("accepts empty arrays for optional-content slides", () => {
    const payload = { ...validPayload, agenda: { items: [] }, qa: { title: "أسئلة", items: [] } };
    expect(validateClientPresentation(JSON.stringify(payload)).ok).toBe(true);
  });

  it("rejects null/empty/invalid JSON", () => {
    expect(validateClientPresentation(null).ok).toBe(false);
    expect(validateClientPresentation("not json").ok).toBe(false);
  });

  it("rejects a response missing a required slide", () => {
    const { closing, ...missing } = validPayload;
    void closing;
    expect(validateClientPresentation(JSON.stringify(missing)).ok).toBe(false);
  });

  it("rejects a response with an extra slide", () => {
    const withExtra = { ...validPayload, pricing: { title: "x", body: "y" } };
    expect(validateClientPresentation(JSON.stringify(withExtra)).ok).toBe(false);
  });

  it("rejects a response still using legacy pre-V2 slide keys", () => {
    const { business_problem, ...rest } = validPayload;
    void business_problem;
    const legacy = { ...rest, problem: { title: "x", body: "y" } };
    expect(validateClientPresentation(JSON.stringify(legacy)).ok).toBe(false);
  });

  it("rejects a cover slide missing client_name", () => {
    const bad = { ...validPayload, cover: { title: "x", subtitle: "y" } };
    expect(validateClientPresentation(JSON.stringify(bad)).ok).toBe(false);
  });

  it("rejects features with a non-array features field", () => {
    const bad = { ...validPayload, features: { title: "x", features: "not an array" } };
    expect(validateClientPresentation(JSON.stringify(bad)).ok).toBe(false);
  });

  it("rejects scope with a non-array out_of_scope field", () => {
    const bad = { ...validPayload, scope: { in_scope: ["x"], out_of_scope: "not an array" } };
    expect(validateClientPresentation(JSON.stringify(bad)).ok).toBe(false);
  });

  it("rejects timeline phases missing a required key", () => {
    const bad = { ...validPayload, timeline: { title: "x", phases: [{ name: "المرحلة 1", duration: "أسبوع" }] } };
    expect(validateClientPresentation(JSON.stringify(bad)).ok).toBe(false);
  });

  it("rejects risks items missing mitigation", () => {
    const bad = { ...validPayload, risks: { title: "x", items: [{ risk: "خطر" }] } };
    expect(validateClientPresentation(JSON.stringify(bad)).ok).toBe(false);
  });

  it("rejects kpis metrics missing value", () => {
    const bad = { ...validPayload, kpis: { title: "x", metrics: [{ name: "مؤشر", description: "..." }] } };
    expect(validateClientPresentation(JSON.stringify(bad)).ok).toBe(false);
  });
});

describe("validateClientPresentationSlide", () => {
  it("accepts a valid single-slide response", () => {
    const result = validateClientPresentationSlide(
      JSON.stringify({ next_steps: { title: "الخطوات القادمة", items: ["إطلاق تجريبي"] } }),
      "next_steps"
    );
    expect(result.ok).toBe(true);
  });

  it("accepts a valid kpis slide response", () => {
    const result = validateClientPresentationSlide(
      JSON.stringify({ kpis: { title: "مؤشرات", metrics: [{ name: "x", value: "90%", description: "y" }] } }),
      "kpis"
    );
    expect(result.ok).toBe(true);
  });

  it("rejects a response for the wrong slide key", () => {
    const result = validateClientPresentationSlide(
      JSON.stringify({ closing: { title: "x", body: "y" } }),
      "next_steps"
    );
    expect(result.ok).toBe(false);
  });
});
