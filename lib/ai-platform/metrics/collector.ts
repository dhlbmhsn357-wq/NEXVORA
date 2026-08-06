import type { SupabaseClient } from "@supabase/supabase-js";
import { createServiceClient } from "@/lib/supabase/service";
import { aggregateCost, cacheHitRate } from "../cost/calculator";

/**
 * جمع مقاييس منصة الذكاء الاصطناعي — قراءة فقط.
 *
 * الحساب يمرّ من `cost/calculator` النقي، فالمنطق مُغطّى بالاختبار
 * والملف ده تجميع فقط.
 */

export interface AIMetrics {
  totalRequests: number;
  successCount: number;
  failureCount: number;
  cachedCount: number;
  successRate: number | null;
  cacheHitRate: number | null;
  avgLatencyMs: number | null;
  totalCostUsd: number;
  savedByCacheUsd: number;
  totalInputTokens: number;
  totalOutputTokens: number;
  avgTokensPerRequest: number | null;
  byProvider: Array<{ provider: string; requests: number; costUsd: number }>;
  byTaskType: Array<{ taskType: string; requests: number; costUsd: number; avgLatencyMs: number }>;
  totalRedactions: number;
}

interface LogRow {
  provider: string;
  task_type: string;
  success: boolean;
  cached: boolean;
  latency_ms: number | null;
  input_tokens: number | null;
  output_tokens: number | null;
  cost_usd: number | null;
  sanitized_fields: number | null;
}

const WINDOW_MS = 30 * 24 * 60 * 60 * 1000;

export async function collectAIMetrics(
  options: { sinceMs?: number } = {},
  client?: SupabaseClient
): Promise<AIMetrics> {
  const db = client ?? createServiceClient();
  const since = new Date(Date.now() - (options.sinceMs ?? WINDOW_MS)).toISOString();

  const { data } = await db
    .from("ai_requests_log")
    .select(
      "provider, task_type, success, cached, latency_ms, input_tokens, output_tokens, cost_usd, sanitized_fields"
    )
    .gte("created_at", since)
    .limit(10_000);

  const rows = (data ?? []) as LogRow[];

  const successCount = rows.filter((r) => r.success).length;
  const failureCount = rows.length - successCount;
  const cachedCount = rows.filter((r) => r.cached).length;

  const costs = aggregateCost(rows.map((r) => ({ costUsd: r.cost_usd, cached: r.cached })));

  const latencies = rows.map((r) => r.latency_ms).filter((v): v is number => typeof v === "number");
  const totalInputTokens = sum(rows.map((r) => r.input_tokens));
  const totalOutputTokens = sum(rows.map((r) => r.output_tokens));

  return {
    totalRequests: rows.length,
    successCount,
    failureCount,
    cachedCount,
    // `null` بلا عيّنة لا صفر: «صفر نجاح من صفر طلب» يبدو فشلًا كاملًا
    // وهو في الحقيقة لا معلومة.
    successRate: rows.length === 0 ? null : successCount / rows.length,
    cacheHitRate: cacheHitRate(costs.cachedCalls, costs.billedCalls),
    avgLatencyMs: latencies.length === 0 ? null : Math.round(mean(latencies)),
    totalCostUsd: costs.totalUsd,
    savedByCacheUsd: costs.savedUsd,
    totalInputTokens,
    totalOutputTokens,
    avgTokensPerRequest:
      rows.length === 0 ? null : Math.round((totalInputTokens + totalOutputTokens) / rows.length),
    byProvider: groupBy(rows, (r) => r.provider).map(([provider, group]) => ({
      provider,
      requests: group.length,
      costUsd: round(sum(group.map((r) => r.cost_usd))),
    })),
    byTaskType: groupBy(rows, (r) => r.task_type)
      .map(([taskType, group]) => ({
        taskType,
        requests: group.length,
        costUsd: round(sum(group.map((r) => r.cost_usd))),
        avgLatencyMs: Math.round(
          mean(group.map((r) => r.latency_ms).filter((v): v is number => typeof v === "number"))
        ),
      }))
      .sort((a, b) => b.requests - a.requests),
    totalRedactions: sum(rows.map((r) => r.sanitized_fields)),
  };
}

/** حالة المزوّدين — قواطع الدوائر. */
export async function collectProviderHealth(client?: SupabaseClient) {
  const db = client ?? createServiceClient();
  const { data } = await db
    .from("ai_provider_health")
    .select("provider, state, consecutive_errors, next_probe_at, last_error");

  return (data ?? []) as Array<{
    provider: string;
    state: string;
    consecutive_errors: number;
    next_probe_at: string | null;
    last_error: string | null;
  }>;
}

function sum(values: Array<number | null>): number {
  return values.reduce<number>((acc, v) => acc + (v ?? 0), 0);
}

function mean(values: number[]): number {
  return values.length === 0 ? 0 : values.reduce((a, b) => a + b, 0) / values.length;
}

function round(value: number): number {
  return Math.round(value * 1e6) / 1e6;
}

function groupBy<T>(rows: T[], keyOf: (row: T) => string): Array<[string, T[]]> {
  const map = new Map<string, T[]>();
  for (const row of rows) {
    const key = keyOf(row);
    const bucket = map.get(key);
    if (bucket) bucket.push(row);
    else map.set(key, [row]);
  }
  return [...map.entries()];
}
