import { WhatsAppTimeoutError } from "./errors";

/**
 * يلف Promise بحد أقصى للوقت — لو الوقت خلص قبل ما الـ Promise يخلص،
 * بيرمي WhatsAppTimeoutError بدل ما يفضل الطلب مفتوح للأبد.
 */
export async function withTimeout<T>(
  promise: Promise<T>,
  timeoutMs: number,
  provider?: string
): Promise<T> {
  let timeoutHandle: ReturnType<typeof setTimeout>;

  const timeoutPromise = new Promise<never>((_, reject) => {
    timeoutHandle = setTimeout(() => {
      reject(new WhatsAppTimeoutError(`انتهى الوقت المسموح (${timeoutMs}ms)`, provider));
    }, timeoutMs);
  });

  try {
    return await Promise.race([promise, timeoutPromise]);
  } finally {
    clearTimeout(timeoutHandle!);
  }
}
