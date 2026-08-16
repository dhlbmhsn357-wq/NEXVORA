import { describe, it, expect, vi, beforeEach } from "vitest";

const state = vi.hoisted(() => {
  let rpcRows: Array<Record<string, unknown>> = [];
  let rpcError: { message: string } | null = null;
  let lastRpcArgs: Record<string, unknown> | null = null;
  let embedSuccess = true;

  return {
    setRpcRows: (rows: Array<Record<string, unknown>>) => {
      rpcRows = rows;
    },
    setRpcError: (err: { message: string } | null) => {
      rpcError = err;
    },
    setEmbedSuccess: (v: boolean) => {
      embedSuccess = v;
    },
    getEmbedSuccess: () => embedSuccess,
    getLastRpcArgs: () => lastRpcArgs,
    setLastRpcArgs: (args: Record<string, unknown>) => {
      lastRpcArgs = args;
    },
    getRpcRows: () => rpcRows,
    getRpcError: () => rpcError,
  };
});

vi.mock("@/lib/ai/service", () => ({
  AIService: {
    embed: vi.fn(async () => {
      if (!state.getEmbedSuccess()) {
        return { success: false, embedding: null, model_used: "test", provider: "gemini", latency_ms: 1, error: { code: "PROVIDER_ERROR", message: "boom" } };
      }
      return { success: true, embedding: [0.1, 0.2, 0.3], model_used: "test", provider: "gemini", latency_ms: 1, error: null };
    }),
  },
}));

import { retrieveProjectKnowledge, fetchSupersededPredecessors, MAX_ENTRY_CONTENT_CHARS } from "./retrieval-service";
import type { RetrievedEntry } from "./current-truth-ranking";

function baseRow(overrides: Partial<Record<string, unknown>> & { id: string }) {
  return {
    object_type: "discovery",
    object_id: `obj-${overrides.id}`,
    title: overrides.id,
    source_title: overrides.id,
    content: "content",
    domain: null,
    classification: null,
    confidentiality: "internal",
    status: null,
    version: null,
    is_current: true,
    is_superseded: false,
    superseded_by: null,
    metadata: {},
    similarity: 0.8,
    ...overrides,
  };
}

function makeSupabase() {
  return {
    rpc: vi.fn(async (_fn: string, args: Record<string, unknown>) => {
      state.setLastRpcArgs(args);
      if (state.getRpcError()) return { data: null, error: state.getRpcError() };
      return { data: state.getRpcRows(), error: null };
    }),
  };
}

beforeEach(() => {
  state.setRpcRows([]);
  state.setRpcError(null);
  state.setEmbedSuccess(true);
});

describe("retrieveProjectKnowledge — permission enforcement (security-critical)", () => {
  it("computes p_exclude_confidential=true for role='member'", async () => {
    const supabase = makeSupabase();
    await retrieveProjectKnowledge(supabase as never, {
      projectId: "p1",
      question: "ما السعة القصوى؟",
      requesterRole: "member",
    });
    expect(state.getLastRpcArgs()?.p_exclude_confidential).toBe(true);
  });

  it.each(["owner", "admin", "supervisor"] as const)(
    "computes p_exclude_confidential=false for role='%s'",
    async (role) => {
      const supabase = makeSupabase();
      await retrieveProjectKnowledge(supabase as never, {
        projectId: "p1",
        question: "س",
        requesterRole: role,
      });
      expect(state.getLastRpcArgs()?.p_exclude_confidential).toBe(false);
    }
  );

  it("defense-in-depth: filters out a confidential row in the application layer even if the RPC somehow still returned it, for role='member'", async () => {
    const supabase = makeSupabase();
    state.setRpcRows([
      baseRow({ id: "confidential-row", confidentiality: "confidential", similarity: 0.99 }),
      baseRow({ id: "internal-row", confidentiality: "internal", similarity: 0.5 }),
    ]);

    const result = await retrieveProjectKnowledge(supabase as never, {
      projectId: "p1",
      question: "عرض السعر؟",
      requesterRole: "member",
    });

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    const ids = result.entries.map((e) => e.id);
    expect(ids).not.toContain("confidential-row");
    expect(ids).toContain("internal-row");
  });

  it("does NOT filter confidential rows for a privileged role (owner)", async () => {
    const supabase = makeSupabase();
    state.setRpcRows([baseRow({ id: "confidential-row", confidentiality: "confidential", similarity: 0.9 })]);

    const result = await retrieveProjectKnowledge(supabase as never, {
      projectId: "p1",
      question: "عرض السعر؟",
      requesterRole: "owner",
    });

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.entries.map((e) => e.id)).toContain("confidential-row");
  });

  it("defense-in-depth: filters out any row with is_current=false even though the RPC is expected to already exclude it", async () => {
    const supabase = makeSupabase();
    state.setRpcRows([
      baseRow({ id: "stale-row", is_current: false, similarity: 0.99 }),
      baseRow({ id: "current-row", is_current: true, similarity: 0.4 }),
    ]);

    const result = await retrieveProjectKnowledge(supabase as never, {
      projectId: "p1",
      question: "س",
      requesterRole: "owner",
    });

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    const ids = result.entries.map((e) => e.id);
    expect(ids).not.toContain("stale-row");
    expect(ids).toContain("current-row");
  });
});

describe("retrieveProjectKnowledge — ranking, truncation, and error handling", () => {
  it("applies current-truth ranking so a Decision outranks a higher-similarity Discovery entry", async () => {
    const supabase = makeSupabase();
    state.setRpcRows([
      baseRow({ id: "discovery", object_type: "discovery", similarity: 0.95 }),
      baseRow({ id: "decision", object_type: "decision", status: "active", similarity: 0.7 }),
    ]);

    const result = await retrieveProjectKnowledge(supabase as never, {
      projectId: "p1",
      question: "السعة القصوى؟",
      requesterRole: "owner",
    });

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.entries[0].id).toBe("decision");
  });

  it("truncates entry content to MAX_ENTRY_CONTENT_CHARS", async () => {
    const supabase = makeSupabase();
    const longContent = "أ".repeat(MAX_ENTRY_CONTENT_CHARS + 500);
    state.setRpcRows([baseRow({ id: "long", content: longContent })]);

    const result = await retrieveProjectKnowledge(supabase as never, {
      projectId: "p1",
      question: "س",
      requesterRole: "owner",
    });

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.entries[0].content.length).toBeLessThanOrEqual(MAX_ENTRY_CONTENT_CHARS + 1);
  });

  it("truncates the final result set to a bounded count even if the RPC returns many rows", async () => {
    const supabase = makeSupabase();
    state.setRpcRows(Array.from({ length: 18 }, (_, i) => baseRow({ id: `r${i}`, similarity: 0.71 + i * 0.001 })));

    const result = await retrieveProjectKnowledge(supabase as never, {
      projectId: "p1",
      question: "س",
      requesterRole: "owner",
    });

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.entries.length).toBeLessThanOrEqual(8);
  });

  it("returns an empty array cleanly when no rows are above threshold — never throws", async () => {
    const supabase = makeSupabase();
    state.setRpcRows([]);

    const result = await retrieveProjectKnowledge(supabase as never, {
      projectId: "p1",
      question: "سؤال لا علاقة له بأي شيء",
      requesterRole: "member",
    });

    expect(result).toEqual({ ok: true, entries: [] });
  });

  it("returns a typed error when embedding fails, without throwing", async () => {
    state.setEmbedSuccess(false);
    const supabase = makeSupabase();

    const result = await retrieveProjectKnowledge(supabase as never, {
      projectId: "p1",
      question: "س",
      requesterRole: "owner",
    });

    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.error.code).toBe("EMBEDDING_FAILED");
  });

  it("returns a typed error when the RPC fails, without throwing", async () => {
    const supabase = makeSupabase();
    state.setRpcError({ message: "db down" });

    const result = await retrieveProjectKnowledge(supabase as never, {
      projectId: "p1",
      question: "س",
      requesterRole: "owner",
    });

    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.error.code).toBe("RPC_FAILED");
  });
});

// ============================================================
// fetchSupersededPredecessors (Phase C) — الفجوة اللي رصدتها Phase B.
// ============================================================

function makeRetrievedEntry(overrides: Partial<RetrievedEntry> & { id: string }): RetrievedEntry {
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

function predecessorRow(overrides: Partial<Record<string, unknown>> & { id: string; superseded_by: string }) {
  return {
    object_type: "decision",
    object_id: `obj-${overrides.id}`,
    title: overrides.id,
    source_title: overrides.id,
    content: "old content",
    domain: null,
    classification: null,
    confidentiality: "internal",
    status: "superseded",
    version: null,
    is_current: false,
    is_superseded: true,
    metadata: {},
    ...overrides,
  };
}

function makeSupabaseForPredecessors(rows: Array<Record<string, unknown>>, error: { message: string } | null = null) {
  const inCalls: unknown[][] = [];
  const supabase = {
    from: vi.fn((_table: string) => ({
      select: vi.fn((_cols: string) => ({
        in: vi.fn(async (_col: string, ids: unknown[]) => {
          inCalls.push(ids);
          if (error) return { data: null, error };
          return { data: rows, error: null };
        }),
      })),
    })),
  };
  return { supabase, inCalls };
}

describe("fetchSupersededPredecessors", () => {
  it("returns an empty map immediately without querying when there are no entries", async () => {
    const { supabase } = makeSupabaseForPredecessors([]);
    const result = await fetchSupersededPredecessors(supabase as never, []);
    expect(result.size).toBe(0);
    expect(supabase.from).not.toHaveBeenCalled();
  });

  it("issues a single targeted query with all top-level entry ids at once (no N+1)", async () => {
    const { supabase, inCalls } = makeSupabaseForPredecessors([]);
    const entries = [makeRetrievedEntry({ id: "current-1" }), makeRetrievedEntry({ id: "current-2" })];

    await fetchSupersededPredecessors(supabase as never, entries);

    expect(supabase.from).toHaveBeenCalledTimes(1);
    expect(inCalls).toHaveLength(1);
    expect(inCalls[0]).toEqual(expect.arrayContaining(["current-1", "current-2"]));
  });

  it("maps a superseded predecessor row to its current-entry target id", async () => {
    const { supabase } = makeSupabaseForPredecessors([
      predecessorRow({ id: "old-1", superseded_by: "current-1" }),
    ]);
    const entries = [makeRetrievedEntry({ id: "current-1" })];

    const result = await fetchSupersededPredecessors(supabase as never, entries);

    expect(result.has("current-1")).toBe(true);
    expect(result.get("current-1")?.map((e) => e.id)).toEqual(["old-1"]);
    expect(result.get("current-1")?.[0].isSuperseded).toBe(true);
  });

  it("returns an empty map when no row has a matching superseded_by (no predecessor exists)", async () => {
    const { supabase } = makeSupabaseForPredecessors([]);
    const entries = [makeRetrievedEntry({ id: "current-1" })];

    const result = await fetchSupersededPredecessors(supabase as never, entries);

    expect(result.size).toBe(0);
  });

  it("excludes confidential predecessor rows when excludeConfidential=true (member permission gate)", async () => {
    const { supabase } = makeSupabaseForPredecessors([
      predecessorRow({ id: "old-confidential", superseded_by: "current-1", confidentiality: "confidential" }),
      predecessorRow({ id: "old-internal", superseded_by: "current-1", confidentiality: "internal" }),
    ]);
    const entries = [makeRetrievedEntry({ id: "current-1" })];

    const result = await fetchSupersededPredecessors(supabase as never, entries, true);

    const ids = result.get("current-1")?.map((e) => e.id) ?? [];
    expect(ids).not.toContain("old-confidential");
    expect(ids).toContain("old-internal");
  });

  it("returns an empty map (never throws) when the query errors", async () => {
    const { supabase } = makeSupabaseForPredecessors([], { message: "db down" });
    const entries = [makeRetrievedEntry({ id: "current-1" })];

    const result = await fetchSupersededPredecessors(supabase as never, entries);

    expect(result.size).toBe(0);
  });
});
