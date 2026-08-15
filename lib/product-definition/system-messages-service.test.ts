import { describe, it, expect, vi } from "vitest";

// تحييد "server-only" + طبقة الوصول للبيانات عشان نختبر منطق تحويل الصف الخالص فقط.
vi.mock("server-only", () => ({}));
vi.mock("@/lib/supabase/service", () => ({ createServiceClient: () => ({}) }));
vi.mock("@/lib/supabase/server", () => ({ createClient: async () => ({}) }));

import { mapSystemMessage } from "./system-messages-service";

describe("mapSystemMessage", () => {
  it("يحوّل صف رسالة النظام من snake_case لـ camelCase بالكامل", () => {
    const row = mapSystemMessage({
      id: "m1",
      project_id: "p1",
      event_name: "رصيد غير كافٍ",
      message_type: "error",
      message_text: "لا يوجد رصيد كافٍ لإتمام العملية",
      linked_flow_id: "f1",
      notes: "ملاحظة",
      created_at: "2026-01-01T00:00:00.000Z",
      updated_at: "2026-01-02T00:00:00.000Z",
      created_by: "u1",
    });

    expect(row).toEqual({
      id: "m1",
      projectId: "p1",
      eventName: "رصيد غير كافٍ",
      messageType: "error",
      messageText: "لا يوجد رصيد كافٍ لإتمام العملية",
      linkedFlowId: "f1",
      notes: "ملاحظة",
      createdAt: "2026-01-01T00:00:00.000Z",
      updatedAt: "2026-01-02T00:00:00.000Z",
      createdBy: "u1",
    });
  });

  it("يتعامل مع linkedFlowId = null ويحافظ على كل أنواع الرسائل", () => {
    for (const t of ["success", "error", "info", "warning"] as const) {
      const row = mapSystemMessage({
        id: "m",
        project_id: "p1",
        event_name: "حدث",
        message_type: t,
        message_text: "",
        linked_flow_id: null,
        notes: "",
        created_at: "",
        updated_at: "",
        created_by: null,
      });
      expect(row.messageType).toBe(t);
      expect(row.linkedFlowId).toBeNull();
    }
  });
});
