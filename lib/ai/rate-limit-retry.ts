/**
 * إعادة المحاولة على مستوى المتصفح (Client) بعد Rate Limit من Gemini.
 *
 * ليه في الـ Client مش السيرفر؟ لأن Vercel Hobby بيقصّ أي Server
 * Function عند 60 ثانية بغضّ النظر عن maxDuration — فمفيش طريقة ننتظر
 * نافذة تبريد الدقيقة (أو أكتر) جوه استدعاء سيرفر واحد. الحل: السيرفر
 * يرجّع فورًا برسالة RATE_LIMIT، والمتصفح ينتظر المدة المقترحة ويعيد
 * الاستدعاء تلقائيًا — كل استدعاء سيرفر يفضل قصير، والانتظار الطويل
 * (لغاية 5 دقايق) بيتوزّع على كذا استدعاء بدون ما يضرب سقف الـ60 ثانية.
 */

export const RATE_LIMIT_CODE = "RATE_LIMIT";

/**
 * المدة الافتراضية للانتظار لو الرسالة مافيهاش مدة صريحة — 60 ثانية
 * (مش 30) عشان تغطي نافذة حصة Gemini بالدقيقة (RPM) كاملة. لو انتظرنا
 * نص المدة بس، فيه احتمال حقيقي نرجع نحاول والنافذة لسه مقفولة، فنرجع
 * نفس خطأ 429 تاني من غير داعي.
 */
const DEFAULT_RETRY_MS = 60_000;
/** أقصى انتظار لمحاولة واحدة (نافذة حصة Gemini بالدقيقة ≈ 60 ثانية). */
const MAX_WAIT_PER_ATTEMPT_MS = 120_000;
/**
 * إجمالي الوقت اللي المتصفح مستعد ينتظره قبل ما يستسلم — زودناها بناءً
 * على طلب صريح من المستخدم، مع تنويه واضح إنها مش هتحل حصة Gemini
 * اليومية (Free Tier: 20 طلب/يوم) لو هي فعلاً السبب — الحصة دي بتتجدد
 * بعد ساعات مش دقايق، فأي مدة انتظار جوه نفس الجلسة (حتى ساعة) هتضرب
 * نفس الحد تاني وترجع نفس الخطأ. الزيادة دي مفيدة بس في حالة حدود
 * الدقيقة (RPM) الحقيقية، أو لو الحصة اليومية قربت تتجدد أثناء الانتظار.
 */
const DEFAULT_TOTAL_BUDGET_MS = 1_800_000; // 30 دقيقة

/**
 * Gemini بيرجّع مدة التبريد صراحةً في نص الخطأ ("Please retry in 47.9s").
 * بنستخرجها ونضيف هامش أمان بسيط. لو مش موجودة نرجّع الافتراضي.
 */
export function parseRetryAfterMs(
  message: string | null | undefined,
  fallbackMs: number = DEFAULT_RETRY_MS
): number {
  if (!message) return fallbackMs;
  const match = message.match(/retry in\s+([\d.]+)\s*s/i);
  if (!match) return fallbackMs;
  const seconds = Number(match[1]);
  if (!Number.isFinite(seconds) || seconds <= 0) return fallbackMs;
  return Math.ceil(seconds * 1000) + 2_000;
}

export interface RateLimitRetryOptions {
  /** إجمالي ميزانية الوقت (افتراضي 5 دقائق). */
  totalBudgetMs?: number;
  /** يُستدعى كل ثانية أثناء الانتظار — للـ Countdown في الواجهة. */
  onWait?: (secondsLeft: number, attempt: number) => void;
  /** يُستدعى قبل كل محاولة فعلية (attempt يبدأ من 1). */
  onAttempt?: (attempt: number) => void;
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * ينفّذ fn، ولو رجّع نتيجة "متوقفة على Rate Limit" ينتظر ويعيد المحاولة
 * لغاية ما ينجح أو تخلص ميزانية الوقت. بيرجّع آخر نتيجة (ناجحة أو لأ).
 *
 * generic عشان يشتغل مع كل أشكال نتائج التوليد (PRD/Prototype/Presentation/
 * Handoff) — كلها بترجّع { status:'error', code, message } عند الفشل.
 */
export async function runWithRateLimitRetry<T>(
  fn: () => Promise<T>,
  isRateLimited: (result: T) => boolean,
  getRetryAfterMs: (result: T) => number,
  options: RateLimitRetryOptions = {}
): Promise<T> {
  const budget = options.totalBudgetMs ?? DEFAULT_TOTAL_BUDGET_MS;
  const start = Date.now();
  let attempt = 1;

  for (;;) {
    options.onAttempt?.(attempt);
    const result = await fn();
    if (!isRateLimited(result)) return result;

    const elapsed = Date.now() - start;
    const remainingBudget = budget - elapsed;
    if (remainingBudget <= 0) return result;

    const wait = Math.min(getRetryAfterMs(result), MAX_WAIT_PER_ATTEMPT_MS, remainingBudget);
    let secondsLeft = Math.ceil(wait / 1000);
    while (secondsLeft > 0) {
      options.onWait?.(secondsLeft, attempt);
      await sleep(1000);
      secondsLeft -= 1;
    }
    attempt += 1;
  }
}
