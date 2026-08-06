import { describe, it, expect } from "vitest";
import {
  MAPPABLE_SECTIONS,
  applyIncomingToContent,
  buildIncomingSections,
  inferConstraintType,
  isMappableSection,
  proposalEvidence,
  proposalToBrainItem,
  splitResponsibilities,
  type KnowledgeProposal,
} from "./brain-mapping";
import { mergeBrainContentAdditive } from "@/lib/brain-v2/incremental-merge";
import type { BrainContent, BrainSectionKey } from "@/lib/brain-v2/types";
import { BRAIN_SECTIONS } from "@/lib/brain-v2/types";

function proposal(overrides: Partial<KnowledgeProposal> = {}): KnowledgeProposal {
  return {
    id: "k1",
    section: "business_rules",
    title: "الحد الأقصى للخصم عشرة بالمئة",
    detail: "يعتمده مدير المبيعات فقط.",
    confidence: 90,
    priority: "high",
    evidence: [{ quote: "الحد الأقصى للخصم هو عشرة بالمئة.", locator: "السياسات ← الخصم" }],
    sourceTitle: "سياسة المبيعات.pdf",
    ...overrides,
  };
}

function emptyBrain(): BrainContent {
  const meta = {
    confidence: 70,
    confidence_reason: null,
    evidence: [],
    source: "ai_analysis" as const,
    last_updated: "2026-01-01T00:00:00.000Z",
  };
  const out: Record<string, unknown> = {};
  for (const key of BRAIN_SECTIONS) {
    let content: unknown = [];
    if (key === "executive_summary") content = "";
    else if (key === "business_model")
      content = { overview: "", how_it_works: "", value_delivery: "", users_description: "" };
    else if (key === "project_scope") content = { in_scope: [], out_of_scope: [] };
    else if (key === "non_functional_requirements")
      content = {
        performance: [],
        security: [],
        scalability: [],
        availability: [],
        accessibility: [],
        compliance: [],
      };
    out[key] = { meta, content };
  }
  return out as unknown as BrainContent;
}

describe("isMappableSection", () => {
  it("يقبل الأقسام المدعومة", () => {
    expect(isMappableSection("business_rules")).toBe(true);
    expect(isMappableSection("suggested_kpis")).toBe(true);
  });

  it("يرفض الأقسام غير المدعومة", () => {
    expect(isMappableSection("executive_summary")).toBe(false);
    expect(isMappableSection("meeting_questions")).toBe(false);
    expect(isMappableSection("شيء")).toBe(false);
  });
});

describe("proposalEvidence", () => {
  it("يبني مرجعًا يحمل معرّف عنصر المعرفة", () => {
    const refs = proposalEvidence(proposal());
    expect(refs).toHaveLength(1);
    expect(refs[0].question_id).toBe("knowledge:k1");
    expect(refs[0].question_label).toContain("سياسة المبيعات.pdf");
    expect(refs[0].question_label).toContain("الخصم");
    expect(refs[0].quote).toContain("عشرة");
  });

  it("يبني دليلًا بديلًا لما مفيش اقتباس محفوظ", () => {
    // الدليل الفاضي كان هيمنع اعتماد الـ Brain عند بوابة الأدلة.
    const refs = proposalEvidence(proposal({ evidence: [] }));
    expect(refs).toHaveLength(1);
    expect(refs[0].quote).toBe("الحد الأقصى للخصم عشرة بالمئة");
  });

  it("يحدّ عدد الاقتباسات بثلاثة", () => {
    const many = Array.from({ length: 9 }, (_, i) => ({ quote: `q${i}`, locator: "" }));
    expect(proposalEvidence(proposal({ evidence: many }))).toHaveLength(3);
  });

  it("يتعامل مع الموضع الفاضي بدون أقواس فاضية", () => {
    const refs = proposalEvidence(
      proposal({ evidence: [{ quote: "نص", locator: "" }] })
    );
    expect(refs[0].question_label).not.toContain("()");
  });
});

describe("inferConstraintType", () => {
  it("يستنتج القانوني", () => {
    expect(inferConstraintType("لائحة الامتثال الضريبي")).toBe("legal");
  });

  it("يستنتج المالي", () => {
    expect(inferConstraintType("الميزانية المتاحة محدودة")).toBe("budget");
  });

  it("يستنتج الزمني", () => {
    expect(inferConstraintType("الموعد النهائي في مارس")).toBe("timeline");
  });

  it("يستنتج التقني", () => {
    expect(inferConstraintType("التكامل مع نظام قاعدة بيانات قديم")).toBe("technical");
  });

  it("يرجّع other لما مفيش دلالة — بدل تخمين متحيّز", () => {
    expect(inferConstraintType("شيء عام بلا دلالة")).toBe("other");
  });
});

describe("splitResponsibilities", () => {
  it("يقسّم بالأسطر", () => {
    expect(splitResponsibilities("مراجعة الطلبات\nاعتماد الخصم")).toEqual([
      "مراجعة الطلبات",
      "اعتماد الخصم",
    ]);
  });

  it("يشيل علامات التعداد", () => {
    expect(splitResponsibilities("- مراجعة\n- اعتماد")).toEqual(["مراجعة", "اعتماد"]);
  });

  it("يقسّم بالفاصلة المنقوطة", () => {
    expect(splitResponsibilities("مراجعة؛ اعتماد")).toEqual(["مراجعة", "اعتماد"]);
  });

  it("يرجّع مصفوفة فاضية للنص الفاضي", () => {
    expect(splitResponsibilities("")).toEqual([]);
  });

  it("يحدّ العدد بثمانية", () => {
    const many = Array.from({ length: 20 }, (_, i) => `مسؤولية ${i}`).join("\n");
    expect(splitResponsibilities(many)).toHaveLength(8);
  });
});

describe("proposalToBrainItem — شكل كل قسم", () => {
  it("قاعدة عمل: rule + rationale", () => {
    const item = proposalToBrainItem(proposal()) as Record<string, unknown>;
    expect(item.rule).toBe("الحد الأقصى للخصم عشرة بالمئة");
    expect(item.rationale).toBe("يعتمده مدير المبيعات فقط.");
    expect(Array.isArray(item.evidence)).toBe(true);
  });

  it("هدف عمل: statement + priority", () => {
    const item = proposalToBrainItem(
      proposal({ section: "business_goals", priority: "medium" })
    ) as Record<string, unknown>;
    expect(item.statement).toBeTruthy();
    expect(item.priority).toBe("medium");
  });

  it("صاحب مصلحة: name + role", () => {
    const item = proposalToBrainItem(
      proposal({ section: "stakeholders", title: "مدير المبيعات", detail: "يعتمد الخصومات" })
    ) as Record<string, unknown>;
    expect(item.name).toBe("مدير المبيعات");
    expect(item.role).toBe("يعتمد الخصومات");
  });

  it("صاحب مصلحة بلا دور: يقول ده صراحةً بدل حقل فاضي", () => {
    const item = proposalToBrainItem(
      proposal({ section: "stakeholders", detail: "" })
    ) as Record<string, unknown>;
    expect(item.role).toContain("غير محدّد");
  });

  it("متطلب وظيفي: يدمج العنوان والتفصيل في جملة واحدة", () => {
    const item = proposalToBrainItem(
      proposal({ section: "functional_requirements", title: "إصدار فاتورة", detail: "بضريبة" })
    ) as Record<string, unknown>;
    expect(item.statement).toBe("إصدار فاتورة — بضريبة");
  });

  it("متطلب وظيفي بلا تفصيل: العنوان بس بدون شرطة معلّقة", () => {
    const item = proposalToBrainItem(
      proposal({ section: "functional_requirements", title: "إصدار فاتورة", detail: "" })
    ) as Record<string, unknown>;
    expect(item.statement).toBe("إصدار فاتورة");
  });

  it("قيد: يستنتج النوع", () => {
    const item = proposalToBrainItem(
      proposal({ section: "constraints", title: "الامتثال للائحة الضريبية", detail: "" })
    ) as Record<string, unknown>;
    expect(item.type).toBe("legal");
  });

  it("افتراض: statement + reason افتراضي", () => {
    const item = proposalToBrainItem(
      proposal({ section: "assumptions", detail: "" })
    ) as Record<string, unknown>;
    expect(item.reason).toContain("مستنتج");
  });

  it("خطر: risk + cause + likelihood + impact", () => {
    const item = proposalToBrainItem(
      proposal({ section: "risks", priority: "low" })
    ) as Record<string, unknown>;
    expect(item.risk).toBeTruthy();
    expect(item.likelihood).toBe("low");
    expect(item.impact).toBe("low");
  });

  it("حقيقة معروفة: fact + category", () => {
    const item = proposalToBrainItem(proposal({ section: "known_facts" })) as Record<
      string,
      unknown
    >;
    expect(item.category).toBe("documents");
  });

  it("دور مستخدم: responsibilities كمصفوفة", () => {
    const item = proposalToBrainItem(
      proposal({ section: "user_roles", title: "المحاسب", detail: "مراجعة\nترحيل" })
    ) as Record<string, unknown>;
    expect(item.role).toBe("المحاسب");
    expect(item.responsibilities).toEqual(["مراجعة", "ترحيل"]);
  });

  it("دور مستخدم بلا مسؤوليات: نص واضح بدل مصفوفة فاضية", () => {
    const item = proposalToBrainItem(
      proposal({ section: "user_roles", detail: "" })
    ) as Record<string, unknown>;
    expect((item.responsibilities as string[])[0]).toContain("غير محدّدة");
  });

  it("ميزة مقترحة: title + rationale + priority", () => {
    const item = proposalToBrainItem(proposal({ section: "suggested_features" })) as Record<
      string,
      unknown
    >;
    expect(item.title).toBeTruthy();
    expect(item.priority).toBe("high");
  });

  it("مؤشر أداء: name + target_or_direction", () => {
    const item = proposalToBrainItem(
      proposal({ section: "suggested_kpis", title: "زمن الدورة", detail: "أقل من يومين" })
    ) as Record<string, unknown>;
    expect(item.name).toBe("زمن الدورة");
    expect(item.target_or_direction).toBe("أقل من يومين");
  });

  it("يرفض القسم غير المدعوم", () => {
    expect(
      proposalToBrainItem(proposal({ section: "executive_summary" as BrainSectionKey }))
    ).toBeNull();
  });

  it("كل الأقسام المدعومة بتنتج عنصرًا مش null", () => {
    for (const section of MAPPABLE_SECTIONS) {
      expect(proposalToBrainItem(proposal({ section }))).not.toBeNull();
    }
  });
});

describe("buildIncomingSections", () => {
  it("يجمّع المقترحات بأقسامها", () => {
    const result = buildIncomingSections([
      proposal({ id: "a", section: "business_rules" }),
      proposal({ id: "b", section: "business_rules", title: "قاعدة تانية" }),
      proposal({ id: "c", section: "risks" }),
    ]);
    expect(result.incoming.business_rules).toHaveLength(2);
    expect(result.incoming.risks).toHaveLength(1);
    expect(result.mappedIds).toEqual(["a", "b", "c"]);
  });

  it("مايبنيش أقسامًا فاضية", () => {
    const result = buildIncomingSections([proposal({ section: "risks" })]);
    expect(Object.keys(result.incoming)).toEqual(["risks"]);
  });

  it("يفصل المرفوضين عن المحوّلين", () => {
    const result = buildIncomingSections([
      proposal({ id: "ok", section: "risks" }),
      proposal({ id: "bad", section: "executive_summary" as BrainSectionKey }),
    ]);
    expect(result.mappedIds).toEqual(["ok"]);
    expect(result.skippedIds).toEqual(["bad"]);
  });

  it("يتعامل مع القائمة الفاضية", () => {
    const result = buildIncomingSections([]);
    expect(result.incoming).toEqual({});
    expect(result.mappedIds).toEqual([]);
  });
});

describe("applyIncomingToContent + الدمج الإضافي", () => {
  it("يضيف العنصر الجديد للـ Brain من غير ما يمس الباقي", () => {
    const existing = emptyBrain();
    const { incoming } = buildIncomingSections([proposal()]);
    const candidate = applyIncomingToContent(existing, incoming);
    const merged = mergeBrainContentAdditive(existing, candidate, "2026-07-27T00:00:00.000Z");

    expect(merged.totalAdded).toBe(1);
    expect(merged.merged.business_rules.content).toHaveLength(1);
    expect(merged.merged.risks.content).toHaveLength(0);
  });

  it("مايكرّرش عنصرًا موجودًا بالفعل في الـ Brain", () => {
    const existing = emptyBrain();
    const { incoming } = buildIncomingSections([proposal()]);
    const first = mergeBrainContentAdditive(
      existing,
      applyIncomingToContent(existing, incoming),
      "2026-07-27T00:00:00.000Z"
    );

    // نفس المقترح تاني — الدمج الإضافي المفروض يتجاهله.
    const second = mergeBrainContentAdditive(
      first.merged,
      applyIncomingToContent(first.merged, incoming),
      "2026-07-27T00:00:00.000Z"
    );
    expect(second.totalAdded).toBe(0);
  });

  it("يحافظ على meta القسم القائم", () => {
    const existing = emptyBrain();
    const { incoming } = buildIncomingSections([proposal()]);
    const candidate = applyIncomingToContent(existing, incoming);
    expect(candidate.business_rules.meta).toBe(existing.business_rules.meta);
  });

  it("يتجاهل الأقسام الفاضية في الوارد", () => {
    const existing = emptyBrain();
    const candidate = applyIncomingToContent(existing, { risks: [] });
    expect(candidate.risks.content).toEqual([]);
  });
});
