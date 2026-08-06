import { describe, expect, it } from "vitest";
import { generatePptxBuffer } from "./pptx-generator";
import type { ClientPresentationSlides } from "@/lib/types/database";

const full = {
  cover: { title: "منصة", subtitle: "حل", client_name: "شركة" },
  agenda: { items: ["أ", "ب"] },
  executive_summary: { title: "الملخص", body: "نص", highlights: ["h"] },
  about_company: { title: "عن الشركة", body: "نص" },
  business_problem: { title: "المشكلة", body: "نص" },
  current_situation: { title: "الوضع", body: "نص", points: ["p"] },
  pain_points: { title: "الألم", items: ["x"] },
  our_understanding: { title: "فهمنا", body: "نص", points: ["p"] },
  vision: { title: "الرؤية", body: "نص" },
  solution: { title: "الحل", body: "نص" },
  scope: { in_scope: ["a"], out_of_scope: ["b"] },
  features: { title: "الميزات", features: ["f"] },
  modules: { title: "الوحدات", items: ["m"] },
  workflow: { title: "سير العمل", items: ["w"] },
  before_after: { title: "قبل وبعد", pairs: [{ before: "قبل", after: "بعد" }] },
  departments: { title: "الأقسام", items: ["d"] },
  user_roles: { title: "الأدوار", items: ["r"] },
  reports: { title: "التقارير", items: ["rep"] },
  ai_capabilities: { title: "الذكاء", items: ["ai"] },
  timeline: { title: "الجدول", phases: [{ name: "م1", duration: "أسبوع", description: "x" }] },
  architecture: { title: "النظرة", description: "نص", components: ["c"] },
  risks: { title: "المخاطر", items: [{ risk: "r", mitigation: "m" }] },
  roi: { title: "العائد", metrics: [{ name: "n", value: "40%", description: "d" }] },
  kpis: { title: "المؤشرات", metrics: [{ name: "n", value: "90%", description: "d" }] },
  roadmap: { title: "الخارطة", milestones: [{ name: "n", target_date: "t", description: "d" }] },
  transformation: { title: "التحوّل", body: "نص", points: ["p"] },
  next_steps: { title: "الخطوات", items: ["s"] },
  qa: { title: "أسئلة", items: ["q"] },
  closing: { title: "الخاتمة", body: "نص" },
} as ClientPresentationSlides;

describe("generatePptxBuffer expansion", () => {
  it("builds a buffer for the full 29-slide deck", async () => {
    const buf = await generatePptxBuffer(full, "مشروع تجريبي");
    expect(buf.length).toBeGreaterThan(1000);
  });

  it("builds a buffer for a legacy 17-slide deck (missing new keys)", async () => {
    const legacy = { ...full } as Record<string, unknown>;
    for (const k of [
      "about_company", "our_understanding", "vision", "modules", "workflow",
      "before_after", "departments", "user_roles", "reports", "ai_capabilities",
      "roi", "transformation",
    ]) {
      delete legacy[k];
    }
    const buf = await generatePptxBuffer(legacy as unknown as ClientPresentationSlides, "مشروع قديم");
    expect(buf.length).toBeGreaterThan(1000);
  });
});
