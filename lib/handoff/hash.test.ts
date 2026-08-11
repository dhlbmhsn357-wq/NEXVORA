import { describe, expect, it } from "vitest";
import { createSourceHash, hashSourceList } from "./hash";

describe("createSourceHash", () => {
  it("same content, different key order → same hash", () => {
    const a = { alpha: 1, beta: 2, gamma: 3 };
    const b = { gamma: 3, beta: 2, alpha: 1 };
    expect(createSourceHash(a)).toBe(createSourceHash(b));
  });

  it("trims whitespace in string input", () => {
    expect(createSourceHash("  hello  ")).toBe(createSourceHash("hello"));
  });

  it("empty array vs nonempty → different hash", () => {
    expect(createSourceHash([])).not.toBe(createSourceHash(["x"]));
  });

  it("nested object with reordered nested keys → same hash", () => {
    const a = { outer: { a: 1, b: { x: 1, y: 2 } } };
    const b = { outer: { b: { y: 2, x: 1 }, a: 1 } };
    expect(createSourceHash(a)).toBe(createSourceHash(b));
  });

  it("different content → different hash", () => {
    expect(createSourceHash("a")).not.toBe(createSourceHash("b"));
  });
});

describe("hashSourceList", () => {
  it("same list, different insertion order → same hash", () => {
    const a = [
      { id: "1", updatedAt: "t1" },
      { id: "2", updatedAt: "t2" },
      { id: "3", updatedAt: "t3" },
    ];
    const b = [
      { id: "3", updatedAt: "t3" },
      { id: "1", updatedAt: "t1" },
      { id: "2", updatedAt: "t2" },
    ];
    expect(hashSourceList(a)).toBe(hashSourceList(b));
  });

  it("different updatedAt → different hash", () => {
    const a = [{ id: "1", updatedAt: "t1" }];
    const b = [{ id: "1", updatedAt: "t2" }];
    expect(hashSourceList(a)).not.toBe(hashSourceList(b));
  });
});
