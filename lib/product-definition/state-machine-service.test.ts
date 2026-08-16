import { describe, it, expect, vi } from "vitest";

// تحييد "server-only" + طبقة الوصول للبيانات عشان نختبر منطق تحويل الصف الخالص فقط.
vi.mock("server-only", () => ({}));
vi.mock("@/lib/supabase/service", () => ({ createServiceClient: () => ({}) }));
vi.mock("@/lib/supabase/server", () => ({ createClient: async () => ({}) }));

import { mapStateMachine } from "./state-machine-service";

describe("mapStateMachine", () => {
  it("يحوّل صف آلة الحالة من snake_case لـ camelCase بالكامل", () => {
    const row = mapStateMachine({
      id: "sm1",
      project_id: "p1",
      name: "دورة حياة طلب الاختبار",
      description: "تتبّع حالة طلب اختبار من الاستلام للتقييم",
      states: ["Request Received", "Scheduled", "Ready", "Live", "Evaluated", "Passed"],
      transitions: [{ from: "Request Received", to: "Scheduled", trigger: "المشرف يحدد موعد" }],
      linked_persona_id: "persona1",
      linked_flow_id: "f1",
      notes: "ملاحظة",
      created_at: "2026-01-01T00:00:00.000Z",
      updated_at: "2026-01-02T00:00:00.000Z",
      created_by: "u1",
    });

    expect(row).toEqual({
      id: "sm1",
      projectId: "p1",
      name: "دورة حياة طلب الاختبار",
      description: "تتبّع حالة طلب اختبار من الاستلام للتقييم",
      states: ["Request Received", "Scheduled", "Ready", "Live", "Evaluated", "Passed"],
      transitions: [{ from: "Request Received", to: "Scheduled", trigger: "المشرف يحدد موعد" }],
      linkedPersonaId: "persona1",
      linkedFlowId: "f1",
      notes: "ملاحظة",
      createdAt: "2026-01-01T00:00:00.000Z",
      updatedAt: "2026-01-02T00:00:00.000Z",
      createdBy: "u1",
    });
  });

  it("يتعامل مع linked_persona_id/linked_flow_id = null و states/transitions فاضية بدون أخطاء", () => {
    const row = mapStateMachine({
      id: "sm2",
      project_id: "p1",
      name: "آلة بدون روابط",
      description: "",
      states: [],
      transitions: [],
      linked_persona_id: null,
      linked_flow_id: null,
      notes: "",
      created_at: "",
      updated_at: "",
      created_by: null,
    });
    expect(row.linkedPersonaId).toBeNull();
    expect(row.linkedFlowId).toBeNull();
    expect(row.states).toEqual([]);
    expect(row.transitions).toEqual([]);
    expect(row.createdBy).toBeNull();
  });

  it("يتعامل مع states/transitions = undefined (fallback لمصفوفة فارغة)", () => {
    const row = mapStateMachine({
      id: "sm3",
      project_id: "p1",
      name: "آلة بدون states",
      description: "",
      states: undefined as unknown as string[],
      transitions: undefined as unknown as never[],
      linked_persona_id: null,
      linked_flow_id: null,
      notes: "",
      created_at: "",
      updated_at: "",
      created_by: null,
    });
    expect(row.states).toEqual([]);
    expect(row.transitions).toEqual([]);
  });
});
