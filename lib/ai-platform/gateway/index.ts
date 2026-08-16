import type { SupabaseClient } from "@supabase/supabase-js";
import { createServiceClient } from "@/lib/supabase/service";
import { getProvider } from "@/lib/ai/registry";
import type { AIProviderName, AITaskType } from "@/lib/ai/types";
import { sanitize, containsSecrets } from "../security/sanitizer";
import { buildCacheKey, hashInput, isCacheable } from "../cache/keys";
import { calculateCost, estimateTokens, findPricing, type PricingRow } from "../cost/calculator";
import {
  canCall,
  onFailure,
  onSuccess,
  refresh,
  type BreakerSnapshot,
  INITIAL_BREAKER,
} from "./circuit-breaker";
import { GEMINI_CAPABILITIES, registerProvider, route, type RoutingRule } from "./router";
import type { GatewayOutcome, GatewayRequest } from "./types";

/**
 * بوابة الذكاء الاصطناعي — **الباب الوحيد لأي مزوّد**.
 *
 * ترتيب المراحل مقصود بالكامل:
 *
 *   ١. التعقيم    ← قبل أي شيء. ما يخرج من هنا لا يحمل أسرارًا.
 *   ٢. الذاكرة    ← قبل القاطع: الإصابة لا تحتاج مزوّدًا أصلًا.
 *   ٣. القاطع     ← قبل النداء: لا نضرب مزوّدًا معطّلًا.
 *   ٤. النداء     ← بمهلة.
 *   ٥. القياس     ← رموز وتكلفة، دائمًا، حتى عند الفشل.
 *   ٦. التخزين    ← النتيجة والذاكرة.
 *
 * وضع الذاكرة قبل القاطع مهم: توقّف المزوّد لا يجب أن يمنع خدمة نتيجة
 * محسوبة ومحفوظة بالفعل.
 */

// Gemini هو المزوّد الوحيد حاليًا — المواصفة منعت إضافة غيره في المرحلة دي.
registerProvider({
  name: "gemini" as AIProviderName,
  capabilities: GEMINI_CAPABILITIES,
  models: ["gemini-3.5-flash", "gemini-3.5-pro", "gemini-embedding-001"],
});

type DB = SupabaseClient;

const DEFAULT_TIMEOUT_MS = 110_000;
/** أقصى نداءات متزامنة عبر كل العمال — يحمي حصة المزوّد المشتركة. */
const MAX_CONCURRENT = 5;

/** موديل Gemini لشبكة أمان الـ JSON داخل البوابة. */
const JSON_FALLBACK_GEMINI_MODEL = "gemini-3.5-flash";

/**
 * هل النص JSON صالح للـ Parse؟ (نسخة محلية — استيرادها من lib/ai/service
 * كان هيعمل دورة استيراد: service → ai-adapter → handlers → gateway).
 */
function isParseableJsonLocal(raw: string | null | undefined): boolean {
  if (!raw || raw.trim().length === 0) return false;
  try {
    JSON.parse(raw.trim());
    return true;
  } catch {
    return false;
  }
}

let inFlight = 0;

async function acquireSlot(): Promise<void> {
  while (inFlight >= MAX_CONCURRENT) {
    await new Promise((resolve) => setTimeout(resolve, 100));
  }
  inFlight += 1;
}

function releaseSlot(): void {
  inFlight = Math.max(0, inFlight - 1);
}

// ============================================================
// قراءة الإعدادات
// ============================================================

async function loadRoutingRules(db: DB): Promise<RoutingRule[]> {
  const { data } = await db
    .from("ai_task_model_config")
    .select("task_type, provider, model");

  return ((data ?? []) as Array<{ task_type: string; provider: string; model: string }>).map(
    (row) => ({
      taskType: row.task_type,
      provider: row.provider as AIProviderName,
      model: row.model,
      // لا مزوّد احتياطي اليوم — لا يوجد غير Gemini. الحقل موجود
      // فالإضافة لاحقًا صفٌّ في القاعدة لا تعديل في الكود.
      fallbackProvider: null,
      fallbackModel: null,
    })
  );
}

async function loadPricing(db: DB): Promise<PricingRow[]> {
  const { data } = await db
    .from("ai_pricing")
    .select("provider, model, input_per_1k_usd, output_per_1k_usd, effective_from, effective_to");

  return ((data ?? []) as Array<Record<string, unknown>>).map((row) => ({
    provider: row.provider as string,
    model: row.model as string,
    inputPer1kUsd: Number(row.input_per_1k_usd),
    outputPer1kUsd: Number(row.output_per_1k_usd),
    effectiveFrom: new Date(row.effective_from as string),
    effectiveTo: row.effective_to ? new Date(row.effective_to as string) : null,
  }));
}

async function loadBreaker(db: DB, provider: string): Promise<BreakerSnapshot> {
  const { data } = await db
    .from("ai_provider_health")
    .select("state, consecutive_errors, opened_at, next_probe_at")
    .eq("provider", provider)
    .maybeSingle();

  if (!data) return { ...INITIAL_BREAKER };

  return refresh({
    state: data.state as BreakerSnapshot["state"],
    consecutiveErrors: data.consecutive_errors as number,
    openedAt: data.opened_at ? new Date(data.opened_at as string) : null,
    nextProbeAt: data.next_probe_at ? new Date(data.next_probe_at as string) : null,
  });
}

async function saveBreaker(db: DB, provider: string, snapshot: BreakerSnapshot): Promise<void> {
  await db.from("ai_provider_health").upsert(
    {
      provider,
      state: snapshot.state,
      consecutive_errors: snapshot.consecutiveErrors,
      opened_at: snapshot.openedAt?.toISOString() ?? null,
      next_probe_at: snapshot.nextProbeAt?.toISOString() ?? null,
      updated_at: new Date().toISOString(),
    },
    { onConflict: "provider" }
  );
}

// ============================================================
// التنفيذ
// ============================================================

/**
 * ينفّذ نداء ذكاء اصطناعي عبر البوابة.
 *
 * **لا يرمي عند فشل المزوّد** — يرجّع نتيجة مصنّفة. قرار إعادة المحاولة
 * للطابور لا للبوابة: البوابة تعرف *ماذا* حدث، والطابور يعرف *ماذا
 * يفعل* بناءً على المحاولات المتبقّية وسياسة النوع.
 */
export async function execute(
  request: GatewayRequest,
  client?: DB
): Promise<GatewayOutcome> {
  const db = client ?? createServiceClient();
  const startedAt = Date.now();

  // ---------- ١) التعقيم ----------
  const sanitized = sanitize(request.prompt, { allowPii: request.allowPii });

  // تأكيد أخير: بقاء سرّ بعد التعقيم يعني ثغرة في التعقيم نفسه، وهو
  // خطأ برمجي يُوقف الطلب لا تحذير يُتجاهَل.
  if (containsSecrets(sanitized.text)) {
    return {
      status: "error",
      provider: null,
      code: "SANITIZATION_FAILED",
      message: "اتكشف سرّ بعد التعقيم — الطلب اتوقف. ده خلل في طبقة التعقيم لازم يتصلّح.",
      transient: false,
      latencyMs: Date.now() - startedAt,
    };
  }

  // كل مهام النظام اللي بتطلب JSON بتقول كده صراحةً في البرومبت. الفحص ده
  // بيشغّل ثلاث حمايات تحت: (١) تجاهل + مسح أي إصابة كاش مسمومة (رد قديم
  // غير صالح اتخزّن قبل ما الحماية دي توجد)، (٢) شبكة أمان Gemini لو
  // المزوّد رجّع ردًّا غير صالح، (٣) منع تخزين رد غير صالح في الكاش.
  const expectsJson = /json/i.test(sanitized.text) && !(request.media && request.media.length > 0);

  const [rules, pricing] = await Promise.all([loadRoutingRules(db), loadPricing(db)]);

  let decision;
  try {
    decision = request.provider && request.model
      ? { provider: request.provider, model: request.model, isFallback: false }
      : route(rules, request.taskType);
  } catch (err) {
    return {
      status: "error",
      provider: null,
      code: "NO_ROUTE",
      message: err instanceof Error ? err.message : "تعذّر تحديد المزوّد.",
      transient: false,
      latencyMs: Date.now() - startedAt,
    };
  }

  const inputHash = hashInput(sanitized.text);
  const promptVersion = request.promptVersion ?? 1;
  const cacheKey = buildCacheKey({
    taskType: request.taskType,
    provider: decision.provider,
    model: decision.model,
    promptVersion,
    inputHash,
  });

  // ---------- ٢) الذاكرة ----------
  const useCache = !request.bypassCache && isCacheable(request.taskType);
  if (useCache) {
    const hit = await readCache(db, cacheKey);
    // إصابة مسمومة: رد قديم غير صالح اتخزّن قبل وجود حارس الكتابة (حصل
    // فعليًّا مع أول ردود gpt-5-mini الفاسدة — كل إعادة محاولة كانت
    // بتقدّم نفس الرد الفاسد بلا أي نداء للمزوّد). نتجاهلها ونمسحها
    // فالنداء الحقيقي تحت يتنفّذ ويكتب نتيجة سليمة مكانها.
    if (hit && expectsJson && !isParseableJsonLocal(hit.outputText)) {
      console.warn(`[gateway] إصابة كاش مسمومة (غير JSON) لمهمة ${request.taskType} — تُمسح ويُعاد التنفيذ.`);
      void db.from("ai_cache").delete().eq("cache_key", cacheKey);
    } else if (hit) {
      await recordRequest(db, {
        request,
        decision,
        outcome: "cached",
        inputTokens: hit.inputTokens,
        outputTokens: hit.outputTokens,
        costUsd: 0,
        latencyMs: Date.now() - startedAt,
        redacted: sanitized.totalRedacted,
        promptVersion,
      });

      return {
        status: "ok",
        output: hit.outputText,
        provider: decision.provider,
        model: decision.model,
        cached: true,
        inputTokens: hit.inputTokens,
        outputTokens: hit.outputTokens,
        costUsd: 0,
        latencyMs: Date.now() - startedAt,
        redactedFields: sanitized.totalRedacted,
        resultId: hit.resultId,
      };
    }
  }

  // ---------- ٣) قاطع الدائرة ----------
  const breaker = await loadBreaker(db, decision.provider);
  const gate = canCall(breaker);
  if (!gate.allow) {
    return {
      status: "circuit_open",
      provider: decision.provider,
      retryAfterMs: gate.retryAfterMs,
      reason: gate.reason,
    };
  }

  // ---------- ٤) النداء ----------
  await acquireSlot();
  try {
    const provider = getProvider(decision.provider);
    // أسماء الحقول هنا لازم تطابق `AIRequest` بالحرف.
    //
    // **درس مدفوع الثمن:** النسخة الأولى كتبتها بأسماء snake_case
    // (`prompt` و`task_type` و`max_output_tokens`) مع كاست `as never`
    // على الكائن كله. الكاست سكّت المدقّق، فوصل للمزوّد `input:
    // undefined` — أي برومبت فاضي — ورد Gemini بخطأ غامض عن حقل ناقص.
    //
    // العطل فضل مستخبيًا حتى أول طلب حقيقي مرّ من البوابة. الكاست
    // العام على حدود الوحدات بيلغي بالظبط الفحص اللي كان هيمسكه.
    let response = await withTimeout(
      provider.execute({
        taskType: request.taskType as AITaskType,
        input: sanitized.text,
        model: decision.model,
        // البوابة تقبل مصفوفة وسائط، والمزوّد يقبل ملفًا واحدًا. الأول
        // فقط يمرّ، والباقي يُتجاهَل صراحةً — تمرير عدة ملفات محتاج
        // تغيير في واجهة المزوّد نفسه، وده شغل نقل الملفات.
        media: request.media?.[0],
        maxOutputTokens: request.maxOutputTokens,
        timeoutMs: request.timeoutMs ?? DEFAULT_TIMEOUT_MS,
        context: {
          projectId: request.projectId ?? undefined,
          actorId: request.actorId ?? undefined,
        },
      }),
      request.timeoutMs ?? DEFAULT_TIMEOUT_MS
    );

    const latencyMs = Date.now() - startedAt;

    if (!response.success || !response.output) {
      const transient = isTransient(response.error?.code, response.error?.message);
      await saveBreaker(db, decision.provider, onFailure(breaker, { transient }));
      await recordRequest(db, {
        request,
        decision,
        outcome: "error",
        latencyMs,
        redacted: sanitized.totalRedacted,
        promptVersion,
        errorCode: response.error?.code,
      });

      return {
        status: "error",
        provider: decision.provider,
        code: response.error?.code ?? "PROVIDER_ERROR",
        message: response.error?.message ?? "المزوّد رجّع رد فاضي.",
        transient,
        latencyMs,
      };
    }

    // الرد النهائي — متغيّر منفصل عشان الـ narrowing يفضل string بعد أي
    // إعادة إسناد في شبكة الأمان تحت.
    let finalOutput: string = response.output;

    // ---------- ٤ب) شبكة أمان الـ JSON ----------
    // المزوّد رجّع "نجاحًا" لكن الرد مش JSON صالح (بيحصل مع موديلات
    // الاستدلال زي gpt-5-mini) — نعيد التنفيذ فورًا على Gemini بدل ما
    // الرد الفاسد يوصل للـ Validator (ويتخزّن في الكاش). المزوّد الأساسي
    // يفضل زي ما هو مضبوط — ده Fallback للطلب الواحد بس.
    if (expectsJson && decision.provider !== "gemini" && !isParseableJsonLocal(finalOutput)) {
      console.warn(
        `[gateway] ${decision.provider}/${decision.model} رجّع ردًّا غير JSON لمهمة ${request.taskType} — تحويل تلقائي لـ Gemini.`
      );
      try {
        const geminiProvider = getProvider("gemini" as AIProviderName);
        const fallback = await withTimeout(
          geminiProvider.execute({
            taskType: request.taskType as AITaskType,
            input: sanitized.text,
            model: JSON_FALLBACK_GEMINI_MODEL,
            media: request.media?.[0],
            maxOutputTokens: request.maxOutputTokens,
            timeoutMs: request.timeoutMs ?? DEFAULT_TIMEOUT_MS,
            context: {
              projectId: request.projectId ?? undefined,
              actorId: request.actorId ?? undefined,
            },
          }),
          request.timeoutMs ?? DEFAULT_TIMEOUT_MS
        );
        if (fallback.success && fallback.output && isParseableJsonLocal(fallback.output)) {
          response = fallback;
          finalOutput = fallback.output;
          decision = { provider: "gemini" as AIProviderName, model: JSON_FALLBACK_GEMINI_MODEL, isFallback: true };
        }
      } catch {
        // فشل الـ Fallback نفسه — نكمل بالرد الأصلي والـ Validator يبلّغ.
      }
    }

    // ---------- ٥) القياس ----------
    const inputTokens =
      response.token_usage?.input_tokens ?? estimateTokens(sanitized.text);
    const outputTokens =
      response.token_usage?.output_tokens ?? estimateTokens(finalOutput);

    const cost = calculateCost(
      { inputTokens, outputTokens },
      findPricing(pricing, decision.provider, decision.model)
    );

    await saveBreaker(db, decision.provider, onSuccess());

    // ---------- ٦) التخزين ----------
    //
    // **التخزين لا يُسقط نتيجة ناجحة.** النداء اتنفّذ واتدفع تمنه
    // وخلاص؛ فشل صفّ في جدول أرشيف مايجوزش يحوّله لفشل يعيد الطابور
    // محاولته فيتدفع تاني.
    //
    // الحدث ده اتكشف من عميل اختبار ناقص، والدرس كان حقيقيًا: كل خطوة
    // بعد النداء هي مسك دفاتر، والدفاتر تتصلّح لاحقًا — النتيجة لأ.
    let resultId: string | null = null;
    try {
      resultId = await storeResult(db, {
        request,
        decision,
        inputHash,
        promptVersion,
        output: finalOutput,
        inputTokens,
        outputTokens,
        costUsd: cost.totalUsd,
        latencyMs,
      });

      // حارس الكتابة: رد غير صالح لمهمة JSON ما يدخلش الكاش أبدًا —
      // ده اللي سمّم الكاش أصلًا وخلّى كل إعادة محاولة ترجّع نفس الفساد.
      const safeToCache = !expectsJson || isParseableJsonLocal(finalOutput);
      if (useCache && resultId && safeToCache) {
        await writeCache(db, cacheKey, {
          taskType: request.taskType,
          resultId,
          outputText: finalOutput,
          inputTokens,
          outputTokens,
          costUsd: cost.totalUsd,
        });
      }

      await recordRequest(db, {
        request,
        decision,
        outcome: "ok",
        inputTokens,
        outputTokens,
        costUsd: cost.totalUsd,
        latencyMs,
        redacted: sanitized.totalRedacted,
        promptVersion,
      });
    } catch (err) {
      console.error("[gateway] فشل حفظ نتيجة ناجحة — النتيجة بترجع للمستدعي:", err);
    }

    return {
      status: "ok",
      output: finalOutput,
      provider: decision.provider,
      model: decision.model,
      cached: false,
      inputTokens,
      outputTokens,
      costUsd: cost.priced ? cost.totalUsd : null,
      latencyMs,
      redactedFields: sanitized.totalRedacted,
      resultId,
    };
  } catch (err) {
    const latencyMs = Date.now() - startedAt;
    const message = err instanceof Error ? err.message : String(err);
    const transient = isTransient(undefined, message);

    await saveBreaker(db, decision.provider, onFailure(breaker, { transient }));

    return {
      status: "error",
      provider: decision.provider,
      code: transient ? "TRANSIENT" : "UNKNOWN",
      message,
      transient,
      latencyMs,
    };
  } finally {
    releaseSlot();
  }
}

function withTimeout<T>(promise: Promise<T>, ms: number): Promise<T> {
  return Promise.race([
    promise,
    new Promise<never>((_, reject) =>
      setTimeout(() => reject(new Error(`تجاوز المهلة (${ms} م.ث)`)), ms)
    ),
  ]);
}

function isTransient(code?: string, message?: string): boolean {
  const text = `${code ?? ""} ${message ?? ""}`;
  return /429|503|502|504|timeout|ETIMEDOUT|ECONNRESET|rate.?limit|quota|overloaded/i.test(text);
}

// ============================================================
// الذاكرة والنتائج والسجل
// ============================================================

async function readCache(
  db: DB,
  cacheKey: string
): Promise<{
  outputText: string;
  inputTokens: number | null;
  outputTokens: number | null;
  resultId: string | null;
} | null> {
  const { data } = await db
    .from("ai_cache")
    .select("output_text, input_tokens, output_tokens, result_id, expires_at, hit_count, saved_usd")
    .eq("cache_key", cacheKey)
    .maybeSingle();

  if (!data?.output_text) return null;
  if (new Date(data.expires_at as string).getTime() <= Date.now()) return null;

  // تحديث عدّاد الإصابة والتوفير — بلا انتظار: المستخدم لا يجب أن ينتظر
  // كتابة إحصائية.
  void db
    .from("ai_cache")
    .update({
      hit_count: (data.hit_count as number) + 1,
      last_hit_at: new Date().toISOString(),
    })
    .eq("cache_key", cacheKey);

  return {
    outputText: data.output_text as string,
    inputTokens: (data.input_tokens as number) ?? null,
    outputTokens: (data.output_tokens as number) ?? null,
    resultId: (data.result_id as string) ?? null,
  };
}

async function writeCache(
  db: DB,
  cacheKey: string,
  entry: {
    taskType: string;
    resultId: string | null;
    outputText: string;
    inputTokens: number;
    outputTokens: number;
    costUsd: number;
  }
): Promise<void> {
  await db.from("ai_cache").upsert(
    {
      cache_key: cacheKey,
      task_type: entry.taskType,
      result_id: entry.resultId,
      output_text: entry.outputText,
      input_tokens: entry.inputTokens,
      output_tokens: entry.outputTokens,
      saved_usd: entry.costUsd,
    },
    { onConflict: "cache_key" }
  );
}

async function storeResult(
  db: DB,
  input: {
    request: GatewayRequest;
    decision: { provider: AIProviderName; model: string };
    inputHash: string;
    promptVersion: number;
    output: string;
    inputTokens: number;
    outputTokens: number;
    costUsd: number;
    latencyMs: number;
  }
): Promise<string | null> {
  const { data } = await db
    .from("ai_results")
    .insert({
      job_id: input.request.jobId ?? null,
      project_id: input.request.projectId ?? null,
      task_type: input.request.taskType,
      input_hash: input.inputHash,
      input_preview: input.request.prompt.slice(0, 500),
      output_text: input.output,
      provider: input.decision.provider,
      model: input.decision.model,
      prompt_template: input.request.promptTemplate ?? null,
      prompt_version: input.promptVersion,
      worker_version: process.env.RAILWAY_GIT_COMMIT_SHA?.slice(0, 7) ?? null,
      input_tokens: input.inputTokens,
      output_tokens: input.outputTokens,
      cost_usd: input.costUsd,
      execution_time_ms: input.latencyMs,
      success: true,
    })
    .select("id")
    .single();

  return (data?.id as string) ?? null;
}

async function recordRequest(
  db: DB,
  input: {
    request: GatewayRequest;
    decision: { provider: AIProviderName; model: string };
    outcome: "ok" | "cached" | "error";
    inputTokens?: number | null;
    outputTokens?: number | null;
    costUsd?: number;
    latencyMs: number;
    redacted: number;
    promptVersion: number;
    errorCode?: string;
  }
): Promise<void> {
  await db.from("ai_requests_log").insert({
    actor_id: input.request.actorId ?? null,
    project_id: input.request.projectId ?? null,
    provider: input.decision.provider,
    model_used: input.decision.model,
    task_type: input.request.taskType,
    success: input.outcome !== "error",
    latency_ms: input.latencyMs,
    error_code: input.errorCode ?? null,
    input_tokens: input.inputTokens ?? null,
    output_tokens: input.outputTokens ?? null,
    total_tokens:
      input.inputTokens != null && input.outputTokens != null
        ? input.inputTokens + input.outputTokens
        : null,
    cost_usd: input.costUsd ?? null,
    cached: input.outcome === "cached",
    job_id: input.request.jobId ?? null,
    trace_id: input.request.traceId ?? null,
    prompt_version: input.promptVersion,
    sanitized_fields: input.redacted,
  });
}
