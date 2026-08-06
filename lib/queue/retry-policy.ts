import type { JobFailureClass } from "./types";

/**
 * سياسة إعادة المحاولة — وحدة نقية.
 *
 * مبنية على مبدأ واحد: **ليس كل فشل يستحق إعادة المحاولة.** إعادة
 * محاولة مدخل غير صالح عشر مرات هدر خالص، وإعادة محاولة ضغط لحظي
 * مرة واحدة استسلام مبكر. التصنيف هو ما يفرّق.
 */

export const BASE_DELAY_MS = 2_000;
export const MAX_DELAY_MS = 5 * 60 * 1000;
/** ±٢٠٪ عشوائية — انظر `backoffDelayMs` للسبب. */
export const JITTER_RATIO = 0.2;

/** المحاولات المسموحة للخطأ المجهول قبل الرسائل الميتة. */
export const UNKNOWN_CLASS_MAX_ATTEMPTS = 2;

/**
 * أنماط تُصنَّف عابرة — تستحق إعادة المحاولة.
 * تُطابَق على نص الخطأ أو كوده.
 */
const TRANSIENT_PATTERNS = [
  /\b429\b/,
  /\b503\b/,
  /\b502\b/,
  /\b504\b/,
  /rate.?limit/i,
  /quota/i,
  /timeout/i,
  /timed out/i,
  /ETIMEDOUT/,
  /ECONNRESET/,
  /ECONNREFUSED/,
  /ENOTFOUND/,
  /EAI_AGAIN/,
  /socket hang up/i,
  /temporarily unavailable/i,
  /too many requests/i,
  /overloaded/i,
];

/**
 * أنماط تُصنَّف دائمة — لا تستحق إعادة المحاولة.
 * تُفحص **قبل** العابرة: "٤٠٠ invalid request timeout parameter" لازم
 * يتقرا كخطأ دائم مش عابر لمجرد وجود كلمة timeout فيه.
 */
const PERMANENT_PATTERNS = [
  /\b400\b/,
  /\b401\b/,
  /\b403\b/,
  /\b404\b/,
  /\b422\b/,
  /invalid.*(input|payload|argument|request)/i,
  /validation failed/i,
  /unsupported/i,
  /not found/i,
  /permission denied/i,
  /unauthorized/i,
  /forbidden/i,
  /malformed/i,
];

/**
 * يصنّف الخطأ.
 *
 * الترتيب مقصود: الدائم أولًا، لأن رسائل الأخطاء الحقيقية بتخلط
 * الكلمات. الافتراضي `unknown` لا `transient` — الافتراض المتفائل
 * هنا معناه حلقة إعادة محاولة لخطأ برمجي لن يُشفى أبدًا.
 */
export function classifyFailure(error: unknown): JobFailureClass {
  const text = extractErrorText(error);
  if (!text) return "unknown";

  for (const pattern of PERMANENT_PATTERNS) {
    if (pattern.test(text)) return "permanent";
  }
  for (const pattern of TRANSIENT_PATTERNS) {
    if (pattern.test(text)) return "transient";
  }
  return "unknown";
}

function extractErrorText(error: unknown): string {
  if (!error) return "";
  if (typeof error === "string") return error;
  if (error instanceof Error) {
    const withCode = error as Error & { code?: string | number; status?: number };
    return [error.message, withCode.code, withCode.status].filter(Boolean).join(" ");
  }
  const e = error as { message?: string; code?: string | number; status?: number };
  const parts = [e.message, e.code, e.status].filter((p) => p !== undefined && p !== null);
  if (parts.length > 0) return parts.join(" ");
  try {
    return JSON.stringify(error);
  } catch {
    return "";
  }
}

/** الحد الأقصى الفعّال للمحاولات — الخطأ المجهول له سقف أقل. */
export function effectiveMaxAttempts(failureClass: JobFailureClass, configured: number): number {
  if (failureClass === "permanent") return 0;
  if (failureClass === "unknown") return Math.min(configured, UNKNOWN_CLASS_MAX_ATTEMPTS);
  return configured;
}

/**
 * هل نعيد المحاولة؟
 *
 * @param attemptsMade عدد المحاولات المكتملة (بما فيها الفاشلة الحالية)
 */
export function shouldRetry(
  failureClass: JobFailureClass,
  attemptsMade: number,
  maxAttempts: number
): boolean {
  if (failureClass === "permanent") return false;
  return attemptsMade < effectiveMaxAttempts(failureClass, maxAttempts);
}

/**
 * تأخير التراجع الأُسّي مع عشوائية.
 *
 * **العشوائية ليست تجميلًا.** بدونها تعيد كل المهام اللي فشلت في نفس
 * اللحظة المحاولةَ في نفس اللحظة بالظبط، فيتكرّر نفس الانهيار اللي
 * أوقعها — وهذا هو "قطيع الرعد" الكلاسيكي.
 *
 * @param attempt رقم المحاولة القادمة (يبدأ من ١)
 * @param random مُمرَّر للاختبار الحتمي
 */
export function backoffDelayMs(attempt: number, random: () => number = Math.random): number {
  const safeAttempt = Math.max(1, Math.floor(attempt));
  const exponent = safeAttempt - 1;

  const raw = BASE_DELAY_MS * 2 ** exponent;
  const capped = Number.isFinite(raw) ? Math.min(raw, MAX_DELAY_MS) : MAX_DELAY_MS;

  const jitter = capped * JITTER_RATIO * (random() * 2 - 1);
  return Math.max(0, Math.round(capped + jitter));
}

/** موعد إعادة المحاولة القادم. */
export function nextRetryAt(
  attempt: number,
  now: Date,
  random: () => number = Math.random
): Date {
  return new Date(now.getTime() + backoffDelayMs(attempt, random));
}

export interface RetryDecision {
  action: "retry" | "dead_letter";
  failureClass: JobFailureClass;
  delayMs: number;
  retryAt: Date | null;
  reason: string;
}

/**
 * القرار الكامل بعد فشل مهمة — نقطة واحدة تجمع كل ما سبق.
 *
 * الخدمة تنادي هذه فقط، فلا يتفرّق منطق إعادة المحاولة على مواضع
 * متعددة تختلف تدريجيًا مع الوقت.
 */
export function decideRetry(input: {
  error: unknown;
  attemptsMade: number;
  maxAttempts: number;
  now: Date;
  random?: () => number;
}): RetryDecision {
  const random = input.random ?? Math.random;
  const failureClass = classifyFailure(input.error);

  if (!shouldRetry(failureClass, input.attemptsMade, input.maxAttempts)) {
    return {
      action: "dead_letter",
      failureClass,
      delayMs: 0,
      retryAt: null,
      reason:
        failureClass === "permanent"
          ? "خطأ دائم — إعادة المحاولة لن تغيّر النتيجة."
          : `استُنفدت المحاولات (${input.attemptsMade} من ${effectiveMaxAttempts(failureClass, input.maxAttempts)}).`,
    };
  }

  const nextAttempt = input.attemptsMade + 1;
  const delayMs = backoffDelayMs(nextAttempt, random);

  return {
    action: "retry",
    failureClass,
    delayMs,
    retryAt: new Date(input.now.getTime() + delayMs),
    reason: `فشل عابر — المحاولة ${nextAttempt} بعد ${Math.round(delayMs / 1000)} ثانية.`,
  };
}
