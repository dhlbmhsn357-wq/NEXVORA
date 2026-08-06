import { describe, expect, it } from "vitest";
import { backfillEvidenceLabels, backfillMissingEvidence } from "./repair";
import type { DiscoveryAnalysisOutput } from "./types";
import type { DiscoverySnapshotItem } from "@/lib/types/database";

const snapshot: DiscoverySnapshotItem[] = [
  { key: "q1", label: "ما نشاط شركتك؟", type: "long_text", category: null, order: 1 },
];

function minimalOutput(): DiscoveryAnalysisOutput {
  const conf = { score: 80, reason: null };
  const empty = (extra: object = {}) => ({ score: 80, reason: null, ...extra });
  void empty;
  // نبني ناتج بأقل قدر، مع عنصر evidence ناقص التسمية
  return {
    executive_summary: {
      summary: "ملخص",
      confidence: conf,
      evidence: [{ question_id: "q1", question_label: "", quote: "تجارة" }],
    },
    business_model: {
      overview: "أ",
      how_it_works: "ب",
      value_delivery: "ج",
      users_description: "د",
      confidence: conf,
      evidence: [{ question_id: "q1", quote: "تجارة" } as never],
    },
    stakeholders: { items: [], confidence: conf },
    business_goals: { items: [], confidence: conf },
    functional_requirements: { items: [], confidence: conf },
    non_functional_requirements: {
      performance: [],
      security: [],
      scalability: [],
      availability: [],
      accessibility: [],
      compliance: [],
      confidence: conf,
    },
    risks: { items: [], confidence: conf },
    assumptions: { items: [], confidence: conf },
    missing_information: { items: [], confidence: conf },
    suggested_features: { items: [], confidence: conf },
    suggested_integrations: { items: [], confidence: conf },
    suggested_user_roles: { items: [], confidence: conf },
    suggested_kpis: { items: [], confidence: conf },
    suggested_user_stories: { items: [], confidence: conf },
    suggested_project_scope: { in_scope: [], out_of_scope: [], confidence: conf },
    suggested_roadmap: { phases: [], confidence: conf },
    meeting_questions: { items: [], confidence: conf },
  };
}

describe("backfillEvidenceLabels", () => {
  it("يملأ question_label الفاضي من لقطة القالب", () => {
    const out = backfillEvidenceLabels(minimalOutput(), snapshot);
    expect(out.executive_summary.evidence[0].question_label).toBe("ما نشاط شركتك؟");
  });

  it("يضيف question_label ومفتاح question_id لو ناقصين تمامًا", () => {
    const out = backfillEvidenceLabels(minimalOutput(), snapshot);
    const ev = out.business_model.evidence[0];
    expect(ev.question_label).toBe("ما نشاط شركتك؟");
    expect(typeof ev.question_id).toBe("string");
  });

  it("يعطي fallback معقول لو الـ id مش موجود في اللقطة", () => {
    const o = minimalOutput();
    o.executive_summary.evidence[0].question_id = "unknown";
    o.executive_summary.evidence[0].question_label = "";
    const out = backfillEvidenceLabels(o, snapshot);
    expect(out.executive_summary.evidence[0].question_label).toBe("سؤال unknown");
  });

  it("لا يغيّر التسميات الموجودة فعلاً", () => {
    const o = minimalOutput();
    o.executive_summary.evidence[0].question_label = "تسمية موجودة";
    const out = backfillEvidenceLabels(o, snapshot);
    expect(out.executive_summary.evidence[0].question_label).toBe("تسمية موجودة");
  });
});

describe("backfillMissingEvidence (إصلاح ذاتي قبل الفحص)", () => {
  it("يملأ مصفوفة evidence الفاضية بدليل استنتاج ويخفّض الثقة", () => {
    const node = {
      non_functional_requirements: {
        performance: [
          {
            statement: "سرعة عالية",
            confidence: { score: 85, reason: null },
            evidence: [],
          },
        ],
      },
    };
    const n = backfillMissingEvidence(node);
    expect(n).toBe(1);
    const item = node.non_functional_requirements.performance[0];
    expect(item.evidence.length).toBe(1);
    expect((item.evidence[0] as { quote: string }).quote).toContain("استنتاج");
    expect(item.confidence.score).toBe(40);
  });

  it("يشيل عناصر الدليل المعطوبة ويحافظ على الصالح دون تخفيض ثقة", () => {
    const node = {
      evidence: [
        { quote: "اقتباس حقيقي", question_id: "q1", question_label: "س" },
        { quote: "   " },
        null,
      ],
      confidence: { score: 90, reason: null },
    };
    const n = backfillMissingEvidence(node);
    expect(n).toBe(1);
    expect(node.evidence.length).toBe(1);
    expect(node.confidence.score).toBe(90);
  });

  it("لا يلمس ناتجًا سليمًا", () => {
    const node = {
      evidence: [{ quote: "دليل", question_id: "q1", question_label: "س" }],
      confidence: { score: 70, reason: null },
    };
    expect(backfillMissingEvidence(node)).toBe(0);
  });
});
