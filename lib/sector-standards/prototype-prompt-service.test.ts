import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("server-only", () => ({}));

const state = vi.hoisted(() => {
  let changeRequest: unknown = null;
  let impacts: unknown[] = [];
  let aiResponse: unknown = null;
  const capturedPrompts: string[] = [];
  const insertedRows: Record<string, unknown>[] = [];

  return {
    setChangeRequest: (cr: unknown) => {
      changeRequest = cr;
    },
    getChangeRequest: () => changeRequest,
    setImpacts: (i: unknown[]) => {
      impacts = i;
    },
    getImpacts: () => impacts,
    setAiResponse: (r: unknown) => {
      aiResponse = r;
    },
    getAiResponse: () => aiResponse,
    capturedPrompts,
    insertedRows,
  };
});

vi.mock("@/lib/ai/service", () => ({
  AIService: {
    execute: vi.fn(async (_taskType: string, prompt: string) => {
      state.capturedPrompts.push(prompt);
      return state.getAiResponse();
    }),
  },
}));

vi.mock("./change-request-service", () => ({
  getChangeRequest: vi.fn(async () => state.getChangeRequest()),
  listChangeImpacts: vi.fn(async () => state.getImpacts()),
}));

vi.mock("@/lib/supabase/service", () => ({
  createServiceClient: () => ({
    from: (table: string) => {
      if (table === "prototype_change_prompts") {
        return {
          insert: (row: Record<string, unknown>) => ({
            select: () => ({
              async single() {
                const full = {
                  id: "prompt-1",
                  generated_at: "2026-01-01T00:00:00.000Z",
                  ...row,
                };
                state.insertedRows.push(full);
                return { data: full, error: null };
              },
            }),
          }),
        };
      }
      throw new Error(`جدول غير متوقّع: ${table}`);
    },
  }),
}));

vi.mock("@/lib/supabase/server", () => ({
  createClient: async () => ({
    from: (table: string) => {
      if (table === "prototype_change_prompts") {
        return {
          select: () => ({
            eq: () => ({
              order: () => ({ data: state.insertedRows, error: null }),
            }),
          }),
        };
      }
      throw new Error(`جدول غير متوقّع: ${table}`);
    },
  }),
}));

import { generatePrototypeChangePrompt, listPrototypeChangePrompts } from "./prototype-prompt-service";
import { AIService } from "@/lib/ai/service";

function aiSuccess(promptText: string) {
  return {
    success: true,
    output: JSON.stringify({ prompt_text: promptText }),
    model_used: "test",
    provider: "gemini",
    latency_ms: 1,
    token_usage: null,
    cost: null,
    error: null,
    warnings: [],
    request_id: "r1",
  };
}

function aiFailure() {
  return {
    success: false,
    output: null,
    model_used: "test",
    provider: "gemini",
    latency_ms: 1,
    token_usage: null,
    cost: null,
    error: { code: "PROVIDER_ERROR", message: "boom" },
    warnings: [],
    request_id: "r1",
  };
}

const baseChangeRequest = {
  id: "cr-1",
  projectId: "p1",
  type: "modify" as const,
  title: "تعديل سعر الحجز",
  description: "السعر يبقى 50 بدل 40",
  sourceType: null,
  sourceId: null,
  status: "applied" as const,
  createdBy: "u1",
  createdAt: "2026-01-01T00:00:00.000Z",
  updatedAt: "2026-01-01T00:00:00.000Z",
};

function makeImpact(overrides: Partial<Record<string, unknown>> & { id: string; status: string }) {
  return {
    changeRequestId: "cr-1",
    artifactType: "requirement",
    artifactId: "req-1",
    artifactLabel: "REQ-1",
    impactType: "modify",
    reason: "سبب",
    proposedChange: { priceLimit: 50 },
    dependencies: [],
    missingInformation: "",
    createdAt: "2026-01-01T00:00:00.000Z",
    ...overrides,
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  state.capturedPrompts.length = 0;
  state.insertedRows.length = 0;
  state.setChangeRequest({ ...baseChangeRequest });
  state.setImpacts([]);
  state.setAiResponse(null);
});

describe("generatePrototypeChangePrompt — طلب تغيير غير موجود", () => {
  it("يرجّع ok:false بدون أي نداء AI", async () => {
    state.setChangeRequest(null);
    const result = await generatePrototypeChangePrompt("cr-missing", "u1");
    expect(result.ok).toBe(false);
    expect(AIService.execute).not.toHaveBeenCalled();
  });
});

describe("generatePrototypeChangePrompt — يرفض بدون أثر مُطبَّق", () => {
  it("مفيش أي أثر applied يرفض بدون نداء AI", async () => {
    state.setImpacts([makeImpact({ id: "i1", status: "proposed" }), makeImpact({ id: "i2", status: "approved" })]);
    const result = await generatePrototypeChangePrompt("cr-1", "u1");
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.message).toMatch(/مُطبَّق/);
    expect(AIService.execute).not.toHaveBeenCalled();
  });
});

describe("generatePrototypeChangePrompt — المسار الناجح", () => {
  it("بيولّد ويحفظ Prompt مبني على الأثر المُطبَّق فعليًا (مش عام)", async () => {
    state.setImpacts([
      makeImpact({ id: "i1", status: "applied", artifactId: "req-1", artifactLabel: "REQ-1", proposedChange: { priceLimit: 50 } }),
      makeImpact({ id: "i2", status: "proposed" }), // ما ينفعش يُستخدم — لسه مش مُطبَّق
    ]);
    state.setAiResponse(aiSuccess("Update the booking price field to enforce a max of 50. Preserve all other flows, the existing design system, and RTL layout. Do not add unrelated features."));

    const result = await generatePrototypeChangePrompt("cr-1", "u1", "claude_code");

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.prompt.promptText).toContain("booking price");
    expect(result.prompt.prototypeTool).toBe("claude_code");
    expect(result.prompt.changeRequestId).toBe("cr-1");

    // الـ prompt المُرسَل للـ AI لازم يحتوي تفاصيل الأثر المُطبَّق الحقيقي، مش حشو عام
    const [sentPrompt] = state.capturedPrompts;
    expect(sentPrompt).toContain("req-1");
    expect(sentPrompt).toContain("priceLimit");
    expect(sentPrompt).not.toContain("i2"); // الأثر غير المُطبَّق ما يتبعتش أصلًا
  });

  it("فشل نداء AI يرجّع ok:false برسالة واضحة", async () => {
    state.setImpacts([makeImpact({ id: "i1", status: "applied" })]);
    state.setAiResponse(aiFailure());

    const result = await generatePrototypeChangePrompt("cr-1", "u1");
    expect(result.ok).toBe(false);
  });

  it("فشل التحقق (رد غير JSON صالح) يرجّع ok:false", async () => {
    state.setImpacts([makeImpact({ id: "i1", status: "applied" })]);
    state.setAiResponse({ success: true, output: "not json", model_used: "test", provider: "gemini", latency_ms: 1, token_usage: null, cost: null, error: null, warnings: [], request_id: "r1" });

    const result = await generatePrototypeChangePrompt("cr-1", "u1");
    expect(result.ok).toBe(false);
  });
});

describe("listPrototypeChangePrompts", () => {
  it("يرجّع Prompts المخزَّنة لنفس طلب التغيير", async () => {
    state.setImpacts([makeImpact({ id: "i1", status: "applied" })]);
    state.setAiResponse(aiSuccess("A concrete, scoped prompt describing only the applied change."));
    await generatePrototypeChangePrompt("cr-1", "u1");

    const list = await listPrototypeChangePrompts("cr-1");
    expect(list).toHaveLength(1);
    expect(list[0].changeRequestId).toBe("cr-1");
  });
});
