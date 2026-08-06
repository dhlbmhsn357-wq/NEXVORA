import { describe, expect, it } from "vitest";
import {
  checkApprovalGate,
  computeReadinessScore,
  pruneRejectedAssumptions,
} from "./readiness";
import { mapAnalysisToBrainContent } from "./mapper";
import type { DiscoveryAnalysisOutput } from "@/lib/discovery-analysis/types";

const ev = [{ question_id: "q1", question_label: "س؟", quote: "الإجابة" }];
const okConf = { score: 85, reason: null };

function baseAnalysis(): DiscoveryAnalysisOutput {
  return {
    executive_summary: { summary: "ملخص", confidence: okConf, evidence: ev },
    business_model: {
      overview: "أ",
      how_it_works: "ب",
      value_delivery: "ج",
      users_description: "د",
      confidence: okConf,
      evidence: ev,
    },
    stakeholders: {
      items: [{ name: "المدير", role: "قرار", influence: "high", evidence: ev }],
      confidence: okConf,
    },
    business_goals: {
      items: [{ goal: "زيادة", priority: "high", evidence: ev }],
      confidence: okConf,
    },
    functional_requirements: {
      items: [{ statement: "تسجيل", evidence: ev }],
      confidence: okConf,
    },
    non_functional_requirements: {
      performance: [],
      security: [{ statement: "تشفير", evidence: ev }],
      scalability: [],
      availability: [],
      accessibility: [],
      compliance: [{ statement: "GDPR", evidence: ev }],
      confidence: okConf,
    },
    risks: {
      items: [{ risk: "بطء", cause: "شبكة", likelihood: "medium", impact: "high", evidence: ev }],
      confidence: okConf,
    },
    assumptions: {
      items: [
        { statement: "دفع محلي", reason: "افتراضي", evidence: ev },
        { statement: "لغة عربية فقط", reason: "افتراضي", evidence: ev },
      ],
      confidence: okConf,
    },
    missing_information: {
      items: [
        { info: "الميزانية", impact: "high", reason: "غير مذكورة" },
        { info: "التاريخ النهائي", impact: "medium", reason: "غير مذكور" },
      ],
      confidence: okConf,
    },
    suggested_features: { items: [], confidence: okConf },
    suggested_integrations: { items: [], confidence: okConf },
    suggested_user_roles: {
      items: [{ role: "مسؤول", responsibilities: ["إدارة"], evidence: ev }],
      confidence: okConf,
    },
    suggested_kpis: { items: [], confidence: okConf },
    suggested_user_stories: { items: [], confidence: okConf },
    suggested_project_scope: {
      in_scope: [{ statement: "حجز", evidence: ev }],
      out_of_scope: [],
      confidence: okConf,
    },
    suggested_roadmap: {
      phases: [{ phase: "MVP", description: "أول", deliverables: ["حجز"], evidence: ev }],
      confidence: okConf,
    },
    meeting_questions: {
      items: [{ question: "الميزانية؟", reason: "للتخطيط", priority: "high" }],
      confidence: okConf,
    },
  };
}

describe("computeReadinessScore", () => {
  it("يبدأ منخفضًا لو مفيش أقسام مُعتمدة ومفيش dispositions", () => {
    const content = mapAnalysisToBrainContent(baseAnalysis());
    const r = computeReadinessScore({
      completeness: 80,
      content,
      sectionReviews: {},
      missingInfoDispositions: {},
      assumptionDispositions: {},
    });
    // 40%×80 + 25%×0 + 20%×0 + 15%×0 = 32
    expect(r.score).toBe(32);
    expect(r.sectionApprovalPct).toBe(0);
  });

  it("يرتفع مع اعتماد الأقسام + معالجة الـ dispositions", () => {
    const content = mapAnalysisToBrainContent(baseAnalysis());
    const r = computeReadinessScore({
      completeness: 80,
      content,
      sectionReviews: {
        executive_summary: {
          state: "approved",
          reason: null,
          reviewer_id: null,
          reviewed_at: "",
        },
      },
      missingInfoDispositions: {
        "0": { state: "resolved", by: null, at: "" },
        "1": { state: "ignored", by: null, at: "" },
      },
      assumptionDispositions: {
        "0": { state: "accepted", by: null, at: "" },
        "1": { state: "rejected", by: null, at: "" },
      },
    });
    expect(r.missingInfoResolvedPct).toBe(100);
    expect(r.assumptionsReviewedPct).toBe(100);
    expect(r.sectionApprovalPct).toBeGreaterThan(0);
    expect(r.score).toBeGreaterThan(60);
  });
});

describe("checkApprovalGate", () => {
  it("يسمح بالاعتماد لو مفيش blockers", () => {
    const content = mapAnalysisToBrainContent(baseAnalysis());
    // نعالج كل الـ missing + assumptions
    const r = checkApprovalGate({
      content,
      sectionReviews: {},
      missingInfoDispositions: {
        "0": { state: "resolved", by: null, at: "" },
        "1": { state: "ignored", by: null, at: "" },
      },
      assumptionDispositions: {
        "0": { state: "accepted", by: null, at: "" },
        "1": { state: "rejected", by: null, at: "" },
      },
    });
    expect(r.canApprove).toBe(true);
  });

  it("يمنع الاعتماد لو فيه قسم مرفوض", () => {
    const content = mapAnalysisToBrainContent(baseAnalysis());
    const r = checkApprovalGate({
      content,
      sectionReviews: {
        risks: { state: "rejected", reason: null, reviewer_id: null, reviewed_at: "" },
      },
      missingInfoDispositions: {
        "0": { state: "resolved", by: null, at: "" },
        "1": { state: "resolved", by: null, at: "" },
      },
      assumptionDispositions: {
        "0": { state: "accepted", by: null, at: "" },
        "1": { state: "accepted", by: null, at: "" },
      },
    });
    expect(r.canApprove).toBe(false);
    expect(r.blockers.some((b) => b.includes("مرفوض"))).toBe(true);
  });

  it("يمنع الاعتماد لو فيه missing_info pending", () => {
    const content = mapAnalysisToBrainContent(baseAnalysis());
    const r = checkApprovalGate({
      content,
      sectionReviews: {},
      missingInfoDispositions: {},
      assumptionDispositions: {
        "0": { state: "accepted", by: null, at: "" },
        "1": { state: "accepted", by: null, at: "" },
      },
    });
    expect(r.canApprove).toBe(false);
    expect(r.blockers.some((b) => b.includes("Missing Info"))).toBe(true);
  });

  it("يمنع الاعتماد لو فيه توصيات ذكية لسه suggested (Phase 4)", () => {
    const content = mapAnalysisToBrainContent(baseAnalysis());
    const r = checkApprovalGate({
      content,
      sectionReviews: {},
      missingInfoDispositions: {
        "0": { state: "resolved", by: null, at: "" },
        "1": { state: "resolved", by: null, at: "" },
      },
      assumptionDispositions: {
        "0": { state: "accepted", by: null, at: "" },
        "1": { state: "accepted", by: null, at: "" },
      },
      pendingRecommendationsCount: 2,
    });
    expect(r.canApprove).toBe(false);
    expect(r.blockers.some((b) => b.includes("توصية ذكية"))).toBe(true);
  });

  it("يسمح بالاعتماد لو pendingRecommendationsCount = 0", () => {
    const content = mapAnalysisToBrainContent(baseAnalysis());
    const r = checkApprovalGate({
      content,
      sectionReviews: {},
      missingInfoDispositions: {
        "0": { state: "resolved", by: null, at: "" },
        "1": { state: "resolved", by: null, at: "" },
      },
      assumptionDispositions: {
        "0": { state: "accepted", by: null, at: "" },
        "1": { state: "accepted", by: null, at: "" },
      },
      pendingRecommendationsCount: 0,
    });
    expect(r.canApprove).toBe(true);
  });

  it("يمنع الاعتماد لو فيه عناصر Brain Review لسه pending_review (Phase 5)", () => {
    const content = mapAnalysisToBrainContent(baseAnalysis());
    const r = checkApprovalGate({
      content,
      sectionReviews: {},
      missingInfoDispositions: {
        "0": { state: "resolved", by: null, at: "" },
        "1": { state: "resolved", by: null, at: "" },
      },
      assumptionDispositions: {
        "0": { state: "accepted", by: null, at: "" },
        "1": { state: "accepted", by: null, at: "" },
      },
      pendingReviewObjectsCount: 3,
    });
    expect(r.canApprove).toBe(false);
    expect(r.blockers.some((b) => b.includes("مراجعة فردية"))).toBe(true);
  });

  it("يمنع الاعتماد لو فيه مشاكل حرجة/عالية في تحقّق Brain Review (Phase 5)", () => {
    const content = mapAnalysisToBrainContent(baseAnalysis());
    const r = checkApprovalGate({
      content,
      sectionReviews: {},
      missingInfoDispositions: {
        "0": { state: "resolved", by: null, at: "" },
        "1": { state: "resolved", by: null, at: "" },
      },
      assumptionDispositions: {
        "0": { state: "accepted", by: null, at: "" },
        "1": { state: "accepted", by: null, at: "" },
      },
      criticalValidationIssuesCount: 1,
    });
    expect(r.canApprove).toBe(false);
    expect(r.blockers.some((b) => b.includes("حرجة"))).toBe(true);
  });

  it("يمنع الاعتماد لو فيه عناصر محتاجة إعادة تحقّق (Phase 5)", () => {
    const content = mapAnalysisToBrainContent(baseAnalysis());
    const r = checkApprovalGate({
      content,
      sectionReviews: {},
      missingInfoDispositions: {
        "0": { state: "resolved", by: null, at: "" },
        "1": { state: "resolved", by: null, at: "" },
      },
      assumptionDispositions: {
        "0": { state: "accepted", by: null, at: "" },
        "1": { state: "accepted", by: null, at: "" },
      },
      needsRevalidationCount: 2,
    });
    expect(r.canApprove).toBe(false);
    expect(r.blockers.some((b) => b.includes("إعادة تحقّق"))).toBe(true);
  });

  it("يمنع الاعتماد لو فيه assumption pending", () => {
    const content = mapAnalysisToBrainContent(baseAnalysis());
    const r = checkApprovalGate({
      content,
      sectionReviews: {},
      missingInfoDispositions: {
        "0": { state: "resolved", by: null, at: "" },
        "1": { state: "resolved", by: null, at: "" },
      },
      assumptionDispositions: {},
    });
    expect(r.canApprove).toBe(false);
    expect(r.blockers.some((b) => b.includes("افتراض"))).toBe(true);
  });
});

describe("pruneRejectedAssumptions", () => {
  it("يشيل فقط الافتراضات المرفوضة من المحتوى", () => {
    const content = mapAnalysisToBrainContent(baseAnalysis());
    const dispositions = {
      "0": { state: "accepted" as const, by: null, at: "" },
      "1": { state: "rejected" as const, by: null, at: "" },
    };
    const pruned = pruneRejectedAssumptions(content, dispositions);
    expect(pruned.assumptions.content).toHaveLength(1);
    expect(pruned.assumptions.content[0].statement).toBe("دفع محلي");
  });

  it("لا يمس القسم لو مفيش رفض", () => {
    const content = mapAnalysisToBrainContent(baseAnalysis());
    const pruned = pruneRejectedAssumptions(content, {});
    expect(pruned.assumptions.content).toHaveLength(2);
  });
});
