import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("server-only", () => ({}));

/**
 * 0125 — تصفير علم needs_regeneration في applyAssembly. اختبار مستهدف
 * (extends الضمانة الموجودة في assembler.test.ts)، مش إعادة اختبار كل
 * previewAssembly/applyAssembly من الصفر.
 */

const state = vi.hoisted(() => ({
  updateCalls: [] as { table: string; patch: Record<string, unknown>; id: string }[],
}));

vi.mock("./service", () => ({
  listItems: vi.fn(async () => []),
  assertPackageMutable: vi.fn(async () => {}),
}));

vi.mock("./source-resolvers", () => ({
  resolveAllSources: vi.fn(async () => []),
}));

vi.mock("@/lib/supabase/service", () => ({
  createServiceClient: () => ({
    from: (table: string) => {
      if (table === "handoff_items") {
        return {
          upsert: () => Promise.resolve({ error: null }),
        };
      }
      if (table === "handoff_packages") {
        return {
          update: (patch: Record<string, unknown>) => ({
            eq: (_col: string, id: string) => {
              state.updateCalls.push({ table, patch, id });
              return Promise.resolve({ error: null });
            },
          }),
        };
      }
      throw new Error(`جدول غير متوقّع في اختبار assembler-regeneration: ${table}`);
    },
  }),
}));

vi.mock("@/lib/supabase/server", () => ({
  createClient: async () => ({}),
}));

import { applyAssembly } from "./assembler";

beforeEach(() => {
  vi.clearAllMocks();
  state.updateCalls.length = 0;
});

describe("applyAssembly — 0125: تصفير علم إعادة التجميع", () => {
  it("بيصفّر needs_regeneration ويفضّي regeneration_reason لنفس الحزمة المُجمَّعة", async () => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    await applyAssembly({} as any, "p1", "pkg-1", "u1");

    const call = state.updateCalls.find((c) => c.table === "handoff_packages" && c.id === "pkg-1");
    expect(call).toBeTruthy();
    expect(call?.patch).toEqual({ needs_regeneration: false, regeneration_reason: "" });
  });
});
