import { describe, expect, it } from "vitest";
import { resolveChangeAgainstSection } from "./conflict-engine";
import { CONFIDENCE_BY_SOURCE, KNOWLEDGE_SOURCE_LABELS } from "./knowledge-sources";

describe("resolveChangeAgainstSection", () => {
  it("عنصر جديد بدون مطابقة في القسم الحالي → إضافة، بدون تعارض", () => {
    const existing = [{ statement: "تسجيل الدخول بالبريد" }];
    const result = resolveChangeAgainstSection(existing, { statement: "تصدير تقرير PDF" });
    expect(result).toEqual({
      changeType: "add",
      oldValue: null,
      conflict: false,
      itemLabel: "تصدير تقرير PDF",
      isDuplicate: false,
    });
  });

  it("قسم فاضي تمامًا → أي عنصر جديد إضافة بدون تعارض", () => {
    const result = resolveChangeAgainstSection([], { risk: "تأخر التسليم" });
    expect(result.changeType).toBe("add");
    expect(result.conflict).toBe(false);
    expect(result.isDuplicate).toBe(false);
  });

  it("نفس المفتاح ونفس المحتوى بالظبط → تكرار حقيقي (isDuplicate)، بدون تعارض", () => {
    const item = { statement: "تسجيل الدخول بالبريد", priority: "high" };
    const existing = [item];
    const result = resolveChangeAgainstSection(existing, { statement: "تسجيل الدخول بالبريد", priority: "high" });
    expect(result.changeType).toBe("modify");
    expect(result.isDuplicate).toBe(true);
    expect(result.conflict).toBe(false);
    expect(result.oldValue).toEqual(item);
  });

  it("نفس المفتاح لكن محتوى مختلف → تعديل ويُعتبر تعارض لازم PM يراجعه", () => {
    const existing = [{ statement: "تسجيل الدخول بالبريد", priority: "low" }];
    const result = resolveChangeAgainstSection(existing, { statement: "تسجيل الدخول بالبريد", priority: "high" });
    expect(result.changeType).toBe("modify");
    expect(result.conflict).toBe(true);
    expect(result.isDuplicate).toBe(false);
    expect(result.oldValue).toEqual(existing[0]);
  });

  it("عنصر بدون أي حقل مفتاح معروف (keyOfItem بيرجّع null) → إضافة دايمًا، بدون مطابقة", () => {
    const existing = [{ someUnknownField: "x" }];
    const result = resolveChangeAgainstSection(existing, { anotherUnknownField: "y" });
    expect(result.changeType).toBe("add");
    expect(result.conflict).toBe(false);
    expect(result.itemLabel).toBe("(بدون عنوان)");
  });

  it("مطابقة المفتاح بتتجاهل الحقول التانية — العنصر القديم اللي بنفس statement هو اللي بيتقارن", () => {
    const existing = [
      { statement: "أ", priority: "low" },
      { statement: "ب", priority: "high" },
    ];
    const result = resolveChangeAgainstSection(existing, { statement: "ب", priority: "medium" });
    expect(result.oldValue).toEqual({ statement: "ب", priority: "high" });
    expect(result.conflict).toBe(true);
  });
});

describe("CONFIDENCE_BY_SOURCE", () => {
  it("الأوزان مطابقة حرفيًا للمواصفة", () => {
    expect(CONFIDENCE_BY_SOURCE.manual_note).toBe(100);
    expect(CONFIDENCE_BY_SOURCE.meeting_transcript).toBe(95);
    expect(CONFIDENCE_BY_SOURCE.meeting_ai_analysis).toBe(85);
    expect(CONFIDENCE_BY_SOURCE.prototype_review).toBe(75);
    expect(CONFIDENCE_BY_SOURCE.support_feedback).toBe(70);
  });

  it("كل مصدر معرفة له تسمية عربية مقابلة", () => {
    for (const source of Object.keys(CONFIDENCE_BY_SOURCE) as Array<keyof typeof CONFIDENCE_BY_SOURCE>) {
      expect(KNOWLEDGE_SOURCE_LABELS[source]).toBeTruthy();
    }
  });

  it("الترتيب التنازلي للثقة يعكس موثوقية المصدر (يدوي أعلى من AI)", () => {
    expect(CONFIDENCE_BY_SOURCE.manual_note).toBeGreaterThan(CONFIDENCE_BY_SOURCE.meeting_transcript);
    expect(CONFIDENCE_BY_SOURCE.meeting_transcript).toBeGreaterThan(CONFIDENCE_BY_SOURCE.meeting_ai_analysis);
    expect(CONFIDENCE_BY_SOURCE.meeting_ai_analysis).toBeGreaterThan(CONFIDENCE_BY_SOURCE.prototype_review);
    expect(CONFIDENCE_BY_SOURCE.prototype_review).toBeGreaterThan(CONFIDENCE_BY_SOURCE.support_feedback);
  });
});
