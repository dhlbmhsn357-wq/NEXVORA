import { describe, it, expect } from "vitest";
import { detectConflicts } from "./conflict-detection";
import type { RetrievedEntry } from "./current-truth-ranking";

function makeEntry(overrides: Partial<RetrievedEntry> & { id: string }): RetrievedEntry {
  return {
    objectType: "decision",
    objectId: `obj-${overrides.id}`,
    title: overrides.id,
    sourceTitle: overrides.id,
    content: "content",
    domain: null,
    classification: null,
    confidentiality: "internal",
    status: "active",
    version: null,
    isCurrent: true,
    isSuperseded: false,
    supersededBy: null,
    metadata: {},
    similarity: 0.8,
    currentTruthRank: 1,
    ...overrides,
  };
}

describe("detectConflicts", () => {
  it("groups a superseded entry with the current entry it points to via supersededBy", () => {
    const current = makeEntry({ id: "current" });
    const superseded = makeEntry({ id: "old", isSuperseded: true, supersededBy: "current", currentTruthRank: 7 });

    const groups = detectConflicts([current, superseded]);

    expect(groups).toHaveLength(1);
    expect(groups[0].topic).toBe("current");
    expect(groups[0].current.id).toBe("current");
    expect(groups[0].superseded).toHaveLength(1);
    expect(groups[0].superseded[0].id).toBe("old");
  });

  it("groups multiple superseded ancestors pointing to the same current entry", () => {
    const current = makeEntry({ id: "current" });
    const old1 = makeEntry({ id: "old1", isSuperseded: true, supersededBy: "current", currentTruthRank: 7 });
    const old2 = makeEntry({ id: "old2", isSuperseded: true, supersededBy: "current", currentTruthRank: 7 });

    const groups = detectConflicts([current, old1, old2]);

    expect(groups).toHaveLength(1);
    expect(groups[0].superseded.map((e) => e.id).sort()).toEqual(["old1", "old2"]);
  });

  it("ignores a superseded entry whose target is not present in the result set", () => {
    const orphan = makeEntry({ id: "orphan", isSuperseded: true, supersededBy: "not-in-set", currentTruthRank: 7 });

    expect(detectConflicts([orphan])).toEqual([]);
  });

  it("does not create a group for entries with no supersede lineage at all", () => {
    const a = makeEntry({ id: "a" });
    const b = makeEntry({ id: "b", objectType: "requirement", currentTruthRank: 3 });

    expect(detectConflicts([a, b])).toEqual([]);
  });

  it("returns an empty array cleanly for empty input", () => {
    expect(detectConflicts([])).toEqual([]);
  });
});
