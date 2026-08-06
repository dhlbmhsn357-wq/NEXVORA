import { ClaudeProvider } from "./provider";
import type { ClaudeRequest, ClaudeResponse } from "./types";

const DEFAULT_TIMEOUT_MS = 180_000;
const MAX_RATE_LIMIT_RETRIES = 2;
const RATE_LIMIT_BACKOFF_MS = 15_000;

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function withTimeout<T>(promise: Promise<T>, ms: number, onTimeout: () => T): Promise<T> {
  return new Promise((resolve) => {
    const timer = setTimeout(() => resolve(onTimeout()), ms);
    promise.then((value) => {
      clearTimeout(timer);
      resolve(value);
    });
  });
}

/**
 * الواجهة الوحيدة اللي أي كود تنفيذ (Task Execution Engine، QA Fix
 * Loop) لازم يستدعيها — بدل ما يستخدم ClaudeProvider مباشرة. مسؤول عن
 * إعادة المحاولة عند Rate Limit والـ Timeout بس؛ منطق التنفيذ نفسه
 * (بناء الـ Prompt، تفسير الرد) مسؤولية الكولر.
 */
export class ClaudeService {
  static async execute(request: ClaudeRequest): Promise<ClaudeResponse> {
    const provider = new ClaudeProvider();
    let lastResponse: ClaudeResponse | null = null;

    for (let attempt = 0; attempt <= MAX_RATE_LIMIT_RETRIES; attempt++) {
      const response = await withTimeout(provider.execute(request), DEFAULT_TIMEOUT_MS, () => ({
        success: false as const,
        output: null,
        model_used: "unknown",
        latency_ms: DEFAULT_TIMEOUT_MS,
        token_usage: null,
        cost_usd: null,
        error: { code: "TIMEOUT", message: "استغرق استدعاء Claude وقتًا أطول من المتوقع." },
        request_id: crypto.randomUUID(),
      }));

      if (response.success || response.error?.code !== "RATE_LIMIT") return response;

      lastResponse = response;
      if (attempt < MAX_RATE_LIMIT_RETRIES) await sleep(RATE_LIMIT_BACKOFF_MS * (attempt + 1));
    }

    return lastResponse!;
  }
}
