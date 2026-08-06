import { describe, expect, it, vi, beforeEach, afterEach } from "vitest";
import { GeminiProvider } from "./gemini";
import { RateLimitError, AuthenticationError, ProviderError } from "../errors";
import { AITaskType } from "../types";
import { invalidateKeyCache } from "../key-store";

function jsonResponse(status: number, body: unknown): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

const baseRequest = {
  taskType: AITaskType.DISCOVERY_ANALYSIS,
  input: "test",
  model: "gemini-2.5-flash",
};

describe("GeminiProvider multi-key rotation", () => {
  const originalEnv = { ...process.env };

  beforeEach(() => {
    vi.restoreAllMocks();
    // اعزل مخزن مفاتيح قاعدة البيانات عن اختبارات البيئة: بلا مفتاح تشفير
    // لا يُقرأ الجدول، وإبطال التخزين المؤقّت يضمن التقاط env كل اختبار.
    delete process.env.MIGRATION_SECRET_KEY;
    invalidateKeyCache();
  });
  afterEach(() => {
    process.env = { ...originalEnv };
    invalidateKeyCache();
  });

  it("يستخدم مفتاح واحد لو مفيش غيره (توافق خلفي)", async () => {
    process.env.GEMINI_API_KEY = "key-a";
    delete process.env.GEMINI_API_KEY_2;

    const calls: string[] = [];
    vi.stubGlobal(
      "fetch",
      vi.fn(async (url: string) => {
        calls.push(url);
        return jsonResponse(200, { candidates: [{ content: { parts: [{ text: "ok" }] } }] });
      })
    );

    const provider = new GeminiProvider();
    const res = await provider.execute(baseRequest);
    expect(res.success).toBe(true);
    expect(calls).toHaveLength(1);
    expect(calls[0]).toContain("key=key-a");
  });

  it("يقبل مفاتيح متعددة مفصولة بفاصلة في GEMINI_API_KEY", async () => {
    process.env.GEMINI_API_KEY = "key-a,key-b,key-c";

    let callCount = 0;
    vi.stubGlobal(
      "fetch",
      vi.fn(async (url: string) => {
        callCount++;
        // أول مفتاح يترفض بـ 429، الثاني ينجح
        if (url.includes("key=key-a") || url.includes("key=key-b") || url.includes("key=key-c")) {
          if (callCount === 1) {
            return jsonResponse(429, { error: { message: "quota exceeded" } });
          }
        }
        return jsonResponse(200, { candidates: [{ content: { parts: [{ text: "ok" }] } }] });
      })
    );

    const provider = new GeminiProvider();
    const res = await provider.execute(baseRequest);
    expect(res.success).toBe(true);
    expect(callCount).toBe(2); // فشل بمفتاح، نجح بالتاني
  });

  it("يدوّر على GEMINI_API_KEY_2 لو أول مفتاح ضرب حد الحصة", async () => {
    process.env.GEMINI_API_KEY = "key-a";
    process.env.GEMINI_API_KEY_2 = "key-b";
    // نثبّت نقطة البداية العشوائية (key-a أولًا) عشان الاختبار يبقى
    // حتمي — الكود الحقيقي بيبدأ من مفتاح عشوائي لتوزيع الحمل، وده
    // سلوك مقصود بره نطاق الاختبار ده.
    vi.spyOn(Math, "random").mockReturnValue(0);

    const attempted: string[] = [];
    vi.stubGlobal(
      "fetch",
      vi.fn(async (url: string) => {
        if (url.includes("key=key-a")) {
          attempted.push("key-a");
          return jsonResponse(429, { error: { message: "quota exceeded" } });
        }
        attempted.push("key-b");
        return jsonResponse(200, { candidates: [{ content: { parts: [{ text: "ok" }] } }] });
      })
    );

    const provider = new GeminiProvider();
    const res = await provider.execute(baseRequest);
    expect(res.success).toBe(true);
    expect(attempted).toContain("key-a");
    expect(attempted).toContain("key-b");
  });

  it("يرمي RateLimitError لو كل المفاتيح ضربت حد الحصة", async () => {
    process.env.GEMINI_API_KEY = "key-a,key-b";

    vi.stubGlobal(
      "fetch",
      vi.fn(async () => jsonResponse(429, { error: { message: "quota exceeded" } }))
    );

    const provider = new GeminiProvider();
    await expect(provider.execute(baseRequest)).rejects.toBeInstanceOf(RateLimitError);
  });

  it("رسالة RateLimitError بتحذّر صراحة لو مفيش أي مفتاح مدفوع مُفعّل", async () => {
    process.env.GEMINI_API_KEY = "key-a,key-b";
    delete process.env.GEMINI_API_KEY_PAID;

    vi.stubGlobal(
      "fetch",
      vi.fn(async () => jsonResponse(429, { error: { message: "quota exceeded" } }))
    );

    const provider = new GeminiProvider();
    await expect(provider.execute(baseRequest)).rejects.toThrow(/مفيش أي مفتاح مدفوع مُفعّل/);
  });

  it("رسالة RateLimitError بتوضّح إن مفتاح مدفوع اتجرّب برضه لو GEMINI_API_KEY_PAID موجود", async () => {
    process.env.GEMINI_API_KEY = "key-a";
    process.env.GEMINI_API_KEY_PAID = "paid-key";

    vi.stubGlobal(
      "fetch",
      vi.fn(async () => jsonResponse(429, { error: { message: "quota exceeded" } }))
    );

    const provider = new GeminiProvider();
    await expect(provider.execute(baseRequest)).rejects.toThrow(/مفتاح مدفوع/);
    await expect(provider.execute(baseRequest)).rejects.not.toThrow(/مفيش أي مفتاح مدفوع مُفعّل/);
  });

  it("يتخطى مفتاح لاغٍ (401) ويجرّب اللي بعده", async () => {
    process.env.GEMINI_API_KEY = "bad-key,good-key";

    vi.stubGlobal(
      "fetch",
      vi.fn(async (url: string) => {
        if (url.includes("key=bad-key")) {
          return jsonResponse(401, { error: { message: "invalid API key" } });
        }
        return jsonResponse(200, { candidates: [{ content: { parts: [{ text: "ok" }] } }] });
      })
    );

    const provider = new GeminiProvider();
    const res = await provider.execute(baseRequest);
    expect(res.success).toBe(true);
  });

  it("يرمي AuthenticationError لو كل المفاتيح لاغية", async () => {
    process.env.GEMINI_API_KEY = "bad-a,bad-b";
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => jsonResponse(403, { error: { message: "invalid API key" } }))
    );

    const provider = new GeminiProvider();
    await expect(provider.execute(baseRequest)).rejects.toBeInstanceOf(AuthenticationError);
  });

  it("يرمي ProviderError فورًا لخطأ سيرفر عام (500) بدون تدوير مفاتيح", async () => {
    process.env.GEMINI_API_KEY = "key-a,key-b";
    let calls = 0;
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => {
        calls++;
        return jsonResponse(500, { error: { message: "internal error" } });
      })
    );

    const provider = new GeminiProvider();
    await expect(provider.execute(baseRequest)).rejects.toBeInstanceOf(ProviderError);
    expect(calls).toBe(1); // ما جرّبش المفتاح التاني — مش مشكلة مفتاح
  });

  it("يعامل 503 (الموديل مزدحم) زي Rate Limit — يجرّب باقي المفاتيح ثم يرمي RateLimitError", async () => {
    process.env.GEMINI_API_KEY = "key-a,key-b";
    let calls = 0;
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => {
        calls++;
        return jsonResponse(503, {
          error: { message: "This model is currently experiencing high demand. Please try again later." },
        });
      })
    );

    const provider = new GeminiProvider();
    await expect(provider.execute(baseRequest)).rejects.toBeInstanceOf(RateLimitError);
    expect(calls).toBe(2); // جرّب المفتاحين قبل ما يستسلم، زي 429 بالظبط
  });

  it("يشيل التكرار لو نفس المفتاح متكرر بين GEMINI_API_KEY والمنفصلة", async () => {
    process.env.GEMINI_API_KEY = "key-a,key-b";
    process.env.GEMINI_API_KEY_2 = "key-a"; // مكرر

    const attempted = new Set<string>();
    vi.stubGlobal(
      "fetch",
      vi.fn(async (url: string) => {
        const key = new URL(url).searchParams.get("key");
        if (key) attempted.add(key);
        return jsonResponse(429, { error: { message: "quota exceeded" } });
      })
    );

    const provider = new GeminiProvider();
    await expect(provider.execute(baseRequest)).rejects.toBeInstanceOf(RateLimitError);
    expect(attempted.size).toBe(2); // key-a و key-b بس، مش 3 محاولات
  });
});
