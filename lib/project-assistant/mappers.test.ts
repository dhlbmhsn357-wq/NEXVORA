import { describe, it, expect } from "vitest";
import {
  buildKnowledgeEntryForBusinessRule,
  buildKnowledgeEntryForUserStory,
  buildKnowledgeEntryForAcceptanceCriterion,
  buildKnowledgeEntryForMarketResearchEvidence,
  buildKnowledgeEntryForProblemValidationEvidence,
  buildKnowledgeEntryForMeetingDecision,
  buildKnowledgeEntryForKnowledgeDecision,
  buildKnowledgeEntryForRisk,
  buildKnowledgeEntryForSystemMessage,
  buildKnowledgeEntryForProposal,
  buildKnowledgeEntryForTask,
} from "./mappers";

describe("buildKnowledgeEntryForBusinessRule", () => {
  it("يبني content ويحدد object_type='business_rule' وconfidentiality='internal' افتراضيًا", () => {
    const draft = buildKnowledgeEntryForBusinessRule({
      id: "r1",
      project_id: "p1",
      title: "حد السحب اليومي",
      trigger_condition: "المبلغ > الرصيد",
      threshold_value: "5000 جنيه",
      on_violation: "منع العملية",
      enforcement_point: "server",
    });
    expect(draft.objectType).toBe("business_rule");
    expect(draft.objectId).toBe("r1");
    expect(draft.confidentiality).toBe("internal");
    expect(draft.content).toContain("حد السحب اليومي");
    expect(draft.content).toContain("المبلغ > الرصيد");
    expect(draft.content).toContain("server");
  });
});

describe("buildKnowledgeEntryForUserStory", () => {
  it("يبني نص القصة بصيغة بصفتي/أريد/لكي ويحمل كود القصة في العنوان", () => {
    const draft = buildKnowledgeEntryForUserStory({
      id: "s1",
      project_id: "p1",
      code: "US-041",
      title: "تسجيل دخول الطالب",
      as_a: "طالب",
      i_want: "أسجّل دخول بسرعة",
      so_that: "أوصل لموادّي فورًا",
      status: "approved",
    });
    expect(draft.objectType).toBe("user_story");
    expect(draft.content).toBe(
      "قصة مستخدم [US-041]: بصفتي طالب، أريد أسجّل دخول بسرعة، لكي أوصل لموادّي فورًا. الحالة: approved."
    );
    expect(draft.sourceTitle).toContain("US-041");
    expect(draft.status).toBe("approved");
  });
});

describe("buildKnowledgeEntryForAcceptanceCriterion", () => {
  it("يبني نص Given/When/Then بالعربي", () => {
    const draft = buildKnowledgeEntryForAcceptanceCriterion({
      id: "ac1",
      project_id: "p1",
      user_story_id: "s1",
      title: "دخول ناجح",
      given_clause: "بيانات صحيحة",
      when_clause: "يضغط دخول",
      then_clause: "يوصل للوحة التحكم",
      status: "verified",
    });
    expect(draft.objectType).toBe("acceptance_criteria");
    expect(draft.content).toContain("بفرض بيانات صحيحة");
    expect(draft.content).toContain("عندما يضغط دخول");
    expect(draft.content).toContain("إذن يوصل للوحة التحكم");
    expect(draft.metadata.userStoryId).toBe("s1");
  });
});

describe("evidence mappers — تصنيف/سرّية موروثين لا مُخترعين", () => {
  it("market research: بيورّث information_class وconfidentiality من الصف نفسه", () => {
    const draft = buildKnowledgeEntryForMarketResearchEvidence({
      id: "m1",
      project_id: "p1",
      item_type: "direct_competitor",
      title: "منافس أ",
      summary: "منافس مباشر قوي",
      information_class: "fact",
      confidentiality: "confidential",
    });
    expect(draft.objectType).toBe("evidence");
    expect(draft.classification).toBe("fact");
    expect(draft.confidentiality).toBe("confidential");
  });

  it("problem validation: نفس المبدأ + الاقتباس في المحتوى", () => {
    const draft = buildKnowledgeEntryForProblemValidationEvidence({
      id: "v1",
      project_id: "p1",
      evidence_type: "user_interview",
      title: "مقابلة عميل ١",
      pain_point: "بطء التسجيل",
      quote: "التسجيل بياخد وقت كتير",
      information_class: "verified",
      confidentiality: "internal",
    });
    expect(draft.classification).toBe("verified");
    expect(draft.confidentiality).toBe("internal");
    expect(draft.content).toContain("بطء التسجيل");
    expect(draft.content).toContain('"التسجيل بياخد وقت كتير"');
  });
});

describe("decision mappers", () => {
  it("meeting_decision: بيحمل الحالة وmetadata.supersededById", () => {
    const draft = buildKnowledgeEntryForMeetingDecision({
      id: "d1",
      project_id: "p1",
      meeting_id: "mt1",
      text: "استخدام Postgres بدل MongoDB",
      status: "superseded",
      superseded_by_id: "d2",
      change_reason: "احتياج علاقات معقدة",
    });
    expect(draft.objectType).toBe("decision");
    expect(draft.status).toBe("superseded");
    expect(draft.metadata.supersededById).toBe("d2");
  });

  it("knowledge_decision: الحالة reversed بتتحمل زي ما هي", () => {
    const draft = buildKnowledgeEntryForKnowledgeDecision({
      id: "kd1",
      project_id: "p1",
      decision: "استخدام Stripe للدفع",
      rationale: "أرخص عمولة",
      decision_maker: "مدير المنتج",
      impact: "يحتاج تكامل جديد",
      status: "reversed",
    });
    expect(draft.status).toBe("reversed");
    expect(draft.content).toContain("مدير المنتج");
  });
});

describe("buildKnowledgeEntryForRisk", () => {
  it("يدمج الاحتمالية والشدة والتخفيف في نص واحد", () => {
    const draft = buildKnowledgeEntryForRisk({
      id: "rk1",
      project_id: "p1",
      description: "فشل مزوّد الدفع وقت الذروة",
      risk_type: "technical",
      likelihood: "medium",
      severity: "high",
      mitigation: "مزوّد احتياطي",
      affected_area: "الدفع",
      status: "active",
    });
    expect(draft.objectType).toBe("risk");
    expect(draft.domain).toBe("الدفع");
    expect(draft.content).toContain("medium");
    expect(draft.content).toContain("high");
    expect(draft.content).toContain("مزوّد احتياطي");
  });
});

describe("buildKnowledgeEntryForSystemMessage", () => {
  it("لا يخترع سرّية — يفترض internal دايمًا لأن الجدول ماعندوش تتبّع سرّية", () => {
    const draft = buildKnowledgeEntryForSystemMessage({
      id: "sm1",
      project_id: "p1",
      event_name: "رصيد غير كافٍ",
      message_type: "error",
      message_text: "رصيدك لا يكفي لإتمام العملية.",
    });
    expect(draft.confidentiality).toBe("internal");
    expect(draft.content).toContain("رصيد غير كافٍ");
    expect(draft.content).toContain("رصيدك لا يكفي لإتمام العملية.");
  });
});

describe("commercial mappers — سرّية دايمًا confidential (بيانات مالية)", () => {
  it("proposal: object_type='commercial' وconfidentiality='confidential' صراحةً", () => {
    const draft = buildKnowledgeEntryForProposal({
      id: "pr1",
      project_id: "p1",
      title: "عرض المرحلة الأولى",
      status: "sent",
      total_amount: 50000,
      currency: "EGP",
      version: 2,
    });
    expect(draft.objectType).toBe("commercial");
    expect(draft.confidentiality).toBe("confidential");
    expect(draft.version).toBe(2);
  });
});

describe("buildKnowledgeEntryForTask", () => {
  it("يبني محتوى المهمة بالأولوية والحالة", () => {
    const draft = buildKnowledgeEntryForTask({
      id: "t1",
      project_id: "p1",
      title: "تجهيز بيئة الإنتاج",
      description: "إعداد السيرفرات",
      status: "in_progress",
      priority: "high",
    });
    expect(draft.objectType).toBe("task");
    expect(draft.content).toContain("high");
    expect(draft.content).toContain("in_progress");
  });
});
