import { describe, it, expect } from "vitest";
import { splitKeys, mergeKeys } from "./key-store";

describe("key-store · splitKeys", () => {
  it("splits comma-separated keys and trims", () => {
    expect(splitKeys("a, b ,c")).toEqual(["a", "b", "c"]);
  });
  it("handles undefined/empty", () => {
    expect(splitKeys(undefined)).toEqual([]);
    expect(splitKeys("")).toEqual([]);
    expect(splitKeys("  ,  ")).toEqual([]);
  });
});

describe("key-store · mergeKeys", () => {
  it("merges env + db and dedupes", () => {
    const m = mergeKeys(["e1", "e2"], ["p1"], ["d1", "e1"], ["p2"]);
    expect(m.paid).toEqual(["p1", "p2"]);
    expect(m.free).toEqual(["e1", "e2", "d1"]);
  });

  it("a key present in both paid and free is treated as paid only", () => {
    const m = mergeKeys(["shared", "f1"], ["shared"], [], []);
    expect(m.paid).toEqual(["shared"]);
    expect(m.free).toEqual(["f1"]); // shared removed from free
  });

  it("db-only keys work when env is empty (Railway reads same keys)", () => {
    const m = mergeKeys([], [], ["dbfree"], ["dbpaid"]);
    expect(m.paid).toEqual(["dbpaid"]);
    expect(m.free).toEqual(["dbfree"]);
  });

  it("dedupes duplicate paid keys across env and db", () => {
    const m = mergeKeys([], ["p1"], [], ["p1", "p2"]);
    expect(m.paid).toEqual(["p1", "p2"]);
  });
});
