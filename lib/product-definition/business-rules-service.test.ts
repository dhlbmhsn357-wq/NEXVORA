import { describe, it, expect, vi } from "vitest";

// تحييد "server-only" + طبقة الوصول للبيانات عشان نختبر منطق تحويل الصف الخالص فقط.
vi.mock("server-only", () => ({}));
vi.mock("@/lib/supabase/service", () => ({ createServiceClient: () => ({}) }));
vi.mock("@/lib/supabase/server", () => ({ createClient: async () => ({}) }));

import { mapBusinessRule } from "./business-rules-service";

describe("mapBusinessRule", () => {
  it("يحوّل صف قاعدة العمل من snake_case لـ camelCase بالكامل", () => {
    const row = mapBusinessRule({
      id: "b1",
      project_id: "p1",
      title: "حد أقصى لإعادة الجدولة",
      trigger_condition: "المستخدم يحاول إعادة جدولة الطلب",
      threshold_value: "3 مرات",
      on_violation: "منع الإجراء وعرض رسالة",
      enforcement_point: "server",
      linked_flow_id: "f1",
      notes: "ملاحظة",
      created_at: "2026-01-01T00:00:00.000Z",
      updated_at: "2026-01-02T00:00:00.000Z",
      created_by: "u1",
    });

    expect(row).toEqual({
      id: "b1",
      projectId: "p1",
      title: "حد أقصى لإعادة الجدولة",
      triggerCondition: "المستخدم يحاول إعادة جدولة الطلب",
      thresholdValue: "3 مرات",
      onViolation: "منع الإجراء وعرض رسالة",
      enforcementPoint: "server",
      linkedFlowId: "f1",
      notes: "ملاحظة",
      createdAt: "2026-01-01T00:00:00.000Z",
      updatedAt: "2026-01-02T00:00:00.000Z",
      createdBy: "u1",
    });
  });

  it("يتعامل مع linkedFlowId = null بدون أخطاء", () => {
    const row = mapBusinessRule({
      id: "b2",
      project_id: "p1",
      title: "قاعدة بدون تدفّق مرتبط",
      trigger_condition: "",
      threshold_value: "",
      on_violation: "",
      enforcement_point: "both",
      linked_flow_id: null,
      notes: "",
      created_at: "",
      updated_at: "",
      created_by: null,
    });
    expect(row.linkedFlowId).toBeNull();
    expect(row.enforcementPoint).toBe("both");
    expect(row.createdBy).toBeNull();
  });
});
