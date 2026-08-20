import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("server-only", () => ({}));

const state = vi.hoisted(() => {
  let changeRequest: unknown = null;
  const statusHistory: string[] = [];
  let aiResponse: unknown = null;
  const capturedPrompts: string[] = [];
  let createdImpacts: unknown[] = [];
  let prdRow: Record<string, unknown> | null = null;

  return {
    setChangeRequest: (cr: unknown) => {
      changeRequest = cr;
    },
    getChangeRequest: () => changeRequest,
    statusHistory,
    setAiResponse: (r: unknown) => {
      aiResponse = r;
    },
    getAiResponse: () => aiResponse,
    capturedPrompts,
    getCreatedImpacts: () => createdImpacts,
    setCreatedImpactsCapture: (v: unknown[]) => {
      createdImpacts = v;
    },
    setPrdRow: (r: Record<string, unknown> | null) => {
      prdRow = r;
    },
    getPrdRow: () => prdRow,
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
  updateChangeRequestStatus: vi.fn(async (_id: string, status: string) => {
    state.statusHistory.push(status);
    return { ...(state.getChangeRequest() as Record<string, unknown>), status };
  }),
  createChangeImpacts: vi.fn(async (_id: string, impacts: unknown[]) => {
    state.setCreatedImpactsCapture(impacts);
    return impacts.map((i, idx) => ({ id: `impact-${idx}`, changeRequestId: _id, status: "proposed", ...(i as Record<string, unknown>) }));
  }),
}));

vi.mock("@/lib/product-definition/service", () => ({
  listPersonas: vi.fn(async () => [{ id: "persona-1", name: "طبيب", role: "Doctor", segment: "", jobsToBeDone: "", goals: "", pains: "", isPrimary: true }]),
  listFlows: vi.fn(async () => []),
  listRequirements: vi.fn(async () => [
    { id: "req-1", code: "REQ-1", title: "نظام حجز", description: "", requirementType: "functional", priority: "must", status: "approved", rationale: "" },
  ]),
}));

vi.mock("@/lib/product-definition/business-rules-service", () => ({
  listBusinessRules: vi.fn(async () => []),
}));

vi.mock("@/lib/product-definition/system-messages-service", () => ({
  listSystemMessages: vi.fn(async () => []),
}));

vi.mock("@/lib/product-definition/state-machine-service", () => ({
  listStateMachines: vi.fn(async () => []),
}));

vi.mock("@/lib/user-stories/service", () => ({
  listStories: vi.fn(async () => [
    { id: "story-1", code: "US-1", title: "حجز موعد", asA: "مريض", iWant: "أحجز", soThat: "أشوف الدكتور", status: "approved" },
  ]),
  listAcceptanceCriteria: vi.fn(async () => []),
}));

vi.mock("@/lib/organizational-intelligence/decision-memory-service", () => ({
  getDecisionMemory: vi.fn(async () => []),
}));

vi.mock("@/lib/supabase/service", () => ({
  createServiceClient: () => ({
    from: (table: string) => {
      if (table === "prd") {
        return {
          select: () => ({
            eq: () => ({
              async maybeSingle() {
                return { data: state.getPrdRow(), error: null };
              },
            }),
          }),
        };
      }
      throw new Error(`جدول غير متوقّع: ${table}`);
    },
  }),
}));

import { runImpactAnalysis } from "./impact-analysis-pipeline";
import { updateChangeRequestStatus, createChangeImpacts } from "./change-request-service";

function aiSuccess(output: Record<string, unknown>) {
  return { success: true, output: JSON.stringify(output), model_used: "test", provider: "gemini", latency_ms: 1, token_usage: null, cost: null, error: null, warnings: [], request_id: "r1" };
}

function aiFailure() {
  return { success: false, output: null, model_used: "test", provider: "gemini", latency_ms: 1, token_usage: null, cost: null, error: { code: "PROVIDER_ERROR", message: "boom" }, warnings: [], request_id: "r1" };
}

const baseChangeRequest = {
  id: "cr-1",
  projectId: "p1",
  type: "modify" as const,
  title: "تعديل سعر الحجز",
  description: "السعر يبقى 50 بدل 40",
  sourceType: null,
  sourceId: null,
  status: "draft" as const,
  createdBy: "u1",
  createdAt: "2026-01-01T00:00:00.000Z",
  updatedAt: "2026-01-01T00:00:00.000Z",
};

beforeEach(() => {
  vi.clearAllMocks();
  state.statusHistory.length = 0;
  state.capturedPrompts.length = 0;
  state.setChangeRequest({ ...baseChangeRequest });
  state.setPrdRow(null);
});

describe("runImpactAnalysis — طلب تغيير غير موجود", () => {
  it("يرجّع ok:false بدون أي نداء AI", async () => {
    state.setChangeRequest(null);
    const result = await runImpactAnalysis("p1", "cr-missing");
    expect(result.ok).toBe(false);
  });
});

describe("runImpactAnalysis — المسار الناجح", () => {
  it("draft → analyzing → needs_review، والـ prompt بيحتوي سياق منتج حقيقي، والأثر بيتحفظ status=proposed", async () => {
    state.setAiResponse(
      aiSuccess({
        impacts: [
          {
            artifact_type: "requirement",
            artifact_id: "req-1",
            artifact_label: "REQ-1",
            impact_type: "modify",
            reason: "السعر اتغيّر حسب طلب التغيير",
            proposed_change: { title: "نظام حجز — سعر محدَّث" },
            dependencies: [],
            missing_information: "",
          },
        ],
      })
    );

    const result = await runImpactAnalysis("p1", "cr-1");

    expect(result.ok).toBe(true);
    expect(state.statusHistory).toEqual(["analyzing", "needs_review"]);
    expect(updateChangeRequestStatus).toHaveBeenCalledTimes(2);

    const [prompt] = state.capturedPrompts;
    expect(prompt).toContain("req-1");
    expect(prompt).toContain("نظام حجز");
    expect(prompt).toContain("story-1");
    expect(prompt).toContain("persona-1");

    expect(createChangeImpacts).toHaveBeenCalledTimes(1);
    const [, insertedImpacts] = (createChangeImpacts as ReturnType<typeof vi.fn>).mock.calls[0];
    expect(insertedImpacts).toHaveLength(1);
    expect(insertedImpacts[0].artifactId).toBe("req-1");

    if (result.ok) {
      expect(result.impacts).toHaveLength(1);
    }
  });

  it("يقصّ artifact_id مخترَع غير موجود في السياق الحقيقي (impact_type != add)", async () => {
    state.setAiResponse(
      aiSuccess({
        impacts: [
          {
            artifact_type: "requirement",
            artifact_id: "req-invented-999",
            artifact_label: "REQ وهمي",
            impact_type: "modify",
            reason: "سبب",
            proposed_change: {},
            dependencies: [],
            missing_information: "",
          },
          {
            artifact_type: "requirement",
            artifact_id: "req-1",
            artifact_label: "REQ-1",
            impact_type: "modify",
            reason: "سبب حقيقي",
            proposed_change: { title: "محدَّث" },
            dependencies: [],
            missing_information: "",
          },
        ],
      })
    );

    const result = await runImpactAnalysis("p1", "cr-1");
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.impacts).toHaveLength(1);
    expect(result.impacts[0].artifactId).toBe("req-1");
  });

  it("يقبل artifact_id=null لعنصر impact_type=add", async () => {
    state.setAiResponse(
      aiSuccess({
        impacts: [
          {
            artifact_type: "requirement",
            artifact_id: null,
            artifact_label: "متطلب جديد",
            impact_type: "add",
            reason: "طلب تغيير من نوع إضافة",
            proposed_change: { title: "متطلب جديد" },
            dependencies: [],
            missing_information: "",
          },
        ],
      })
    );

    const result = await runImpactAnalysis("p1", "cr-1");
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.impacts).toHaveLength(1);
    expect(result.impacts[0].artifactId).toBeNull();
  });
});

describe("runImpactAnalysis — معالجة الفشل", () => {
  it("فشل نداء AI: الحالة ترجع لـ draft، مفيش أثر بيتحفظ", async () => {
    state.setAiResponse(aiFailure());
    const result = await runImpactAnalysis("p1", "cr-1");
    expect(result.ok).toBe(false);
    expect(state.statusHistory).toEqual(["analyzing", "draft"]);
    expect(createChangeImpacts).not.toHaveBeenCalled();
  });

  it("فشل التحقق (رد غير JSON صالح): الحالة ترجع لـ draft", async () => {
    state.setAiResponse({ success: true, output: "not json", model_used: "test", provider: "gemini", latency_ms: 1, token_usage: null, cost: null, error: null, warnings: [], request_id: "r1" });
    const result = await runImpactAnalysis("p1", "cr-1");
    expect(result.ok).toBe(false);
    expect(state.statusHistory).toEqual(["analyzing", "draft"]);
  });
});
