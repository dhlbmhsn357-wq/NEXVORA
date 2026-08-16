import { describe, it, expect } from "vitest";
import { rankByCurrentTruth, computeCurrentTruthRank, type RawRetrievedEntry } from "./current-truth-ranking";

function makeEntry(overrides: Partial<RawRetrievedEntry> & { id: string }): RawRetrievedEntry {
  return {
    objectType: "discovery",
    objectId: `obj-${overrides.id}`,
    title: overrides.id,
    sourceTitle: overrides.id,
    content: "content",
    domain: null,
    classification: null,
    confidentiality: "internal",
    status: null,
    version: null,
    isCurrent: true,
    isSuperseded: false,
    supersededBy: null,
    metadata: {},
    similarity: 0.8,
    ...overrides,
  };
}

describe("computeCurrentTruthRank", () => {
  it("ranks a current decision at tier 1", () => {
    expect(computeCurrentTruthRank({ objectType: "decision", classification: null, status: "active", isSuperseded: false })).toBe(1);
  });

  it("ranks any entry with classification='decision' at tier 1 regardless of object_type", () => {
    expect(
      computeCurrentTruthRank({ objectType: "brain", classification: "decision", status: null, isSuperseded: false })
    ).toBe(1);
  });

  it("ranks an approved PRD section at tier 2", () => {
    expect(
      computeCurrentTruthRank({ objectType: "prd_section", classification: null, status: "approved", isSuperseded: false })
    ).toBe(2);
  });

  it("ranks a draft (unapproved) PRD section below an approved one", () => {
    const approved = computeCurrentTruthRank({ objectType: "prd_section", classification: null, status: "approved", isSuperseded: false });
    const draft = computeCurrentTruthRank({ objectType: "prd_section", classification: null, status: "draft", isSuperseded: false });
    expect(draft).toBeGreaterThan(approved);
  });

  it("ranks an approved requirement at tier 3", () => {
    expect(
      computeCurrentTruthRank({ objectType: "requirement", classification: null, status: "approved", isSuperseded: false })
    ).toBe(3);
  });

  it("ranks a brain entry at tier 4", () => {
    expect(computeCurrentTruthRank({ objectType: "brain", classification: null, status: null, isSuperseded: false })).toBe(4);
  });

  it("ranks verified evidence above raw (unclassified) evidence", () => {
    const verified = computeCurrentTruthRank({ objectType: "evidence", classification: "fact", status: null, isSuperseded: false });
    const raw = computeCurrentTruthRank({ objectType: "evidence", classification: null, status: null, isSuperseded: false });
    expect(verified).toBeLessThan(raw);
  });

  it("ranks discovery/meeting entries at the discovery tier", () => {
    expect(computeCurrentTruthRank({ objectType: "discovery", classification: null, status: null, isSuperseded: false })).toBe(6);
    expect(computeCurrentTruthRank({ objectType: "meeting", classification: null, status: null, isSuperseded: false })).toBe(6);
  });

  it("forces superseded entries to the last tier regardless of type or classification", () => {
    expect(
      computeCurrentTruthRank({ objectType: "decision", classification: "decision", status: "active", isSuperseded: true })
    ).toBe(7);
  });

  it("falls back to the discovery tier for an unmapped object_type", () => {
    expect(computeCurrentTruthRank({ objectType: "some_future_type", classification: null, status: null, isSuperseded: false })).toBe(6);
  });
});

describe("rankByCurrentTruth", () => {
  it("the user's own example: a later Decision outranks a higher-similarity Discovery note on the same topic", () => {
    const discoveryHighSimilarity = makeEntry({
      id: "discovery-capacity",
      objectType: "discovery",
      content: "السعة القصوى 20 مستخدم متزامن.",
      similarity: 0.95,
    });
    const decisionLowerSimilarity = makeEntry({
      id: "decision-capacity",
      objectType: "decision",
      status: "active",
      content: "تقرر تخفيض السعة القصوى إلى 15 مستخدم متزامن.",
      similarity: 0.8,
    });

    const [first, second] = rankByCurrentTruth([discoveryHighSimilarity, decisionLowerSimilarity]);

    expect(first.id).toBe("decision-capacity");
    expect(second.id).toBe("discovery-capacity");
    expect(first.currentTruthRank).toBeLessThan(second.currentTruthRank);
  });

  it("breaks ties within the same tier by similarity descending", () => {
    const a = makeEntry({ id: "a", objectType: "discovery", similarity: 0.72 });
    const b = makeEntry({ id: "b", objectType: "discovery", similarity: 0.9 });
    const c = makeEntry({ id: "c", objectType: "discovery", similarity: 0.81 });

    const ranked = rankByCurrentTruth([a, b, c]);
    expect(ranked.map((e) => e.id)).toEqual(["b", "c", "a"]);
  });

  it("never lets a superseded entry rank above its current replacement", () => {
    const current = makeEntry({ id: "current", objectType: "decision", status: "active", similarity: 0.6 });
    const superseded = makeEntry({
      id: "superseded",
      objectType: "decision",
      status: "active",
      isSuperseded: true,
      supersededBy: "current",
      similarity: 0.99, // تشابه أعلى بكتير، لازم برضه ينزل تحت
    });

    const ranked = rankByCurrentTruth([superseded, current]);
    expect(ranked[0].id).toBe("current");
    expect(ranked[1].id).toBe("superseded");
  });

  it("returns an empty array cleanly for empty input", () => {
    expect(rankByCurrentTruth([])).toEqual([]);
  });
});
