import { AIError, TimeoutError } from "./errors";

const MAX_ATTEMPTS = 3;
const BASE_DELAY_MS = 500;

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * ينفّذ fn مع Exponential Backoff (حتى 3 محاولات) لو الخطأ Retryable
 * (503, 429, انقطاع مؤقت، Timeout). أي خطأ مش Retryable بيتوقف فورًا.
 */
export async function withRetry<T>(
  fn: () => Promise<T>,
  maxAttempts: number = MAX_ATTEMPTS
): Promise<T> {
  let lastError: unknown;

  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    try {
      return await fn();
    } catch (err) {
      lastError = err;
      const retryable = err instanceof AIError ? err.retryable : false;

      if (!retryable || attempt === maxAttempts) {
        throw err;
      }

      const delay = BASE_DELAY_MS * 2 ** (attempt - 1);
      await sleep(delay);
    }
  }

  throw lastError;
}

/**
 * يلف Promise بحد أقصى للوقت — لو الوقت خلص قبل ما الـ Promise يخلص،
 * بيرمي TimeoutError بدل ما يفضل الطلب مفتوح للأبد.
 */
export async function withTimeout<T>(
  promise: Promise<T>,
  timeoutMs: number,
  provider?: string
): Promise<T> {
  let timeoutHandle: ReturnType<typeof setTimeout>;

  const timeoutPromise = new Promise<never>((_, reject) => {
    timeoutHandle = setTimeout(() => {
      reject(new TimeoutError(`انتهى الوقت المسموح (${timeoutMs}ms)`, provider));
    }, timeoutMs);
  });

  try {
    return await Promise.race([promise, timeoutPromise]);
  } finally {
    clearTimeout(timeoutHandle!);
  }
}
