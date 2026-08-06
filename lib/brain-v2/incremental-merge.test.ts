import { describe, it, expect } from "vitest";
import {
  describeMerge,
  mergeBrainContentAdditive,
  normalizeForCompare,
} from "./incremental-merge";
import { BRAIN_SECTION_LABELS, BRAIN_SECTIONS } from "./types";
import type { BrainContent, BrainSectionMeta } from "./types";

const NOW = "2026-07-27T10:00:00.000Z";
const OLD = "2026-01-01T00:00:00.000Z";

function meta(source: BrainSectionMeta["source"] = "ai_analysis"): BrainSectionMeta {
  return {
    confidence: 70,
    confidence_reason: null,
    evidence: [],
    source,
    last_updated: OLD,
  };
}

/** يبني BrainContent كامل بقيم فاضية، مع إمكانية تجاوز أقسام بعينها. */
function content(overrides: Partial<Record<string, unknown>> = {}): BrainContent {
  const empty: Record<string, unknown> = {};
  for (const key of BRAIN_SECTIONS) {
    let c: unknown = [];
    if (key === "executive_summary") c = "";
    else if (key === "business_model")
      c = { overview: "", how_it_works: "", value_delivery: "", users_description: "" };
    else if (key === "project_scope") c = { in_scope: [], out_of_scope: [] };
    else if (key === "non_functional_requirements")
      c = {
        performance: [],
        security: [],
        scalability: [],
        availability: [],
        accessibility: [],
        compliance: [],
      };
    empty[key] = { meta: meta(), content: c };
  }
  return { ...empty, ...overrides } as unknown as BrainContent;
}

function section(c: unknown, source: BrainSectionMeta["source"] = "ai_analysis") {
  return { meta: meta(source), content: c };
}

describe("normalizeForCompare", () => {
  it("يوحّد المسافات والتطويل والتشكيل", () => {
    expect(normalizeForCompare("  نظــام   المخـ__".replace(/_/g, ""))).toBe(
      normalizeForCompare("نظام المخ")
    );
    expect(normalizeForCompare("Order   Management ")).toBe("order management");
  });

  it("يعتبر النص المشكَّل مطابقًا لغير المشكَّل", () => {
    expect(normalizeForCompare("مَخْزَن")).toBe(normalizeForCompare("مخزن"));
  });
});

describe("mergeBrainContentAdditive — الأقسام المصفوفة", () => {
  it("يضيف العنصر الجديد ويحافظ على القديم", () => {
    const existing = content({
      business_goals: section([{ statement: "زيادة المبيعات", priority: "high", evidence: [] }]),
    });
    const incoming = content({
      business_goals: section([{ statement: "تقليل التكلفة", priority: "medium", evidence: [] }]),
    });

    const r = mergeBrainContentAdditive(existing, incoming, NOW);
    const goals = r.merged.business_goals.content;

    expect(goals).toHaveLength(2);
    expect(goals[0].statement).toBe("زيادة المبيعات");
    expect(goals[1].statement).toBe("تقليل التكلفة");
    expect(r.addedBySection.business_goals).toBe(1);
    expect(r.totalAdded).toBe(1);
  });

  it("لا يكرّر عنصرًا موجودًا حتى مع اختلاف المسافات", () => {
    const existing = content({
      business_goals: section([{ statement: "زيادة المبيعات", priority: "high", evidence: [] }]),
    });
    const incoming = content({
      business_goals: section([
        { statement: "  زيادة   المبيعات ", priority: "low", evidence: [] },
      ]),
    });

    const r = mergeBrainContentAdditive(existing, incoming, NOW);
    expect(r.merged.business_goals.content).toHaveLength(1);
    expect(r.totalAdded).toBe(0);
  });

  it("لا يحذف عنصرًا قديمًا حتى لو غاب عن الوارد الجديد", () => {
    const existing = content({
      risks: section([
        { risk: "تأخر المورد", cause: "س", likelihood: "high", impact: "high", evidence: [] },
      ]),
    });
    const incoming = content({ risks: section([]) });

    const r = mergeBrainContentAdditive(existing, incoming, NOW);
    expect(r.merged.risks.content).toHaveLength(1);
    expect(r.totalAdded).toBe(0);
  });

  it("يضيف في آخر المصفوفة عشان الـ dispositions المفهرسة بالـ index تفضل مربوطة", () => {
    const existing = content({
      missing_information: section([
        { info: "أ", impact: "high", reason: "r" },
        { info: "ب", impact: "low", reason: "r" },
      ]),
    });
    const incoming = content({
      missing_information: section([{ info: "ج", impact: "medium", reason: "r" }]),
    });

    const r = mergeBrainContentAdditive(existing, incoming, NOW);
    const items = r.merged.missing_information.content;
    // العنصر اللي كان index=1 لازم يفضل index=1
    expect(items[0].info).toBe("أ");
    expect(items[1].info).toBe("ب");
    expect(items[2].info).toBe("ج");
  });

  it("يتجاهل العناصر بدون هوية نصية بدل ما يضيف تكرارات فاضية", () => {
    const existing = content({ business_rules: section([]) });
    const incoming = content({
      business_rules: section([
        { rule: "", rationale: "x", evidence: [] },
        { rule: "   ", rationale: "y", evidence: [] },
      ]),
    });

    const r = mergeBrainContentAdditive(existing, incoming, NOW);
    expect(r.merged.business_rules.content).toHaveLength(0);
    expect(r.totalAdded).toBe(0);
  });

  it("يميّز أصحاب المصلحة بالاسم والدور معًا", () => {
    const existing = content({
      stakeholders: section([{ name: "أحمد", role: "مدير", influence: "high", evidence: [] }]),
    });
    const incoming = content({
      stakeholders: section([
        { name: "أحمد", role: "مدير", influence: "low", evidence: [] },
        { name: "أحمد", role: "محاسب", influence: "medium", evidence: [] },
      ]),
    });

    const r = mergeBrainContentAdditive(existing, incoming, NOW);
    expect(r.merged.stakeholders.content).toHaveLength(2);
    expect(r.addedBySection.stakeholders).toBe(1);
  });
});

describe("mergeBrainContentAdditive — الأقسام النصية والمركّبة", () => {
  it("لا يستبدل ملخّصًا تنفيذيًا مكتوبًا بالفعل", () => {
    const existing = content({ executive_summary: section("ملخّص كتبه الـ PM", "pm_manual_edit") });
    const incoming = content({ executive_summary: section("ملخّص من التحليل الجديد") });

    const r = mergeBrainContentAdditive(existing, incoming, NOW);
    expect(r.merged.executive_summary.content).toBe("ملخّص كتبه الـ PM");
    expect(r.totalAdded).toBe(0);
  });

  it("يملأ الملخّص الفاضي من الوارد الجديد", () => {
    const existing = content({ executive_summary: section("") });
    const incoming = content({ executive_summary: section("ملخّص جديد") });

    const r = mergeBrainContentAdditive(existing, incoming, NOW);
    expect(r.merged.executive_summary.content).toBe("ملخّص جديد");
    expect(r.addedBySection.executive_summary).toBe(1);
  });

  it("يملأ حقول نموذج العمل الفاضية فقط", () => {
    const existing = content({
      business_model: section({
        overview: "نظرة قائمة",
        how_it_works: "",
        value_delivery: "",
        users_description: "",
      }),
    });
    const incoming = content({
      business_model: section({
        overview: "نظرة جديدة",
        how_it_works: "آلية جديدة",
        value_delivery: "",
        users_description: "",
      }),
    });

    const r = mergeBrainContentAdditive(existing, incoming, NOW);
    const bm = r.merged.business_model.content;
    expect(bm.overview).toBe("نظرة قائمة");
    expect(bm.how_it_works).toBe("آلية جديدة");
    expect(r.addedBySection.business_model).toBe(1);
  });

  it("يدمج نطاق المشروع داخل وخارج النطاق", () => {
    const existing = content({
      project_scope: section({
        in_scope: [{ statement: "الفوترة", evidence: [] }],
        out_of_scope: [],
      }),
    });
    const incoming = content({
      project_scope: section({
        in_scope: [
          { statement: "الفوترة", evidence: [] },
          { statement: "المخزون", evidence: [] },
        ],
        out_of_scope: [{ statement: "الموارد البشرية", evidence: [] }],
      }),
    });

    const r = mergeBrainContentAdditive(existing, incoming, NOW);
    expect(r.merged.project_scope.content.in_scope).toHaveLength(2);
    expect(r.merged.project_scope.content.out_of_scope).toHaveLength(1);
    expect(r.addedBySection.project_scope).toBe(2);
  });

  it("يدمج المتطلبات غير الوظيفية لكل حقل فرعي", () => {
    const existing = content({
      non_functional_requirements: section({
        performance: [{ statement: "زمن استجابة أقل من ثانية", evidence: [] }],
        security: [],
        scalability: [],
        availability: [],
        accessibility: [],
        compliance: [],
      }),
    });
    const incoming = content({
      non_functional_requirements: section({
        performance: [{ statement: "زمن استجابة أقل من ثانية", evidence: [] }],
        security: [{ statement: "تشفير البيانات", evidence: [] }],
        scalability: [],
        availability: [],
        accessibility: [],
        compliance: [],
      }),
    });

    const r = mergeBrainContentAdditive(existing, incoming, NOW);
    const nfr = r.merged.non_functional_requirements.content;
    expect(nfr.performance).toHaveLength(1);
    expect(nfr.security).toHaveLength(1);
    expect(r.addedBySection.non_functional_requirements).toBe(1);
  });
});

describe("mergeBrainContentAdditive — الـ meta", () => {
  it("يحافظ على مصدر التعديل اليدوي ولا يحوّله لـ ai_analysis", () => {
    const existing = content({
      business_goals: section(
        [{ statement: "هدف قديم", priority: "high", evidence: [] }],
        "pm_manual_edit"
      ),
    });
    const incoming = content({
      business_goals: section([{ statement: "هدف جديد", priority: "low", evidence: [] }]),
    });

    const r = mergeBrainContentAdditive(existing, incoming, NOW);
    expect(r.merged.business_goals.meta.source).toBe("pm_manual_edit");
    expect(r.merged.business_goals.meta.last_updated).toBe(NOW);
  });

  it("لا يغيّر last_updated للقسم اللي مااتغيّرش", () => {
    const existing = content({
      risks: section([
        { risk: "خطر", cause: "س", likelihood: "low", impact: "low", evidence: [] },
      ]),
    });
    const r = mergeBrainContentAdditive(existing, content(), NOW);
    expect(r.merged.risks.meta.last_updated).toBe(OLD);
  });
});

describe("mergeBrainContentAdditive — التكرار (idempotence)", () => {
  it("تشغيل نفس التحليل مرتين مايضيفش حاجة في المرة التانية", () => {
    const base = content();
    const incoming = content({
      business_goals: section([{ statement: "هدف", priority: "high", evidence: [] }]),
      risks: section([
        { risk: "خطر", cause: "س", likelihood: "low", impact: "low", evidence: [] },
      ]),
    });

    const first = mergeBrainContentAdditive(base, incoming, NOW);
    expect(first.totalAdded).toBe(2);

    const second = mergeBrainContentAdditive(first.merged, incoming, NOW);
    expect(second.totalAdded).toBe(0);
    expect(second.changedSections).toEqual([]);
  });
});

describe("describeMerge", () => {
  it("يوصّف الإضافات بالعربي مع أسماء الأقسام", () => {
    const r = mergeBrainContentAdditive(
      content(),
      content({
        business_goals: section([{ statement: "هدف", priority: "high", evidence: [] }]),
      }),
      NOW
    );
    const text = describeMerge(r, BRAIN_SECTION_LABELS, "اجتماع جديد");
    expect(text).toContain("اجتماع جديد");
    expect(text).toContain("أهداف العمل");
    expect(text).toContain("+1");
  });

  it("يوضّح إن مفيش جديد لما مايتضافش شيء", () => {
    const r = mergeBrainContentAdditive(content(), content(), NOW);
    const text = describeMerge(r, BRAIN_SECTION_LABELS, "تحليل");
    expect(text).toContain("لا توجد معلومات جديدة");
  });
});
