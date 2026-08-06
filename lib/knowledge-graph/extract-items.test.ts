import { describe, expect, it } from "vitest";
import { extractFlatItems } from "./extract-items";

describe("extractFlatItems", () => {
  it("قسم Array عادي (business_rules) بيرجّع عنصر لكل بند بمفتاح صحيح", () => {
    const items = extractFlatItems("business_rules", [
      { rule: "لازم يكون فيه موافقة مدير قبل الصرف", evidence: [] },
      { rule: "أقصى خصم مسموح 20%", evidence: [] },
    ]);
    expect(items).toHaveLength(2);
    expect(items[0].key).toBe("لازم يكون فيه موافقة مدير قبل الصرف");
  });

  it("العنصر بلا مفتاح معروف (keyOfItem يرجّع null) بيتجاهل بدل ما يكسر", () => {
    const items = extractFlatItems("risks", [{ unrelated_field: "x" }]);
    expect(items).toHaveLength(0);
  });

  it("non_functional_requirements (Object of Arrays) بيتفرّط لعناصر مستقلة بعنوان يوضّح الفئة الفرعية", () => {
    const items = extractFlatItems("non_functional_requirements", {
      performance: [{ statement: "زمن الاستجابة أقل من 200ms", evidence: [] }],
      security: [{ statement: "تشفير كل البيانات الحساسة", evidence: [] }],
    });
    expect(items).toHaveLength(2);
    expect(items.some((i) => i.title.includes("performance"))).toBe(true);
  });

  it("project_scope (in_scope/out_of_scope) بيتفرّط لعناصر مستقلة", () => {
    const items = extractFlatItems("project_scope", {
      in_scope: [{ statement: "تسجيل الدخول", evidence: [] }],
      out_of_scope: [{ statement: "دعم متعدد اللغات", evidence: [] }],
    });
    expect(items).toHaveLength(2);
  });

  it("قسم سردي (executive_summary) مش قابل للتقسيم — يرجّع مصفوفة فاضية عمدًا", () => {
    expect(extractFlatItems("executive_summary", "نص طويل")).toEqual([]);
  });

  it("evidence بتتنقل من العنصر الخام للعنصر المسطّح", () => {
    const items = extractFlatItems("risks", [{ risk: "تأخير التسليم", evidence: [{ question_id: "q1", question_label: "المدة الزمنية؟", quote: "المشروع محتاج 3 شهور" }] }]);
    expect(items[0].evidence).toHaveLength(1);
    expect(items[0].evidence[0].quote).toBe("المشروع محتاج 3 شهور");
  });
});
