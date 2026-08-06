import {
  AIEmbeddingResponse,
  AIProvider,
  AIProviderName,
  AIRequest,
  AIResponse,
} from "../types";
import {
  AuthenticationError,
  ConfigurationError,
  ProviderError,
  RateLimitError,
} from "../errors";
import { getMergedGeminiKeys } from "../key-store";

const GEMINI_API_BASE = "https://generativelanguage.googleapis.com/v1beta/models";

/**
 * أقصى عدد مفاتيح تُجرَّب في النداء الواحد. لو المستخدم ضاف عشرات/مئات
 * المفاتيح من **نفس المشروع** (بيتشاركوا نفس الحصة)، فتجربة كلها واحدًا
 * تلو الآخر عند كل 429 = عشرات/مئات نداءات HTTP لكل مقطع = زحف. الحدّ ده
 * يجرّب المدفوعة كلها + عدد محدود من المجانية ثم يفشل بسرعة بدل الزحف.
 */
const MAX_KEYS_PER_REQUEST = 8;

interface GeminiSuccessBody {
  candidates?: Array<{
    content?: { parts?: Array<{ text?: string }> };
    finishReason?: string;
  }>;
  usageMetadata?: {
    promptTokenCount?: number;
    candidatesTokenCount?: number;
    totalTokenCount?: number;
  };
}

interface GeminiErrorBody {
  error?: { code?: number; message?: string; status?: string };
}

/**
 * مصدر المفاتيح: `getMergedGeminiKeys` (في key-store) يدمج متغيّرات البيئة
 * (GEMINI_API_KEY[_2..10] المجانية + GEMINI_API_KEY_PAID المدفوعة) **مع**
 * مفاتيح قاعدة البيانات المشفَّرة — فأي بيئة تشغيل (Vercel/Railway) تحصل على
 * نفس المفاتيح بلا ضبط منفصل. الحصة المجانية per-project، والمدفوعة تُجرَّب
 * أولًا (حصتها أعلى) قبل استهلاك المجانية.
 */

/**
 * Provider مستقل لـ Google Gemini — بيطبّق AIProvider بس.
 * ما بيتعاملش مع الـ Retry بين المحاولات (ده شغل AIService) — لكنه هو
 * المسؤول عن تدوير مفاتيح الـ API لو فيه أكتر من واحد: لو مفتاح ضرب حد
 * الحصة (429) أو اتبيّن إنه لاغٍ (401/403)، يجرّب المفتاح اللي بعده على
 * طول من غير أي تأخير — المفاتيح مستقلة عن بعض (حصص منفصلة). مفاتيح
 * GEMINI_API_KEY_PAID (Paid Tier) بتتجرّب أولًا دايمًا قبل مفاتيح
 * الـ Free Tier — راجع getApiKeys().
 */
export class GeminiProvider implements AIProvider {
  readonly name = AIProviderName.GEMINI;

  /**
   * ترتيب المحاولة: مفاتيح Paid Tier أولًا (بترتيبها الثابت — حصتها
   * عالية فمفيش داعي لتوزيع عشوائي بينها)، وبعدين مفاتيح Free Tier
   * بنفس منطق البداية العشوائية القديم (توزيع الحمل بين استدعاءات
   * Serverless المختلفة). النتيجة: أي طلب بيجرّب المفتاح المدفوع الأول
   * قبل ما يستهلك أي حصة من الـ 100 مفتاح المجاني المشتركة.
   */
  private async resolveKeys(): Promise<{ ordered: string[]; paidCount: number; freeCount: number }> {
    const { free, paid } = await getMergedGeminiKeys();
    if (paid.length === 0 && free.length === 0) {
      throw new ConfigurationError(
        "لا يوجد أي مفتاح Gemini — لا في متغيرات البيئة (GEMINI_API_KEY) ولا في مدير المفاتيح.",
        this.name
      );
    }
    const startOffset = free.length > 1 ? Math.floor(Math.random() * free.length) : 0;
    const orderedFree = free.map((_, i) => free[(startOffset + i) % free.length]);
    // المدفوعة أولًا (كلها)، ثم نكمّل بالمجانية حتى الحدّ — فلا يزحف النداء
    // على مئات المفاتيح. paidCount/freeCount يظلّان يعكسان المجموع الكامل
    // للتشخيص الصادق.
    const ordered = [...paid, ...orderedFree].slice(0, Math.max(paid.length, MAX_KEYS_PER_REQUEST));
    return { ordered, paidCount: paid.length, freeCount: free.length };
  }

  private async callOnce(
    apiKey: string,
    request: AIRequest
  ): Promise<{ res: Response; latency_ms: number } | { networkError: Error }> {
    const url = `${GEMINI_API_BASE}/${encodeURIComponent(request.model)}:generateContent?key=${apiKey}`;

    const parts: Array<{ text: string } | { inlineData: { mimeType: string; data: string } }> = [
      { text: request.input },
    ];
    if (request.media) {
      parts.push({
        inlineData: { mimeType: request.media.mimeType, data: request.media.data },
      });
    }

    const start = Date.now();
    try {
      const res = await fetch(url, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        // maxOutputTokens صريح — من غيره الموديل بيستخدم حد افتراضي مش
        // موثّق ممكن يقطع رد JSON طويل (زي عرض العميل بـ 17 شريحة، أو
        // Stage كامل في الـ Pipeline) في نص الطريق، فيوصل رد "ناجح" لكن
        // JSON غير مكتمل وغير قابل للـ Parse — بالظبط شكل "لم نتمكن من
        // فهم نتيجة التوليد" اللي مالوش سبب واضح غير كده.
        body: JSON.stringify({
          contents: [{ parts }],
          // سقف مخرجات لكل مهمة (بيوصل من AIService حسب حجم JSON المتوقّع).
          // من غيره الموديل بيستخدم حدًّا افتراضيًا مش موثّق ممكن يقطع رد
          // JSON طويل (تحليل اكتشاف بكل أقسامه، عرض 17 شريحة، Stage كامل)
          // في نص الطريق، فيوصل رد "ناجح" لكن JSON غير مكتمل وغير قابل
          // للـ Parse — بالظبط شكل "الرد ليس JSON صالحًا" اللي مالوش سبب واضح.
          generationConfig: { maxOutputTokens: request.maxOutputTokens ?? 16384 },
        }),
      });
      return { res, latency_ms: Date.now() - start };
    } catch (err) {
      return { networkError: err instanceof Error ? err : new Error("unknown") };
    }
  }

  async execute(request: AIRequest): Promise<AIResponse> {
    const requestId = crypto.randomUUID();
    const { ordered: keys, paidCount, freeCount } = await this.resolveKeys();

    let lastRateLimitMessage: string | null = null;
    let lastAuthMessage: string | null = null;

    for (let i = 0; i < keys.length; i++) {
      const apiKey = keys[i];
      const attempt = await this.callOnce(apiKey, request);

      if ("networkError" in attempt) {
        // خطأ شبكة/اتصال — مش خاص بالمفتاح، منفعش نجرّب مفتاح تاني هيفشل
        // بنفس الطريقة. نسيبه لـ AIService يعيد المحاولة بعد فترة.
        throw new ProviderError(`فشل الاتصال بـ Gemini: ${attempt.networkError.message}`, this.name);
      }

      const { res, latency_ms } = attempt;

      if (res.ok) {
        const body = (await res.json()) as GeminiSuccessBody;
        const output = body.candidates?.[0]?.content?.parts?.[0]?.text ?? null;
        const finishReason = body.candidates?.[0]?.finishReason;
        const warnings: string[] = [];
        if (!output) warnings.push("Gemini رجّع بدون نص فعلي في الرد");
        // لو الرد اتقطع لأنه وصل لحد maxOutputTokens، الـ JSON هيكون ناقص
        // وهيفشل في الـ Validation برسالة عامة غير واضحة السبب — التحذير
        // ده بيوضّح السبب الحقيقي في اللوج وقت التشخيص.
        if (finishReason === "MAX_TOKENS") {
          warnings.push("الرد اتقطع لأنه وصل لحد أقصى عدد Tokens (MAX_TOKENS) — الناتج غالبًا JSON ناقص.");
        }
        return {
          success: true,
          output,
          model_used: request.model,
          provider: this.name,
          latency_ms,
          token_usage: body.usageMetadata
            ? {
                input_tokens: body.usageMetadata.promptTokenCount,
                output_tokens: body.usageMetadata.candidatesTokenCount,
                total_tokens: body.usageMetadata.totalTokenCount,
              }
            : null,
          cost: null,
          error: null,
          warnings,
          request_id: requestId,
        };
      }

      const body = (await res.json().catch(() => null)) as GeminiErrorBody | null;
      const message = body?.error?.message ?? `Gemini رجّع HTTP ${res.status}`;

      if (res.status === 429) {
        // حصة المفتاح ده خلصت — جرّب اللي بعده لو موجود، ما تستناش
        lastRateLimitMessage = message;
        continue;
      }
      if (res.status === 401 || res.status === 403) {
        // مفتاح لاغٍ/غير صالح — جرّب اللي بعده برضه (ممكن يكون غيره سليم)
        lastAuthMessage = message;
        continue;
      }
      if (res.status === 503) {
        // الموديول نفسه مزدحم مؤقتًا ("model is currently experiencing
        // high demand") — مش مشكلة في المفتاح، وغالبًا بيتصفّى خلال
        // ثواني لدقيقة. بنعامله زي Rate Limit بالظبط عشان يستفيد من
        // نفس منطق الانتظار الصبور في الخلفية (executeAIWithRateLimitWait)
        // بدل ما يفشل نهائيًا من أول محاولتين سريعتين.
        lastRateLimitMessage = message;
        continue;
      }
      // أي خطأ تاني (500, ...) مش خاص بالمفتاح — رميه فورًا
      throw new ProviderError(message, this.name);
    }

    // كل المفاتيح جُرِّبت وفشلت
    if (lastRateLimitMessage) {
      // تشخيص صريح بيفرّق بين حالتين مختلفتين تمامًا: (أ) فيه مفتاح مدفوع
      // اتجرّب وضرب حصة برضه — ده Rate Limit حقيقي مش مشكلة إعداد. (ب)
      // مفيش أي مفتاح مدفوع مُفعّل أصلًا — يعني أي رصيد مدفوع عند
      // المستخدم قاعد من غير استخدام، والنظام شغّال بالكامل على المفاتيح
      // المجانية المشتركة (اللي حصتها per-project مش per-key). العدّ ده
      // من المفاتيح **المدموجة** (بيئة + مدير المفاتيح في قاعدة البيانات).
      const diagnostic =
        paidCount > 0
          ? ` (جُرِّب ${paidCount} مفتاح مدفوع و${freeCount} مفتاح مجاني، كلهم وصلوا لحد الحصة)`
          : ` (تحذير: مفيش أي مفتاح مدفوع مُفعّل حاليًا — لا في متغيرات البيئة (GEMINI_API_KEY_PAID) ولا في مدير المفاتيح. كل الطلبات بتعتمد على ${freeCount} مفتاح مجاني، وحصتهم per-project مش per-key فمبتتضاعفش بزيادة العدد. أضِف مفتاحًا مدفوعًا برصيد من مدير مفاتيح الذكاء الاصطناعي في الإعدادات — يُستخدَم في كل البيئات تلقائيًّا.)`;
      throw new RateLimitError(`${lastRateLimitMessage}${diagnostic}`, this.name);
    }
    if (lastAuthMessage) {
      throw new AuthenticationError(lastAuthMessage, this.name);
    }
    throw new ProviderError("فشل الاتصال بـ Gemini لسبب غير معروف.", this.name);
  }

  /**
   * توليد Embedding حقيقي (768 بعد) عبر text-embedding-004 — نفس منطق
   * تدوير المفاتيح في execute() بس بدون Retry/Timeout (ده شغل AIService).
   */
  async embed(text: string, model: string): Promise<AIEmbeddingResponse> {
    const { ordered: keys } = await this.resolveKeys();
    const start = Date.now();
    let lastMessage: string | null = null;

    for (let i = 0; i < keys.length; i++) {
      const apiKey = keys[i];
      const url = `${GEMINI_API_BASE}/${encodeURIComponent(model)}:embedContent?key=${apiKey}`;

      let res: Response;
      try {
        res = await fetch(url, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ content: { parts: [{ text }] } }),
        });
      } catch (err) {
        return {
          success: false,
          embedding: null,
          model_used: model,
          provider: this.name,
          latency_ms: Date.now() - start,
          error: { code: "PROVIDER_ERROR", message: `فشل الاتصال بـ Gemini Embeddings: ${err instanceof Error ? err.message : "unknown"}` },
        };
      }

      if (res.ok) {
        const body = (await res.json()) as { embedding?: { values?: number[] } };
        const values = body.embedding?.values ?? null;
        return {
          success: values !== null,
          embedding: values,
          model_used: model,
          provider: this.name,
          latency_ms: Date.now() - start,
          error: values === null ? { code: "PROVIDER_ERROR", message: "Gemini رجّع بدون Embedding فعلي." } : null,
        };
      }

      const errBody = (await res.json().catch(() => null)) as GeminiErrorBody | null;
      lastMessage = errBody?.error?.message ?? `Gemini رجّع HTTP ${res.status}`;
      if (res.status === 429 || res.status === 401 || res.status === 403 || res.status === 503) continue;
      return {
        success: false,
        embedding: null,
        model_used: model,
        provider: this.name,
        latency_ms: Date.now() - start,
        error: { code: "PROVIDER_ERROR", message: lastMessage },
      };
    }

    return {
      success: false,
      embedding: null,
      model_used: model,
      provider: this.name,
      latency_ms: Date.now() - start,
      error: { code: "RATE_LIMIT", message: lastMessage ?? "كل مفاتيح Gemini فشلت في توليد Embedding." },
    };
  }

  async healthCheck(): Promise<{ ok: boolean; message: string }> {
    try {
      const { ordered: keys } = await this.resolveKeys();
      let okCount = 0;
      for (const apiKey of keys) {
        const res = await fetch(`${GEMINI_API_BASE}?key=${apiKey}`, { method: "GET" });
        if (res.ok) okCount++;
      }
      if (okCount === 0) {
        return { ok: false, message: `كل المفاتيح (${keys.length}) فشلت في الاتصال.` };
      }
      return {
        ok: true,
        message:
          keys.length > 1
            ? `متصل — ${okCount} من ${keys.length} مفتاح سليم.`
            : "الاتصال بـ Gemini ناجح.",
      };
    } catch (err) {
      return {
        ok: false,
        message: err instanceof Error ? err.message : "فشل غير معروف",
      };
    }
  }
}
