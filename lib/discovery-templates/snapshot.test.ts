import { describe, expect, it } from "vitest";
import { buildQuestionsSnapshot, buildDiscoveryPairs } from "./snapshot";
import type { DiscoveryQuestion } from "@/lib/types/database";

function q(partial: Partial<DiscoveryQuestion> & { id: string }): DiscoveryQuestion {
  return {
    id: partial.id,
    template_id: "t1",
    question: partial.question ?? "سؤال",
    description: null,
    type: partial.type ?? "short_text",
    required: false,
    placeholder: null,
    options: partial.options ?? [],
    help_text: null,
    sort_order: partial.sort_order ?? 0,
    ai_weight: 1,
    category: partial.category ?? null,
    validation: {},
    conditional: partial.conditional ?? null,
    created_at: "",
    updated_at: "",
  };
}

describe("buildQuestionsSnapshot", () => {
  it("يحوّل الأسئلة للقطة تحتفظ بالمفتاح والتسمية والترتيب", () => {
    const snap = buildQuestionsSnapshot([
      q({ id: "a", question: "الاسم؟", sort_order: 2, category: "عام" }),
      q({ id: "b", question: "النشاط؟", sort_order: 1 }),
    ]);
    expect(snap).toEqual([
      { key: "a", label: "الاسم؟", type: "short_text", category: "عام", order: 2 },
      { key: "b", label: "النشاط؟", type: "short_text", category: null, order: 1 },
    ]);
  });
});

describe("buildDiscoveryPairs", () => {
  const snapshot = [
    { key: "a", label: "النشاط؟", type: "short_text" as const, category: null, order: 2 },
    { key: "b", label: "عندك لوجو؟", type: "yes_no" as const, category: null, order: 1 },
    { key: "c", label: "تقييمك؟", type: "rating" as const, category: null, order: 3 },
  ];

  it("يرتّب بحسب order ويتخطى الفاضي ويصيغ القيم", () => {
    const pairs = buildDiscoveryPairs({ a: "تجارة", b: true, c: 0 }, snapshot);
    // b (order 1) قبل a (order 2)، و c فاضي (0 = بلا تقييم) يتخطى
    expect(pairs).toEqual([
      { label: "عندك لوجو؟", value: "نعم" },
      { label: "النشاط؟", value: "تجارة" },
    ]);
  });

  it("يرجّع فاضي لو مفيش snapshot (فورم قديم)", () => {
    expect(buildDiscoveryPairs({ a: "x" }, null)).toEqual([]);
    expect(buildDiscoveryPairs({ a: "x" }, [])).toEqual([]);
  });
});
