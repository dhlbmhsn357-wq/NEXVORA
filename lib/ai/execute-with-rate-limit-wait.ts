import { AIService } from "./service";
import { parseRetryAfterMs } from "./rate-limit-retry";
import type { AIRequestContext, AIResponse, AITaskType } from "./types";

/**
 * نسخة Server-only من إعادة المحاولة على Rate Limit — للاستخدام **جوّه
 * Background Job فقط** (بعد ما الـ Lock اتحجز والاستجابة السريعة
 * ("started") رجعت للمتصفح بالفعل). هنا الانتظار الطويل آمن لأنه مفيش
 * متصفح ماسك الطلب.
 *
 * ده غير lib/ai/rate-limit-retry.ts (اللي بيتستخدم في المتصفح نفسه) —
 * الملف ده بيستدعي AIService مباشرة (Service Role)، فمينفعش يتحمّل في
 * Client Bundle.
 */

const DEFAULT_BACKGROUND_RATE_LIMIT_BUDGET_MS = 240_000; // 4 دقائق
const MAX_SINGLE_WAIT_MS = 65_000;

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export async function executeAIWithRateLimitWait(
  taskType: AITaskType,
  input: string,
  context: AIRequestContext,
  /** ميزانية الانتظار الصبور — أقل من الافتراضي لو الـ Job فيه خطوة
   * تانية بطيئة قبل استدعاء الـ AI (زي قراءة Repository كامل) وقارب
   * على حد maxDuration الكلي للصفحة. */
  budgetMs: number = DEFAULT_BACKGROUND_RATE_LIMIT_BUDGET_MS
): Promise<AIResponse> {
  const start = Date.now();
  for (;;) {
    const response = await AIService.execute(taskType, input, context);
    if (response.success || response.error?.code !== "RATE_LIMIT") return response;

    const elapsed = Date.now() - start;
    const remaining = budgetMs - elapsed;
    if (remaining <= 0) return response;

    const wait = Math.min(parseRetryAfterMs(response.error?.message), MAX_SINGLE_WAIT_MS, remaining);
    await sleep(wait);
  }
}
