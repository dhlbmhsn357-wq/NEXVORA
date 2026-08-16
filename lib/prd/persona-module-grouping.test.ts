import { describe, it, expect } from "vitest";
import { groupByPersona, GENERAL_MODULE_LABEL } from "./persona-module-grouping";
import type { PersonaRow, RequirementRow, UserFlowRow } from "@/lib/product-definition/types";
import type { UserStoryRow } from "@/lib/user-stories/types";
import type { BusinessRuleRow, SystemMessageRow } from "@/lib/product-definition/business-rules-types";

function persona(id: string, name: string, role = ""): PersonaRow {
  return {
    id,
    projectId: "p1",
    name,
    role,
    segment: "",
    jobsToBeDone: "",
    goals: "",
    pains: "",
    channels: [],
    techSavviness: 50,
    notes: "",
    isPrimary: false,
    sourceBrainItemKey: null,
    createdAt: "",
    updatedAt: "",
    createdBy: null,
  };
}

function story(id: string, linkedPersonaId: string | null): UserStoryRow {
  return {
    id,
    projectId: "p1",
    code: `US-${id}`,
    title: `قصة ${id}`,
    asA: "مستخدم",
    iWant: "أفعل شيئًا",
    soThat: "أحقق هدفًا",
    narrativeExtra: "",
    status: "draft",
    storyPoints: null,
    businessValue: 50,
    riskLevel: "medium",
    linkedPersonaId,
    linkedFlowId: null,
    linkedRequirementId: null,
    tags: [],
    createdAt: "",
    updatedAt: "",
    createdBy: null,
  };
}

function requirement(id: string, linkedPersonaId: string | null): RequirementRow {
  return {
    id,
    projectId: "p1",
    code: `REQ-${id}`,
    title: `متطلب ${id}`,
    description: "",
    requirementType: "functional",
    priority: "must",
    status: "draft",
    rationale: "",
    acceptanceHint: "",
    effortEstimate: "",
    linkedPersonaId,
    linkedFlowId: null,
    tags: [],
    sourceBrainItemKey: null,
    createdAt: "",
    updatedAt: "",
    createdBy: null,
  };
}

function businessRule(id: string, linkedPersonaId: string | null): BusinessRuleRow {
  return {
    id,
    projectId: "p1",
    title: `قاعدة ${id}`,
    triggerCondition: "",
    thresholdValue: "",
    onViolation: "",
    enforcementPoint: "server",
    linkedFlowId: null,
    linkedPersonaId,
    notes: "",
    createdAt: "",
    updatedAt: "",
    createdBy: null,
  };
}

function systemMessage(id: string, linkedPersonaId: string | null): SystemMessageRow {
  return {
    id,
    projectId: "p1",
    eventName: `حدث ${id}`,
    messageType: "info",
    messageText: "",
    linkedFlowId: null,
    linkedPersonaId,
    notes: "",
    createdAt: "",
    updatedAt: "",
    createdBy: null,
  };
}

function flow(id: string, personaId: string | null): UserFlowRow {
  return {
    id,
    projectId: "p1",
    personaId,
    name: `تدفّق ${id}`,
    description: "",
    flowType: "primary",
    triggerEvent: "",
    successOutcome: "",
    steps: [],
    notes: "",
    createdAt: "",
    updatedAt: "",
    createdBy: null,
  };
}

describe("groupByPersona", () => {
  it("يجمّع كل عنصر تحت الشخصية المرتبطة بيه بشكل صحيح", () => {
    const personas = [persona("pa", "الطالب"), persona("pb", "المعلّم")];
    const result = groupByPersona(
      personas,
      [story("s1", "pa"), story("s2", "pb")],
      [requirement("r1", "pa")],
      [businessRule("b1", "pb")],
      [systemMessage("m1", "pa")],
      [flow("f1", "pb")]
    );

    const student = result.find((m) => m.personaId === "pa")!;
    const teacher = result.find((m) => m.personaId === "pb")!;

    expect(student.userStories.map((s) => s.id)).toEqual(["s1"]);
    expect(student.requirements.map((r) => r.id)).toEqual(["r1"]);
    expect(student.systemMessages.map((m) => m.id)).toEqual(["m1"]);
    expect(teacher.userStories.map((s) => s.id)).toEqual(["s2"]);
    expect(teacher.businessRules.map((b) => b.id)).toEqual(["b1"]);
    expect(teacher.flowSpecifications.map((f) => f.flowId)).toEqual(["f1"]);
  });

  it("عناصر بدون ربط شخصية تروح لموديول 'عام' — ولا يتم إسقاطها أبدًا", () => {
    const personas = [persona("pa", "الطالب")];
    const result = groupByPersona(
      personas,
      [story("s1", "pa"), story("s2", null)],
      [requirement("r1", null)],
      [],
      [],
      []
    );

    const general = result.find((m) => m.personaId === null);
    expect(general).toBeDefined();
    expect(general!.personaName).toBe(GENERAL_MODULE_LABEL);
    expect(general!.userStories.map((s) => s.id)).toEqual(["s2"]);
    expect(general!.requirements.map((r) => r.id)).toEqual(["r1"]);
  });

  it("عنصر مربوط بشخصية غير موجودة فعليًا (orphan) يروح لموديول 'عام' بدل ما يختفي", () => {
    const personas = [persona("pa", "الطالب")];
    const result = groupByPersona(personas, [story("s1", "ghost-persona")], [], [], [], []);
    const general = result.find((m) => m.personaId === null);
    expect(general).toBeDefined();
    expect(general!.userStories.map((s) => s.id)).toEqual(["s1"]);
    const student = result.find((m) => m.personaId === "pa")!;
    expect(student.userStories).toEqual([]);
  });

  it("لا يتم إسقاط أي عنصر إطلاقًا — إجمالي العناصر في المخرَج = إجمالي المدخلات", () => {
    const personas = [persona("pa", "الطالب"), persona("pb", "المعلّم")];
    const stories = [story("s1", "pa"), story("s2", "pb"), story("s3", null), story("s4", "ghost")];
    const requirements = [requirement("r1", "pa"), requirement("r2", null)];
    const rules = [businessRule("b1", "pb"), businessRule("b2", null)];
    const messages = [systemMessage("m1", "pa"), systemMessage("m2", null)];
    const flows = [flow("f1", "pb"), flow("f2", null)];

    const result = groupByPersona(personas, stories, requirements, rules, messages, flows);

    const totalOut = result.reduce(
      (sum, m) =>
        sum +
        m.userStories.length +
        m.requirements.length +
        m.businessRules.length +
        m.systemMessages.length +
        m.flowSpecifications.length,
      0
    );
    const totalIn = stories.length + requirements.length + rules.length + messages.length + flows.length;
    expect(totalOut).toBe(totalIn);
  });

  it("شخصية مسجّلة بدون أي عنصر مرتبط لسه بتظهر كموديول فاضي مستقل", () => {
    const personas = [persona("pa", "الطالب"), persona("pb", "المعلّم")];
    const result = groupByPersona(personas, [story("s1", "pa")], [], [], [], []);

    const teacher = result.find((m) => m.personaId === "pb");
    expect(teacher).toBeDefined();
    expect(teacher!.userStories).toEqual([]);
    expect(teacher!.requirements).toEqual([]);
  });

  it("موديول 'عام' مايظهرش لو مفيش أي محتوى غير مرتبط أصلًا", () => {
    const personas = [persona("pa", "الطالب")];
    const result = groupByPersona(personas, [story("s1", "pa")], [], [], [], []);
    expect(result.find((m) => m.personaId === null)).toBeUndefined();
  });

  it("ترتيب الموديولات يطابق ترتيب مصفوفة personas المُمرَّرة، وموديول 'عام' دايمًا آخر عنصر", () => {
    const personas = [persona("pb", "المعلّم"), persona("pa", "الطالب")];
    const result = groupByPersona(personas, [story("s1", null)], [], [], [], []);
    expect(result.map((m) => m.personaId)).toEqual(["pb", "pa", null]);
  });

  it("صفر شخصيات مسجّلة → كل المحتوى يروح لـ 'عام' بدون رمي أي استثناء", () => {
    expect(() => groupByPersona([], [story("s1", null)], [requirement("r1", null)], [], [], [])).not.toThrow();
    const result = groupByPersona([], [story("s1", null)], [requirement("r1", null)], [], [], []);
    expect(result).toHaveLength(1);
    expect(result[0].personaId).toBeNull();
    expect(result[0].userStories.map((s) => s.id)).toEqual(["s1"]);
    expect(result[0].requirements.map((r) => r.id)).toEqual(["r1"]);
  });

  it("صفر شخصيات وصفر عناصر → مصفوفة فاضية بدون throw", () => {
    expect(() => groupByPersona([], [], [], [], [], [])).not.toThrow();
    expect(groupByPersona([], [], [], [], [], [])).toEqual([]);
  });
});
