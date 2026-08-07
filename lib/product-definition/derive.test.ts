import { describe, expect, it } from "vitest";
import {
  summarizePersonas,
  summarizeFlows,
  summarizeRequirements,
  deriveDefinitionReadiness,
} from "./derive";
import type { PersonaRow, UserFlowRow, RequirementRow } from "./types";

const NOW = "2026-08-07T10:00:00.000Z";

function persona(over: Partial<PersonaRow>): PersonaRow {
  return {
    id: "p", projectId: "prj", name: "n", role: "", segment: "SMB",
    jobsToBeDone: "", goals: "", pains: "", channels: [],
    techSavviness: 50, notes: "", isPrimary: false,
    createdAt: NOW, updatedAt: NOW, createdBy: null,
    ...over,
  };
}
function flow(over: Partial<UserFlowRow>): UserFlowRow {
  return {
    id: "f", projectId: "prj", personaId: null, name: "n",
    description: "", flowType: "primary", triggerEvent: "",
    successOutcome: "", steps: [], notes: "",
    createdAt: NOW, updatedAt: NOW, createdBy: null,
    ...over,
  };
}
function req(over: Partial<RequirementRow>): RequirementRow {
  return {
    id: "r", projectId: "prj", code: null, title: "t", description: "",
    requirementType: "functional", priority: "should", status: "draft",
    rationale: "", acceptanceHint: "", effortEstimate: "",
    linkedPersonaId: "some-persona", linkedFlowId: null, tags: [],
    createdAt: NOW, updatedAt: NOW, createdBy: null,
    ...over,
  };
}

describe("summarizePersonas", () => {
  it("فاضي = أصفار", () => {
    const s = summarizePersonas([]);
    expect(s.total).toBe(0);
    expect(s.avgTechSavviness).toBe(0);
    expect(s.primary).toBe(0);
  });
  it("segments متكرّرة بعد trim+lower تُعدّ مرة", () => {
    const s = summarizePersonas([
      persona({ segment: "SMB" }),
      persona({ segment: " smb " }),
      persona({ segment: "Enterprise" }),
    ]);
    expect(s.distinctSegments).toBe(2);
  });
  it("يحسب primary والمتوسط", () => {
    const s = summarizePersonas([
      persona({ isPrimary: true, techSavviness: 80 }),
      persona({ isPrimary: false, techSavviness: 20 }),
    ]);
    expect(s.primary).toBe(1);
    expect(s.avgTechSavviness).toBe(50);
  });
});

describe("summarizeFlows", () => {
  it("متوسط الخطوات صحيح", () => {
    const s = summarizeFlows([
      flow({ steps: [] }),
      flow({ steps: [{ order: 1, action: "a", expectedResult: "b", notes: "" }] }),
      flow({ steps: [
        { order: 1, action: "a", expectedResult: "b", notes: "" },
        { order: 2, action: "c", expectedResult: "d", notes: "" },
      ] }),
    ]);
    expect(s.avgSteps).toBe(1);
    expect(s.byType.primary).toBe(3);
  });
  it("يعدّ linkedToPersona صح", () => {
    const s = summarizeFlows([
      flow({ personaId: "x" }),
      flow({ personaId: "y" }),
      flow({ personaId: null }),
    ]);
    expect(s.linkedToPersona).toBe(2);
  });
});

describe("summarizeRequirements", () => {
  it("فاضي = أصفار + mustRatio صفر", () => {
    const s = summarizeRequirements([]);
    expect(s.total).toBe(0);
    expect(s.mustRatio).toBe(0);
  });
  it("يحسب MoSCoW ratio ويستثني wont من المقام", () => {
    const s = summarizeRequirements([
      req({ priority: "must" }),
      req({ priority: "must" }),
      req({ priority: "should" }),
      req({ priority: "could" }),
      req({ priority: "wont" }),   // مستثنى من scoped
    ]);
    // scoped = 4 (must+should+could), must=2 → 50%
    expect(s.mustRatio).toBe(50);
  });
  it("orphans = بدون persona ولا flow", () => {
    const s = summarizeRequirements([
      req({ linkedPersonaId: null, linkedFlowId: null }),
      req({ linkedPersonaId: "x", linkedFlowId: null }),
      req({ linkedPersonaId: null, linkedFlowId: "y" }),
    ]);
    expect(s.orphans).toBe(1);
  });
  it("يفصل functional/non-functional", () => {
    const s = summarizeRequirements([
      req({ requirementType: "functional" }),
      req({ requirementType: "functional" }),
      req({ requirementType: "non_functional" }),
    ]);
    expect(s.functional).toBe(2);
    expect(s.nonFunctional).toBe(1);
  });
});

describe("deriveDefinitionReadiness", () => {
  it("فاضي = 0 وليس جاهز", () => {
    const r = deriveDefinitionReadiness([], [], []);
    expect(r.score).toBe(0);
    expect(r.ready).toBe(false);
  });
  it("تعريف كامل الجودة = 100 وجاهز", () => {
    const personas = [persona({ isPrimary: true })];
    const flows = [flow({ flowType: "primary" })];
    // 5 approved + must ratio 40% (2/5) + كلهم مرتبطين بـ persona
    const reqs = [
      req({ status: "approved", priority: "must" }),
      req({ status: "approved", priority: "must" }),
      req({ status: "approved", priority: "should" }),
      req({ status: "approved", priority: "should" }),
      req({ status: "done",     priority: "could" }),
    ];
    const r = deriveDefinitionReadiness(personas, flows, reqs);
    expect(r.checks.hasPrimaryPersonaOk).toBe(true);
    expect(r.checks.hasPrimaryFlowOk).toBe(true);
    expect(r.checks.minApprovedReqsOk).toBe(true);
    expect(r.checks.healthyMustRatioOk).toBe(true);
    expect(r.checks.lowOrphanRatioOk).toBe(true);
    expect(r.score).toBe(100);
    expect(r.ready).toBe(true);
  });
  it("mustRatio > 60% يفشل الفحص الصحّي", () => {
    const personas = [persona({ isPrimary: true })];
    const flows = [flow({ flowType: "primary" })];
    const reqs = [
      req({ status: "approved", priority: "must" }),
      req({ status: "approved", priority: "must" }),
      req({ status: "approved", priority: "must" }),
      req({ status: "approved", priority: "must" }),
      req({ status: "approved", priority: "should" }),
    ];
    const r = deriveDefinitionReadiness(personas, flows, reqs);
    expect(r.breakdown.mustRatio).toBe(80);
    expect(r.checks.healthyMustRatioOk).toBe(false);
    expect(r.score).toBe(20 + 20 + 25 + 20); // 85 (فقد 15)
  });
  it("orphans > 20% يفشل الفحص", () => {
    const personas = [persona({ isPrimary: true })];
    const flows = [flow({ flowType: "primary" })];
    const reqs = [
      req({ status: "approved", priority: "should", linkedPersonaId: null, linkedFlowId: null }),
      req({ status: "approved", priority: "should", linkedPersonaId: null, linkedFlowId: null }),
      req({ status: "approved", priority: "should", linkedPersonaId: "x" }),
      req({ status: "approved", priority: "should", linkedPersonaId: "y" }),
      req({ status: "approved", priority: "should", linkedPersonaId: "z" }),
    ];
    const r = deriveDefinitionReadiness(personas, flows, reqs);
    expect(r.breakdown.orphanRatio).toBe(40);
    expect(r.checks.lowOrphanRatioOk).toBe(false);
  });
});
