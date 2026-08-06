import { describe, expect, it } from "vitest";
import {
  CHANGE_IMPACT,
  MODULE_KEYS,
  describePlan,
  planUpdate,
  type ModuleKey,
  type UpdatePolicy,
} from "./plan-update";

describe("planUpdate", () => {
  it("متطلب جديد يؤثّر على Brain وPRD والبرومبت لا على العرض", () => {
    const plan = planUpdate(["requirement"]);
    const affected = [...plan.needsApproval, ...plan.autoUpdate].map((e) => e.module);
    expect(affected).toContain("project_brain");
    expect(affected).toContain("prd");
    expect(affected).toContain("prototype_prompt");
    // العرض والتسليم غير متأثّرين بمتطلب.
    expect(plan.unaffected).toContain("client_presentation");
    expect(plan.unaffected).toContain("developer_handoff");
  });

  it("سياسة داخلية تؤثّر على Brain والمعمار لا على البرومبت (مثال المواصفة)", () => {
    const plan = planUpdate(["policy"]);
    const affected = [...plan.needsApproval, ...plan.autoUpdate].map((e) => e.module);
    expect(affected).toContain("project_brain");
    expect(affected).toContain("architecture");
    expect(affected).not.toContain("prototype_prompt");
    expect(plan.unaffected).toContain("prototype_prompt");
  });

  it("السياسة auto_update تضع الموديول في التحديث التلقائي", () => {
    const policies: Partial<Record<ModuleKey, UpdatePolicy>> = { prd: "auto_update" };
    const plan = planUpdate(["requirement"], policies);
    expect(plan.autoUpdate.map((e) => e.module)).toContain("prd");
    expect(plan.needsApproval.map((e) => e.module)).not.toContain("prd");
  });

  it("السياسة never تتخطّى الموديول مع سبب", () => {
    const plan = planUpdate(["requirement"], { prd: "never" });
    const skipped = plan.skipped.find((e) => e.module === "prd");
    expect(skipped).toBeDefined();
    expect(skipped?.reason).toContain("أبدًا");
  });

  it("الافتراضي هو الموافقة اليدوية", () => {
    const plan = planUpdate(["requirement"]);
    expect(plan.needsApproval.map((e) => e.module)).toContain("prd");
  });

  it("يجمع أنواع التغيّر المؤثّرة على نفس الموديول", () => {
    const plan = planUpdate(["requirement", "business_rule"]);
    const brain = [...plan.needsApproval, ...plan.autoUpdate].find((e) => e.module === "project_brain");
    expect(brain?.triggeredBy).toContain("requirement");
    expect(brain?.triggeredBy).toContain("business_rule");
  });

  it("لا تغييرات = كل الموديولات غير متأثّرة", () => {
    const plan = planUpdate([]);
    expect(plan.unaffected.length).toBe(MODULE_KEYS.length);
    expect(plan.autoUpdate).toHaveLength(0);
    expect(plan.needsApproval).toHaveLength(0);
  });

  it("كل نوع تغيّر يؤثّر على عقل المشروع", () => {
    for (const change of Object.keys(CHANGE_IMPACT) as Array<keyof typeof CHANGE_IMPACT>) {
      expect(CHANGE_IMPACT[change]).toContain("project_brain");
    }
  });

  it("describePlan يلخّص الأقسام الثلاثة", () => {
    const plan = planUpdate(["requirement"], { prd: "auto_update", prototype_prompt: "never" });
    const text = describePlan(plan);
    expect(text).toContain("تحديث تلقائي");
    expect(text).toContain("بانتظار موافقة");
    expect(text).toContain("متخطّى");
  });
});
