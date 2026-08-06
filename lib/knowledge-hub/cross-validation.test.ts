import { describe, it, expect } from "vitest";
import {
  brainStatementsToExternal,
  coverageScore,
  crossValidate,
  flattenBrainStatements,
  type ExternalStatement,
} from "./cross-validation";
import type { BrainContent } from "@/lib/brain-v2/types";

function section(content: unknown) {
  return {
    meta: {
      confidence: 80,
      confidence_reason: null,
      evidence: [],
      source: "ai_analysis" as const,
      last_updated: "2026-01-01T00:00:00.000Z",
    },
    content,
  };
}

function brain(overrides: Record<string, unknown> = {}): BrainContent {
  return {
    executive_summary: section(""),
    business_model: section({
      overview: "",
      how_it_works: "",
      value_delivery: "",
      users_description: "",
    }),
    business_goals: section([]),
    stakeholders: section([]),
    business_rules: section([]),
    functional_requirements: section([]),
    non_functional_requirements: section({
      performance: [],
      security: [],
      scalability: [],
      availability: [],
      accessibility: [],
      compliance: [],
    }),
    constraints: section([]),
    assumptions: section([]),
    risks: section([]),
    known_facts: section([]),
    missing_information: section([]),
    user_roles: section([]),
    suggested_features: section([]),
    suggested_integrations: section([]),
    suggested_kpis: section([]),
    project_scope: section({ in_scope: [], out_of_scope: [] }),
    roadmap: section([]),
    meeting_questions: section([]),
    ...overrides,
  } as unknown as BrainContent;
}

function external(id: string, text: string): ExternalStatement {
  return { id, text, source: "brain", label: "Project Brain" };
}

describe("flattenBrainStatements", () => {
  it("يرجّع مصفوفة فاضية للمحتوى الغائب", () => {
    expect(flattenBrainStatements(null)).toEqual([]);
  });

  it("يفرد قواعد العمل والمتطلبات مع موضعها", () => {
    const content = brain({
      business_rules: section([{ rule: "الخصم الأقصى عشرة بالمئة", rationale: "", evidence: [] }]),
      functional_requirements: section([{ statement: "إصدار فاتورة", evidence: [] }]),
    });
    const flat = flattenBrainStatements(content);

    expect(flat).toHaveLength(2);
    expect(flat[0]).toEqual({
      sectionKey: "business_rules",
      index: 0,
      text: "الخصم الأقصى عشرة بالمئة",
    });
    expect(flat[1].sectionKey).toBe("functional_requirements");
  });

  it("يتخطّى أسئلة الاجتماع والمعلومات الناقصة", () => {
    // دول مش معرفة مثبتة — مقارنتهم بالمستندات بتطلّع ضجيج.
    const content = brain({
      meeting_questions: section([{ question: "كام فرع؟", reason: "", priority: "high" }]),
      missing_information: section([{ info: "عدد الفروع", impact: "high", reason: "" }]),
    });
    expect(flattenBrainStatements(content)).toEqual([]);
  });

  it("يتجاهل العناصر بلا نص", () => {
    const content = brain({
      business_rules: section([
        { rule: "  ", rationale: "", evidence: [] },
        { rationale: "بلا حقل rule", evidence: [] },
      ]),
    });
    expect(flattenBrainStatements(content)).toEqual([]);
  });

  it("يحافظ على الفهرس الأصلي للعنصر", () => {
    const content = brain({
      business_rules: section([
        { rule: "الأولى", rationale: "", evidence: [] },
        { rule: "  ", rationale: "", evidence: [] },
        { rule: "الثالثة", rationale: "", evidence: [] },
      ]),
    });
    const flat = flattenBrainStatements(content);
    // العنصر الثالث لازم يفضل index=2 حتى لو اللي قبله اتشال.
    expect(flat.map((s) => s.index)).toEqual([0, 2]);
  });
});

describe("brainStatementsToExternal", () => {
  it("يبني معرّفًا يحمل القسم والفهرس", () => {
    const out = brainStatementsToExternal([
      { sectionKey: "business_rules", index: 3, text: "قاعدة" },
    ]);
    expect(out[0].id).toBe("brain:business_rules:3");
    expect(out[0].source).toBe("brain");
  });
});

describe("crossValidate", () => {
  it("يعتبر التطابق العالي تأكيدًا", () => {
    const result = crossValidate(
      [{ id: "k1", title: "الحد الأقصى للخصم", content: "الحد الأقصى للخصم عشرة بالمئة." }],
      [external("b1", "الحد الاقصى للخصم هو عشرة بالمئة.")]
    );
    expect(result.confirmed).toHaveLength(1);
    expect(result.confirmed[0].itemId).toBe("k1");
    expect(result.divergent).toHaveLength(0);
    expect(result.documentOnlyItemIds).toEqual([]);
  });

  it("يعتبر التقارب بلا تطابق مرشّح تعارض", () => {
    const result = crossValidate(
      [{ id: "k1", title: "الحد الأقصى للخصم", content: "الحد الأقصى للخصم خمسة عشر بالمئة." }],
      [external("b1", "الحد الأقصى للخصم عشرة بالمئة.")]
    );
    expect(result.divergent).toHaveLength(1);
    expect(result.confirmed).toHaveLength(0);
  });

  it("يعتبر العنصر بلا مقابل معرفة مستندية فقط", () => {
    const result = crossValidate(
      [{ id: "k1", title: "جدول الصيانة", content: "الصيانة الدورية كل ستة أشهر." }],
      [external("b1", "الحد الأقصى للخصم عشرة بالمئة.")]
    );
    expect(result.documentOnlyItemIds).toEqual(["k1"]);
    expect(result.unbackedExternalIds).toEqual(["b1"]);
  });

  it("يرصد جمل الـ Brain بلا سند مستندي", () => {
    const result = crossValidate(
      [{ id: "k1", title: "الحد الأقصى للخصم", content: "الحد الأقصى للخصم عشرة بالمئة." }],
      [
        external("b1", "الحد الاقصى للخصم هو عشرة بالمئة."),
        external("b2", "دورة الشراء يعتمدها مدير المشتريات."),
      ]
    );
    expect(result.unbackedExternalIds).toEqual(["b2"]);
  });

  it("ياخد أعلى تطابق واحد بس لكل عنصر", () => {
    // العنصر متقارب مع اتنين — نسجّل الأقوى بس بدل ما نغرق الـ PM بتكرار.
    const result = crossValidate(
      [{ id: "k1", title: "سياسة الخصم", content: "الخصم عشرة بالمئة." }],
      [
        external("b1", "سياسة الخصم عشرة بالمئة."),
        external("b2", "سياسة الخصم للعملاء الجدد."),
      ]
    );
    expect(result.confirmed.length + result.divergent.length).toBe(1);
  });

  it("يتعامل مع غياب المصادر الخارجية", () => {
    const result = crossValidate(
      [{ id: "k1", title: "أ", content: "ب" }],
      []
    );
    expect(result.documentOnlyItemIds).toEqual(["k1"]);
    expect(result.confirmed).toEqual([]);
  });

  it("يتعامل مع غياب عناصر المعرفة", () => {
    const result = crossValidate([], [external("b1", "قاعدة")]);
    expect(result.unbackedExternalIds).toEqual(["b1"]);
  });

  it("يرتّب المرشّحين بالدرجة ويقتطع عند السقف مع تبليغ", () => {
    const items = Array.from({ length: 10 }, (_, i) => ({
      id: `k${i}`,
      title: `سياسة الخصم رقم ${i}`,
      content: `الخصم في الحالة ${i} محدود بنسبة معيّنة.`,
    }));
    const result = crossValidate(items, [external("b1", "سياسة الخصم محدودة بنسبة معيّنة.")], {
      maxDivergent: 3,
    });
    expect(result.divergent.length).toBeLessThanOrEqual(3);
    for (let i = 1; i < result.divergent.length; i += 1) {
      expect(result.divergent[i - 1].score).toBeGreaterThanOrEqual(result.divergent[i].score);
    }
    if (result.divergent.length === 3) expect(result.truncatedDivergent).toBeGreaterThan(0);
  });

  it("يحمل مصدر ونص الجملة الخارجية في نتيجة المطابقة", () => {
    const result = crossValidate(
      [{ id: "k1", title: "الحد الأقصى للخصم", content: "الحد الأقصى للخصم عشرة بالمئة." }],
      [
        {
          id: "m1",
          text: "الحد الاقصى للخصم هو عشرة بالمئة.",
          source: "meeting",
          label: "اجتماع 12 مايو",
        },
      ]
    );
    expect(result.confirmed[0].externalSource).toBe("meeting");
    expect(result.confirmed[0].externalLabel).toBe("اجتماع 12 مايو");
    expect(result.confirmed[0].externalText).toContain("عشرة");
  });
});

describe("coverageScore", () => {
  it("يرجّع null لما مفيش جمل خارجية أصلًا", () => {
    // الصفر هنا كان هيبان تقييمًا سيئًا لمشروع لسه ما بدأش — وده تضليل.
    const empty = crossValidate([], []);
    expect(coverageScore(empty, 0)).toBeNull();
  });

  it("يحسب نسبة الجمل المدعومة", () => {
    const result = crossValidate(
      [{ id: "k1", title: "الحد الأقصى للخصم", content: "الحد الأقصى للخصم عشرة بالمئة." }],
      [
        external("b1", "الحد الاقصى للخصم هو عشرة بالمئة."),
        external("b2", "دورة الشراء يعتمدها مدير المشتريات."),
      ]
    );
    expect(coverageScore(result, 2)).toBe(50);
  });

  it("يرجّع مئة لما كل الجمل مدعومة", () => {
    const result = crossValidate(
      [{ id: "k1", title: "الحد الأقصى للخصم", content: "الحد الأقصى للخصم عشرة بالمئة." }],
      [external("b1", "الحد الاقصى للخصم هو عشرة بالمئة.")]
    );
    expect(coverageScore(result, 1)).toBe(100);
  });
});
