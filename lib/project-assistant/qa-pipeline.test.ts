import { describe, it, expect, vi, beforeEach } from "vitest";
import type { RetrievedEntry } from "./current-truth-ranking";

const state = vi.hoisted(() => {
  let retrievalResult: unknown = { ok: true, entries: [] };
  let predecessorsMap: Map<string, unknown[]> = new Map();
  let aiResponses: unknown[] = [];
  let aiCallCount = 0;
  const capturedPrompts: string[] = [];

  return {
    setRetrievalResult: (r: unknown) => {
      retrievalResult = r;
    },
    getRetrievalResult: () => retrievalResult,
    setPredecessorsMap: (m: Map<string, unknown[]>) => {
      predecessorsMap = m;
    },
    getPredecessorsMap: () => predecessorsMap,
    /** يسمح بترتيب رد مختلف لكل نداء متتالي — لاختبار عدم وجود Memoization. */
    queueAiResponse: (r: unknown) => {
      aiResponses.push(r);
    },
    resetAiResponses: () => {
      aiResponses = [];
      aiCallCount = 0;
    },
    nextAiResponse: () => {
      const r = aiResponses[aiCallCount] ?? aiResponses[aiResponses.length - 1];
      aiCallCount++;
      return r;
    },
    getAiCallCount: () => aiCallCount,
    capturedPrompts,
    resetPrompts: () => {
      capturedPrompts.length = 0;
    },
  };
});

vi.mock("@/lib/ai/service", () => ({
  AIService: {
    execute: vi.fn(async (_taskType: string, prompt: string) => {
      state.capturedPrompts.push(prompt);
      return state.nextAiResponse();
    }),
  },
}));

vi.mock("./retrieval-service", () => ({
  retrieveProjectKnowledge: vi.fn(async () => state.getRetrievalResult()),
  fetchSupersededPredecessors: vi.fn(async () => state.getPredecessorsMap()),
}));

import { askProjectAssistant } from "./qa-pipeline";
import { AIService } from "@/lib/ai/service";
import { retrieveProjectKnowledge, fetchSupersededPredecessors } from "./retrieval-service";

function makeEntry(overrides: Partial<RetrievedEntry> & { id: string }): RetrievedEntry {
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
    currentTruthRank: 6,
    ...overrides,
  };
}

function aiSuccess(output: Record<string, unknown>) {
  return { success: true, output: JSON.stringify(output), model_used: "test", provider: "gemini", latency_ms: 1, token_usage: null, cost: null, error: null, warnings: [], request_id: "r1" };
}

function aiFailure(code = "PROVIDER_ERROR") {
  return { success: false, output: null, model_used: "test", provider: "gemini", latency_ms: 1, token_usage: null, cost: null, error: { code, message: "boom" }, warnings: [], request_id: "r1" };
}

beforeEach(() => {
  vi.clearAllMocks();
  state.setRetrievalResult({ ok: true, entries: [] });
  state.setPredecessorsMap(new Map());
  state.resetAiResponses();
  state.resetPrompts();
});

const baseInput = { projectId: "p1", question: "ما حالة الاشتراك؟", requesterRole: "owner" as const };

describe("askProjectAssistant — case 1: only Discovery entries, no decision", () => {
  it("references the Discovery source and returns 'documented' (info exists, nothing decided/approved)", async () => {
    const discoveryEntry = makeEntry({ id: "disc-1", objectType: "discovery", currentTruthRank: 6 });
    state.setRetrievalResult({ ok: true, entries: [discoveryEntry] });
    state.queueAiResponse(
      aiSuccess({
        answer_text: "حسب ملاحظات الاكتشاف، الاشتراك شهري.",
        answer_status: "documented",
        cited_source_ids: ["disc-1"],
        conflict_explained: false,
      })
    );

    const result = await askProjectAssistant({} as never, baseInput);

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.answerStatus).toBe("documented");
    expect(result.citations.map((c) => c.sourceId)).toEqual(["disc-1"]);
    expect(result.citations[0].sourceType).toBe("discovery");
  });
});

describe("askProjectAssistant — case 2a: explicit supersede link", () => {
  it("assembles both current+superseded context in the prompt and surfaces conflictExplained=true", async () => {
    const currentDecision = makeEntry({ id: "decision-1", objectType: "decision", classification: "decision", status: "active", currentTruthRank: 1 });
    const oldDiscovery = makeEntry({ id: "old-disc-1", objectType: "discovery", isSuperseded: true, supersededBy: "decision-1", currentTruthRank: 7 });

    state.setRetrievalResult({ ok: true, entries: [currentDecision] });
    state.setPredecessorsMap(new Map([["decision-1", [oldDiscovery]]]));
    state.queueAiResponse(
      aiSuccess({
        answer_text: "كانت المعلومة السابقة X، لكن تم تعديلها لاحقًا إلى Y وفق القرار Z.",
        answer_status: "approved",
        cited_source_ids: ["decision-1", "old-disc-1"],
        conflict_explained: true,
      })
    );

    const result = await askProjectAssistant({} as never, baseInput);

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.conflictExplained).toBe(true);
    expect(result.citations.map((c) => c.sourceId).sort()).toEqual(["decision-1", "old-disc-1"]);

    const [prompt] = state.capturedPrompts;
    expect(prompt).toContain("decision-1");
    expect(prompt).toContain("old-disc-1");
    expect(fetchSupersededPredecessors).toHaveBeenCalledWith({}, [currentDecision], false);
  });
});

describe("askProjectAssistant — case 2b: naturally outranked (no explicit supersede link)", () => {
  it("assembles the prompt with both the Discovery and Decision entries from the same retrieval result", async () => {
    const discoveryEntry = makeEntry({ id: "disc-2", objectType: "discovery", currentTruthRank: 6, similarity: 0.95 });
    const decisionEntry = makeEntry({ id: "decision-2", objectType: "decision", classification: "decision", status: "active", currentTruthRank: 1, similarity: 0.7 });

    // مفيش supersededBy رسمي — الترتيب بس هو اللي بيفوّز.
    state.setRetrievalResult({ ok: true, entries: [decisionEntry, discoveryEntry] });
    state.setPredecessorsMap(new Map());
    state.queueAiResponse(
      aiSuccess({
        answer_text: "القرار الحالي هو المرجع، والملاحظة القديمة كانت مختلفة.",
        answer_status: "approved",
        cited_source_ids: ["decision-2"],
        conflict_explained: false,
      })
    );

    const result = await askProjectAssistant({} as never, baseInput);

    expect(result.ok).toBe(true);
    const [prompt] = state.capturedPrompts;
    expect(prompt).toContain("disc-2");
    expect(prompt).toContain("decision-2");
  });
});

describe("askProjectAssistant — case 3: empty retrieval skips the AI call", () => {
  it("returns a deterministic not_found result and never calls AIService.execute", async () => {
    state.setRetrievalResult({ ok: true, entries: [] });

    const result = await askProjectAssistant({} as never, baseInput);

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.answerStatus).toBe("not_found");
    expect(result.citations).toEqual([]);
    expect(result.answerText).toBe("لا توجد معلومات كافية في المشروع لحسم هذا السؤال.");
    expect(AIService.execute).not.toHaveBeenCalled();
  });
});

describe("askProjectAssistant — case 6: no unintended memoization for repeated question text", () => {
  it("does not cache the previous answer for the same projectId+question", async () => {
    const entry = makeEntry({ id: "e1" });
    state.setRetrievalResult({ ok: true, entries: [entry] });

    state.queueAiResponse(
      aiSuccess({ answer_text: "إجابة أولى", answer_status: "documented", cited_source_ids: ["e1"], conflict_explained: false })
    );
    const first = await askProjectAssistant({} as never, baseInput);

    state.queueAiResponse(
      aiSuccess({ answer_text: "إجابة محدَّثة بعد مزامنة جديدة", answer_status: "approved", cited_source_ids: ["e1"], conflict_explained: false })
    );
    const second = await askProjectAssistant({} as never, baseInput);

    expect(first.ok && second.ok).toBe(true);
    if (!first.ok || !second.ok) return;
    expect(first.answerText).toBe("إجابة أولى");
    expect(second.answerText).toBe("إجابة محدَّثة بعد مزامنة جديدة");
    expect(second.answerStatus).toBe("approved");
    expect(AIService.execute).toHaveBeenCalledTimes(2);
  });
});

describe("askProjectAssistant — case 7: multi-domain retrieval", () => {
  it("citations span multiple distinct source types, answer_status reflects the highest-ranked approved entry", async () => {
    const discovery = makeEntry({ id: "d1", objectType: "discovery", currentTruthRank: 6 });
    const decision = makeEntry({ id: "dec1", objectType: "decision", classification: "decision", status: "approved", currentTruthRank: 1 });
    const prd = makeEntry({ id: "prd1", objectType: "prd_section", status: "approved", currentTruthRank: 2 });
    const story = makeEntry({ id: "us1", objectType: "user_story", status: "approved", currentTruthRank: 3 });

    state.setRetrievalResult({ ok: true, entries: [decision, prd, story, discovery] });
    state.queueAiResponse(
      aiSuccess({
        answer_text: "الإجابة معتمدة استنادًا للقرار.",
        answer_status: "approved",
        cited_source_ids: ["dec1", "prd1", "us1", "d1"],
        conflict_explained: false,
      })
    );

    const result = await askProjectAssistant({} as never, baseInput);

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.answerStatus).toBe("approved");
    const types = new Set(result.citations.map((c) => c.sourceType));
    expect(types.size).toBeGreaterThanOrEqual(3);
  });
});

describe("askProjectAssistant — hallucinated citation stripping (defense in depth)", () => {
  it("never surfaces a citation id that was not actually in the retrieved set", async () => {
    const entry = makeEntry({ id: "real-1" });
    state.setRetrievalResult({ ok: true, entries: [entry] });
    state.queueAiResponse(
      aiSuccess({
        answer_text: "إجابة بها استشهاد مخترَع.",
        answer_status: "documented",
        cited_source_ids: ["real-1", "invented-999"],
        conflict_explained: false,
      })
    );

    const result = await askProjectAssistant({} as never, baseInput);

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.citations.map((c) => c.sourceId)).toEqual(["real-1"]);
  });
});

describe("askProjectAssistant — retrieval failure handling", () => {
  it("returns a clear Arabic ok:false message for EMBEDDING_FAILED, without an AI call", async () => {
    state.setRetrievalResult({ ok: false, error: { code: "EMBEDDING_FAILED", message: "boom" } });

    const result = await askProjectAssistant({} as never, baseInput);

    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.message.length).toBeGreaterThan(0);
    expect(AIService.execute).not.toHaveBeenCalled();
  });

  it("returns a clear Arabic ok:false message for RPC_FAILED, without an AI call", async () => {
    state.setRetrievalResult({ ok: false, error: { code: "RPC_FAILED", message: "db down" } });

    const result = await askProjectAssistant({} as never, baseInput);

    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.message.length).toBeGreaterThan(0);
    expect(AIService.execute).not.toHaveBeenCalled();
  });
});

describe("askProjectAssistant — AI call failure handling", () => {
  it("returns ok:false with a friendly message when AIService.execute fails", async () => {
    const entry = makeEntry({ id: "e1" });
    state.setRetrievalResult({ ok: true, entries: [entry] });
    state.queueAiResponse(aiFailure());

    const result = await askProjectAssistant({} as never, baseInput);

    expect(result.ok).toBe(false);
  });

  it("returns ok:false when the AI response fails validation (invalid JSON)", async () => {
    const entry = makeEntry({ id: "e1" });
    state.setRetrievalResult({ ok: true, entries: [entry] });
    state.queueAiResponse({ success: true, output: "not json", model_used: "test", provider: "gemini", latency_ms: 1, token_usage: null, cost: null, error: null, warnings: [], request_id: "r1" });

    const result = await askProjectAssistant({} as never, baseInput);

    expect(result.ok).toBe(false);
  });
});

describe("askProjectAssistant — passes requesterRole permission gate to fetchSupersededPredecessors", () => {
  it("excludeConfidential=true when requesterRole='member'", async () => {
    const entry = makeEntry({ id: "e1" });
    state.setRetrievalResult({ ok: true, entries: [entry] });
    state.queueAiResponse(
      aiSuccess({ answer_text: "ok", answer_status: "documented", cited_source_ids: ["e1"], conflict_explained: false })
    );

    await askProjectAssistant({} as never, { ...baseInput, requesterRole: "member" });

    expect(fetchSupersededPredecessors).toHaveBeenCalledWith({}, [entry], true);
  });
});

describe("askProjectAssistant — passes domainFilter through to retrieval", () => {
  it("forwards domainFilter to retrieveProjectKnowledge", async () => {
    state.setRetrievalResult({ ok: true, entries: [] });

    await askProjectAssistant({} as never, { ...baseInput, domainFilter: ["meeting"] });

    expect(retrieveProjectKnowledge).toHaveBeenCalledWith(
      {},
      expect.objectContaining({ domainFilter: ["meeting"] })
    );
  });
});
