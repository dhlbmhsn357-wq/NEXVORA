import { describe, expect, it } from "vitest";
import {
  scoreStoryInvest, validateGherkin,
  summarizeStories, summarizeAcceptance,
  deriveStoriesReadiness,
} from "./derive";
import type { UserStoryRow, AcceptanceCriterionRow } from "./types";

const NOW = "2026-08-07T10:00:00.000Z";

function story(over: Partial<UserStoryRow>): UserStoryRow {
  return {
    id: "s", projectId: "prj", code: null, title: "t",
    asA: "مدير", iWant: "أن أعتمد الطلب بضغطة", soThat: "أوفّر وقت",
    narrativeExtra: "", status: "draft", storyPoints: 3, businessValue: 60,
    riskLevel: "medium", linkedPersonaId: null, linkedFlowId: null,
    linkedRequirementId: "req-x", tags: [],
    createdAt: NOW, updatedAt: NOW, createdBy: null,
    ...over,
  };
}
function ac(over: Partial<AcceptanceCriterionRow>): AcceptanceCriterionRow {
  return {
    id: "a", userStoryId: "s", projectId: "prj", code: null, orderIndex: 1, title: "",
    givenClause: "المستخدم مسجّل دخول", whenClause: "يضغط على الاعتماد",
    thenClause: "تظهر رسالة نجاح", andConditions: [],
    status: "draft", notes: "", createdAt: NOW, updatedAt: NOW, createdBy: null,
    ...over,
  };
}

// ---------------------------------------------------------------------------
describe("validateGherkin", () => {
  it("الثلاثة موجودين → ok", () => {
    const r = validateGherkin(ac({}));
    expect(r.ok).toBe(true);
    expect(r.missing).toEqual([]);
  });
  it("Given فاضي → missing يحتوي Given", () => {
    const r = validateGherkin(ac({ givenClause: "" }));
    expect(r.ok).toBe(false);
    expect(r.missing).toEqual(["Given"]);
  });
  it("الاتنين ناقصين", () => {
    const r = validateGherkin(ac({ givenClause: "", thenClause: "  " }));
    expect(r.missing).toEqual(["Given", "Then"]);
  });
});

describe("scoreStoryInvest", () => {
  it("قصة كاملة الجودة = 6", () => {
    const s = scoreStoryInvest(story({}), 2, 0);
    expect(s.score).toBe(6);
    expect(s.testable).toBe(true);
  });
  it("لا AC → غير قابلة للاختبار", () => {
    const s = scoreStoryInvest(story({}), 0, 0);
    expect(s.testable).toBe(false);
    expect(s.score).toBe(5);
  });
  it("story_points > 8 → مش Small", () => {
    const s = scoreStoryInvest(story({ storyPoints: 13 }), 1, 0);
    expect(s.small).toBe(false);
    expect(s.estimable).toBe(true);
  });
  it("business_value < 30 → مش Valuable", () => {
    const s = scoreStoryInvest(story({ businessValue: 20 }), 1, 0);
    expect(s.valuable).toBe(false);
  });
  it("Narrative طويل جدًا (>80 كلمة) → مش Negotiable", () => {
    const longText = "كلمة ".repeat(100).trim();
    const s = scoreStoryInvest(story({ iWant: longText }), 1, 0);
    expect(s.negotiable).toBe(false);
  });
  it("siblingLinkedCount > 1 → مش Independent", () => {
    const s = scoreStoryInvest(story({}), 1, 5);
    expect(s.independent).toBe(false);
  });
});

describe("summarizeStories", () => {
  it("فاضي = أصفار", () => {
    const s = summarizeStories([]);
    expect(s.total).toBe(0);
    expect(s.totalPoints).toBe(0);
    expect(s.avgBusinessValue).toBe(0);
  });
  it("يجمع points ويتجاهل null، ويحسب orphans", () => {
    const s = summarizeStories([
      story({ storyPoints: 3, linkedRequirementId: "r1" }),
      story({ storyPoints: 5, linkedRequirementId: null, linkedPersonaId: null, linkedFlowId: null }),
      story({ storyPoints: null, linkedRequirementId: "r2" }),
    ]);
    expect(s.totalPoints).toBe(8);
    expect(s.orphans).toBe(1);
    expect(s.linkedToRequirementCount).toBe(2);
  });
});

describe("summarizeAcceptance", () => {
  it("يحسب valid vs invalid Gherkin", () => {
    const acs = [
      ac({ userStoryId: "s1" }),
      ac({ userStoryId: "s1", givenClause: "" }),   // invalid
      ac({ userStoryId: "s2" }),
    ];
    const r = summarizeAcceptance(acs, ["s1", "s2"]);
    expect(r.total).toBe(3);
    expect(r.validGherkinCount).toBe(2);
    expect(r.invalidGherkinCount).toBe(1);
    expect(r.storiesWithAcCount).toBe(2);
  });
  it("AC من قصة خارج المشروع لا تُعدّ في storiesWithAcCount", () => {
    const acs = [ac({ userStoryId: "outsider" })];
    const r = summarizeAcceptance(acs, ["s1"]);
    expect(r.storiesWithAcCount).toBe(0);
  });
});

describe("deriveStoriesReadiness", () => {
  it("فاضي = 0 وليس جاهز", () => {
    const r = deriveStoriesReadiness([], []);
    expect(r.score).toBe(0);
    expect(r.ready).toBe(false);
  });
  it("مشروع كامل الجاهزية = 100 وجاهز", () => {
    const stories = [
      story({ id: "s1", status: "approved" }),
      story({ id: "s2", status: "approved" }),
      story({ id: "s3", status: "in_dev" }),
    ];
    const acs = [
      ac({ userStoryId: "s1" }),
      ac({ userStoryId: "s2" }),
      ac({ userStoryId: "s3" }),
    ];
    const r = deriveStoriesReadiness(stories, acs);
    expect(r.checks.minApprovedOk).toBe(true);
    expect(r.checks.acCoverageOk).toBe(true);
    expect(r.checks.gherkinValidityOk).toBe(true);
    expect(r.checks.avgInvestOk).toBe(true);
    expect(r.checks.lowOrphansOk).toBe(true);
    expect(r.score).toBe(100);
    expect(r.ready).toBe(true);
  });
  it("قصة معتمدة بدون AC → التغطية أقل من 80% تفشل", () => {
    const stories = [
      story({ id: "s1", status: "approved" }),
      story({ id: "s2", status: "approved" }),
      story({ id: "s3", status: "approved" }),
    ];
    const acs = [ac({ userStoryId: "s1" })];
    const r = deriveStoriesReadiness(stories, acs);
    expect(r.breakdown.acCoveragePercent).toBe(33);   // 1/3
    expect(r.checks.acCoverageOk).toBe(false);
  });
  it("AC مكسور الصيغة يخفّض النسبة", () => {
    const stories = [story({ id: "s1", status: "approved" })];
    const acs = [
      ac({ userStoryId: "s1" }),
      ac({ userStoryId: "s1", givenClause: "", thenClause: "" }),  // invalid
    ];
    const r = deriveStoriesReadiness(stories, acs);
    expect(r.breakdown.gherkinValidityPercent).toBe(50);
    expect(r.checks.gherkinValidityOk).toBe(false);
  });
});
