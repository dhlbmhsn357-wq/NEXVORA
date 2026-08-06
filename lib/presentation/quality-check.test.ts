import { describe, expect, it } from "vitest";
import { checkPresentationConsistency } from "./quality-check";
import type { ClientPresentationSlides } from "@/lib/types/database";

function baseSlides(): ClientPresentationSlides {
  const slides = {
    cover: { title: "منصة", subtitle: "حل", client_name: "شركة الأثاث" },
    agenda: { items: ["أ"] },
    executive_summary: { title: "الملخص", body: "نص وافٍ عن المشروع كامل.", highlights: ["h"] },
    about_company: { title: "عن الشركة", body: "شركة أثاث." },
    business_problem: { title: "المشكلة", body: "المتابعة اليدوية بطيئة." },
    current_situation: { title: "الوضع", body: "الوضع قبل الحل.", points: ["p"] },
    pain_points: { title: "الألم", items: ["x"] },
    our_understanding: { title: "فهمنا", body: "فهمنا الاحتياج.", points: ["p"] },
    vision: { title: "الرؤية", body: "رؤية موحّدة." },
    solution: { title: "الحل", body: "منصة موحّدة." },
    scope: { in_scope: ["a"], out_of_scope: ["b"] },
    features: { title: "الميزات", features: ["f"] },
    modules: { title: "الوحدات", items: ["m"] },
    workflow: { title: "سير العمل", items: ["w"] },
    before_after: { title: "قبل وبعد", pairs: [{ before: "قبل", after: "بعد" }] },
    departments: { title: "الأقسام", items: ["d"] },
    user_roles: { title: "الأدوار", items: ["r"] },
    reports: { title: "التقارير", items: ["rep"] },
    ai_capabilities: { title: "الذكاء", items: ["توصيات ذكية"] },
    timeline: { title: "الجدول", phases: [{ name: "م1", duration: "أسبوع", description: "x" }] },
    architecture: { title: "النظرة", description: "شرح مبسّط.", components: ["الواجهة"] },
    risks: { title: "المخاطر", items: [{ risk: "r", mitigation: "m" }] },
    roi: { title: "العائد", metrics: [{ name: "n", value: "40%", description: "d" }] },
    kpis: { title: "المؤشرات", metrics: [{ name: "n", value: "90%", description: "d" }] },
    roadmap: { title: "الخارطة", milestones: [{ name: "n", target_date: "t", description: "d" }] },
    transformation: { title: "التحوّل", body: "نقلة نوعية.", points: ["p"] },
    next_steps: { title: "الخطوات", items: ["s"] },
    qa: { title: "أسئلة", items: ["q"] },
    closing: { title: "الخاتمة", body: "شكرًا." },
  };
  return slides as unknown as ClientPresentationSlides;
}

describe("checkPresentationConsistency", () => {
  it("returns no warnings for a clean business-only deck", () => {
    expect(checkPresentationConsistency(baseSlides(), { clientName: "شركة الأثاث" })).toHaveLength(0);
  });

  it("flags technical-term leakage as a warning on a business slide", () => {
    const s = baseSlides();
    s.solution.body = "نبني API موحّد يربط الفروع.";
    const w = checkPresentationConsistency(s);
    expect(w.some((x) => x.slideKey === "solution" && x.severity === "warning")).toBe(true);
  });

  it("downgrades technical terms to info on the tech-tolerant architecture slide", () => {
    const s = baseSlides();
    s.architecture.description = "يعتمد على قاعدة بيانات مركزية.";
    const w = checkPresentationConsistency(s).filter((x) => x.slideKey === "architecture");
    expect(w).toHaveLength(1);
    expect(w[0].severity).toBe("info");
  });

  it("flags placeholder content", () => {
    const s = baseSlides();
    s.solution.body = "—";
    expect(checkPresentationConsistency(s).some((x) => x.slideKey === "solution")).toBe(true);
  });

  it("flags an empty client name when clientName is provided", () => {
    const s = baseSlides();
    s.cover.client_name = "  ";
    expect(checkPresentationConsistency(s, { clientName: "شركة" }).some((x) => x.slideKey === "cover")).toBe(true);
  });
});
