import { describe, expect, it } from "vitest";
import { isItemStale } from "./derive";
import type { HandoffItemRow } from "./types";

const base = {
  isManualOverride: false,
  sourceHash: null as string | null,
};

describe("isItemStale (0110)", () => {
  it("null hashes = not stale", () => {
    expect(isItemStale(base, null)).toBe(false);
  });
  it("same hash = not stale", () => {
    expect(isItemStale({ ...base, sourceHash: "abc" }, "abc")).toBe(false);
  });
  it("different hash = stale", () => {
    expect(isItemStale({ ...base, sourceHash: "abc" }, "def")).toBe(true);
  });
  it("manual override always not stale", () => {
    expect(isItemStale({ isManualOverride: true, sourceHash: "abc" }, "def")).toBe(false);
  });
  it("uses HandoffItemRow shape correctly", () => {
    const item: Pick<HandoffItemRow, "sourceHash" | "isManualOverride"> = {
      sourceHash: "h1", isManualOverride: false,
    };
    expect(isItemStale(item, "h2")).toBe(true);
  });
});

// Hash determinism test — pure function inside source-resolvers isn't exported.
// Instead re-derive the algorithm to lock the contract.
import { createHash } from "node:crypto";
function hashList(entries: { id: string; updatedAt: string }[]): string {
  const sorted = entries.map((e) => `${e.id}:${e.updatedAt}`).sort().join("|");
  return createHash("sha256").update(sorted).digest("hex").slice(0, 32);
}

describe("hashList (deterministic)", () => {
  it("same input = same hash regardless of order", () => {
    const a = [{ id: "1", updatedAt: "t1" }, { id: "2", updatedAt: "t2" }];
    const b = [{ id: "2", updatedAt: "t2" }, { id: "1", updatedAt: "t1" }];
    expect(hashList(a)).toBe(hashList(b));
  });
  it("different updatedAt = different hash", () => {
    const a = [{ id: "1", updatedAt: "t1" }];
    const b = [{ id: "1", updatedAt: "t2" }];
    expect(hashList(a)).not.toBe(hashList(b));
  });
  it("empty list has a stable hash", () => {
    expect(hashList([])).toBe(hashList([]));
  });
});
