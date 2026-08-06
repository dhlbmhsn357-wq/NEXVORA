import { describe, it, expect } from "vitest";
import { computeKnowledgeHealth, type KnowledgeHealthInput } from "./health";

function input(overrides: Partial<KnowledgeHealthInput> = {}): KnowledgeHealthInput {
  return {
    totalSources: 10,
    readySources: 10,
    failedSources: 0,
    totalItems: 100,
    enrichedItems: 100,
    openGaps: 0,
    openConflicts: 0,
    appliedProposals: 20,
    totalProposals: 20,
    ...overrides,
  };
}

describe("computeKnowledgeHealth — الحالة الفارغة", () => {
  it("يرجّع null لما مفيش مصادر — مش صفر", () => {
    // الصفر كان هيبان تقييمًا سيئًا لمشروع لسه ما بدأش.
    const health = computeKnowledgeHealth(input({ totalSources: 0 }));
    expect(health.score).toBeNull();
    expect(health.level).toBe("empty");
    expect(health.nextStep).toContain("ارفع");
  });
});

describe("computeKnowledgeHealth — الدرجة", () => {
  it("يعطي مئة للحالة المكتملة تمامًا", () => {
    const health = computeKnowledgeHealth(input());
    expect(health.score).toBe(100);
    expect(health.level).toBe("strong");
  });

  it("يخصم على المصادر غير المحلَّلة", () => {
    const health = computeKnowledgeHealth(input({ readySources: 5 }));
    expect(health.breakdown.processing).toBe(50);
    expect(health.score).toBeLessThan(100);
  });

  it("يخصم على المعرفة غير المُثراة", () => {
    const health = computeKnowledgeHealth(input({ enrichedItems: 50 }));
    expect(health.breakdown.enrichment).toBe(50);
  });

  it("يخصم على المقترحات غير المعتمَدة", () => {
    const health = computeKnowledgeHealth(input({ appliedProposals: 5 }));
    expect(health.breakdown.integration).toBe(25);
  });

  it("يخصم على التعارضات المفتوحة", () => {
    const health = computeKnowledgeHealth(input({ openConflicts: 3 }));
    expect(health.breakdown.cleanliness).toBe(76);
  });

  it("يخصم على الفجوات المفتوحة بوزن أقل من التعارض", () => {
    const withGaps = computeKnowledgeHealth(input({ openGaps: 3 }));
    const withConflicts = computeKnowledgeHealth(input({ openConflicts: 3 }));
    expect(withGaps.breakdown.cleanliness).toBeGreaterThan(withConflicts.breakdown.cleanliness);
  });

  it("مايخلّيش النظافة تحت الصفر", () => {
    const health = computeKnowledgeHealth(input({ openConflicts: 50, openGaps: 50 }));
    expect(health.breakdown.cleanliness).toBe(0);
    expect(health.score).toBeGreaterThanOrEqual(0);
  });

  it("يعتبر الإثراء صفرًا لما مفيش عناصر أصلًا", () => {
    const health = computeKnowledgeHealth(input({ totalItems: 0, enrichedItems: 0 }));
    expect(health.breakdown.enrichment).toBe(0);
  });

  it("يعتبر الإدماج صفرًا لما مفيش مقترحات", () => {
    const health = computeKnowledgeHealth(input({ totalProposals: 0, appliedProposals: 0 }));
    expect(health.breakdown.integration).toBe(0);
  });
});

describe("computeKnowledgeHealth — المستوى", () => {
  it("يصنّف المستويات بالحدود الصحيحة", () => {
    expect(computeKnowledgeHealth(input()).level).toBe("strong");
    expect(
      computeKnowledgeHealth(input({ appliedProposals: 12, enrichedItems: 85 })).level
    ).toBe("good");
    expect(
      computeKnowledgeHealth(input({ readySources: 4, enrichedItems: 40, appliedProposals: 5 }))
        .level
    ).toBe("fair");
    expect(
      computeKnowledgeHealth(input({ readySources: 1, enrichedItems: 5, appliedProposals: 0 }))
        .level
    ).toBe("weak");
  });
});

describe("computeKnowledgeHealth — الخطوة التالية", () => {
  it("يبلّغ عن الفشل أولًا", () => {
    const health = computeKnowledgeHealth(input({ readySources: 8, failedSources: 2 }));
    expect(health.nextStep).toContain("فشل");
  });

  it("يطلب الانتظار وقت التحليل", () => {
    const health = computeKnowledgeHealth(input({ readySources: 5 }));
    expect(health.nextStep).toContain("التحليل");
  });

  it("يطلب الإثراء بعد اكتمال التحليل", () => {
    const health = computeKnowledgeHealth(input({ enrichedItems: 30 }));
    expect(health.nextStep).toContain("الإثراء");
  });

  it("يطلب التوليف لما مفيش مقترحات", () => {
    const health = computeKnowledgeHealth(input({ totalProposals: 0, appliedProposals: 0 }));
    expect(health.nextStep).toContain("التوليف");
  });

  it("يطلب الاعتماد لما فيه مقترحات معلّقة", () => {
    const health = computeKnowledgeHealth(input({ appliedProposals: 12 }));
    expect(health.nextStep).toContain("8");
    expect(health.nextStep).toContain("الاعتماد");
  });

  it("يشاور على التعارضات بعد اكتمال الإدماج", () => {
    const health = computeKnowledgeHealth(input({ openConflicts: 2 }));
    expect(health.nextStep).toContain("تعارض");
  });

  it("يشاور على الفجوات بعد التعارضات", () => {
    const health = computeKnowledgeHealth(input({ openGaps: 4 }));
    expect(health.nextStep).toContain("فجوة");
  });

  it("يعلن الاكتمال لما مفيش شيء متبقٍّ", () => {
    expect(computeKnowledgeHealth(input()).nextStep).toContain("مكتملة");
  });

  it("مايقترحش الاعتماد والمصادر لسه بتتحلّل — الترتيب مقصود", () => {
    const health = computeKnowledgeHealth(input({ readySources: 3, appliedProposals: 0 }));
    expect(health.nextStep).not.toContain("الاعتماد");
  });
});
