import { describe, it, expect } from "vitest";
import { validateKnowledgeEnrichment } from "./knowledge-enrichment";

const REFS = new Set(["I1", "I2", "I3"]);

function payload(overrides: Record<string, unknown> = {}): string {
  return JSON.stringify({
    relations: [
      {
        left_ref: "I1",
        right_ref: "I2",
        type: "contradicts",
        rationale: "رقمان مختلفان لنفس حد الخصم.",
        confidence: 90,
      },
    ],
    conflicts: [
      {
        left_ref: "I1",
        right_ref: "I2",
        description: "الأول يقول عشرة بالمئة والثاني يقول خمسة عشر.",
        severity: "high",
      },
    ],
    glossary: [{ term: "SO", expansion: "أمر بيع", note: "Sales Order" }],
    ...overrides,
  });
}

describe("validateKnowledgeEnrichment — القبول", () => {
  it("يقبل نتيجة سليمة", () => {
    const r = validateKnowledgeEnrichment(payload(), REFS);
    expect(r.ok).toBe(true);
    if (r.ok) {
      expect(r.data.relations).toHaveLength(1);
      expect(r.data.conflicts).toHaveLength(1);
      expect(r.data.glossary).toHaveLength(1);
    }
  });

  it("يقبل نتيجة فاضية — ده رد صحيح مش فشل", () => {
    const r = validateKnowledgeEnrichment(
      JSON.stringify({ relations: [], conflicts: [], glossary: [] }),
      REFS
    );
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.data.relations).toEqual([]);
  });

  it("يقبل JSON داخل code fences", () => {
    const r = validateKnowledgeEnrichment("```json\n" + payload() + "\n```", REFS);
    expect(r.ok).toBe(true);
  });

  it("يعتبر المفاتيح الغائبة مصفوفات فاضية", () => {
    const r = validateKnowledgeEnrichment(JSON.stringify({ relations: [] }), REFS);
    expect(r.ok).toBe(true);
    if (r.ok) {
      expect(r.data.conflicts).toEqual([]);
      expect(r.data.glossary).toEqual([]);
    }
  });
});

describe("حارس المعرّفات", () => {
  it("يشيل العلاقة اللي بتشاور على معرّف مش موجود", () => {
    const r = validateKnowledgeEnrichment(
      payload({
        relations: [{ left_ref: "I1", right_ref: "I99", type: "supports", confidence: 80 }],
        conflicts: [],
      }),
      REFS
    );
    expect(r.ok).toBe(true);
    if (r.ok) {
      expect(r.data.relations).toHaveLength(0);
      expect(r.data.droppedUnknownRef).toBe(1);
    }
  });

  it("يشيل التعارض اللي بيشاور على معرّف مخترع", () => {
    const r = validateKnowledgeEnrichment(
      payload({
        relations: [],
        conflicts: [{ left_ref: "IX", right_ref: "I2", description: "تعارض", severity: "high" }],
      }),
      REFS
    );
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.data.conflicts).toHaveLength(0);
  });

  it("يشيل ربط العنصر بنفسه", () => {
    const r = validateKnowledgeEnrichment(
      payload({
        relations: [{ left_ref: "I1", right_ref: "I1", type: "refines", confidence: 70 }],
        conflicts: [],
      }),
      REFS
    );
    expect(r.ok).toBe(true);
    if (r.ok) {
      expect(r.data.relations).toHaveLength(0);
      expect(r.data.droppedSelfLink).toBe(1);
    }
  });
});

describe("التطبيع ومنع التكرار", () => {
  it("يشيل نوع العلاقة غير المعروف", () => {
    const r = validateKnowledgeEnrichment(
      payload({
        relations: [{ left_ref: "I1", right_ref: "I2", type: "يشبه", confidence: 80 }],
        conflicts: [],
      }),
      REFS
    );
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.data.relations).toHaveLength(0);
  });

  it("مايكرّرش نفس العلاقة مرتين", () => {
    const rel = { left_ref: "I1", right_ref: "I2", type: "supports", confidence: 80 };
    const r = validateKnowledgeEnrichment(
      payload({ relations: [rel, rel], conflicts: [] }),
      REFS
    );
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.data.relations).toHaveLength(1);
  });

  it("يسمح بنوعين مختلفين لنفس الزوج", () => {
    const r = validateKnowledgeEnrichment(
      payload({
        relations: [
          { left_ref: "I1", right_ref: "I2", type: "supports", confidence: 80 },
          { left_ref: "I1", right_ref: "I2", type: "refines", confidence: 60 },
        ],
        conflicts: [],
      }),
      REFS
    );
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.data.relations).toHaveLength(2);
  });

  it("يوحّد اتجاه التعارض فما يتسجّلش مرتين", () => {
    const r = validateKnowledgeEnrichment(
      payload({
        relations: [],
        conflicts: [
          { left_ref: "I1", right_ref: "I2", description: "أ", severity: "high" },
          { left_ref: "I2", right_ref: "I1", description: "نفسه بالعكس", severity: "low" },
        ],
      }),
      REFS
    );
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.data.conflicts).toHaveLength(1);
  });

  it("يصحّح الشدّة غير الصالحة", () => {
    const r = validateKnowledgeEnrichment(
      payload({
        relations: [],
        conflicts: [{ left_ref: "I1", right_ref: "I2", description: "أ", severity: "كارثي" }],
      }),
      REFS
    );
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.data.conflicts[0].severity).toBe("medium");
  });

  it("يحصر الثقة بين صفر ومئة", () => {
    const r = validateKnowledgeEnrichment(
      payload({
        relations: [{ left_ref: "I1", right_ref: "I2", type: "supports", confidence: 250 }],
        conflicts: [],
      }),
      REFS
    );
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.data.relations[0].confidence).toBe(100);
  });

  it("يشيل التعارض بلا وصف", () => {
    const r = validateKnowledgeEnrichment(
      payload({
        relations: [],
        conflicts: [{ left_ref: "I1", right_ref: "I2", description: "  ", severity: "high" }],
      }),
      REFS
    );
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.data.conflicts).toHaveLength(0);
  });

  it("مايكرّرش المصطلح ويشيل الناقص", () => {
    const r = validateKnowledgeEnrichment(
      payload({
        glossary: [
          { term: "SO", expansion: "أمر بيع" },
          { term: "so", expansion: "تكرار" },
          { term: "PO", expansion: "" },
        ],
      }),
      REFS
    );
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.data.glossary).toHaveLength(1);
  });
});

describe("الرفض", () => {
  it("يرفض الرد الفاضي", () => {
    expect(validateKnowledgeEnrichment("", REFS).ok).toBe(false);
    expect(validateKnowledgeEnrichment(null, REFS).ok).toBe(false);
  });

  it("يرفض ما ليس JSON", () => {
    expect(validateKnowledgeEnrichment("مش JSON", REFS).ok).toBe(false);
  });
});
