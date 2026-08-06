import { beforeEach, describe, expect, it, vi } from "vitest";
import type { SupabaseClient } from "@supabase/supabase-js";
import { AIProviderName, AITaskType, type AIRequest, type AIResponse } from "@/lib/ai/types";

/**
 * عقد البوابة ← المزوّد.
 *
 * ## ليه الملف ده موجود
 *
 * البوابة كانت بتنادي المزوّد بأسماء حقول snake_case (`prompt` بدل
 * `input`) مع كاست `as never` على الكائن كله. الكاست ألغى الفحص، فوصل
 * للمزوّد برومبت `undefined`، ورد Gemini بخطأ غامض عن حقل ناقص.
 *
 * العطل عاش من المرحلة التالتة لحد أول طلب حقيقي مرّ من البوابة —
 * لأن مافيش اختبار كان بيتحقّق من **شكل** النداء، والمدقّق اتسكّت.
 *
 * الاختبار ده بيمسك المزوّد ويتأكّد إن اللي وصله صحيح فعلًا.
 */

const captured: AIRequest[] = [];

vi.mock("@/lib/ai/registry", () => ({
  getProvider: () => ({
    name: "gemini",
    execute: async (req: AIRequest): Promise<AIResponse> => {
      captured.push(req);
      return {
        success: true,
        output: "رد المزوّد",
        model_used: req.model,
        provider: AIProviderName.GEMINI,
        latency_ms: 10,
        token_usage: null,
        cost: null,
        error: null,
        warnings: [],
        request_id: "test",
      };
    },
  }),
}));

const { execute } = await import("./index");

/** عميل مزيّف: توجيه لـGemini، بلا تسعير ولا ذاكرة ولا قاطع مفتوح. */
function fakeClient(): SupabaseClient {
  const rows: Record<string, unknown[]> = {
    ai_task_model_config: [
      { task_type: AITaskType.SUPPORT_TRIAGE, provider: "gemini", model: "gemini-3.5-flash" },
    ],
    ai_pricing: [],
  };

  const chain = (table: string) => {
    const target = {
      select: () => target,
      eq: () => target,
      gte: () => target,
      order: () => target,
      limit: () => target,
      maybeSingle: () => Promise.resolve({ data: null, error: null }),
      single: () => Promise.resolve({ data: null, error: null }),
      insert: () => target,
      upsert: () => Promise.resolve({ data: null, error: null }),
      then: (resolve: (v: { data: unknown[]; error: null }) => unknown) =>
        resolve({ data: rows[table] ?? [], error: null }),
    };
    return target;
  };

  return { from: (table: string) => chain(table) } as unknown as SupabaseClient;
}

beforeEach(() => {
  captured.length = 0;
});

describe("عقد النداء بين البوابة والمزوّد", () => {
  it("البرومبت يوصل للمزوّد في الحقل الصحيح وغير فاضي", async () => {
    const prompt = "المستخدم بيسأل عن حالة طلبه";
    const outcome = await execute(
      { taskType: AITaskType.SUPPORT_TRIAGE, prompt },
      fakeClient()
    );

    expect(outcome.status).toBe("ok");
    expect(captured).toHaveLength(1);

    // الحقل ده بالذات هو اللي كان بيوصل undefined.
    expect(captured[0].input).toBe(prompt);
    expect(captured[0].input?.length ?? 0).toBeGreaterThan(0);
  });

  it("النموذج ونوع المهمة يوصلوا بأسمائهم الصحيحة", async () => {
    await execute(
      { taskType: AITaskType.SUPPORT_TRIAGE, prompt: "سؤال" },
      fakeClient()
    );

    expect(captured[0].model).toBe("gemini-3.5-flash");
    expect(captured[0].taskType).toBe(AITaskType.SUPPORT_TRIAGE);
  });

  // الكاست العام كان بيسمح بأي اسم حقل. الفحص ده بيمنع رجوع النمط:
  // أي مفتاح snake_case في النداء معناه إن حدًّا كتب اسمًا من عنده.
  it("مافيش أي مفتاح snake_case في النداء", async () => {
    await execute(
      { taskType: AITaskType.SUPPORT_TRIAGE, prompt: "سؤال" },
      fakeClient()
    );

    const snakeKeys = Object.keys(captured[0]).filter((k) => k.includes("_"));
    expect(snakeKeys, `مفاتيح بأسماء غلط: ${snakeKeys.join(", ")}`).toEqual([]);
  });

  it("السياق يمرّ بأسماء camelCase", async () => {
    await execute(
      {
        taskType: AITaskType.SUPPORT_TRIAGE,
        prompt: "سؤال",
        projectId: "p-1",
        actorId: "u-1",
      },
      fakeClient()
    );

    expect(captured[0].context?.projectId).toBe("p-1");
    expect(captured[0].context?.actorId).toBe("u-1");
  });

  it("التعقيم بيشيل الأسرار قبل ما توصل للمزوّد", async () => {
    await execute(
      {
        taskType: AITaskType.SUPPORT_TRIAGE,
        prompt: "المفتاح بتاعي sk-proj-abcdefghijklmnopqrstuvwxyz123456 ساعدني",
      },
      fakeClient()
    );

    expect(captured[0].input).not.toContain("sk-proj-abcdefghijklmnopqrstuvwxyz123456");
    expect(captured[0].input).toContain("ساعدني");
  });
});
