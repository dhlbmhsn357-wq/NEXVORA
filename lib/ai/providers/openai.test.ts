import { describe, expect, it, vi, beforeEach, afterEach } from "vitest";
import { OpenAIProvider } from "./openai";
import { RateLimitError, AuthenticationError, ConfigurationError } from "../errors";
import { AITaskType } from "../types";
import { invalidateOpenAIKeyCache } from "../key-store";

function jsonResponse(status: number, body: unknown): Response {
  return new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });
}

const baseRequest = {
  taskType: AITaskType.DISCOVERY_ANALYSIS,
  input: "test",
  model: "gpt-5-mini",
};

describe("OpenAIProvider", () => {
  const originalEnv = { ...process.env };

  beforeEach(() => {
    vi.restoreAllMocks();
    // بلا مفتاح تشفير لا يُقرأ جدول قاعدة البيانات، وإبطال الكاش يضمن
    // التقاط متغيّرات البيئة الطازجة كل اختبار.
    delete process.env.MIGRATION_SECRET_KEY;
    delete process.env.OPENAI_API_KEY;
    for (let i = 2; i <= 10; i++) delete process.env[`OPENAI_API_KEY_${i}`];
    invalidateOpenAIKeyCache();
  });
  afterEach(() => {
    process.env = { ...originalEnv };
    invalidateOpenAIKeyCache();
  });

  it("يرمي ConfigurationError لو مفيش أي مفتاح", async () => {
    await expect(new OpenAIProvider().execute(baseRequest)).rejects.toBeInstanceOf(ConfigurationError);
  });

  it("ينجح ويفكّ نص الرد + يستخدم max_completion_tokens بلا temperature", async () => {
    process.env.OPENAI_API_KEY = "sk-a";
    let sentBody: Record<string, unknown> = {};
    vi.stubGlobal(
      "fetch",
      vi.fn(async (_url: string, init: RequestInit) => {
        sentBody = JSON.parse(init.body as string);
        return jsonResponse(200, {
          choices: [{ message: { content: "{\"ok\":true}" }, finish_reason: "stop" }],
          usage: { prompt_tokens: 5, completion_tokens: 7, total_tokens: 12 },
        });
      })
    );

    const res = await new OpenAIProvider().execute(baseRequest);
    expect(res.success).toBe(true);
    expect(res.output).toBe("{\"ok\":true}");
    expect(res.token_usage?.total_tokens).toBe(12);
    expect(sentBody.max_completion_tokens).toBeDefined();
    expect(sentBody.max_tokens).toBeUndefined();
    expect(sentBody.temperature).toBeUndefined();
  });

  it("يفعّل response_format=json_object لو البرومبت فيه JSON", async () => {
    process.env.OPENAI_API_KEY = "sk-a";
    let sent: Record<string, unknown> = {};
    vi.stubGlobal(
      "fetch",
      vi.fn(async (_url: string, init: RequestInit) => {
        sent = JSON.parse(init.body as string);
        return jsonResponse(200, { choices: [{ message: { content: "{}" }, finish_reason: "stop" }] });
      })
    );
    await new OpenAIProvider().execute({ ...baseRequest, input: "أرجع JSON فقط" });
    expect(sent.response_format).toEqual({ type: "json_object" });
    expect(sent.reasoning_effort).toBe("low"); // gpt-5-mini
  });

  it("ينضّف الـ JSON من code fences وكلام حواليه", async () => {
    process.env.OPENAI_API_KEY = "sk-a";
    vi.stubGlobal(
      "fetch",
      vi.fn(async () =>
        jsonResponse(200, {
          choices: [{ message: { content: "هنا النتيجة:\n```json\n{\"a\":1}\n```\nشكرًا" }, finish_reason: "stop" }],
        })
      )
    );
    const res = await new OpenAIProvider().execute(baseRequest);
    expect(res.output).toBe("{\"a\":1}");
    expect(JSON.parse(res.output as string)).toEqual({ a: 1 });
  });

  it("يدوّر على المفتاح التالي عند 429 ويرمي RateLimitError لو الكل ضرب الحد", async () => {
    process.env.OPENAI_API_KEY = "sk-a,sk-b";
    const calls: string[] = [];
    vi.stubGlobal(
      "fetch",
      vi.fn(async (_url: string, init: RequestInit) => {
        calls.push((JSON.parse(init.body as string) as { model: string }).model);
        return jsonResponse(429, { error: { message: "rate limited" } });
      })
    );
    await expect(new OpenAIProvider().execute(baseRequest)).rejects.toBeInstanceOf(RateLimitError);
    expect(calls.length).toBe(2); // جرّب المفتاحين
  });

  it("يرمي AuthenticationError عند 401 على كل المفاتيح", async () => {
    process.env.OPENAI_API_KEY = "sk-bad";
    vi.stubGlobal("fetch", vi.fn(async () => jsonResponse(401, { error: { message: "invalid key" } })));
    await expect(new OpenAIProvider().execute(baseRequest)).rejects.toBeInstanceOf(AuthenticationError);
  });
});
