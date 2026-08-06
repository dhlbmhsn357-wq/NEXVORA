import { AIProvider, AIProviderName, AIRequest, AIResponse } from "../types";
import { AuthenticationError, ConfigurationError, ProviderError, RateLimitError } from "../errors";
import { getMergedOpenAIKeys } from "../key-store";

const OPENAI_CHAT_URL = "https://api.openai.com/v1/chat/completions";
const OPENAI_MODELS_URL = "https://api.openai.com/v1/models";

/** أقصى عدد مفاتيح تُجرَّب في النداء الواحد (زي Gemini — تفادي الزحف). */
const MAX_KEYS_PER_REQUEST = 8;

interface OpenAISuccessBody {
  choices?: Array<{ message?: { content?: string }; finish_reason?: string }>;
  usage?: { prompt_tokens?: number; completion_tokens?: number; total_tokens?: number };
}

interface OpenAIErrorBody {
  error?: { message?: string; type?: string; code?: string };
}

/**
 * موديلات OpenAI بترجّع الـ JSON أحيانًا ملفوف في ```json ... ``` أو معاه
 * كلام تمهيدي — والـ Validators بتعمل JSON.parse مباشرة فتفشل بـ
 * INVALID_RESPONSE. الدالة دي بتنضّف الرد: تشيل code fences، ولو لسه
 * فيه كلام حوالين الـ JSON بتستخرج من أول '{'/'[' لآخر '}'/']'. آمنة:
 * لو الرد أصلًا JSON نضيف أو نص بلا أقواس، بترجّعه زي ما هو.
 */
function extractJson(text: string | null): string | null {
  if (!text) return text;
  let s = text.trim();
  const fenced = s.match(/^```(?:json)?\s*([\s\S]*?)\s*```$/i);
  if (fenced) s = fenced[1].trim();
  if (!s.startsWith("{") && !s.startsWith("[")) {
    const first = s.search(/[{[]/);
    const last = Math.max(s.lastIndexOf("}"), s.lastIndexOf("]"));
    if (first !== -1 && last > first) s = s.slice(first, last + 1).trim();
  }
  return s;
}

/**
 * Provider مستقل لـ OpenAI (ChatGPT) — بيطبّق AIProvider بس. بيقرأ
 * مفاتيحه من المصدر المشترك (env OPENAI_API_KEY + قاعدة البيانات المشفَّرة)
 * فيشتغل على Vercel + Railway بلا ضبط منفصل — نفس فلسفة Gemini بالظبط.
 *
 * ملاحظات توافق مهمّة مع عائلة الموديلات الحديثة (gpt-5-*, o-series):
 * - نستخدم `max_completion_tokens` مش `max_tokens` (الموديلات الجديدة
 *   بترفض القديم).
 * - ما نبعتش `temperature` إطلاقًا (بعض الموديلات الجديدة بتدعم القيمة
 *   الافتراضية فقط وبترفض أي قيمة صريحة) — الافتراضي كافٍ لتوليد JSON.
 * - الـ Prompt هو نفسه المُستخدَم مع Gemini (بيطلب "JSON فقط")، فمفيش
 *   حاجة خاصة لازمة في response_format.
 */
export class OpenAIProvider implements AIProvider {
  readonly name = AIProviderName.OPENAI;

  private async resolveKeys(): Promise<string[]> {
    const keys = await getMergedOpenAIKeys();
    if (keys.length === 0) {
      throw new ConfigurationError(
        "لا يوجد أي مفتاح OpenAI — لا في متغيرات البيئة (OPENAI_API_KEY) ولا في مدير المفاتيح.",
        this.name
      );
    }
    // بداية عشوائية لتوزيع الحمل بين استدعاءات Serverless المختلفة، ثم حدّ.
    const start = keys.length > 1 ? Math.floor(Math.random() * keys.length) : 0;
    const ordered = keys.map((_, i) => keys[(start + i) % keys.length]);
    return ordered.slice(0, MAX_KEYS_PER_REQUEST);
  }

  private async callOnce(
    apiKey: string,
    request: AIRequest
  ): Promise<{ res: Response; latency_ms: number } | { networkError: Error }> {
    const body: Record<string, unknown> = {
      model: request.model,
      messages: [{ role: "user", content: request.input }],
      // سقف المخرجات لكل مهمة (بيوصل من AIService حسب حجم JSON المتوقّع).
      max_completion_tokens: request.maxOutputTokens ?? 16384,
    };
    // عائلة GPT-5 وo-series موديلات استدلال (reasoning) — بطيئة افتراضيًّا
    // وممكن تستهلك حصة المخرجات في "التفكير" الداخلي فترجع بطيئة/ناقصة
    // (فيظهر Timeout زي "استغرق وقتًا أطول من المتوقع"). reasoning_effort=low
    // بيخلّيها سريعة ورخيصة ومناسبة لتوليد JSON المنظّم. لا يُرسَل لموديلات
    // gpt-4* (مش بتدعم الباراميتر ده).
    if (/^(gpt-5|o\d)/i.test(request.model)) {
      body.reasoning_effort = "low";
    }
    // كل مهام النظام اللي بتروح OpenAI بتطلب JSON صريحًا في البرومبت.
    // response_format=json_object بيجبر الموديل يطلّع JSON صالح بس — بدون
    // code fences ولا كلام حواليه ولا رد فاضي (اللي كان بيسبب INVALID_RESPONSE
    // مع gpt-5-mini). بنفعّله فقط لو البرومبت فيه كلمة "json" (شرط OpenAI،
    // وكمان بيحمي أي مهمة نصّية نادرة من الإجبار على JSON).
    if (/json/i.test(request.input)) {
      body.response_format = { type: "json_object" };
    }

    const start = Date.now();
    try {
      const res = await fetch(OPENAI_CHAT_URL, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${apiKey}`,
        },
        body: JSON.stringify(body),
      });
      return { res, latency_ms: Date.now() - start };
    } catch (err) {
      return { networkError: err instanceof Error ? err : new Error("unknown") };
    }
  }

  async execute(request: AIRequest): Promise<AIResponse> {
    const requestId = crypto.randomUUID();
    const keys = await this.resolveKeys();

    let lastRateLimitMessage: string | null = null;
    let lastAuthMessage: string | null = null;

    for (const apiKey of keys) {
      const attempt = await this.callOnce(apiKey, request);

      if ("networkError" in attempt) {
        throw new ProviderError(`فشل الاتصال بـ OpenAI: ${attempt.networkError.message}`, this.name);
      }

      const { res, latency_ms } = attempt;

      if (res.ok) {
        const body = (await res.json()) as OpenAISuccessBody;
        const rawContent = body.choices?.[0]?.message?.content ?? null;
        // ننضّف الـ JSON من code fences/كلام حوالينه قبل ما يوصل للـ Validator.
        const output = extractJson(rawContent);
        const finishReason = body.choices?.[0]?.finish_reason;
        const warnings: string[] = [];
        if (!output) warnings.push("OpenAI رجّع بدون نص فعلي في الرد");
        if (finishReason === "length") {
          warnings.push("الرد اتقطع لأنه وصل لحد أقصى عدد Tokens (length) — الناتج غالبًا JSON ناقص.");
        }
        return {
          success: true,
          output,
          model_used: request.model,
          provider: this.name,
          latency_ms,
          token_usage: body.usage
            ? {
                input_tokens: body.usage.prompt_tokens,
                output_tokens: body.usage.completion_tokens,
                total_tokens: body.usage.total_tokens,
              }
            : null,
          cost: null,
          error: null,
          warnings,
          request_id: requestId,
        };
      }

      const body = (await res.json().catch(() => null)) as OpenAIErrorBody | null;
      const message = body?.error?.message ?? `OpenAI رجّع HTTP ${res.status}`;

      if (res.status === 429) {
        // حصة/معدّل المفتاح ده اتخطّى — جرّب اللي بعده لو موجود.
        lastRateLimitMessage = message;
        continue;
      }
      if (res.status === 401 || res.status === 403) {
        lastAuthMessage = message;
        continue;
      }
      if (res.status === 503 || res.status === 500) {
        // ازدحام مؤقّت — عامله زي Rate Limit عشان يستفيد من الانتظار الصبور.
        lastRateLimitMessage = message;
        continue;
      }
      // أي خطأ تاني (400 غالبًا = موديل غير معروف/طلب غير صالح) — رميه فورًا.
      throw new ProviderError(message, this.name);
    }

    if (lastRateLimitMessage) {
      throw new RateLimitError(
        `${lastRateLimitMessage} (جُرِّب ${keys.length} مفتاح OpenAI، كلهم وصلوا لحد المعدّل/الحصة — راجع رصيد حسابك في OpenAI.)`,
        this.name
      );
    }
    if (lastAuthMessage) {
      throw new AuthenticationError(lastAuthMessage, this.name);
    }
    throw new ProviderError("فشل الاتصال بـ OpenAI لسبب غير معروف.", this.name);
  }

  async healthCheck(): Promise<{ ok: boolean; message: string }> {
    try {
      const keys = await this.resolveKeys();
      let okCount = 0;
      for (const apiKey of keys) {
        const res = await fetch(OPENAI_MODELS_URL, {
          method: "GET",
          headers: { Authorization: `Bearer ${apiKey}` },
        });
        if (res.ok) okCount++;
      }
      if (okCount === 0) {
        return { ok: false, message: `كل المفاتيح (${keys.length}) فشلت في الاتصال بـ OpenAI.` };
      }
      return {
        ok: true,
        message: keys.length > 1 ? `متصل — ${okCount} من ${keys.length} مفتاح سليم.` : "الاتصال بـ OpenAI ناجح.",
      };
    } catch (err) {
      return { ok: false, message: err instanceof Error ? err.message : "فشل غير معروف" };
    }
  }
}
