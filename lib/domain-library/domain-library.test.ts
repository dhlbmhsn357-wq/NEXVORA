import { describe, expect, it } from "vitest";
import { computePackageQuality, isDomainItemType, itemTypeLabel } from "./package-model";
import { selectDomainPackages, type CandidatePackage } from "./selection";
import { DEFAULT_WEIGHTS, resolveWeight } from "./fusion/weights";
import { fuseKnowledge, formatFusedContextForPrompt, type KnowledgeFragment } from "./fusion/fusion-model";

// ============================================================
// package-model
// ============================================================

describe("computePackageQuality", () => {
  it("حزمة فارغة درجتها صفر", () => {
    const q = computePackageQuality([]);
    expect(q.score).toBe(0);
    expect(q.coverage).toBe(0);
  });

  it("تغطية الأنواع الأساسية ترفع التغطية", () => {
    const items = ["module", "workflow", "business_rule", "requirement", "risk", "kpi", "integration", "security"]
      .map((t) => ({ item_type: t }));
    const q = computePackageQuality(items);
    expect(q.coverage).toBe(100);
  });

  it("العمق يرفع الاكتمال", () => {
    const shallow = computePackageQuality([{ item_type: "module" }]);
    const deep = computePackageQuality([
      { item_type: "module" }, { item_type: "module" }, { item_type: "module" },
    ]);
    expect(deep.completeness).toBeGreaterThan(shallow.completeness);
  });

  it("حرّاس النوع والتسمية", () => {
    expect(isDomainItemType("workflow")).toBe(true);
    expect(isDomainItemType("nonsense")).toBe(false);
    expect(itemTypeLabel("best_practice")).toBe("أفضل ممارسة");
  });
});

// ============================================================
// selection
// ============================================================

function pkg(id: string, domain: string, keywords: string[] = []): CandidatePackage {
  return { id, domain, name: id, keywords };
}

describe("selectDomainPackages", () => {
  const candidates = [
    pkg("hospital", "hospital", ["pharmacy", "radiology", "patients"]),
    pkg("hotel", "restaurant", ["rooms", "booking"]),
    pkg("erp", "erp", ["inventory", "accounting"]),
  ];

  it("المستشفى يختار حزمة المستشفى لا الفندق", () => {
    const selected = selectDomainPackages(
      { projectDomain: "hospital", projectKeywords: ["patients", "pharmacy"] },
      candidates
    );
    const ids = selected.map((s) => s.packageId);
    expect(ids).toContain("hospital");
    expect(ids).not.toContain("hotel");
  });

  it("مطابقة المجال ترفع الملاءمة فوق التداخل وحده", () => {
    const selected = selectDomainPackages(
      { projectDomain: "hospital", projectKeywords: [] },
      candidates
    );
    expect(selected[0].packageId).toBe("hospital");
    expect(selected[0].rationale).toContain("مطابقة المجال");
  });

  it("تداخل الكلمات يرفّع بلا مطابقة مجال", () => {
    const selected = selectDomainPackages(
      { projectDomain: "erp", projectKeywords: ["inventory", "accounting"] },
      candidates
    );
    expect(selected[0].packageId).toBe("erp");
    expect(selected[0].relevance).toBeGreaterThan(60);
  });

  it("الحزمة بلا مجال مطابق ولا تداخل تسقط", () => {
    const selected = selectDomainPackages(
      { projectDomain: "hospital", projectKeywords: ["patients"] },
      [pkg("hotel", "restaurant", ["rooms"])]
    );
    expect(selected).toHaveLength(0);
  });

  it("مجال generic لا يطابق شيئًا بالمجال", () => {
    const selected = selectDomainPackages(
      { projectDomain: "generic", projectKeywords: ["inventory", "accounting", "sales", "purchasing"] },
      [pkg("erp", "erp", ["inventory", "accounting", "sales", "purchasing"])]
    );
    expect(selected).toHaveLength(1);
    // يُختار بالتداخل فقط، لا بالمجال.
    expect(selected[0].rationale).not.toContain("مطابقة المجال");
  });
});

// ============================================================
// weights
// ============================================================

describe("resolveWeight", () => {
  it("قرار العميل الأعلى، اقتراح الذكاء الأدنى", () => {
    expect(DEFAULT_WEIGHTS.client_decision).toBe(100);
    expect(resolveWeight("client_decision")).toBeGreaterThan(resolveWeight("ai_suggestion"));
  });
  it("التجاوز يتغلّب على الافتراضي", () => {
    expect(resolveWeight("ai_suggestion", { ai_suggestion: 90 })).toBe(90);
  });
  it("المصدر المجهول محايد", () => {
    expect(resolveWeight("unknown_source")).toBe(50);
  });
});

// ============================================================
// fusion-model
// ============================================================

describe("fuseKnowledge", () => {
  it("شظية واحدة تدخل بوزن مصدرها", () => {
    const { fused } = fuseKnowledge([{ key: "approval", statement: "موافقة مطلوبة", source: "business_rule" }]);
    expect(fused).toHaveLength(1);
    expect(fused[0].weight).toBe(95);
  });

  it("المصادر المتّفقة تُسجَّل كتأكيد", () => {
    const frags: KnowledgeFragment[] = [
      { key: "approval", statement: "موافقة مطلوبة", source: "client_decision" },
      { key: "approval", statement: "موافقة مطلوبة", source: "domain_standard" },
    ];
    const { fused, conflicts } = fuseKnowledge(frags);
    expect(conflicts).toHaveLength(0);
    expect(fused[0].corroboratedBy).toContain("domain_standard");
  });

  it("التعارض يُعرَض لا يُستبدَل، والأقوى يمثّل النموذج", () => {
    const frags: KnowledgeFragment[] = [
      { key: "approval", statement: "لا حاجة لموافقة", source: "client_decision" },
      { key: "approval", statement: "موافقة إلزامية", source: "domain_standard" },
    ];
    const { fused, conflicts } = fuseKnowledge(frags);
    expect(conflicts).toHaveLength(1);
    // قرار العميل (١٠٠) يتصدّر النموذج.
    expect(fused[0].statement).toBe("لا حاجة لموافقة");
    // لكن التعارض مسجَّل بالطرفين.
    expect(conflicts[0].sides).toHaveLength(2);
    expect(conflicts[0].sides[0].source).toBe("client_decision");
  });

  it("توصية التعارض تحترم أن معيار المجال لا يتغلّب على العميل", () => {
    const frags: KnowledgeFragment[] = [
      { key: "x", statement: "أ", source: "domain_standard" },
      { key: "x", statement: "ب", source: "meeting" },
    ];
    // domain_standard (80) > meeting (90)? لا، meeting أعلى. نعكس لاختبار الفرع.
    const frags2: KnowledgeFragment[] = [
      { key: "y", statement: "أ", source: "best_practice" },
      { key: "y", statement: "ب", source: "ai_suggestion" },
    ];
    const { conflicts } = fuseKnowledge(frags2);
    expect(conflicts[0].recommendation).toContain("قرار العميل يبقى الفصل");
    void frags;
  });

  it("يرتّب النموذج بالوزن تنازليًا", () => {
    const frags: KnowledgeFragment[] = [
      { key: "a", statement: "س", source: "ai_suggestion" },
      { key: "b", statement: "ص", source: "client_decision" },
    ];
    const { fused } = fuseKnowledge(frags);
    expect(fused[0].source).toBe("client_decision");
  });
});

// ============================================================
// formatFusedContextForPrompt — كتلة السياق للبرومبت
// ============================================================

describe("formatFusedContextForPrompt", () => {
  it("لا معرفة → نصّ فارغ (المولّد يتصرّف كأن الطبقة غير موجودة)", () => {
    expect(formatFusedContextForPrompt({ fused: [], conflicts: [] })).toBe("");
  });

  it("يعرض البنود مع تسمية المصدر ووزنه", () => {
    const result = fuseKnowledge([
      { key: "org", statement: "افصل المصادقة عن التفويض", source: "org_memory" },
    ]);
    const text = formatFusedContextForPrompt(result);
    expect(text).toContain("معرفة مؤسسية مدمجة");
    expect(text).toContain("الذاكرة المؤسسية · وزن 78");
    expect(text).toContain("افصل المصادقة عن التفويض");
  });

  it("يمنع اختراع الحقائق صراحةً في التعليمات", () => {
    const result = fuseKnowledge([{ key: "x", statement: "بند", source: "domain_standard" }]);
    expect(formatFusedContextForPrompt(result)).toContain("لا تخترع منها حقائق");
  });

  it("يعرض التعارضات كقسم منفصل مع التوصية", () => {
    const result = fuseKnowledge([
      { key: "approval", statement: "لا حاجة لموافقة", source: "client_decision" },
      { key: "approval", statement: "موافقة إلزامية", source: "domain_standard" },
    ]);
    const text = formatFusedContextForPrompt(result);
    expect(text).toContain("تعارضات تحتاج انتباه");
    // قرار العميل هو الأقوى هنا → توصية توثيق المخالفة.
    expect(text).toContain("توثيق سبب مخالفة");
  });

  it("يذكر المصادر المؤكِّدة عند وجودها", () => {
    const result = fuseKnowledge([
      { key: "approval", statement: "موافقة مطلوبة", source: "client_decision" },
      { key: "approval", statement: "موافقة مطلوبة", source: "domain_standard" },
    ]);
    expect(formatFusedContextForPrompt(result)).toContain("مؤكَّد أيضًا من");
  });
});
