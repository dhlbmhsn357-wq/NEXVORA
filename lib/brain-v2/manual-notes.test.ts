import { describe, expect, it } from "vitest";
import { buildManualNoteCandidate, MANUAL_NOTE_TYPE_SECTION, MANUAL_NOTE_TYPES } from "./manual-notes";

describe("buildManualNoteCandidate", () => {
  it("كل نوع ملاحظة بيتحول لمرشّح بالقسم الصحيح المحدد في MANUAL_NOTE_TYPE_SECTION", () => {
    for (const noteType of MANUAL_NOTE_TYPES) {
      const candidate = buildManualNoteCandidate(noteType, "نص تجريبي");
      expect(candidate.sectionKey).toBe(MANUAL_NOTE_TYPE_SECTION[noteType]);
    }
  });

  it("النص بيتقطع من المسافات الزيادة قبل ما يتحط في newValue", () => {
    const candidate = buildManualNoteCandidate("risk", "   في خطر تأخر التسليم   ");
    expect(candidate.newValue).toMatchObject({ risk: "في خطر تأخر التسليم" });
  });

  it("decision بيبني fact بقسم known_facts", () => {
    const candidate = buildManualNoteCandidate("decision", "هنستخدم Stripe للدفع");
    expect(candidate.sectionKey).toBe("known_facts");
    expect(candidate.newValue).toMatchObject({ fact: "هنستخدم Stripe للدفع", category: "قرار يدوي من PM" });
  });

  it("requirement بيبني statement بقسم functional_requirements", () => {
    const candidate = buildManualNoteCandidate("requirement", "تسجيل دخول بالبريد");
    expect(candidate.sectionKey).toBe("functional_requirements");
    expect(candidate.newValue).toMatchObject({ statement: "تسجيل دخول بالبريد" });
  });

  it("business_rule بيبني rule بقسم business_rules", () => {
    const candidate = buildManualNoteCandidate("business_rule", "أي خصم أكتر من 20% يحتاج موافقة المدير");
    expect(candidate.sectionKey).toBe("business_rules");
    expect(candidate.newValue).toMatchObject({ rule: "أي خصم أكتر من 20% يحتاج موافقة المدير" });
  });

  it("question بيبني question بقسم meeting_questions من غير evidence", () => {
    const candidate = buildManualNoteCandidate("question", "هل التطبيق هيدعم لغات تانية؟");
    expect(candidate.sectionKey).toBe("meeting_questions");
    expect(candidate.newValue).toMatchObject({ question: "هل التطبيق هيدعم لغات تانية؟", priority: "medium" });
  });

  it("rationale دايمًا بيوضح إن المصدر ملاحظة يدوية من PM مع اسم النوع بالعربي", () => {
    const candidate = buildManualNoteCandidate("idea", "فكرة جديدة");
    expect(candidate.rationale).toContain("ملاحظة يدوية من PM");
    expect(candidate.rationale).toContain("فكرة");
  });

  it("action_item بيبني عنصر roadmap (phase) — نفس شكل RoadmapPhaseItem بدون تكرار بنية جديدة", () => {
    const candidate = buildManualNoteCandidate("action_item", "تجهيز بيئة الاختبار قبل السبرنت الجاي");
    expect(candidate.sectionKey).toBe("roadmap");
    expect(candidate.newValue).toMatchObject({ phase: "تجهيز بيئة الاختبار قبل السبرنت الجاي", deliverables: [] });
  });

  it("client_feedback بيبني fact بقسم known_facts زي باقي أنواع الحقائق اليدوية", () => {
    const candidate = buildManualNoteCandidate("client_feedback", "العميل مش مرتاح لسرعة التطبيق");
    expect(candidate.sectionKey).toBe("known_facts");
    expect(candidate.newValue).toMatchObject({ fact: "العميل مش مرتاح لسرعة التطبيق", category: "ملاحظة عميل مباشرة (يدوي)" });
  });
});
