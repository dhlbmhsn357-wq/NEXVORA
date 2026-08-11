/**
 * 0111 — assertPackageMutable unit tests
 * =======================================
 * Uses a minimal stub of the SupabaseClient shape (from/select/eq/maybeSingle
 * chain) since we only need to assert on the guard's decision logic.
 */
import { describe, expect, it, vi } from "vitest";
import type { SupabaseClient } from "@supabase/supabase-js";

// stubs — service.ts imports "server-only" and supabase server helpers that
// blow up in a node test environment; we only need assertPackageMutable's logic.
vi.mock("server-only", () => ({}));
vi.mock("@/lib/supabase/server", () => ({ createClient: async () => ({}) }));
vi.mock("@/lib/supabase/service", () => ({ createServiceClient: () => ({}) }));

const { assertPackageMutable } = await import("./service");

function stubSupabase(status: string | null, opts: { itemLookup?: string | null } = {}): SupabaseClient {
  const chain = (result: { data: unknown; error: null } | { data: null; error: { message: string } }) => ({
    select: () => ({
      eq: () => ({
        maybeSingle: async () => result,
      }),
    }),
  });
  return {
    from: (table: string) => {
      if (table === "handoff_items") {
        return chain({
          data: opts.itemLookup !== undefined ? (opts.itemLookup === null ? null : { package_id: opts.itemLookup }) : null,
          error: null,
        });
      }
      if (table === "handoff_packages") {
        return chain({ data: status === null ? null : { status }, error: null });
      }
      throw new Error(`unexpected table ${table}`);
    },
  } as unknown as SupabaseClient;
}

describe("assertPackageMutable (0111)", () => {
  it("throws when status=finalized", async () => {
    await expect(
      assertPackageMutable(stubSupabase("finalized"), { packageId: "p1" }),
    ).rejects.toThrow(/نسخة تسليم نهائية/);
  });

  it("throws when status=superseded", async () => {
    await expect(
      assertPackageMutable(stubSupabase("superseded"), { packageId: "p1" }),
    ).rejects.toThrow(/نسخة تسليم نهائية/);
  });

  it("passes when status=draft", async () => {
    await expect(
      assertPackageMutable(stubSupabase("draft"), { packageId: "p1" }),
    ).resolves.toBeUndefined();
  });

  it("passes when status=ready", async () => {
    await expect(
      assertPackageMutable(stubSupabase("ready"), { packageId: "p1" }),
    ).resolves.toBeUndefined();
  });

  it("throws when package not found", async () => {
    await expect(
      assertPackageMutable(stubSupabase(null), { packageId: "missing" }),
    ).rejects.toThrow(/غير موجودة/);
  });

  it("resolves packageId from itemId when only itemId provided", async () => {
    await expect(
      assertPackageMutable(stubSupabase("draft", { itemLookup: "pkg-1" }), { itemId: "item-1" }),
    ).resolves.toBeUndefined();
  });

  it("throws when itemId not found", async () => {
    await expect(
      assertPackageMutable(stubSupabase("draft", { itemLookup: null }), { itemId: "missing" }),
    ).rejects.toThrow(/عنصر التسليم غير موجود/);
  });

  it("throws when neither packageId nor itemId provided", async () => {
    await expect(
      assertPackageMutable(stubSupabase("draft"), {}),
    ).rejects.toThrow(/يلزم packageId أو itemId/);
  });
});
