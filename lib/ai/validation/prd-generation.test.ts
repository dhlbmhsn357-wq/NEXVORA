import { describe, expect, it } from "vitest";
import { validatePRDGeneration, validatePRDSectionRegeneration } from "./prd-generation";

const validPayload = {
  overview: "منصة لإدارة طلبات الصيانة للفروع.",
  problem_statement: "الفروع بتتابع الطلبات يدويًا عبر واتساب من غير أي تتبع مركزي.",
  goals: ["تقليل زمن الاستجابة للطلبات"],
  out_of_scope: ["تطبيق موبايل في الإصدار الأول"],
  target_users: ["مديرو الفروع"],
  user_stories: [{ role: "بصفتي مدير فرع", want: "أسجل طلب صيانة", benefit: "حتى يتم متابعته" }],
  acceptance_criteria: [
    { given: "بافتراض إن الطلب موجود", when: "عندما يضغط المستخدم تحديث", then: "فإن الحالة تتغير" },
  ],
  functional_requirements: ["نظام تسجيل دخول"],
  non_functional_requirements: ["زمن استجابة أقل من ثانية"],
  risks_assumptions: ["افتراض وجود اتصال إنترنت مستقر"],
  success_metrics: ["نسبة رضا 90%"],
  business_rules_detail: [
    {
      title: "حد أقصى لإعادة الجدولة",
      trigger_condition: "المستخدم يحاول إعادة جدولة الطلب",
      threshold_value: "3 مرات",
      on_violation: "منع إعادة الجدولة وعرض رسالة",
      enforcement_point: "server",
    },
  ],
  system_messages_detail: [
    { event_name: "تسجيل دخول ناجح", message_type: "success", message_text: "تم تسجيل الدخول بنجاح" },
  ],
  flow_specifications: [
    {
      flow_name: "تسجيل الدخول",
      step_action: "إدخال البريد وكلمة المرور",
      ui_elements: [{ field_name: "البريد", field_type: "نص", validation_rule: "صيغة بريد صالحة" }],
      success_message: "تم الدخول",
      error_messages: ["بيانات غير صحيحة"],
    },
  ],
};

describe("validatePRDGeneration", () => {
  it("accepts a well-formed full PRD response", () => {
    const result = validatePRDGeneration(JSON.stringify(validPayload));
    expect(result.ok).toBe(true);
  });

  it("rejects null/empty/invalid JSON", () => {
    expect(validatePRDGeneration(null).ok).toBe(false);
    expect(validatePRDGeneration("").ok).toBe(false);
    expect(validatePRDGeneration("not json").ok).toBe(false);
  });

  it("rejects a response missing a required section", () => {
    const { success_metrics, ...missing } = validPayload;
    void success_metrics;
    expect(validatePRDGeneration(JSON.stringify(missing)).ok).toBe(false);
  });

  it("rejects a response with an extra section", () => {
    const withExtra = { ...validPayload, timeline: "شهرين" };
    expect(validatePRDGeneration(JSON.stringify(withExtra)).ok).toBe(false);
  });

  it("rejects acceptance_criteria not in Given/When/Then object form", () => {
    const bad = { ...validPayload, acceptance_criteria: ["Given X, When Y, Then Z"] };
    expect(validatePRDGeneration(JSON.stringify(bad)).ok).toBe(false);
  });

  it("rejects acceptance_criteria missing the 'then' field", () => {
    const bad = { ...validPayload, acceptance_criteria: [{ given: "g", when: "w" }] };
    expect(validatePRDGeneration(JSON.stringify(bad)).ok).toBe(false);
  });

  it("rejects user_stories as bare strings", () => {
    const bad = { ...validPayload, user_stories: ["كمستخدم أريد كذا"] };
    expect(validatePRDGeneration(JSON.stringify(bad)).ok).toBe(false);
  });

  it("rejects an empty overview", () => {
    const bad = { ...validPayload, overview: "" };
    expect(validatePRDGeneration(JSON.stringify(bad)).ok).toBe(false);
  });

  it("accepts empty arrays for the 3 new zero-invention sections (no structured input case)", () => {
    const payload = {
      ...validPayload,
      business_rules_detail: [],
      system_messages_detail: [],
      flow_specifications: [],
    };
    expect(validatePRDGeneration(JSON.stringify(payload)).ok).toBe(true);
  });

  it("rejects business_rules_detail with an invalid enforcement_point", () => {
    const bad = {
      ...validPayload,
      business_rules_detail: [
        {
          title: "قاعدة",
          trigger_condition: "شرط",
          threshold_value: "",
          on_violation: "",
          enforcement_point: "everywhere",
        },
      ],
    };
    expect(validatePRDGeneration(JSON.stringify(bad)).ok).toBe(false);
  });

  it("rejects system_messages_detail with an invalid message_type", () => {
    const bad = {
      ...validPayload,
      system_messages_detail: [{ event_name: "حدث", message_type: "critical", message_text: "" }],
    };
    expect(validatePRDGeneration(JSON.stringify(bad)).ok).toBe(false);
  });

  it("rejects flow_specifications missing flow_name", () => {
    const bad = {
      ...validPayload,
      flow_specifications: [
        { flow_name: "", step_action: "خطوة", ui_elements: [], success_message: "", error_messages: [] },
      ],
    };
    expect(validatePRDGeneration(JSON.stringify(bad)).ok).toBe(false);
  });
});

describe("validatePRDSectionRegeneration", () => {
  it("accepts a valid single-section response", () => {
    const result = validatePRDSectionRegeneration(JSON.stringify({ goals: ["هدف جديد"] }), "goals");
    expect(result.ok).toBe(true);
  });

  it("rejects a response with more than one key", () => {
    const result = validatePRDSectionRegeneration(
      JSON.stringify({ goals: ["هدف"], risks_assumptions: ["خطر"] }),
      "goals"
    );
    expect(result.ok).toBe(false);
  });

  it("rejects a response for the wrong section key", () => {
    const result = validatePRDSectionRegeneration(JSON.stringify({ risks_assumptions: ["خطر"] }), "goals");
    expect(result.ok).toBe(false);
  });

  it("rejects invalid JSON", () => {
    expect(validatePRDSectionRegeneration("not json", "goals").ok).toBe(false);
  });
});
