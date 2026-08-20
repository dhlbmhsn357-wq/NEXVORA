import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("server-only", () => ({}));

type Row = Record<string, unknown>;

const state: { requests: Map<string, Row>; impacts: Map<string, Row>; nextId: number } = {
  requests: new Map(),
  impacts: new Map(),
  nextId: 1,
};

function freshId(prefix: string): string {
  return `${prefix}-${state.nextId++}`;
}

function resetState() {
  state.requests = new Map();
  state.impacts = new Map();
  state.nextId = 1;
}

function makeClient() {
  return {
    from(table: string) {
      if (table === "client_change_requests") {
        return {
          select() {
            return {
              eq(_col: string, id: string) {
                return {
                  order() {
                    return { data: [...state.requests.values()].filter((r) => r.project_id === id), error: null };
                  },
                  async maybeSingle() {
                    return { data: state.requests.get(id) ?? null, error: null };
                  },
                };
              },
            };
          },
          insert(row: Row) {
            return {
              select() {
                return {
                  async single() {
                    const id = freshId("cr");
                    const full: Row = {
                      id,
                      status: "draft",
                      created_at: new Date().toISOString(),
                      updated_at: new Date().toISOString(),
                      ...row,
                    };
                    state.requests.set(id, full);
                    return { data: full, error: null };
                  },
                };
              },
            };
          },
          update(patch: Row) {
            return {
              eq(_col: string, id: string) {
                return {
                  select() {
                    return {
                      async single() {
                        const existing = state.requests.get(id);
                        if (!existing) return { data: null, error: { message: "not found" } };
                        const updated = { ...existing, ...patch };
                        state.requests.set(id, updated);
                        return { data: updated, error: null };
                      },
                    };
                  },
                };
              },
            };
          },
          delete() {
            return {
              async eq(_col: string, id: string) {
                state.requests.delete(id);
                return { error: null };
              },
            };
          },
        };
      }
      if (table === "change_impacts") {
        return {
          select() {
            return {
              eq(_col: string, changeRequestId: string) {
                return {
                  order() {
                    return {
                      data: [...state.impacts.values()].filter((i) => i.change_request_id === changeRequestId),
                      error: null,
                    };
                  },
                };
              },
            };
          },
          insert(rows: Row[]) {
            return {
              select() {
                const inserted = rows.map((row) => {
                  const id = freshId("impact");
                  const full: Row = { id, created_at: new Date().toISOString(), ...row };
                  state.impacts.set(id, full);
                  return full;
                });
                return Promise.resolve({ data: inserted, error: null });
              },
            };
          },
          update(patch: Row) {
            return {
              eq(_col: string, id: string) {
                return {
                  select() {
                    return {
                      async single() {
                        const existing = state.impacts.get(id);
                        if (!existing) return { data: null, error: { message: "not found" } };
                        const updated = { ...existing, ...patch };
                        state.impacts.set(id, updated);
                        return { data: updated, error: null };
                      },
                    };
                  },
                };
              },
            };
          },
        };
      }
      throw new Error(`جدول غير متوقّع في اختبار change-request-service: ${table}`);
    },
  };
}

vi.mock("@/lib/supabase/service", () => ({ createServiceClient: () => makeClient() }));
vi.mock("@/lib/supabase/server", () => ({ createClient: async () => makeClient() }));

import {
  createChangeRequest,
  listChangeRequests,
  getChangeRequest,
  updateChangeRequestStatus,
  deleteChangeRequest,
  createChangeImpacts,
  listChangeImpacts,
  updateChangeImpactStatus,
} from "./change-request-service";

beforeEach(() => {
  resetState();
});

describe("createChangeRequest", () => {
  it("يرفض عنوان فاضي", async () => {
    await expect(createChangeRequest("p1", { type: "add", title: "   " }, "u1")).rejects.toThrow(/عنوان/);
  });

  it("ينشئ طلب تغيير بحالة draft افتراضيًا", async () => {
    const cr = await createChangeRequest("p1", { type: "modify", title: "تعديل قاعدة السعر" }, "u1");
    expect(cr.status).toBe("draft");
    expect(cr.type).toBe("modify");
    expect(cr.projectId).toBe("p1");
    expect(cr.createdBy).toBe("u1");
  });
});

describe("listChangeRequests / getChangeRequest", () => {
  it("يرجّع طلبات مشروع معيّن فقط", async () => {
    await createChangeRequest("p1", { type: "add", title: "A" }, "u1");
    await createChangeRequest("p2", { type: "add", title: "B" }, "u1");
    const list = await listChangeRequests("p1");
    expect(list).toHaveLength(1);
    expect(list[0].title).toBe("A");
  });

  it("getChangeRequest يرجّع null لطلب غير موجود", async () => {
    const found = await getChangeRequest("does-not-exist");
    expect(found).toBeNull();
  });
});

describe("updateChangeRequestStatus — دورة حياة الحالة", () => {
  it("draft → analyzing → needs_review → approved → applied", async () => {
    const cr = await createChangeRequest("p1", { type: "add", title: "A" }, "u1");
    expect(cr.status).toBe("draft");

    const analyzing = await updateChangeRequestStatus(cr.id, "analyzing");
    expect(analyzing.status).toBe("analyzing");

    const review = await updateChangeRequestStatus(cr.id, "needs_review");
    expect(review.status).toBe("needs_review");

    const approved = await updateChangeRequestStatus(cr.id, "approved");
    expect(approved.status).toBe("approved");

    const applied = await updateChangeRequestStatus(cr.id, "applied");
    expect(applied.status).toBe("applied");
  });

  it("يقدر يرجع لـ draft من analyzing (مسار فشل التحليل)", async () => {
    const cr = await createChangeRequest("p1", { type: "add", title: "A" }, "u1");
    await updateChangeRequestStatus(cr.id, "analyzing");
    const back = await updateChangeRequestStatus(cr.id, "draft");
    expect(back.status).toBe("draft");
  });
});

describe("deleteChangeRequest", () => {
  it("يحذف الطلب فعليًا", async () => {
    const cr = await createChangeRequest("p1", { type: "add", title: "A" }, "u1");
    await deleteChangeRequest(cr.id);
    const found = await getChangeRequest(cr.id);
    expect(found).toBeNull();
  });
});

describe("createChangeImpacts / listChangeImpacts / updateChangeImpactStatus", () => {
  it("يُدرج دفعة أثر كلها بحالة proposed", async () => {
    const cr = await createChangeRequest("p1", { type: "add", title: "A" }, "u1");
    const impacts = await createChangeImpacts(cr.id, [
      {
        artifactType: "requirement",
        artifactId: null,
        artifactLabel: "REQ جديد",
        impactType: "add",
        reason: "سبب",
        proposedChange: { title: "متطلب جديد" },
        dependencies: [],
        missingInformation: "",
      },
    ]);
    expect(impacts).toHaveLength(1);
    expect(impacts[0].status).toBe("proposed");

    const listed = await listChangeImpacts(cr.id);
    expect(listed).toHaveLength(1);
  });

  it("createChangeImpacts بمصفوفة فاضية بيرجع [] بدون نداء قاعدة بيانات", async () => {
    const result = await createChangeImpacts("cr-x", []);
    expect(result).toEqual([]);
  });

  it("updateChangeImpactStatus يحدّث الحالة بشكل صحيح", async () => {
    const cr = await createChangeRequest("p1", { type: "add", title: "A" }, "u1");
    const [impact] = await createChangeImpacts(cr.id, [
      {
        artifactType: "business_rule",
        artifactId: "br-1",
        artifactLabel: "قاعدة",
        impactType: "modify",
        reason: "سبب",
        proposedChange: {},
        dependencies: [],
        missingInformation: "",
      },
    ]);
    const approved = await updateChangeImpactStatus(impact.id, "approved");
    expect(approved.status).toBe("approved");
    const applied = await updateChangeImpactStatus(impact.id, "applied");
    expect(applied.status).toBe("applied");
  });
});
