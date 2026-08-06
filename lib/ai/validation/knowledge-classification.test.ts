import { describe, it, expect } from "vitest";
import { validateKnowledgeClassification } from "./knowledge-classification";

const CHUNK = "الحد الأقصى للخصم هو عشرة بالمئة. يعتمد الخصم من مدير المبيعات فقط.";

function payload(overrides: Record<string, unknown> = {}): string {
  return JSON.stringify({
    document_summary: "سياسة الخصومات.",
    language: "ar",
    items: [
      {
        category: "business_rules",
        title: "حد الخصم",
        content: "الحد الأقصى للخصم عشرة بالمئة.",
        confidence: 90,
        quote: "الحد الأقصى للخصم هو عشرة بالمئة.",
        tags: ["خصم"],
      },
    ],
    gaps: [
      {
        description: "لا يوجد استثناء موضّح للعملاء الاستراتيجيين.",
        why_it_matters: "قد يمنع صفقات كبيرة.",
        needed_from: "client",
        priority: "high",
      },
    ],
    ...overrides,
  });
}

describe("validateKnowledgeClassification — القبول", () => {
  it("يقبل نتيجة سليمة", () => {
    const r = validateKnowledgeClassification(payload(), CHUNK);
    expect(r.ok).toBe(true);
    if (r.ok) {
      expect(r.data.items).toHaveLength(1);
      expect(r.data.gaps).toHaveLength(1);
      expect(r.data.droppedForMissingQuote).toBe(0);
    }
  });

  it("يقبل مقطعًا بلا عناصر — ده صحيح مش فشل", () => {
    const r = validateKnowledgeClassification(
      payload({ items: [], gaps: [] }),
      "فهرس المحتويات"
    );
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.data.items).toEqual([]);
  });

  it("يقبل JSON داخل code fences", () => {
    const r = validateKnowledgeClassification("```json\n" + payload() + "\n```", CHUNK);
    expect(r.ok).toBe(true);
  });
});

describe("حارس الاقتباس", () => {
  it("يشيل العنصر اللي اقتباسه مش موجود في النص", () => {
    const r = validateKnowledgeClassification(
      payload({
        items: [
          {
            category: "business_rules",
            title: "حد مؤلَّف",
            content: "الحد الأقصى للخصم خمسة وعشرون بالمئة.",
            confidence: 95,
            quote: "الحد الأقصى للخصم هو خمسة وعشرون بالمئة.",
            tags: [],
          },
        ],
      }),
      CHUNK
    );
    expect(r.ok).toBe(true);
    if (r.ok) {
      expect(r.data.items).toHaveLength(0);
      expect(r.data.droppedForMissingQuote).toBe(1);
    }
  });

  it("يشيل العنصر اللي بلا اقتباس أصلًا", () => {
    const r = validateKnowledgeClassification(
      payload({
        items: [{ category: "business", title: "بلا دليل", content: "ادعاء.", confidence: 80, quote: "" }],
      }),
      CHUNK
    );
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.data.droppedForMissingQuote).toBe(1);
  });

  it("يتسامح مع فروق المسافات والتشكيل في الاقتباس", () => {
    const r = validateKnowledgeClassification(
      payload({
        items: [
          {
            category: "business_rules",
            title: "حد الخصم",
            content: "الحد عشرة بالمئة.",
            confidence: 90,
            quote: "الحد   الأقصى للخصم  هو عشرة بالمئة.",
            tags: [],
          },
        ],
      }),
      CHUNK
    );
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.data.items).toHaveLength(1);
  });

  it("يتخطّى فحص الاقتباس للمصادر اللي بتتقرأ كملف", () => {
    // PDF وصورة وصوت: مفيش نص مرجعي نقارن بيه، فالفحص مش منطبق.
    const r = validateKnowledgeClassification(
      payload({
        items: [
          { category: "business", title: "من صورة", content: "قيمة في مخطط.", confidence: 70, quote: "مخطط" },
        ],
      }),
      null
    );
    expect(r.ok).toBe(true);
    if (r.ok) {
      expect(r.data.items).toHaveLength(1);
      expect(r.data.droppedForMissingQuote).toBe(0);
    }
  });
});

describe("تطبيع الحقول", () => {
  it("يحوّل التصنيف لـ snake_case لاتيني", () => {
    const r = validateKnowledgeClassification(
      payload({
        items: [
          {
            category: "Business Rules",
            title: "أ",
            content: "ب",
            confidence: 50,
            quote: "الحد الأقصى للخصم هو عشرة بالمئة.",
          },
        ],
      }),
      CHUNK
    );
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.data.items[0].category).toBe("business_rules");
  });

  it("يقبل تصنيفًا جديدًا مش في القايمة", () => {
    const r = validateKnowledgeClassification(
      payload({
        items: [
          {
            category: "warranty_policy",
            title: "أ",
            content: "ب",
            confidence: 50,
            quote: "الحد الأقصى للخصم هو عشرة بالمئة.",
          },
        ],
      }),
      CHUNK
    );
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.data.items[0].category).toBe("warranty_policy");
  });

  it("يحصر الثقة بين صفر ومئة", () => {
    const build = (confidence: unknown) =>
      validateKnowledgeClassification(
        payload({
          items: [
            {
              category: "business",
              title: "أ",
              content: "ب",
              confidence,
              quote: "الحد الأقصى للخصم هو عشرة بالمئة.",
            },
          ],
        }),
        CHUNK
      );

    const high = build(180);
    const low = build(-30);
    const bad = build("مش رقم");
    expect(high.ok && high.data.items[0].confidence).toBe(100);
    expect(low.ok && low.data.items[0].confidence).toBe(0);
    expect(bad.ok && bad.data.items[0].confidence).toBe(50);
  });

  it("يصحّح قيم الفجوة غير الصالحة لقيم افتراضية", () => {
    const r = validateKnowledgeClassification(
      payload({
        gaps: [{ description: "ناقص", needed_from: "الفضاء", priority: "عاجل جدًا" }],
      }),
      CHUNK
    );
    expect(r.ok).toBe(true);
    if (r.ok) {
      expect(r.data.gaps[0].needed_from).toBe("client");
      expect(r.data.gaps[0].priority).toBe("medium");
    }
  });

  it("يتجاهل العناصر بلا عنوان أو محتوى", () => {
    const r = validateKnowledgeClassification(
      payload({ items: [{ category: "business", title: "", content: "ب", quote: "x" }] }),
      CHUNK
    );
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.data.items).toHaveLength(0);
  });

  it("يحدّ الوسوم بثمانية", () => {
    const r = validateKnowledgeClassification(
      payload({
        items: [
          {
            category: "business",
            title: "أ",
            content: "ب",
            confidence: 50,
            quote: "الحد الأقصى للخصم هو عشرة بالمئة.",
            tags: Array.from({ length: 20 }, (_, i) => `t${i}`),
          },
        ],
      }),
      CHUNK
    );
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.data.items[0].tags).toHaveLength(8);
  });
});

describe("الرفض", () => {
  it("يرفض الرد الفاضي", () => {
    expect(validateKnowledgeClassification("", CHUNK).ok).toBe(false);
    expect(validateKnowledgeClassification(null, CHUNK).ok).toBe(false);
  });

  it("يرفض ما ليس JSON", () => {
    expect(validateKnowledgeClassification("مش JSON خالص", CHUNK).ok).toBe(false);
  });
});
