import { describe, expect, it } from "vitest";
import { validateDiscoveryAnalysis } from "./validation";

const okEvidence = [{ question_id: "q1", question_label: "س؟", quote: "الإجابة" }];
const okConfidence = { score: 85, reason: null };

/** Fixture لأصغر ناتج صحيح ممكن — كل قسم فيه أقل عناصر مقبولة. */
function validOutput() {
  return {
    executive_summary: { summary: "ملخص", confidence: okConfidence, evidence: okEvidence },
    business_model: {
      overview: "أ",
      how_it_works: "ب",
      value_delivery: "ج",
      users_description: "د",
      confidence: okConfidence,
      evidence: okEvidence,
    },
    stakeholders: {
      items: [{ name: "المدير", role: "قرار", influence: "high", evidence: okEvidence }],
      confidence: okConfidence,
    },
    business_goals: {
      items: [{ goal: "زيادة الطلاب", priority: "high", evidence: okEvidence }],
      confidence: okConfidence,
    },
    functional_requirements: {
      items: [{ statement: "تسجيل الطالب", evidence: okEvidence }],
      confidence: okConfidence,
    },
    non_functional_requirements: {
      performance: [],
      security: [{ statement: "تشفير", evidence: okEvidence }],
      scalability: [],
      availability: [],
      accessibility: [],
      compliance: [],
      confidence: { score: 60, reason: "بعض الأبعاد غير مذكورة" },
    },
    risks: {
      items: [
        {
          risk: "بطء الإنترنت",
          cause: "منطقة نائية",
          likelihood: "medium",
          impact: "high",
          evidence: okEvidence,
        },
      ],
      confidence: okConfidence,
    },
    assumptions: {
      items: [{ statement: "دفع محلي", reason: "لا معلومة", evidence: okEvidence }],
      confidence: okConfidence,
    },
    missing_information: {
      items: [{ info: "الميزانية", impact: "high", reason: "غير مذكورة" }],
      confidence: okConfidence,
    },
    suggested_features: {
      items: [
        {
          title: "شاشة حجز",
          rationale: "مبني على طلب صريح",
          priority: "high",
          evidence: okEvidence,
        },
      ],
      confidence: okConfidence,
    },
    suggested_integrations: {
      items: [
        { title: "SMS", rationale: "لتذكير المرضى", priority: "medium", evidence: okEvidence },
      ],
      confidence: okConfidence,
    },
    suggested_user_roles: {
      items: [{ role: "مسؤول", responsibilities: ["إدارة"], evidence: okEvidence }],
      confidence: okConfidence,
    },
    suggested_kpis: {
      items: [
        {
          name: "معدل الحجز",
          target_or_direction: "≥ 60%",
          goal_link: "زيادة الطلاب",
          evidence: okEvidence,
        },
      ],
      confidence: okConfidence,
    },
    suggested_user_stories: {
      items: [
        {
          role: "بصفتي طالب",
          want: "أحجز حصة",
          benefit: "أوفر وقت",
          priority: "high",
          evidence: okEvidence,
        },
      ],
      confidence: okConfidence,
    },
    suggested_project_scope: {
      in_scope: [{ statement: "حجز", evidence: okEvidence }],
      out_of_scope: [{ statement: "دفع مسبق", evidence: okEvidence }],
      confidence: okConfidence,
    },
    suggested_roadmap: {
      phases: [
        {
          phase: "MVP",
          description: "أول إصدار",
          deliverables: ["حجز"],
          evidence: okEvidence,
        },
      ],
      confidence: okConfidence,
    },
    meeting_questions: {
      items: [{ question: "الميزانية؟", reason: "للتخطيط", priority: "high" }],
      confidence: okConfidence,
    },
  };
}

describe("validateDiscoveryAnalysis", () => {
  it("يقبل ناتجًا مكتمل الشروط", () => {
    const r = validateDiscoveryAnalysis(JSON.stringify(validOutput()));
    expect(r.ok).toBe(true);
  });

  it("يشيل code fences لو وُجدت", () => {
    const wrapped = "```json\n" + JSON.stringify(validOutput()) + "\n```";
    const r = validateDiscoveryAnalysis(wrapped);
    expect(r.ok).toBe(true);
  });

  it("يرفض JSON غير صالح", () => {
    const r = validateDiscoveryAnalysis("{not json");
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.reason).toMatch(/JSON/);
  });

  it("يقبل JSON محاط بكلام قبله وبعده (اقتصاص { ... })", () => {
    const wrapped =
      "إليك التحليل المطلوب:\n" + JSON.stringify(validOutput()) + "\nأتمنى أن يكون مفيدًا.";
    const r = validateDiscoveryAnalysis(wrapped);
    expect(r.ok).toBe(true);
  });

  it("يتسامح مع فاصلة زائدة قبل قوس الإغلاق", () => {
    const withTrailingComma = JSON.stringify(validOutput()).replace(/}$/, ",}");
    const r = validateDiscoveryAnalysis(withTrailingComma);
    expect(r.ok).toBe(true);
  });

  it("يُصلح ملخصًا تنفيذيًا بلا evidence بدليل استنتاج بدل الرفض", () => {
    const o = validOutput();
    o.executive_summary.evidence = [];
    const r = validateDiscoveryAnalysis(JSON.stringify(o));
    expect(r.ok).toBe(true);
    if (r.ok) {
      expect(r.data.executive_summary.evidence.length).toBe(1);
      expect(r.data.executive_summary.evidence[0].quote).toContain("استنتاج");
    }
  });

  it("يُصلح عنصرًا وظيفيًا بدون evidence بدل الرفض", () => {
    const o = validOutput();
    (o.functional_requirements.items[0] as { evidence: unknown[] }).evidence = [];
    const r = validateDiscoveryAnalysis(JSON.stringify(o));
    expect(r.ok).toBe(true);
    if (r.ok) {
      expect(r.data.functional_requirements.items[0].evidence.length).toBe(1);
    }
  });

  it("يقبل evidence فيه quote حتى لو question_label فاضي (يُصلَح لاحقًا)", () => {
    const o = validOutput();
    (o.suggested_user_roles.items[0].evidence[0] as { question_label: string }).question_label = "";
    const r = validateDiscoveryAnalysis(JSON.stringify(o));
    expect(r.ok).toBe(true);
  });

  it("يقبل evidence بدون مفتاح question_label أصلاً طالما فيه quote", () => {
    const o = validOutput();
    o.functional_requirements.items[0].evidence = [
      { question_id: "q1", quote: "دليل" },
    ] as never;
    const r = validateDiscoveryAnalysis(JSON.stringify(o));
    expect(r.ok).toBe(true);
  });

  it("يُصلح evidence بدون quote: يشيل المعطوب ويحط دليل استنتاج", () => {
    const o = validOutput();
    o.functional_requirements.items[0].evidence = [
      { question_id: "q1", question_label: "س" },
    ] as never;
    const r = validateDiscoveryAnalysis(JSON.stringify(o));
    expect(r.ok).toBe(true);
    if (r.ok) {
      const ev = r.data.functional_requirements.items[0].evidence;
      expect(ev.length).toBe(1);
      expect(ev[0].quote.trim().length).toBeGreaterThan(0);
    }
  });

  it("يطبّع confidence.score كنص رقمي إلى رقم", () => {
    const o = validOutput();
    (o.executive_summary.confidence as { score: unknown }).score = "82";
    const r = validateDiscoveryAnalysis(JSON.stringify(o));
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.data.executive_summary.confidence.score).toBe(82);
  });

  it("يطبّع الأولوية بحروف كبيرة أو بالعربي", () => {
    const o = validOutput();
    (o.business_goals.items[0] as { priority: string }).priority = "High";
    (o.risks.items[0] as { impact: string }).impact = "منخفضة";
    const r = validateDiscoveryAnalysis(JSON.stringify(o));
    expect(r.ok).toBe(true);
    if (r.ok) {
      expect(r.data.business_goals.items[0].priority).toBe("high");
      expect(r.data.risks.items[0].impact).toBe("low");
    }
  });

  it("يرفض ثقة خارج المدى 0..100", () => {
    const o = validOutput();
    o.executive_summary.confidence = { score: 150, reason: null };
    const r = validateDiscoveryAnalysis(JSON.stringify(o));
    expect(r.ok).toBe(false);
  });

  it("يرفض priority غير معروف", () => {
    const o = validOutput();
    (o.business_goals.items[0] as { priority: string }).priority = "urgent";
    const r = validateDiscoveryAnalysis(JSON.stringify(o));
    expect(r.ok).toBe(false);
  });

  it("يقبل مصفوفة non-functional فرعية فارغة (compliance مثلاً)", () => {
    const o = validOutput();
    o.non_functional_requirements.security = [];
    const r = validateDiscoveryAnalysis(JSON.stringify(o));
    expect(r.ok).toBe(true);
  });

  it("يرفض missing_information بلا reason", () => {
    const o = validOutput();
    (o.missing_information.items[0] as { reason: string }).reason = "";
    const r = validateDiscoveryAnalysis(JSON.stringify(o));
    expect(r.ok).toBe(false);
  });

  it("يرفض قسمًا كاملاً مفقودًا", () => {
    const o = validOutput() as unknown as Record<string, unknown>;
    delete o.risks;
    const r = validateDiscoveryAnalysis(JSON.stringify(o));
    expect(r.ok).toBe(false);
  });

  it("يقبل confidence.reason=null فقط عندما يكون نص أو null", () => {
    const o = validOutput();
    (o.executive_summary.confidence as { reason: unknown }).reason = 123;
    const r = validateDiscoveryAnalysis(JSON.stringify(o));
    expect(r.ok).toBe(false);
  });
});
