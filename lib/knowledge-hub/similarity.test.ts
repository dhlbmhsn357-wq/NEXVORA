import { describe, it, expect } from "vitest";
import {
  CANDIDATE_THRESHOLD,
  DUPLICATE_THRESHOLD,
  chooseCanonical,
  diceCoefficient,
  findDuplicateGroups,
  findRelationCandidates,
  itemSimilarity,
  normalizeText,
  stripPrefix,
  tokenize,
  type ComparableItem,
} from "./similarity";

function item(
  id: string,
  title: string,
  content: string,
  overrides: Partial<ComparableItem> = {}
): ComparableItem {
  return {
    id,
    category: "business_rules",
    title,
    content,
    confidence: 80,
    created_at: "2026-01-01T00:00:00.000Z",
    ...overrides,
  };
}

describe("normalizeText", () => {
  it("يوحّد الهمزات والألف المقصورة والتاء المربوطة", () => {
    expect(normalizeText("إجراء")).toBe(normalizeText("اجراء"));
    expect(normalizeText("عملية")).toBe(normalizeText("عمليه"));
    expect(normalizeText("مستشفى")).toBe(normalizeText("مستشفي"));
  });

  it("يشيل التشكيل والتطويل والترقيم", () => {
    expect(normalizeText("الخَصْم،")).toBe(normalizeText("الخصم"));
  });

  it("يوحّد حالة الأحرف اللاتينية", () => {
    expect(normalizeText("Sales Order")).toBe("sales order");
  });
});

describe("tokenize", () => {
  it("يشيل الكلمات الوظيفية", () => {
    const tokens = tokenize("الحد الأقصى للخصم في هذا النظام هو عشرة");
    expect(tokens.has("في")).toBe(false);
    expect(tokens.has("هذا")).toBe(false);
    // الكلمة الدالّة بتفضل، بجذرها بعد تجريد السابقة "لل".
    expect(tokens.has("خصم")).toBe(true);
  });

  it("يشيل الحروف المفردة", () => {
    expect(tokenize("a b الخصم").has("a")).toBe(false);
  });

  it("يجرّد السوابق العربية المتّصلة", () => {
    // من غير التجريد دول تلات كلمات مختلفة، والتكرار الواضح بيفلت.
    expect(tokenize("الخصم")).toEqual(tokenize("للخصم"));
    expect(tokenize("الخصم")).toEqual(tokenize("بالخصم"));
    expect(tokenize("الخصم")).toEqual(tokenize("خصم"));
  });

  it("مايجرّدش لو الباقي هيبقى قصير جدًا", () => {
    // "الله" لو اتجرّدت تبقى "له" — تشويه مش تطبيع.
    expect(stripPrefix("الله")).toBe("الله");
  });

  it("يجرّد السابقة الأطول أولًا", () => {
    expect(stripPrefix("بالمخزون")).toBe("مخزون");
  });
});

describe("diceCoefficient", () => {
  it("يرجّع واحد للمجموعتين المتطابقتين", () => {
    expect(diceCoefficient(new Set(["a", "b"]), new Set(["a", "b"]))).toBe(1);
  });

  it("يرجّع صفر لما مفيش تقاطع", () => {
    expect(diceCoefficient(new Set(["a"]), new Set(["b"]))).toBe(0);
  });

  it("يرجّع واحد للمجموعتين الفاضيتين", () => {
    expect(diceCoefficient(new Set(), new Set())).toBe(1);
  });

  it("يرجّع صفر لما واحدة فاضية بس", () => {
    expect(diceCoefficient(new Set(["a"]), new Set())).toBe(0);
  });
});

describe("itemSimilarity", () => {
  it("يعطي درجة عالية لصياغتين لنفس المعلومة", () => {
    const a = item("1", "الحد الأقصى للخصم", "الحد الأقصى للخصم عشرة بالمئة.");
    const b = item("2", "الحد الاقصى للخصم", "الحد الاقصى للخصم هو عشرة بالمئة.");
    expect(itemSimilarity(a, b)).toBeGreaterThan(DUPLICATE_THRESHOLD);
  });

  it("يعطي درجة منخفضة لمعلومتين مختلفتين", () => {
    const a = item("1", "سياسة الخصم", "الخصم عشرة بالمئة.");
    const b = item("2", "دورة الشراء", "أمر الشراء يعتمده مدير المشتريات.");
    expect(itemSimilarity(a, b)).toBeLessThan(CANDIDATE_THRESHOLD);
  });

  it("يرجّح العنوان على المحتوى", () => {
    const sameTitle = itemSimilarity(
      item("1", "سياسة الإرجاع", "نص مختلف تمامًا هنا عن الشحن والتوصيل."),
      item("2", "سياسة الإرجاع", "كلام آخر بعيد عن الأول بالكامل.")
    );
    const sameContent = itemSimilarity(
      item("1", "عنوان بعيد جدًا", "الإرجاع خلال أربعة عشر يومًا."),
      item("2", "شيء مختلف تمامًا", "الإرجاع خلال أربعة عشر يومًا.")
    );
    expect(sameTitle).toBeGreaterThan(sameContent);
  });
});

describe("chooseCanonical", () => {
  it("يختار الأعلى ثقة", () => {
    const chosen = chooseCanonical([
      item("1", "أ", "نص", { confidence: 60 }),
      item("2", "أ", "نص", { confidence: 95 }),
    ]);
    expect(chosen.id).toBe("2");
  });

  it("عند تساوي الثقة يختار الأطول محتوى", () => {
    const chosen = chooseCanonical([
      item("1", "أ", "قصير"),
      item("2", "أ", "محتوى أطول بكثير وفيه تفصيل أوضح"),
    ]);
    expect(chosen.id).toBe("2");
  });

  it("عند التساوي الكامل يختار الأقدم — عشان النتيجة تفضل ثابتة", () => {
    const chosen = chooseCanonical([
      item("2", "أ", "نص", { created_at: "2026-05-01T00:00:00.000Z" }),
      item("1", "أ", "نص", { created_at: "2026-01-01T00:00:00.000Z" }),
    ]);
    expect(chosen.id).toBe("1");
  });
});

describe("findDuplicateGroups", () => {
  it("يجمّع الصياغتين المتطابقتين", () => {
    const groups = findDuplicateGroups([
      item("1", "الحد الأقصى للخصم", "الحد الأقصى للخصم عشرة بالمئة.", { confidence: 90 }),
      item("2", "الحد الاقصى للخصم", "الحد الاقصى للخصم هو عشرة بالمئة.", { confidence: 70 }),
    ]);
    expect(groups).toHaveLength(1);
    expect(groups[0].canonicalId).toBe("1");
    expect(groups[0].duplicateIds).toEqual(["2"]);
  });

  it("مايجمّعش عبر تصنيفات مختلفة", () => {
    const groups = findDuplicateGroups([
      item("1", "الحد الأقصى للخصم", "الحد الأقصى للخصم عشرة بالمئة."),
      item("2", "الحد الأقصى للخصم", "الحد الأقصى للخصم عشرة بالمئة.", {
        category: "terminology",
      }),
    ]);
    expect(groups).toHaveLength(0);
  });

  it("يجمّع التكرار المتسلسل في مجموعة واحدة", () => {
    // أ≈ب و ب≈ج → لازم تبقى مجموعة واحدة فيها التلاتة، مش مجموعتين.
    const groups = findDuplicateGroups([
      item("a", "سياسة الإرجاع خلال أربعة عشر يوما", "الإرجاع مسموح خلال أربعة عشر يوما."),
      item("b", "سياسة الإرجاع خلال أربعة عشر يوم", "الإرجاع مسموح خلال أربعة عشر يوم."),
      item("c", "سياسه الارجاع خلال اربعه عشر يوما", "الارجاع مسموح خلال اربعه عشر يوما."),
    ]);
    expect(groups).toHaveLength(1);
    expect(groups[0].duplicateIds).toHaveLength(2);
  });

  it("مايرجّعش مجموعات للعناصر المختلفة", () => {
    const groups = findDuplicateGroups([
      item("1", "سياسة الخصم", "الخصم عشرة بالمئة."),
      item("2", "دورة الشراء", "أمر الشراء يعتمده مدير المشتريات."),
    ]);
    expect(groups).toHaveLength(0);
  });

  it("مايرجّعش حاجة لعنصر واحد", () => {
    expect(findDuplicateGroups([item("1", "أ", "نص")])).toHaveLength(0);
  });

  it("يحترم عتبة مخصّصة", () => {
    const items = [
      item("1", "سياسة الخصم للعملاء", "الخصم عشرة بالمئة للعملاء."),
      item("2", "سياسة الخصم للموردين", "الخصم خمسة بالمئة للموردين."),
    ];
    expect(findDuplicateGroups(items, 0.95)).toHaveLength(0);
    expect(findDuplicateGroups(items, 0.3).length).toBeGreaterThan(0);
  });
});

describe("findRelationCandidates", () => {
  it("يرجّع الأزواج المتقاربة بلا تطابق", () => {
    const { candidates } = findRelationCandidates([
      item("1", "الحد الأقصى للخصم للعملاء", "الخصم الأقصى للعملاء عشرة بالمئة."),
      item("2", "الحد الأقصى للخصم للموردين", "الخصم الأقصى للموردين خمسة بالمئة."),
    ]);
    expect(candidates.length).toBeGreaterThan(0);
    expect(candidates[0].score).toBeGreaterThanOrEqual(CANDIDATE_THRESHOLD);
    expect(candidates[0].score).toBeLessThan(DUPLICATE_THRESHOLD);
  });

  it("يستبعد المتطابقين — دول شغل الدمج مش شغل العلاقات", () => {
    const { candidates } = findRelationCandidates([
      item("1", "الحد الأقصى للخصم", "الحد الأقصى للخصم عشرة بالمئة."),
      item("2", "الحد الاقصى للخصم", "الحد الاقصى للخصم هو عشرة بالمئة."),
    ]);
    expect(candidates).toHaveLength(0);
  });

  it("يستبعد البعيدين تمامًا", () => {
    const { candidates } = findRelationCandidates([
      item("1", "سياسة الخصم", "الخصم عشرة بالمئة."),
      item("2", "جدول الصيانة", "الصيانة الدورية كل ستة أشهر."),
    ]);
    expect(candidates).toHaveLength(0);
  });

  it("يرتّب بالدرجة تنازليًا", () => {
    const { candidates } = findRelationCandidates(
      [
        item("1", "سياسة الخصم للعملاء", "الخصم للعملاء عشرة."),
        item("2", "سياسة الخصم للموردين", "الخصم للموردين خمسة."),
        item("3", "سياسة الخصم للعملاء الجدد", "الخصم للعملاء الجدد خمسة عشر."),
      ],
      { minScore: 0.2, maxScore: 0.99 }
    );
    for (let i = 1; i < candidates.length; i += 1) {
      expect(candidates[i - 1].score).toBeGreaterThanOrEqual(candidates[i].score);
    }
  });

  it("يقتطع عند السقف ويبلّغ بعدد المستبعد", () => {
    const items = Array.from({ length: 12 }, (_, i) =>
      item(`${i}`, `سياسة الخصم رقم ${i}`, `الخصم في الحالة ${i} محدود.`)
    );
    const { candidates, truncated } = findRelationCandidates(items, {
      minScore: 0.1,
      maxScore: 0.99,
      maxPairs: 5,
    });
    expect(candidates).toHaveLength(5);
    expect(truncated).toBeGreaterThan(0);
  });

  it("مايبلّغش باقتطاع لما كل الأزواج داخلة", () => {
    const { truncated } = findRelationCandidates(
      [
        item("1", "سياسة الخصم للعملاء", "الخصم للعملاء عشرة."),
        item("2", "سياسة الخصم للموردين", "الخصم للموردين خمسة."),
      ],
      { maxPairs: 50 }
    );
    expect(truncated).toBe(0);
  });
});
