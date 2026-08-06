import { describe, expect, it } from "vitest";
import {
  ENTITY_TYPES,
  entityTypeLabel,
  normalizeEntityKey,
  riskPriority,
} from "./taxonomy";
import { validateExtract } from "./validator";
import { aggregateCompleteness, computeDomainCompleteness } from "./completeness";
import type { ProcessingExtract } from "./validator";

// ============================================================
// taxonomy
// ============================================================

describe("taxonomy", () => {
  it("يعطي تسمية عربية للأنواع المعروفة ويمرّر غير المعروف كما هو", () => {
    expect(entityTypeLabel("company")).toBe("شركة");
    expect(entityTypeLabel("drone_fleet")).toBe("drone_fleet");
  });

  it("تحتوي القائمة على unknown كملاذ أخير", () => {
    expect(ENTITY_TYPES).toContain("unknown");
  });

  describe("normalizeEntityKey", () => {
    it("يوحّد التنويعات الإملائية العربية", () => {
      expect(normalizeEntityKey("الإدارة")).toBe(normalizeEntityKey("الاداره"));
    });

    it("يزيل البادئات التنظيمية فيتطابق «قسم المبيعات» مع «المبيعات»", () => {
      expect(normalizeEntityKey("قسم المبيعات")).toBe(normalizeEntityKey("المبيعات"));
      expect(normalizeEntityKey("ادارة المبيعات")).toBe(normalizeEntityKey("المبيعات"));
    });

    it("يوحّد التشكيل والمسافات", () => {
      expect(normalizeEntityKey("  المَبِيعات  ")).toBe(normalizeEntityKey("المبيعات"));
    });

    it("لا يرجع سلسلة فارغة لو الاسم كله بادئة", () => {
      expect(normalizeEntityKey("قسم")).not.toBe("");
    });
  });

  describe("riskPriority", () => {
    it("عالي × حرج = حرج", () => {
      expect(riskPriority("high", "critical")).toEqual({ score: 12, level: "critical" });
    });

    it("منخفض × منخفض = منخفض", () => {
      expect(riskPriority("low", "low")).toEqual({ score: 1, level: "low" });
    });

    it("متوسط × عالي = عالي", () => {
      expect(riskPriority("medium", "high").level).toBe("high");
    });
  });
});

// ============================================================
// validator
// ============================================================

describe("validateExtract", () => {
  it("يرجّع بنية فارغة صالحة لمدخل غير صالح تمامًا", () => {
    const r = validateExtract(null);
    expect(r.data.entities).toEqual([]);
    expect(r.data.risks).toEqual([]);
  });

  it("يقبل snake_case و camelCase للحقول", () => {
    const r = validateExtract({
      entities: [
        { entity_type: "department", name: "المبيعات", confidence: 90 },
        { entityType: "employee", name: "أحمد", confidence: 0.8 },
      ],
    });
    expect(r.data.entities).toHaveLength(2);
    expect(r.data.entities[0].entityType).toBe("department");
    // ٠٫٨ اتحوّلت لنسبة مئوية
    expect(r.data.entities[1].confidence).toBe(80);
  });

  it("يحوّل نوع كيان مجهول إلى unknown", () => {
    const r = validateExtract({ entities: [{ entity_type: "spaceship", name: "X" }] });
    expect(r.data.entities[0].entityType).toBe("unknown");
  });

  it("يسقط الكيان بلا اسم ويسجّل السبب", () => {
    const r = validateExtract({ entities: [{ entity_type: "company" }] });
    expect(r.data.entities).toHaveLength(0);
    expect(r.dropped).toContainEqual({ kind: "entity", reason: "بلا اسم" });
  });

  it("يسقط العلاقة اللي طرفها مش كيان مستخرَج", () => {
    const r = validateExtract({
      entities: [{ entity_type: "company", name: "شركة" }],
      relations: [{ from: "شركة", to: "كيان وهمي", relation_type: "يملك" }],
    });
    expect(r.data.relations).toHaveLength(0);
    expect(r.dropped.some((d) => d.kind === "relation")).toBe(true);
  });

  it("يقبل العلاقة لما الطرفان كيانان مستخرَجان", () => {
    const r = validateExtract({
      entities: [
        { entity_type: "company", name: "الشركة" },
        { entity_type: "department", name: "المبيعات" },
      ],
      relations: [{ from: "الشركة", to: "المبيعات", relation_type: "يحتوي" }],
    });
    expect(r.data.relations).toHaveLength(1);
  });

  it("يسقط العلاقة الذاتية", () => {
    const r = validateExtract({
      entities: [{ entity_type: "company", name: "الشركة" }],
      relations: [{ from: "الشركة", to: "الشركة", relation_type: "يساوي" }],
    });
    expect(r.data.relations).toHaveLength(0);
  });

  it("يسقط قاعدة العمل بلا شرط أو نتيجة", () => {
    const r = validateExtract({
      rules: [
        { condition: "لو الطلب > ١٠٠٠", action: "" },
        { condition: "لو الطلب > ١٠٠٠", action: "يحتاج موافقة" },
      ],
    });
    expect(r.data.rules).toHaveLength(1);
    expect(r.data.rules[0].action).toBe("يحتاج موافقة");
  });

  it("يسقط سير العمل بأقل من خطوتين", () => {
    const r = validateExtract({
      workflows: [
        { name: "مهمة مفردة", steps: [{ name: "خطوة" }] },
        {
          name: "الموافقة على الإجازة",
          steps: [{ name: "تقديم الطلب" }, { name: "اعتماد المدير" }],
        },
      ],
    });
    expect(r.data.workflows).toHaveLength(1);
    // الخطوة اللي فيها «اعتماد» تُعلَّم موافقة تلقائيًا
    expect(r.data.workflows[0].steps[1].isApproval).toBe(true);
  });

  it("يقيّد نوع المتطلب والمخاطرة على القائمة المغلقة", () => {
    const r = validateExtract({
      requirements: [{ type: "made_up", statement: "س" }],
      risks: [{ type: "made_up", description: "خطر" }],
    });
    expect(r.data.requirements[0].requirementType).toBe("functional");
    expect(r.data.risks[0].riskType).toBe("operational");
  });

  it("يطبّع الثقة الشاذة إلى المدى ٠–١٠٠", () => {
    const r = validateExtract({
      entities: [
        { entity_type: "company", name: "أ", confidence: 250 },
        { entity_type: "company", name: "ب", confidence: -5 },
        { entity_type: "company", name: "ج", confidence: "nonsense" },
      ],
    });
    expect(r.data.entities[0].confidence).toBe(100);
    expect(r.data.entities[1].confidence).toBe(0);
    expect(r.data.entities[2].confidence).toBe(60); // الافتراضي
  });

  it("يجمع الوحدات المتأثرة في القرار كمصفوفة نصوص", () => {
    const r = validateExtract({
      decisions: [
        { decision: "اعتماد Postgres", affected_modules: ["المخزون", "الفوترة"] },
      ],
    });
    expect(r.data.decisions[0].affectedModules).toEqual(["المخزون", "الفوترة"]);
  });
});

// ============================================================
// completeness
// ============================================================

function extractWith(partial: Partial<ProcessingExtract>): ProcessingExtract {
  return {
    entities: [],
    relations: [],
    rules: [],
    workflows: [],
    requirements: [],
    decisions: [],
    risks: [],
    ...partial,
  };
}

describe("computeDomainCompleteness", () => {
  it("مجال فارغ درجته صفر وكل الأبعاد فجوات", () => {
    const c = computeDomainCompleteness("المبيعات", extractWith({}));
    expect(c.score).toBe(0);
    expect(c.gaps.length).toBe(7);
  });

  it("الوصول للتشبّع في كل بعد يعطي ١٠٠", () => {
    const c = computeDomainCompleteness(
      "المخزون",
      extractWith({
        entities: Array(8).fill({ entityType: "company", name: "x", normalizedKey: "x", description: "", confidence: 80, quote: "" }),
        relations: Array(6).fill({ fromName: "a", toName: "b", relationType: "r", confidence: 80 }),
        rules: Array(4).fill({ name: "r", condition: "c", action: "a", ruleType: "validation", scope: null, priority: "medium", confidence: 80, quote: "" }),
        workflows: Array(2).fill({ name: "w", description: "", trigger: null, outcome: null, domain: null, steps: [], confidence: 80 }),
        requirements: Array(5).fill({ requirementType: "functional", statement: "s", rationale: null, priority: "medium", module: null, confidence: 80, quote: "" }),
        decisions: Array(3).fill({ decision: "d", rationale: null, decisionMaker: null, decidedOn: null, impact: null, affectedModules: [], confidence: 80, quote: "" }),
        risks: Array(3).fill({ riskType: "operational", description: "k", likelihood: "low", severity: "low", mitigation: null, affectedArea: null, confidence: 80, quote: "" }),
      })
    );
    expect(c.score).toBe(100);
    expect(c.gaps).toHaveLength(0);
  });

  it("يعدّ المخاطر الحرجة", () => {
    const c = computeDomainCompleteness(
      "الأمن",
      extractWith({
        risks: [
          { riskType: "security", description: "اختراق", likelihood: "high", severity: "critical", mitigation: null, affectedArea: null, confidence: 90, quote: "" },
          { riskType: "operational", description: "بسيط", likelihood: "low", severity: "low", mitigation: null, affectedArea: null, confidence: 50, quote: "" },
        ],
      })
    );
    expect(c.criticalRiskCount).toBe(1);
  });
});

describe("aggregateCompleteness", () => {
  it("قائمة فارغة ترجّع أصفارًا", () => {
    expect(aggregateCompleteness([])).toEqual({
      overallScore: 0,
      totalCriticalRisks: 0,
      weakestDomains: [],
    });
  });

  it("المتوسط مرجَّح بحجم المجال لا بسيطًا", () => {
    const big = computeDomainCompleteness(
      "كبير",
      extractWith({
        entities: Array(8).fill({ entityType: "company", name: "x", normalizedKey: "x", description: "", confidence: 80, quote: "" }),
      })
    );
    const tiny = computeDomainCompleteness("صغير", extractWith({}));
    const agg = aggregateCompleteness([big, tiny]);
    // المجال الكبير (درجته أعلى) يجرّ المتوسط لأعلى من المتوسط البسيط
    const simpleAvg = (big.score + tiny.score) / 2;
    expect(agg.overallScore).toBeGreaterThan(simpleAvg);
  });

  it("يبرز أضعف المجالات تحت ٦٠", () => {
    const weak = computeDomainCompleteness("ضعيف", extractWith({ entities: [{ entityType: "company", name: "x", normalizedKey: "x", description: "", confidence: 80, quote: "" }] }));
    const agg = aggregateCompleteness([weak]);
    expect(agg.weakestDomains).toContain("ضعيف");
  });
});
