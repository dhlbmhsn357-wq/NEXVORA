import type { PageCheckResult } from "./check-runner";

/**
 * توليد مرشحي الحوادث آليًا من دليل حقيقي بس — منطق خالص بدون أي AI،
 * نفس فلسفة Phase 4 بالظبط. عتبات (Thresholds) هذه النسخة محافظة
 * وموثّقة صراحةً — قابلة للتعديل مستقبلًا.
 */

const SLOW_RESPONSE_THRESHOLD_MS = 3000;
const SLOW_LCP_THRESHOLD_MS = 4000;

export interface MonitoringCandidate {
  type: "unreachable" | "http_error" | "slow_response" | "slow_lcp" | "console_error" | "network_error";
  url: string;
  detail: string;
}

export function generateCandidatesFromPageCheck(result: PageCheckResult): MonitoringCandidate[] {
  const candidates: MonitoringCandidate[] = [];

  if (!result.reachable && result.httpStatus === null) {
    candidates.push({ type: "unreachable", url: result.url, detail: "تعذّر الوصول للصفحة نهائيًا (فشل التنقل)." });
  } else if (!result.reachable && result.httpStatus !== null) {
    candidates.push({ type: "http_error", url: result.url, detail: `الصفحة رجّعت HTTP ${result.httpStatus}.` });
  }

  if (result.responseTimeMs > SLOW_RESPONSE_THRESHOLD_MS) {
    candidates.push({ type: "slow_response", url: result.url, detail: `زمن الاستجابة ${result.responseTimeMs}ms (أعلى من ${SLOW_RESPONSE_THRESHOLD_MS}ms).` });
  }

  if (result.lcpMs !== null && result.lcpMs > SLOW_LCP_THRESHOLD_MS) {
    candidates.push({ type: "slow_lcp", url: result.url, detail: `Largest Contentful Paint ${result.lcpMs}ms (أعلى من ${SLOW_LCP_THRESHOLD_MS}ms).` });
  }

  for (const error of result.consoleErrors) {
    candidates.push({ type: "console_error", url: result.url, detail: error });
  }

  for (const error of result.networkErrors) {
    candidates.push({ type: "network_error", url: result.url, detail: error });
  }

  return candidates;
}

export function generateCandidatesFromChecks(results: PageCheckResult[]): MonitoringCandidate[] {
  return results.flatMap(generateCandidatesFromPageCheck);
}
