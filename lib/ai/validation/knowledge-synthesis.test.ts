import { describe, it, expect } from "vitest";
import { validateKnowledgeSynthesis } from "./knowledge-synthesis";

const REFS = new Set(["I1", "I2", "I3"]);

function payload(overrides: Record<string, unknown> = {}): string {
  return JSON.stringify({
    proposals: [
      {
        section: "business_rules",
        title: "الحد الأقصى للخصم عشرة بالمئة",
        detail: "يعتمده مدير المبيعات فقط.",
        priority: "high",
        confidence: 90,
        source_refs: ["I1"],
      },
    ],
    operational: [
      {
        kind: "approval_chain",
        title: "اعتماد الخصم",
        detail: "مندوب المبيعات ← مدير المبيعات ← المدير المالي فوق عشرين بالمئة.",
        source_refs: ["I1", "I2"],
      },
    ],
    ...overrides,
  });
}

describe("validateKnowledgeSynthesis — القبول", () => {
  it("يقبل نتيجة سليمة", () => {
    const r = validateKnowledgeSynthesis(payload(), REFS);
    expect(r.ok).toBe(true);
    if (r.ok) {
      expect(r.data.proposals).toHaveLength(1);
      expect(r.data.operational).toHaveLength(1);
      expect(r.data.proposals[0].sourceRefs).toEqual(["I1"]);
    }
  });

  it("يقبل نتيجة فاضية — ده رد صحيح", () => {
    const r = validateKnowledgeSynthesis(
      JSON.stringify({ proposals: [], operational: [] }),
      REFS
    );
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.data.proposals).toEqual([]);
  });

  it("يقبل JSON داخل code fences", () => {
    const r = validateKnowledgeSynthesis("```json\n" + payload() + "\n```", REFS);
    expect(r.ok).toBe(true);
  });

  it("يعتبر المفاتيح الغائبة مصفوفات فاضية", () => {
    const r = validateKnowledgeSynthesis(JSON.stringify({}), REFS);
    expect(r.ok).toBe(true);
    if (r.ok) {
      expect(r.data.proposals).toEqual([]);
      expect(r.data.operational).toEqual([]);
    }
  });
});

describe("حارس المرجع", () => {
  it("يشيل المقترح بلا مراجع", () => {
    const r = validateKnowledgeSynthesis(
      payload({
        proposals: [
          {
            section: "business_rules",
            title: "أفضل ممارسة عامة",
            priority: "high",
            confidence: 90,
            source_refs: [],
          },
        ],
        operational: [],
      }),
      REFS
    );
    expect(r.ok).toBe(true);
    if (r.ok) {
      expect(r.data.proposals).toHaveLength(0);
      expect(r.data.droppedUnsourced).toBe(1);
    }
  });

  it("يشيل المقترح اللي كل مراجعه مخترعة", () => {
    const r = validateKnowledgeSynthesis(
      payload({
        proposals: [
          {
            section: "business_rules",
            title: "قاعدة",
            confidence: 80,
            source_refs: ["I99", "IX"],
          },
        ],
        operational: [],
      }),
      REFS
    );
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.data.droppedUnsourced).toBe(1);
  });

  it("يحتفظ بالمراجع الصالحة ويشيل المخترعة منها", () => {
    const r = validateKnowledgeSynthesis(
      payload({
        proposals: [
          {
            section: "business_rules",
            title: "قاعدة",
            confidence: 80,
            source_refs: ["I1", "I99"],
          },
        ],
        operational: [],
      }),
      REFS
    );
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.data.proposals[0].sourceRefs).toEqual(["I1"]);
  });

  it("يطبّق نفس الحارس على البنى التشغيلية", () => {
    const r = validateKnowledgeSynthesis(
      payload({
        proposals: [],
        operational: [
          { kind: "calculation", title: "معادلة", detail: "وصف", source_refs: [] },
        ],
      }),
      REFS
    );
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.data.operational).toHaveLength(0);
  });
});

describe("حارس التكرار مع الـ Brain", () => {
  it("يشيل المقترح الموجود بالفعل في الـ Brain", () => {
    const r = validateKnowledgeSynthesis(payload(), REFS, [
      "الحد الأقصى للخصم عشرة بالمئة",
    ]);
    expect(r.ok).toBe(true);
    if (r.ok) {
      expect(r.data.proposals).toHaveLength(0);
      expect(r.data.droppedDuplicate).toBe(1);
    }
  });

  it("يتسامح مع فروق الهمزات والتشكيل في المقارنة", () => {
    const r = validateKnowledgeSynthesis(payload(), REFS, [
      "الحد الاقصي للخصم عشره بالمئه",
    ]);
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.data.droppedDuplicate).toBe(1);
  });

  it("مايشيلش المقترح المختلف فعلًا", () => {
    const r = validateKnowledgeSynthesis(payload(), REFS, [
      "دورة الشراء يعتمدها مدير المشتريات",
    ]);
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.data.proposals).toHaveLength(1);
  });
});

describe("التطبيع ومنع التكرار الداخلي", () => {
  it("يشيل القسم غير المسموح", () => {
    const r = validateKnowledgeSynthesis(
      payload({
        proposals: [
          { section: "executive_summary", title: "ملخّص", confidence: 80, source_refs: ["I1"] },
        ],
        operational: [],
      }),
      REFS
    );
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.data.proposals).toHaveLength(0);
  });

  it("يشيل نوع البنية التشغيلية غير المعروف", () => {
    const r = validateKnowledgeSynthesis(
      payload({
        proposals: [],
        operational: [{ kind: "شيء", title: "أ", detail: "ب", source_refs: ["I1"] }],
      }),
      REFS
    );
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.data.operational).toHaveLength(0);
  });

  it("مايكرّرش نفس المقترح في نفس القسم", () => {
    const proposal = {
      section: "business_rules",
      title: "الحد الأقصى للخصم عشرة بالمئة",
      confidence: 80,
      source_refs: ["I1"],
    };
    const r = validateKnowledgeSynthesis(
      payload({ proposals: [proposal, proposal], operational: [] }),
      REFS
    );
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.data.proposals).toHaveLength(1);
  });

  it("يسمح بنفس العنوان في قسمين مختلفين", () => {
    const r = validateKnowledgeSynthesis(
      payload({
        proposals: [
          { section: "business_rules", title: "الخصم", confidence: 80, source_refs: ["I1"] },
          { section: "constraints", title: "الخصم", confidence: 80, source_refs: ["I1"] },
        ],
        operational: [],
      }),
      REFS
    );
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.data.proposals).toHaveLength(2);
  });

  it("يصحّح الأولوية غير الصالحة", () => {
    const r = validateKnowledgeSynthesis(
      payload({
        proposals: [
          {
            section: "business_rules",
            title: "قاعدة",
            priority: "عاجل",
            confidence: 80,
            source_refs: ["I1"],
          },
        ],
        operational: [],
      }),
      REFS
    );
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.data.proposals[0].priority).toBe("medium");
  });

  it("يحصر الثقة بين صفر ومئة", () => {
    const r = validateKnowledgeSynthesis(
      payload({
        proposals: [
          { section: "business_rules", title: "قاعدة", confidence: -5, source_refs: ["I1"] },
        ],
        operational: [],
      }),
      REFS
    );
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.data.proposals[0].confidence).toBe(0);
  });

  it("يشيل البنية التشغيلية بلا تفصيل", () => {
    const r = validateKnowledgeSynthesis(
      payload({
        proposals: [],
        operational: [{ kind: "scenario", title: "أ", detail: "  ", source_refs: ["I1"] }],
      }),
      REFS
    );
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.data.operational).toHaveLength(0);
  });

  it("يوحّد المراجع المكرّرة", () => {
    const r = validateKnowledgeSynthesis(
      payload({
        proposals: [
          {
            section: "business_rules",
            title: "قاعدة",
            confidence: 80,
            source_refs: ["I1", "I1", "I2"],
          },
        ],
        operational: [],
      }),
      REFS
    );
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.data.proposals[0].sourceRefs).toEqual(["I1", "I2"]);
  });
});

describe("الرفض", () => {
  it("يرفض الرد الفاضي", () => {
    expect(validateKnowledgeSynthesis("", REFS).ok).toBe(false);
    expect(validateKnowledgeSynthesis(null, REFS).ok).toBe(false);
  });

  it("يرفض ما ليس JSON", () => {
    expect(validateKnowledgeSynthesis("مش JSON", REFS).ok).toBe(false);
  });
});
