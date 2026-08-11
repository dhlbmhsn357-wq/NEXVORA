import { describe, expect, it } from "vitest";
import { autoDeriveChecklistStates } from "./auto-derive";
import { computeAllReadiness } from "./compute";
import { WORKFLOW_V2_CHECKLISTS } from "@/lib/workflow-v2";

describe("auto-derive / empty input", () => {
  it("يرجع كل العناصر not_started ونسب صفر", () => {
    const states = autoDeriveChecklistStates({});
    for (const stageKey of Object.keys(states) as Array<keyof typeof states>) {
      const arr = states[stageKey]!;
      for (const item of arr) expect(item.status).toBe("not_started");
    }
    const metrics = computeAllReadiness(states);
    for (const m of metrics) expect(m.percentage).toBe(0);
  });
});

describe("auto-derive / fully populated", () => {
  it("العناصر الإلزامية المشتقّة مكتملة والنسب > 0", () => {
    const states = autoDeriveChecklistStates({
      project: { id: "p1", stage: "in_progress", owner_id: "u1" },
      hasDiscoveryForm: true,
      discoveryLinkSentCount: 2,
      discoverySubmittedCount: 1,
      meetingPrepCount: 1,
      meetingsCount: 3,
      discoveryAnalysisExists: true,
      brainDoc: { status: "approved", version: 3 },
      brainReviewApproved: true,
      smartRecommendationsResolvedCount: 5,
      smartRecommendationsPendingCount: 0,
      problemValidationCount: 4,
      verifiedProblemValidationCount: 3,
      personasCount: 3,
      userFlowsCount: 2,
      requirementsCount: 8,
      storiesCount: 5,
      acceptanceCriteriaCount: 12,
      marketResearchCount: 2,
      verifiedMarketResearchCount: 2,
      competitorResearchCount: 3,
      contractsCount: 1,
      studioConfigExists: true,
      studioContextPackExists: true,
      studioApprovedBriefExists: true,
      studioCodexPackExists: true,
      prototypeLink: "https://staging.example.com",
      prototypeReviewApproved: true,
      clientApprovals: [{ status: "decided", decision: "approved" }],
      handoffPackages: [{ status: "finalized" }],
      handoffMandatoryCompletedCount: 7,
      handoffMandatoryTotalCount: 7,
      decisionsCount: 3,
      risksCount: 2,
      scopeAndMvpMarked: true,
    });
    const metrics = computeAllReadiness(states);
    for (const m of metrics) expect(m.percentage).toBeGreaterThan(0);
  });
});

describe("auto-derive / partial (definition only)", () => {
  it("product_definition_ready > 0 والباقي 0", () => {
    const states = autoDeriveChecklistStates({
      personasCount: 2,
      userFlowsCount: 1,
      requirementsCount: 4,
      scopeAndMvpMarked: true,
    });
    const metrics = computeAllReadiness(states);
    const byKey = new Map(metrics.map((m) => [m.metric, m.percentage] as const));
    expect(byKey.get("product_definition_ready")!).toBeGreaterThan(0);
    expect(byKey.get("discovery_completeness")!).toBe(0);
    expect(byKey.get("problem_validation")!).toBe(0);
    expect(byKey.get("prototype_ready")!).toBe(0);
    expect(byKey.get("client_approval")!).toBe(0);
    expect(byKey.get("handoff_ready")!).toBe(0);
  });
});

describe("auto-derive / brainDoc approved fallback", () => {
  it("brain_review_approved يكتمل لو brainDoc.status='approved' حتى بدون brainReviewApproved", () => {
    const states = autoDeriveChecklistStates({
      brainDoc: { status: "approved" },
    });
    const analysis = states.analysis_and_validation!;
    const item = analysis.find((i) => i.itemKey === "brain_review_approved")!;
    expect(item.status).toBe("completed");
  });
});

describe("auto-derive / handoff mandatory completion", () => {
  it("mandatory_items مكتملة → evaluation_guide_ready = completed", () => {
    const states = autoDeriveChecklistStates({
      handoffPackages: [{ status: "finalized" }],
      handoffMandatoryCompletedCount: 7,
      handoffMandatoryTotalCount: 7,
    });
    const handoff = states.handoff_and_closure!;
    const eg = handoff.find((i) => i.itemKey === "evaluation_guide_ready")!;
    expect(eg.status).toBe("completed");
    const pd = handoff.find((i) => i.itemKey === "package_delivered")!;
    expect(pd.status).toBe("completed");
  });
});

describe("auto-derive / evidence-quality gating (0106+0109)", () => {
  it("raw problemValidationCount>0 لكن verified=0 → problem_validation & customer_interviews غير مكتملة", () => {
    const states = autoDeriveChecklistStates({
      problemValidationCount: 3,
      verifiedProblemValidationCount: 0,
    });
    const av = states.analysis_and_validation!;
    const dv = states.discovery_and_research!;
    expect(av.find((i) => i.itemKey === "problem_validation")!.status).toBe("not_started");
    expect(dv.find((i) => i.itemKey === "customer_interviews")!.status).toBe("not_started");
  });

  it("verifiedProblemValidationCount≥1 → problem_validation & customer_interviews مكتملة", () => {
    const states = autoDeriveChecklistStates({
      problemValidationCount: 3,
      verifiedProblemValidationCount: 1,
    });
    const av = states.analysis_and_validation!;
    const dv = states.discovery_and_research!;
    expect(av.find((i) => i.itemKey === "problem_validation")!.status).toBe("completed");
    expect(dv.find((i) => i.itemKey === "customer_interviews")!.status).toBe("completed");
  });

  it("raw marketResearchCount>0 لكن verified=0 → market_research غير مكتمل", () => {
    const states = autoDeriveChecklistStates({
      marketResearchCount: 5,
      verifiedMarketResearchCount: 0,
    });
    const dr = states.discovery_and_research!;
    expect(dr.find((i) => i.itemKey === "market_research")!.status).toBe("not_started");
  });

  it("verifiedMarketResearchCount≥1 → market_research مكتمل", () => {
    const states = autoDeriveChecklistStates({
      marketResearchCount: 5,
      verifiedMarketResearchCount: 2,
    });
    const dr = states.discovery_and_research!;
    expect(dr.find((i) => i.itemKey === "market_research")!.status).toBe("completed");
  });
});

describe("auto-derive / registry coverage", () => {
  it("كل عناصر كل مرحلة موجودة في الإخراج (لا يوجد ناقص)", () => {
    const states = autoDeriveChecklistStates({});
    for (const stageKey of Object.keys(WORKFLOW_V2_CHECKLISTS) as Array<
      keyof typeof WORKFLOW_V2_CHECKLISTS
    >) {
      const registryItems = WORKFLOW_V2_CHECKLISTS[stageKey];
      const derivedItems = states[stageKey]!;
      expect(derivedItems.length).toBe(registryItems.length);
      const derivedKeys = new Set(derivedItems.map((i) => i.itemKey));
      for (const r of registryItems) expect(derivedKeys.has(r.itemKey)).toBe(true);
    }
  });
});
