import { describe, expect, it, vi, beforeEach } from "vitest";

// vi.hoisted: بنجهّز في الأول كل الـ shared state اللي الـ vi.mock() factories
// (اللي بتتحمّل قبل imports) هتحتاجه — عشان نتجنب "before initialization".
const state = vi.hoisted(() => {
  const rows: Record<string, unknown[]> = {
    product_requirements: [],
    user_stories: [],
    acceptance_criteria: [],
    project_recommendations: [],
  };
  const projectRow: { workflow_version: string | null } = { workflow_version: "v2" };

  const makeQuery = (table: string) => {
    const filters: { column: string; value: unknown }[] = [];
    const q: Record<string, unknown> = {
      select: (_cols: string, opts?: { count?: string; head?: boolean }) => {
        if (opts?.count === "exact" && opts.head) {
          return {
            eq: (col: string, val: unknown) => {
              filters.push({ column: col, value: val });
              return Promise.resolve({
                count: (rows[table] ?? []).length,
                error: null,
              });
            },
          };
        }
        return q;
      },
      eq: (col: string, val: unknown) => {
        filters.push({ column: col, value: val });
        if (table === "projects") {
          return {
            maybeSingle: async () => ({ data: projectRow, error: null }),
          };
        }
        return q;
      },
      order: () => q,
      then: (resolve: (v: { data: unknown[]; error: null }) => unknown) =>
        resolve({ data: rows[table] ?? [], error: null }),
    };
    return q;
  };

  const supabase = {
    from: (table: string) => makeQuery(table),
  };

  return { rows, projectRow, supabase };
});

vi.mock("@/lib/supabase/service", () => ({
  createServiceClient: vi.fn(() => state.supabase),
}));

vi.mock("@/lib/feature-flags", () => ({
  isFeatureEnabled: vi.fn(async () => true),
}));

vi.mock("@/lib/brain-v2/downstream-context", () => ({
  getBrainForDownstreamGeneration: vi.fn(async () => ({
    content: {
      executive_summary: { content: "ملخص تنفيذي", approved: true },
    },
    version: 1,
    isApproved: true,
  })),
  formatBrainV2ForPrompt: () => "BRAIN",
  formatAcceptedRecommendationsForPrompt: () => "RECS",
}));

vi.mock("@/lib/domain-library/fusion/fusion-service", () => ({
  buildFusedKnowledgeBlock: vi.fn(async () => ({ text: "" })),
}));

vi.mock("@/lib/ai/execute-with-rate-limit-wait", () => ({
  executeAIWithRateLimitWait: vi.fn(async () => ({
    success: true,
    output: {},
  })),
}));

vi.mock("@/lib/ai/validation/prd-generation", () => ({
  validatePRDGeneration: vi.fn(() => ({ ok: true, data: {} })),
  validatePRDSectionRegeneration: vi.fn(() => ({ ok: true, value: {} })),
}));

vi.mock("./versioning", () => ({
  applyFullGeneration: vi.fn(async () => {}),
  applySectionRegeneration: vi.fn(async () => {}),
  getOrCreatePrd: vi.fn(async () => ({})),
}));

vi.mock("@/lib/ai/prompt-framework", () => ({
  buildContextResult: () => ({ presentKeys: [], blocks: [], sources: [] }),
  computePromptReadiness: () => ({ score: 100 }),
  getProfile: () => ({ ruleKeys: [] }),
  persistPromptGeneration: vi.fn(async () => {}),
}));

vi.mock("@/lib/observability/safe-log", () => ({
  truncateForLog: (s: string) => s,
}));

import {
  getStructuredContextForPRD,
  formatStructuredContextForPrompt,
  isProductModeV2Project,
  PRDGenerationEngine,
  PRD_GATE_MESSAGES,
} from "./generation-service";
import { executeAIWithRateLimitWait } from "@/lib/ai/execute-with-rate-limit-wait";
import { isFeatureEnabled } from "@/lib/feature-flags";

beforeEach(() => {
  vi.clearAllMocks();
  state.rows.product_requirements = [];
  state.rows.user_stories = [];
  state.rows.acceptance_criteria = [];
  state.rows.project_recommendations = [];
  state.projectRow.workflow_version = "v2";
  vi.mocked(isFeatureEnabled).mockResolvedValue(true);
});

describe("getStructuredContextForPRD", () => {
  it("يرجّع أصفار لما مافيش صفوف", async () => {
    const ctx = await getStructuredContextForPRD("p1", state.supabase as never);
    expect(ctx.requirements).toEqual([]);
    expect(ctx.stories).toEqual([]);
    expect(ctx.acceptanceCriteria).toEqual([]);
  });

  it("يقرأ ويحوّل الصفوف من snake_case لـ camelCase", async () => {
    state.rows.product_requirements = [
      {
        id: "r1",
        project_id: "p1",
        code: "REQ-1",
        title: "متطلب أول",
        description: "الوصف",
        requirement_type: "functional",
        priority: "must",
        status: "approved",
        rationale: "",
        acceptance_hint: "",
        effort_estimate: "",
        linked_persona_id: null,
        linked_flow_id: null,
        tags: [],
        created_at: "",
        updated_at: "",
        created_by: null,
      },
    ];
    const ctx = await getStructuredContextForPRD("p1", state.supabase as never);
    expect(ctx.requirements).toHaveLength(1);
    expect(ctx.requirements[0].code).toBe("REQ-1");
    expect(ctx.requirements[0].requirementType).toBe("functional");
  });
});

describe("formatStructuredContextForPrompt", () => {
  it("يرجّع string فاضي لما مافيش أي بيانات", () => {
    expect(
      formatStructuredContextForPrompt({
        requirements: [], stories: [], acceptanceCriteria: [],
        businessRules: [], systemMessages: [], flowsWithDetail: [],
      })
    ).toBe("");
  });

  it("يبني قسم كامل لما فيه requirements + stories + ac", () => {
    const out = formatStructuredContextForPrompt({
      requirements: [
        {
          id: "r1", projectId: "p1", code: "REQ-1", title: "دخول موحّد",
          description: "SSO عبر Google", requirementType: "functional",
          priority: "must", status: "approved", rationale: "", acceptanceHint: "",
          effortEstimate: "", linkedPersonaId: null, linkedFlowId: null, tags: [],
          sourceBrainItemKey: null,
          createdAt: "", updatedAt: "", createdBy: null,
        },
      ],
      stories: [
        {
          id: "s1", projectId: "p1", code: "US-1", title: "تسجيل دخول",
          asA: "مستخدم", iWant: "أدخل بحسابي", soThat: "أوصل لبياناتي",
          narrativeExtra: "", status: "approved", storyPoints: 3,
          businessValue: 80, riskLevel: "low",
          linkedPersonaId: null, linkedFlowId: null, linkedRequirementId: "r1",
          tags: [], createdAt: "", updatedAt: "", createdBy: null,
        },
      ],
      acceptanceCriteria: [
        {
          id: "a1", userStoryId: "s1", projectId: "p1", code: null, orderIndex: 1,
          title: "نجاح", givenClause: "بيانات صحيحة", whenClause: "أضغط دخول",
          thenClause: "أدخل للوحة", andConditions: [], status: "approved",
          notes: "", createdAt: "", updatedAt: "", createdBy: null,
        },
      ],
      businessRules: [],
      systemMessages: [],
      flowsWithDetail: [],
    });
    expect(out).toContain("المصدر الأساسي");
    expect(out).toContain("REQ-1");
    expect(out).toContain("US-1");
    expect(out).toContain("Given بيانات صحيحة");
    expect(out).toContain("المصدر الأساسي");
    expect(out).not.toContain("قواعد العمل والحالات الخاصة");
    expect(out).not.toContain("رسائل النظام");
    expect(out).not.toContain("مواصفات التدفقات التفصيلية");
  });

  it("يبني الأقسام التلاتة الجديدة لما فيه business rules / system messages / flow detail، ويتجاهلها لما تكون فاضية", () => {
    const out = formatStructuredContextForPrompt({
      requirements: [],
      stories: [],
      acceptanceCriteria: [],
      businessRules: [
        {
          id: "b1", projectId: "p1", title: "حد أقصى لإعادة الجدولة",
          triggerCondition: "طلب إعادة جدولة", thresholdValue: "3 مرات",
          onViolation: "منع الإجراء", enforcementPoint: "server",
          linkedFlowId: null, notes: "",
          createdAt: "", updatedAt: "", createdBy: null,
        },
      ],
      systemMessages: [
        {
          id: "m1", projectId: "p1", eventName: "رصيد غير كافٍ",
          messageType: "error", messageText: "لا يوجد رصيد كافٍ لإتمام العملية",
          linkedFlowId: null, notes: "",
          createdAt: "", updatedAt: "", createdBy: null,
        },
      ],
      flowsWithDetail: [
        {
          id: "f1", projectId: "p1", personaId: null, name: "تسجيل الدخول",
          description: "", flowType: "primary", triggerEvent: "", successOutcome: "",
          steps: [
            {
              order: 1, action: "إدخال البريد وكلمة المرور", expectedResult: "", notes: "",
              uiElements: [{ fieldName: "البريد", fieldType: "نص", validationRule: "صيغة بريد صالحة" }],
              successMessage: "تم الدخول", errorMessages: ["بيانات غير صحيحة"],
            },
          ],
          notes: "",
          createdAt: "", updatedAt: "", createdBy: null,
        },
      ],
    });
    expect(out).toContain("قواعد العمل والحالات الخاصة");
    expect(out).toContain("حد أقصى لإعادة الجدولة");
    expect(out).toContain("3 مرات");
    expect(out).toContain("رسائل النظام");
    expect(out).toContain("رصيد غير كافٍ");
    expect(out).toContain("مواصفات التدفقات التفصيلية");
    expect(out).toContain("صيغة بريد صالحة");
    expect(out).toContain("تم الدخول");
    expect(out).toContain("بيانات غير صحيحة");
  });
});

describe("isProductModeV2Project", () => {
  it("v2 + product_mode مفعّل → true", async () => {
    state.projectRow.workflow_version = "v2";
    vi.mocked(isFeatureEnabled).mockResolvedValue(true);
    await expect(isProductModeV2Project(state.supabase as never, "p1")).resolves.toBe(true);
  });
  it("v1 → false مهما كان الفلاج", async () => {
    state.projectRow.workflow_version = "v1";
    vi.mocked(isFeatureEnabled).mockResolvedValue(true);
    await expect(isProductModeV2Project(state.supabase as never, "p1")).resolves.toBe(false);
  });
  it("v2 لكن product_mode معطّل → false", async () => {
    state.projectRow.workflow_version = "v2";
    vi.mocked(isFeatureEnabled).mockResolvedValue(false);
    await expect(isProductModeV2Project(state.supabase as never, "p1")).resolves.toBe(false);
  });
});

describe("PRDGenerationEngine.runFullGenerationCore — gate", () => {
  it("Product Mode v2 + مفيش requirements → يفشل بالرسالة الواضحة قبل أي AI call", async () => {
    state.projectRow.workflow_version = "v2";
    state.rows.product_requirements = [];

    // نستبدل الـ update اللي بيعمله releaseLockAsFailed بمراقبة الرسالة.
    let capturedError = "";
    const origFrom = state.supabase.from;
    state.supabase.from = ((table: string) => {
      if (table === "prd") {
        return {
          upsert: async () => ({ error: null }),
          update: (patch: { last_error?: string }) => {
            if (patch.last_error) capturedError = patch.last_error;
            return { eq: () => ({ or: () => ({ select: async () => ({ data: [{}], error: null }) }) }), };
          },
        } as unknown;
      }
      return origFrom(table);
    }) as typeof origFrom;

    await PRDGenerationEngine.runFullGenerationCore("p1", "full_generation");

    state.supabase.from = origFrom;
    expect(capturedError).toBe(PRD_GATE_MESSAGES.missingRequirements);
    expect(executeAIWithRateLimitWait).not.toHaveBeenCalled();
  });

  it("v1 project → مفيش gate حتى لو الجداول فاضية (backwards compat)", async () => {
    state.projectRow.workflow_version = "v1";
    state.rows.product_requirements = [];

    const origFrom = state.supabase.from;
    state.supabase.from = ((table: string) => {
      if (table === "prd") {
        return {
          upsert: async () => ({ error: null }),
          update: () => ({
            eq: () => ({ or: () => ({ select: async () => ({ data: [{}], error: null }) }) }),
          }),
        } as unknown;
      }
      return origFrom(table);
    }) as typeof origFrom;

    await PRDGenerationEngine.runFullGenerationCore("p1", "full_generation");

    state.supabase.from = origFrom;
    // AI اتنادى (مفيش gate)
    expect(executeAIWithRateLimitWait).toHaveBeenCalled();
  });

  it("Product Mode v2 + فيه requirements → التوليد يمشي طبيعي", async () => {
    state.projectRow.workflow_version = "v2";
    state.rows.product_requirements = [
      {
        id: "r1", project_id: "p1", code: "REQ-1", title: "متطلب",
        description: "", requirement_type: "functional", priority: "must",
        status: "approved", rationale: "", acceptance_hint: "",
        effort_estimate: "", linked_persona_id: null, linked_flow_id: null,
        tags: [], created_at: "", updated_at: "", created_by: null,
      },
    ];

    const origFrom = state.supabase.from;
    state.supabase.from = ((table: string) => {
      if (table === "prd") {
        return {
          upsert: async () => ({ error: null }),
          update: () => ({
            eq: () => ({ or: () => ({ select: async () => ({ data: [{}], error: null }) }) }),
          }),
        } as unknown;
      }
      return origFrom(table);
    }) as typeof origFrom;

    await PRDGenerationEngine.runFullGenerationCore("p1", "full_generation");

    state.supabase.from = origFrom;
    expect(executeAIWithRateLimitWait).toHaveBeenCalled();
  });
});
