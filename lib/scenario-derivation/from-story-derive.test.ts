import { describe, expect, it } from "vitest";
import {
  planScenariosFromInputs,
  planScenarioForSingleStory,
  deriveScenarioDraft,
  deriveSeverityFromStory,
  buildStepsFromStoryAndAc,
} from "./from-story-derive";
import type { UserStoryRow, AcceptanceCriterionRow } from "@/lib/user-stories/types";
import type { EvaluationScenarioRow } from "@/lib/evaluation/types";

const NOW = "2026-08-07T10:00:00.000Z";

function story(over: Partial<UserStoryRow>): UserStoryRow {
  return {
    id: "s1", projectId: "prj", code: "US-1", title: "اعتماد الطلب",
    asA: "مدير المشتريات", iWant: "أعتمد الطلب بضغطة", soThat: "أوفّر وقت",
    narrativeExtra: "", status: "approved", storyPoints: 3, businessValue: 60,
    riskLevel: "medium", linkedPersonaId: null, linkedFlowId: null,
    linkedRequirementId: null, tags: [],
    createdAt: NOW, updatedAt: NOW, createdBy: null,
    ...over,
  };
}

function ac(over: Partial<AcceptanceCriterionRow>): AcceptanceCriterionRow {
  return {
    id: "a1", userStoryId: "s1", projectId: "prj", code: null, orderIndex: 1, title: "",
    givenClause: "المستخدم داخل", whenClause: "يضغط اعتماد", thenClause: "تظهر رسالة نجاح",
    andConditions: [], status: "draft", notes: "", createdAt: NOW, updatedAt: NOW, createdBy: null,
    ...over,
  };
}

function scen(over: Partial<EvaluationScenarioRow>): EvaluationScenarioRow {
  return {
    id: "sc1", projectId: "prj", code: null, title: "t", description: "",
    category: "usability", severity: "medium", preconditions: "", steps: [],
    expectedResult: "", linkedStoryId: null, linkedFlowId: null, tags: [],
    createdAt: NOW, updatedAt: NOW, createdBy: null,
    ...over,
  };
}

describe("deriveSeverityFromStory", () => {
  it("high risk → high severity", () => {
    expect(deriveSeverityFromStory(story({ riskLevel: "high" }))).toBe("high");
  });
  it("medium risk → medium severity", () => {
    expect(deriveSeverityFromStory(story({ riskLevel: "medium" }))).toBe("medium");
  });
  it("low risk → low severity", () => {
    expect(deriveSeverityFromStory(story({ riskLevel: "low" }))).toBe("low");
  });
});

describe("buildStepsFromStoryAndAc", () => {
  it("مفيش AC → قالب عام من 3 خطوات", () => {
    const steps = buildStepsFromStoryAndAc(story({}), []);
    expect(steps).toHaveLength(3);
    expect(steps[0].order).toBe(1);
    expect(steps[0].action).toContain("اعتماد الطلب");
  });
  it("عندها AC → خطوات من whenClause و andConditions", () => {
    const steps = buildStepsFromStoryAndAc(story({}), [
      ac({ whenClause: "يضغط اعتماد", andConditions: ["يُرسَل إشعار", "يُسجَّل الحدث"] }),
    ]);
    expect(steps.map((s) => s.action)).toEqual([
      "يضغط اعتماد",
      "يُرسَل إشعار",
      "يُسجَّل الحدث",
    ]);
    expect(steps[0].order).toBe(1);
    expect(steps[2].order).toBe(3);
  });
  it("AC بترتيب متعدد → مرتّبة حسب orderIndex", () => {
    const steps = buildStepsFromStoryAndAc(story({}), [
      ac({ id: "a2", orderIndex: 2, whenClause: "خطوة B" }),
      ac({ id: "a1", orderIndex: 1, whenClause: "خطوة A" }),
    ]);
    expect(steps.map((s) => s.action)).toEqual(["خطوة A", "خطوة B"]);
  });
  it("AC فارغة (whenClause فاضي) → fallback عام", () => {
    const steps = buildStepsFromStoryAndAc(story({}), [ac({ whenClause: "", andConditions: [] })]);
    expect(steps).toHaveLength(3);
  });
});

describe("deriveScenarioDraft", () => {
  it("يبني عنوان ووصف ومتوقّع من القصة", () => {
    const d = deriveScenarioDraft(story({}), []);
    expect(d.suggestedTitle).toBe("اختبار: اعتماد الطلب");
    expect(d.suggestedDescription).toContain("مدير المشتريات");
    expect(d.suggestedDescription).toContain("أعتمد الطلب");
    expect(d.suggestedExpectedResult).toBe("أوفّر وقت");
    expect(d.suggestedCategory).toBe("usability");
    expect(d.linkedStoryId).toBe("s1");
    expect(d.storyCode).toBe("US-1");
  });
  it("soThat فاضي → fallback من iWant", () => {
    const d = deriveScenarioDraft(story({ soThat: "" }), []);
    expect(d.suggestedExpectedResult).toContain("أعتمد الطلب");
  });
});

describe("planScenariosFromInputs", () => {
  it("مفيش قصص معتمدة → خطة فارغة", () => {
    const p = planScenariosFromInputs(
      [story({ status: "draft" }), story({ id: "s2", status: "in_review" })],
      [],
      [],
    );
    expect(p.toCreate).toHaveLength(0);
    expect(p.skipped).toHaveLength(2);
    expect(p.skipped.every((s) => s.reason === "not_approved")).toBe(true);
  });

  it("3 قصص معتمدة، واحدة عندها سيناريو → توليد 2", () => {
    const stories = [
      story({ id: "s1", status: "approved" }),
      story({ id: "s2", status: "in_dev" }),
      story({ id: "s3", status: "done" }),
    ];
    const existing = [scen({ id: "sc1", linkedStoryId: "s2" })];
    const p = planScenariosFromInputs(stories, existing, []);
    expect(p.toCreate).toHaveLength(2);
    expect(p.toCreate.map((d) => d.linkedStoryId).sort()).toEqual(["s1", "s3"]);
    expect(p.skipped).toHaveLength(1);
    expect(p.skipped[0]).toMatchObject({ storyId: "s2", reason: "already_has_scenario" });
  });

  it("Idempotent — بعد افتراض إنشاء السيناريوهات لا يُنشئ شيئًا جديدًا", () => {
    const stories = [story({ id: "s1" }), story({ id: "s2" })];
    // أول جولة: مفيش سيناريوهات
    const first = planScenariosFromInputs(stories, [], []);
    expect(first.toCreate).toHaveLength(2);
    // بنمثّل أن الجولة الأولى أُنشئت سيناريوهاتها ونعيد التخطيط
    const afterApply = first.toCreate.map((d) => scen({ linkedStoryId: d.linkedStoryId }));
    const second = planScenariosFromInputs(stories, afterApply, []);
    expect(second.toCreate).toHaveLength(0);
    expect(second.skipped).toHaveLength(2);
  });

  it("قصة archived → تُتجاهل", () => {
    const p = planScenariosFromInputs([story({ status: "archived" })], [], []);
    expect(p.toCreate).toHaveLength(0);
    expect(p.skipped[0].reason).toBe("not_approved");
  });

  it("severity mapping ينعكس على toCreate", () => {
    const p = planScenariosFromInputs(
      [
        story({ id: "s1", riskLevel: "high" }),
        story({ id: "s2", riskLevel: "medium" }),
        story({ id: "s3", riskLevel: "low" }),
      ],
      [],
      [],
    );
    const bySeverity = new Map(p.toCreate.map((d) => [d.linkedStoryId, d.suggestedSeverity]));
    expect(bySeverity.get("s1")).toBe("high");
    expect(bySeverity.get("s2")).toBe("medium");
    expect(bySeverity.get("s3")).toBe("low");
  });

  it("steps مأخوذة من AC للقصة المطابقة فقط", () => {
    const p = planScenariosFromInputs(
      [story({ id: "s1" })],
      [],
      [
        ac({ userStoryId: "s1", whenClause: "خطوة أ" }),
        ac({ userStoryId: "s-other", whenClause: "لا تُدخَل" }),
      ],
    );
    expect(p.toCreate[0].suggestedSteps.map((s) => s.action)).toEqual(["خطوة أ"]);
  });
});

describe("planScenarioForSingleStory", () => {
  it("قصة معتمدة بلا سيناريو → toCreate واحد", () => {
    const p = planScenarioForSingleStory(story({}), [], []);
    expect(p.toCreate).toHaveLength(1);
  });
  it("قصة عندها سيناريو → skipped", () => {
    const p = planScenarioForSingleStory(story({ id: "s1" }), [scen({ linkedStoryId: "s1" })], []);
    expect(p.toCreate).toHaveLength(0);
    expect(p.skipped[0].reason).toBe("already_has_scenario");
  });
});
