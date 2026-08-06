import { beforeEach, describe, expect, it, vi } from "vitest";
import type { SupabaseClient } from "@supabase/supabase-js";
import { AIProviderName, AITaskType, type AIResponse } from "@/lib/ai/types";

const enqueue = vi.fn();
const getJob = vi.fn();

vi.mock("@/lib/queue/service", () => ({
  enqueue: (...args: unknown[]) => enqueue(...args),
  getJob: (...args: unknown[]) => getJob(...args),
}));

const { routeExecution, invalidateWorkerCache, waitBudgetFor } = await import("./ai-adapter");
const { invalidateFlagCache } = await import("./flag-store");

/**
 * عميل قاعدة بيانات مزيّف — يردّ صفوفًا ثابتة لكل جدول.
 *
 * السلاسل في supabase-js تُنتظَر في نهايتها، فكل حلقة ترجّع نفسها
 * وتحمل `then` — ده أبسط شكل يحاكي السلوك بلا مكتبة.
 */
function fakeClient(rows: Record<string, unknown[]>, inserts: Record<string, unknown[]> = {}) {
  const chain = (table: string) => {
    const target = {
      select: () => target,
      eq: () => target,
      neq: () => target,
      gte: () => target,
      limit: () => target,
      insert: (value: unknown) => {
        (inserts[table] ??= []).push(value);
        return Promise.resolve({ data: null, error: null });
      },
      upsert: () => Promise.resolve({ data: null, error: null }),
      then: (resolve: (value: { data: unknown[]; error: null }) => unknown) =>
        resolve({ data: rows[table] ?? [], error: null }),
    };
    return target;
  };

  return { from: (table: string) => chain(table) } as unknown as SupabaseClient;
}

const LEGACY_RESPONSE: AIResponse = {
  success: true,
  output: "نتيجة المسار القديم",
  model_used: "gemini-3.5-flash",
  provider: AIProviderName.GEMINI,
  latency_ms: 120,
  token_usage: null,
  cost: null,
  error: null,
  warnings: [],
  request_id: "legacy-1",
};

const ROUTE = {
  taskType: AITaskType.MEETING_EXTRACTION,
  input: "نص الاجتماع",
};

const FLAG_ON = [{ service: "meeting", state: "on", rollout_percent: 100, updated_at: new Date(0).toISOString() }];
const WORKER_ALIVE = [{ handled_types: ["ai.meeting"] }];

beforeEach(() => {
  vi.clearAllMocks();
  invalidateFlagCache();
  invalidateWorkerCache();
  delete process.env.MIGRATION_KILL_SWITCH;
  delete process.env.MIGRATE_MEETING;
});

describe("تسجيل الأنواع عند المُدرِج", () => {
  // اختبار انحدار لعطل حقيقي ظهر في أول تشغيل إنتاجي: التسجيل كان
  // بيحصل في عملية العامل وحدها، فتطبيق Next.js ما كانش يعرف الأنواع،
  // وكل محاولة نقل كانت ترجع للقديم بـ«نوع مهمة غير مسجّل».
  it("مجرّد استيراد المحوّل يسجّل كل أنواع الذكاء الاصطناعي", async () => {
    const { isRegisteredType } = await import("@/lib/queue/registry");
    for (const type of ["ai.support", "ai.meeting", "ai.discovery", "ai.brain", "ai.prd"]) {
      expect(isRegisteredType(type), `${type} مش مسجّل`).toBe(true);
    }
  });
});

describe("ميزانية الانتظار", () => {
  // رقم ثابت أقصر من مهلة النوع كان بيخلّي المستخدم يستنّى المهلة
  // كاملة ثم يستنّاها تاني على المسار القديم — ضِعف الانتظار بلا فايدة.
  it("المهام التقيلة تاخد انتظارًا أطول من الخفيفة", () => {
    expect(waitBudgetFor("ai.qa")).toBeGreaterThan(waitBudgetFor("ai.support"));
  });

  it("الانتظار دايمًا أطول من مهلة النوع نفسه", () => {
    // 60 ثانية مهلة الدعم + هامش.
    expect(waitBudgetFor("ai.support")).toBeGreaterThan(60_000);
  });

  it("مافيش انتظار يتجاوز السقف المطلق", () => {
    for (const type of ["ai.qa", "ai.monitoring", "ai.prd", "ai.discovery"]) {
      expect(waitBudgetFor(type)).toBeLessThanOrEqual(300_000);
    }
  });

  it("نوع غير معروف ياخد الافتراضي بدل ما ينهار", () => {
    expect(waitBudgetFor("ai.does-not-exist")).toBeGreaterThan(0);
  });
});

describe("الافتراض الآمن", () => {
  it("بلا أعلام، ينفّذ المسار القديم ولا يُدرج شيئًا", async () => {
    const legacy = vi.fn(async () => LEGACY_RESPONSE);
    const result = await routeExecution(ROUTE, legacy, fakeClient({}));

    expect(result).toEqual(LEGACY_RESPONSE);
    expect(legacy).toHaveBeenCalledOnce();
    expect(enqueue).not.toHaveBeenCalled();
  });

  it("مفتاح الإيقاف العام يغلب علمًا مفعّلًا بالكامل", async () => {
    process.env.MIGRATION_KILL_SWITCH = "on";
    const legacy = vi.fn(async () => LEGACY_RESPONSE);

    await routeExecution(ROUTE, legacy, fakeClient({ migration_flags: FLAG_ON, queue_workers: WORKER_ALIVE }));

    expect(legacy).toHaveBeenCalledOnce();
    expect(enqueue).not.toHaveBeenCalled();
  });
});

describe("الحارس: لا إدراج بلا عامل حيّ", () => {
  // الخاصية الأخطر في المرحلة كلها. لولاها، فتح العلم قبل نشر العامل
  // على Railway كان بيوقف كل نداء ذكاء اصطناعي في المنصة لثلاث دقائق
  // ثم يفشل — أي تعطّل كامل بسبب تبديل إعداد.
  it("علم مفعّل بلا عامل حيّ = المسار القديم بلا إدراج", async () => {
    const legacy = vi.fn(async () => LEGACY_RESPONSE);
    const result = await routeExecution(
      ROUTE,
      legacy,
      fakeClient({ migration_flags: FLAG_ON, queue_workers: [] })
    );

    expect(result).toEqual(LEGACY_RESPONSE);
    expect(enqueue).not.toHaveBeenCalled();
  });

  it("عامل حيّ لنوع آخر لا يُحسب", async () => {
    const legacy = vi.fn(async () => LEGACY_RESPONSE);
    await routeExecution(
      ROUTE,
      legacy,
      fakeClient({ migration_flags: FLAG_ON, queue_workers: [{ handled_types: ["ai.support"] }] })
    );

    expect(enqueue).not.toHaveBeenCalled();
    expect(legacy).toHaveBeenCalledOnce();
  });
});

describe("المسار الجديد", () => {
  it("يُدرج وينتظر ويرجّع نتيجة بنفس شكل الرد القديم", async () => {
    enqueue.mockResolvedValue({ status: "created", job: { id: "job-1" } });
    getJob.mockResolvedValue({
      id: "job-1",
      status: "completed",
      result: { output: "نتيجة العامل", provider: "gemini", model: "gemini-3.5-flash" },
      execution_time_ms: 4321,
      estimated_cost_usd: 0.002,
      metadata: {},
    });

    const legacy = vi.fn(async () => LEGACY_RESPONSE);
    const result = await routeExecution(
      ROUTE,
      legacy,
      fakeClient({ migration_flags: FLAG_ON, queue_workers: WORKER_ALIVE })
    );

    expect(legacy).not.toHaveBeenCalled();
    expect(result.success).toBe(true);
    expect(result.output).toBe("نتيجة العامل");
    expect(result.model_used).toBe("gemini-3.5-flash");
    expect(result.provider).toBe(AIProviderName.GEMINI);
    expect(result.latency_ms).toBe(4321);
    // شكل الرد لازم يفضل مطابقًا للقديم حرفيًا — أي مفتاح ناقص بيكسر
    // مستدعيًا من الواحد والثلاثين بلا ما يعدّل أحد سطرًا فيه.
    expect(Object.keys(result).sort()).toEqual(Object.keys(LEGACY_RESPONSE).sort());
  });

  it("مهمة فاشلة ترجع للمسار القديم لا تُمرَّر كفشل للمستخدم", async () => {
    enqueue.mockResolvedValue({ status: "created", job: { id: "job-2" } });
    getJob.mockResolvedValue({ id: "job-2", status: "failed", result: null, metadata: {} });

    const legacy = vi.fn(async () => LEGACY_RESPONSE);
    const result = await routeExecution(
      ROUTE,
      legacy,
      fakeClient({ migration_flags: FLAG_ON, queue_workers: WORKER_ALIVE })
    );

    expect(result).toEqual(LEGACY_RESPONSE);
    expect(legacy).toHaveBeenCalledOnce();
  });

  it("رفض الإدراج (ضغط عكسي) يرجع للقديم", async () => {
    enqueue.mockResolvedValue({ status: "rejected", reason: "الطابور ممتلئ" });

    const legacy = vi.fn(async () => LEGACY_RESPONSE);
    const result = await routeExecution(
      ROUTE,
      legacy,
      fakeClient({ migration_flags: FLAG_ON, queue_workers: WORKER_ALIVE })
    );

    expect(result).toEqual(LEGACY_RESPONSE);
  });

  it("عطل غير متوقّع في الطابور لا يصل للمستدعي", async () => {
    enqueue.mockRejectedValue(new Error("انقطع الاتصال"));

    const legacy = vi.fn(async () => LEGACY_RESPONSE);
    const result = await routeExecution(
      ROUTE,
      legacy,
      fakeClient({ migration_flags: FLAG_ON, queue_workers: WORKER_ALIVE })
    );

    expect(result).toEqual(LEGACY_RESPONSE);
  });
});

describe("الوسائط", () => {
  it("طلب يحمل وسائط يبقى على القديم حتى لو العلم مفعّل والعامل حيّ", async () => {
    const legacy = vi.fn(async () => LEGACY_RESPONSE);
    await routeExecution(
      { ...ROUTE, context: { media: { mimeType: "audio/mpeg", data: "..." } } },
      legacy,
      fakeClient({ migration_flags: FLAG_ON, queue_workers: WORKER_ALIVE })
    );

    expect(enqueue).not.toHaveBeenCalled();
    expect(legacy).toHaveBeenCalledOnce();
  });
});

describe("القياس", () => {
  it("يسجّل صفّ مقارنة يحمل سبب الرجوع", async () => {
    const inserts: Record<string, unknown[]> = {};
    const client = fakeClient({ migration_flags: FLAG_ON, queue_workers: [] }, inserts);

    await routeExecution(ROUTE, async () => LEGACY_RESPONSE, client);

    const rows = inserts.migration_comparisons as Array<Record<string, unknown>>;
    expect(rows).toHaveLength(1);
    expect(rows[0].service).toBe("meeting");
    expect(rows[0].path).toBe("legacy");
    expect(String(rows[0].reason)).toContain("عامل حيّ");
  });
});
