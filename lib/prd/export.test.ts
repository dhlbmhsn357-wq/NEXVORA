import { describe, it, expect } from "vitest";
import { formatPRDAsMarkdown } from "./export";
import type { PRD } from "@/lib/types/database";

function basePrd(over: Partial<PRD>): PRD {
  return {
    id: "prd1", project_id: "p1",
    overview: "", problem_statement: "",
    goals: [], out_of_scope: [], target_users: [],
    user_stories: [], acceptance_criteria: [],
    functional_requirements: [], non_functional_requirements: [],
    risks_assumptions: [], success_metrics: [],
    business_rules_detail: [], system_messages_detail: [], flow_specifications: [],
    version: 1, status: "draft", generated_from_brain_version: null,
    sync_status: "idle", last_error: null, created_by: null,
    created_at: "2026-01-01T00:00:00.000Z", updated_at: "2026-01-01T00:00:00.000Z",
    ...over,
  };
}

describe("formatPRDAsMarkdown — الأقسام الثلاثة الجديدة", () => {
  it("يعرض '—' لما الأقسام الثلاثة فاضية", () => {
    const out = formatPRDAsMarkdown("مشروع", basePrd({}));
    expect(out).toContain("## قواعد العمل والحالات الخاصة");
    expect(out).toContain("## رسائل النظام");
    expect(out).toContain("## مواصفات التدفقات التفصيلية");
  });

  it("يعرض جدول قواعد العمل ورسائل النظام وتفاصيل التدفقات لما تكون موجودة", () => {
    const out = formatPRDAsMarkdown(
      "مشروع",
      basePrd({
        business_rules_detail: [
          {
            title: "حد أقصى لإعادة الجدولة",
            trigger_condition: "طلب إعادة جدولة",
            threshold_value: "3 مرات",
            on_violation: "منع الإجراء",
            enforcement_point: "server",
          },
        ],
        system_messages_detail: [
          { event_name: "رصيد غير كافٍ", message_type: "error", message_text: "لا يوجد رصيد كافٍ" },
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
      })
    );
    expect(out).toContain("حد أقصى لإعادة الجدولة");
    expect(out).toContain("3 مرات");
    expect(out).toContain("رصيد غير كافٍ");
    expect(out).toContain("لا يوجد رصيد كافٍ");
    expect(out).toContain("تسجيل الدخول");
    expect(out).toContain("صيغة بريد صالحة");
    expect(out).toContain("تم الدخول");
    expect(out).toContain("بيانات غير صحيحة");
  });
});
