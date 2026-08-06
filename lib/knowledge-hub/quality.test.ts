import { describe, expect, it } from "vitest";
import { computeQuality, countDuplicates, qualityLevel } from "./quality";
import type { KnowledgeObject } from "./model";

const NOW = new Date("2026-07-01T00:00:00Z");

function obj(patch: Partial<KnowledgeObject> = {}): KnowledgeObject {
  return {
    id: `k-${Math.abs(hash(JSON.stringify(patch)))}`,
    projectId: "p-1",
    workspaceId: "w-1",
    sourceType: "pdf",
    sourceId: "s-1",
    title: "قاعدة عمل واضحة",
    content: "نصّ كافٍ الطول عشان يُعتبر محتوى حقيقيًا لا مجرد عنوان مكرَّر مرتين.",
    summary: null,
    language: "ar",
    category: "business",
    tags: [],
    status: "indexed",
    confidence: 80,
    importance: 50,
    version: 1,
    contentHash: null,
    visibility: "project",
    ownerId: null,
    createdBy: null,
    updatedBy: null,
    metadata: {},
    relationships: [],
    createdAt: NOW,
    updatedAt: NOW,
    reviewedAt: null,
    ...patch,
  };
}

function hash(s: string): number {
  let h = 0;
  for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) | 0;
  return h;
}

describe("المشروع الفاضي", () => {
  it("صفر في كل شيء مع إجراء واضح", () => {
    const score = computeQuality({ objects: [], now: NOW });

    expect(score.overall).toBe(0);
    expect(score.itemCount).toBe(0);
    expect(score.weaknesses[0].action).toContain("ارفع أول مستند");
  });

  // ده الفرق بين «مفيش معرفة» و«فيه معرفة كلها مرفوضة» — الرسالتان
  // مختلفتان لأن الإجراء المطلوب مختلف.
  it("معرفة كلها غير صالحة تُميَّز عن الغياب الكامل", () => {
    const score = computeQuality({
      objects: [obj({ status: "rejected" }), obj({ status: "deleted" })],
      now: NOW,
    });

    expect(score.itemCount).toBe(0);
    expect(score.weaknesses[0].message).toContain("عنصر موجود");
  });
});

describe("الاكتمال", () => {
  it("المحتوى القصير جدًا مايتحسبش مكتملًا", () => {
    const score = computeQuality({ objects: [obj({ content: "قصير" })], now: NOW });
    expect(score.completeness).toBe(0);
  });

  it("العنصر بلا تصنيف مايتحسبش مكتملًا", () => {
    const score = computeQuality({ objects: [obj({ category: "unknown" })], now: NOW });
    expect(score.completeness).toBe(0);
  });

  it("عنصر كامل يعطي مئة بالمئة", () => {
    const score = computeQuality({ objects: [obj()], now: NOW });
    expect(score.completeness).toBe(100);
  });
});

describe("التناسق", () => {
  // التعارض أثقل بمرتين من التكرار: التكرار إهدار، والتعارض خطأ محتمل
  // في القرار.
  it("التعارض يخصم ضعف ما يخصمه التكرار", () => {
    const objects = Array.from({ length: 10 }, (_, i) => obj({ title: `عنصر رقم ${i}` }));

    const withConflict = computeQuality({ objects, openConflicts: 1, now: NOW });
    const clean = computeQuality({ objects, now: NOW });

    expect(clean.consistency - withConflict.consistency).toBe(20);
  });

  it("مايقلّش عن صفر مهما كثرت التعارضات", () => {
    const score = computeQuality({ objects: [obj()], openConflicts: 100, now: NOW });
    expect(score.consistency).toBe(0);
  });
});

describe("كشف التكرار", () => {
  it("يمسك البصمة المتطابقة", () => {
    const objects = [obj({ contentHash: "abc" }), obj({ contentHash: "abc" })];
    expect(countDuplicates(objects)).toBe(1);
  });

  // بدون التطبيع العربي، «الإدارة» و«الاداره» بيتحسبوا عنوانين مختلفين.
  it("يمسك العناوين المتطابقة بعد التطبيع العربي", () => {
    const objects = [obj({ title: "سياسة الإدارة" }), obj({ title: "سياسه الاداره" })];
    expect(countDuplicates(objects)).toBe(1);
  });

  it("العناوين القصيرة مش دليل تكرار", () => {
    const objects = [obj({ title: "ملاحظة" }), obj({ title: "ملاحظة" })];
    expect(countDuplicates(objects)).toBe(0);
  });

  it("عناصر مختلفة مش تكرارًا", () => {
    const objects = [obj({ title: "سياسة التسعير" }), obj({ title: "إجراءات الشحن" })];
    expect(countDuplicates(objects)).toBe(0);
  });
});

describe("التغطية", () => {
  it("تصنيف واحد من ستة متوقَّعة يعطي تغطية منخفضة", () => {
    const score = computeQuality({ objects: [obj({ category: "business" })], now: NOW });
    expect(score.coverage).toBe(17);
  });

  it("تغطية كل المتوقَّع تعطي مئة", () => {
    const objects = ["business", "requirements", "operations", "technical", "workflow", "ui"].map(
      (category) => obj({ category, title: `عنصر ${category}` })
    );
    expect(computeQuality({ objects, now: NOW }).coverage).toBe(100);
  });

  it("التصنيفات المتوقَّعة قابلة للتخصيص", () => {
    const score = computeQuality({
      objects: [obj({ category: "security" })],
      expectedCategories: ["security"],
      now: NOW,
    });
    expect(score.coverage).toBe(100);
  });
});

describe("الحداثة", () => {
  it("المعرفة الطازجة تعطي مئة", () => {
    expect(computeQuality({ objects: [obj({ updatedAt: NOW })], now: NOW }).freshness).toBe(100);
  });

  it("الأقدم من ستة أشهر تعطي صفرًا", () => {
    const old = obj({ updatedAt: new Date("2025-01-01") });
    expect(computeQuality({ objects: [old], now: NOW }).freshness).toBe(0);
  });

  it("تتناقص خطّيًا مع العمر", () => {
    const halfway = obj({ updatedAt: new Date(NOW.getTime() - 90 * 86_400_000) });
    const score = computeQuality({ objects: [halfway], now: NOW }).freshness;
    expect(score).toBeGreaterThan(45);
    expect(score).toBeLessThan(55);
  });
});

describe("نقاط الضعف", () => {
  // الرقم لوحده مايقودش لفعل — المطلوب إن المستخدم يعرف يعمل إيه.
  it("كل ضعف بيجي معاه إجراء مقترح", () => {
    const score = computeQuality({ objects: [obj({ confidence: 20 })], now: NOW });
    for (const weakness of score.weaknesses) {
      expect(weakness.action.length, weakness.dimension).toBeGreaterThan(10);
    }
  });

  it("مرتَّبة بالأسوأ أولًا", () => {
    const score = computeQuality({
      objects: [obj({ confidence: 10, category: "unknown", content: "x" })],
      openConflicts: 5,
      now: NOW,
    });

    const scores = score.weaknesses.map((w) => w.score);
    expect([...scores].sort((a, b) => a - b)).toEqual(scores);
  });

  it("المعرفة السليمة مافيهاش نقاط ضعف", () => {
    const objects = ["business", "requirements", "operations", "technical", "workflow", "ui"].map(
      (category) => obj({ category, title: `عنصر ${category}`, confidence: 90 })
    );
    expect(computeQuality({ objects, now: NOW }).weaknesses).toEqual([]);
  });
});

describe("مستوى الجودة", () => {
  it("يترجم الدرجة لمستوى", () => {
    expect(qualityLevel(10)).toBe("critical");
    expect(qualityLevel(40)).toBe("weak");
    expect(qualityLevel(60)).toBe("fair");
    expect(qualityLevel(80)).toBe("good");
    expect(qualityLevel(95)).toBe("excellent");
  });
});
