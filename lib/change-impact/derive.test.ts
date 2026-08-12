import { describe, expect, it } from "vitest";
import { computeImpact, type ImpactInput } from "./derive";
import type { RequirementRow } from "@/lib/product-definition/types";
import type { UserStoryRow, AcceptanceCriterionRow } from "@/lib/user-stories/types";
import type { EvaluationScenarioRow } from "@/lib/evaluation/types";
import type { EvidenceLinkRow } from "@/lib/evidence/types";

const NOW = "2026-08-08T10:00:00.000Z";
function req(id: string, over: Partial<RequirementRow> = {}): RequirementRow {
  return {
    id, projectId: "p", code: null, title: `Req ${id}`, description: "",
    requirementType: "functional", priority: "should", status: "approved",
    rationale: "", acceptanceHint: "", effortEstimate: "",
    linkedPersonaId: null, linkedFlowId: null, tags: [], sourceBrainItemKey: null,
    createdAt: NOW, updatedAt: NOW, createdBy: null, ...over,
  };
}
function story(id: string, over: Partial<UserStoryRow> = {}): UserStoryRow {
  return {
    id, projectId: "p", code: null, title: `Story ${id}`, asA: "", iWant: "", soThat: "",
    narrativeExtra: "", status: "approved", storyPoints: 3, businessValue: 50,
    riskLevel: "medium", linkedPersonaId: null, linkedFlowId: null,
    linkedRequirementId: null, tags: [],
    createdAt: NOW, updatedAt: NOW, createdBy: null, ...over,
  };
}
function ac(id: string, userStoryId: string): AcceptanceCriterionRow {
  return {
    id, userStoryId, projectId: "p", code: null, orderIndex: 1, title: `AC ${id}`,
    givenClause: "g", whenClause: "w", thenClause: "t", andConditions: [],
    status: "approved", notes: "", createdAt: NOW, updatedAt: NOW, createdBy: null,
  };
}
function scen(id: string, linkedStoryId: string | null): EvaluationScenarioRow {
  return {
    id, projectId: "p", code: null, title: `Scen ${id}`, description: "",
    category: "functional", severity: "medium", preconditions: "", steps: [],
    expectedResult: "", linkedStoryId, linkedFlowId: null, tags: [],
    createdAt: NOW, updatedAt: NOW, createdBy: null,
  };
}
function ev(id: string, sourceType: EvidenceLinkRow["sourceType"], sourceId: string): EvidenceLinkRow {
  return {
    id, projectId: "p", sourceType, sourceId,
    evidenceType: "problem_validation", evidenceId: "e", note: "دليل",
    createdAt: NOW, createdBy: null,
  };
}

describe("computeImpact", () => {
  const input: ImpactInput = {
    requirements: [req("r1"), req("r2")],
    stories: [
      story("s1", { linkedRequirementId: "r1" }),
      story("s2", { linkedRequirementId: "r1" }),
      story("s3", { linkedRequirementId: null }),
    ],
    acs: [
      ac("a1", "s1"), ac("a2", "s1"), ac("a3", "s2"),
    ],
    scenarios: [scen("sc1", "s1"), scen("sc2", "s2"), scen("sc3", null)],
    evidence: [
      ev("e1", "requirement", "r1"),
      ev("e2", "user_story", "s1"),
      ev("e3", "acceptance_criterion", "a1"),
    ],
  };

  it("Requirement فارغ = 0 impacts", () => {
    const r = computeImpact("requirement", "nonexistent", input);
    expect(r.totalImpacts).toBe(0);
  });

  it("Requirement r1: يجمع 2 قصص + 3 AC + 2 scenarios + 3 evidence (1 req + 1 story + 1 ac)", () => {
    const r = computeImpact("requirement", "r1", input);
    expect(r.directStories.length).toBe(2);
    expect(r.directAcs.length).toBe(3);
    expect(r.directEvaluations.length).toBe(2);
    expect(r.directEvidence.length).toBe(3);
    expect(r.totalImpacts).toBe(2 + 3 + 2 + 3);
  });

  it("Story s1: AC=2 + Scen=1 + Evidence=1", () => {
    const r = computeImpact("user_story", "s1", input);
    expect(r.directAcs.length).toBe(2);
    expect(r.directEvaluations.length).toBe(1);
    expect(r.directEvidence.length).toBe(1);
  });

  it("AC a1: Evidence=1 + Scen مرتبطة بـ s1 = 1", () => {
    const r = computeImpact("acceptance_criterion", "a1", input);
    expect(r.directEvidence.length).toBe(1);
    expect(r.directEvaluations.length).toBe(1);
  });
});
