import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("server-only", () => ({}));

type Row = Record<string, unknown>;

const state: { notes: Map<string, Row>; projects: Map<string, Row>; nextId: number } = {
  notes: new Map(),
  projects: new Map(),
  nextId: 1,
};

function freshId(prefix: string): string {
  return `${prefix}-${state.nextId++}`;
}

function resetState() {
  state.notes = new Map();
  state.projects = new Map([["p1", { id: "p1", workflow_mode: "standard_based" }]]);
  state.nextId = 1;
}

function makeClient() {
  return {
    from(table: string) {
      if (table === "fit_gap_notes") {
        return {
          select() {
            return {
              eq(_col: string, projectId: string) {
                return {
                  async maybeSingle() {
                    const found = [...state.notes.values()].find((r) => r.project_id === projectId);
                    return { data: found ?? null, error: null };
                  },
                };
              },
            };
          },
          upsert(row: Row) {
            return {
              select() {
                return {
                  async single() {
                    const existing = [...state.notes.values()].find((r) => r.project_id === row.project_id);
                    if (existing) {
                      const updated = { ...existing, ...row };
                      state.notes.set(existing.id as string, updated);
                      return { data: updated, error: null };
                    }
                    const id = freshId("fg");
                    const full: Row = { id, ...row };
                    state.notes.set(id, full);
                    return { data: full, error: null };
                  },
                };
              },
            };
          },
        };
      }
      if (table === "projects") {
        return {
          update(patch: Row) {
            return {
              async eq(_col: string, id: string) {
                const existing = state.projects.get(id);
                if (!existing) return { error: { message: "not found" } };
                state.projects.set(id, { ...existing, ...patch });
                return { error: null };
              },
            };
          },
        };
      }
      throw new Error(`جدول غير متوقّع في اختبار fit-gap-service: ${table}`);
    },
  };
}

vi.mock("@/lib/supabase/service", () => ({ createServiceClient: () => makeClient() }));
vi.mock("@/lib/supabase/server", () => ({ createClient: async () => makeClient() }));

import { getFitGapNotes, upsertFitGapNotes, convertToFullDiscovery } from "./fit-gap-service";

beforeEach(() => {
  resetState();
});

describe("getFitGapNotes", () => {
  it("يرجّع null لو مفيش ملاحظات بعد", async () => {
    const found = await getFitGapNotes("p1");
    expect(found).toBeNull();
  });
});

describe("upsertFitGapNotes", () => {
  it("ينشئ صف جديد أول مرة", async () => {
    const notes = await upsertFitGapNotes("p1", { staysAsIs: "الفريم الأساسي" }, "u1");
    expect(notes.projectId).toBe("p1");
    expect(notes.staysAsIs).toBe("الفريم الأساسي");
    expect(notes.needsAdding).toBe("");
  });

  it("يحدّث نفس الصف تاني مرة (upsert مش صف جديد)", async () => {
    await upsertFitGapNotes("p1", { staysAsIs: "نسخة 1" }, "u1");
    const updated = await upsertFitGapNotes("p1", { staysAsIs: "نسخة 2", needsAdding: "ميزة جديدة" }, "u1");
    expect(updated.staysAsIs).toBe("نسخة 2");
    expect(updated.needsAdding).toBe("ميزة جديدة");

    const all = [...state.notes.values()];
    expect(all).toHaveLength(1);
  });
});

describe("convertToFullDiscovery", () => {
  it("يحدّث workflow_mode للمشروع إلى full_discovery", async () => {
    await convertToFullDiscovery("p1");
    expect(state.projects.get("p1")?.workflow_mode).toBe("full_discovery");
  });
});
