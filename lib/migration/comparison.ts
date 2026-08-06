import type { SupabaseClient } from "@supabase/supabase-js";
import { createServiceClient } from "@/lib/supabase/service";
import type { MigratableService } from "./flags";

/**
 * مقارنة المسار القديم بالجديد — **مقاسة لا مُدّعاة**.
 *
 * كل تنفيذ يسجّل صفًّا يقول: أي مسار سلك، وكم استغرق، وهل نجح، وهل
 * رجع للقديم ولماذا. بدون هذا السجل، الحكم على الترحيل يصبح انطباعًا،
 * والانطباع لا يكشف تدهورًا بطيئًا.
 */

export interface ComparisonEntry {
  service: MigratableService;
  taskType: string;
  path: "legacy" | "new";
  latencyMs: number;
  success: boolean;
  /** هل بدأ في المسار الجديد ثم رجع للقديم؟ */
  fellBack: boolean;
  reason?: string;
}

export async function recordComparison(
  entry: ComparisonEntry,
  client?: SupabaseClient
): Promise<void> {
  try {
    const db = client ?? createServiceClient();
    await db.from("migration_comparisons").insert({
      service: entry.service,
      task_type: entry.taskType,
      path: entry.path,
      latency_ms: entry.latencyMs,
      success: entry.success,
      fell_back: entry.fellBack,
      reason: entry.reason ?? null,
    });
  } catch {
    // القياس لا يُسقط التنفيذ أبدًا. فقدان صفّ قياس مزعج؛ وفشل عملية
    // نجحت بسبب فشل كتابة إحصائية غير مقبول.
  }
}

export interface ServiceComparison {
  service: string;
  legacyCalls: number;
  newCalls: number;
  fallbacks: number;
  legacyAvgMs: number | null;
  newAvgMs: number | null;
  legacySuccessRate: number | null;
  newSuccessRate: number | null;
  /** نسبة الطلبات التي نفّذها المسار الجديد فعلًا. */
  migratedShare: number | null;
}

interface Row {
  service: string;
  path: "legacy" | "new";
  latency_ms: number;
  success: boolean;
  fell_back: boolean;
}

export async function collectComparisons(
  options: { sinceMs?: number } = {},
  client?: SupabaseClient
): Promise<ServiceComparison[]> {
  const db = client ?? createServiceClient();
  const since = new Date(Date.now() - (options.sinceMs ?? 7 * 24 * 60 * 60 * 1000)).toISOString();

  const { data } = await db
    .from("migration_comparisons")
    .select("service, path, latency_ms, success, fell_back")
    .gte("created_at", since)
    .limit(20_000);

  return summarize((data ?? []) as Row[]);
}

/** التجميع — دالة نقية عشان تتغطّى بالاختبار بلا قاعدة بيانات. */
export function summarize(rows: Row[]): ServiceComparison[] {
  const byService = new Map<string, Row[]>();
  for (const row of rows) {
    const bucket = byService.get(row.service);
    if (bucket) bucket.push(row);
    else byService.set(row.service, [row]);
  }

  return [...byService.entries()]
    .map(([service, group]) => {
      const legacy = group.filter((r) => r.path === "legacy");
      const fresh = group.filter((r) => r.path === "new");
      const total = group.length;

      return {
        service,
        legacyCalls: legacy.length,
        newCalls: fresh.length,
        fallbacks: group.filter((r) => r.fell_back).length,
        legacyAvgMs: avg(legacy.map((r) => r.latency_ms)),
        newAvgMs: avg(fresh.map((r) => r.latency_ms)),
        legacySuccessRate: rate(legacy),
        newSuccessRate: rate(fresh),
        migratedShare: total === 0 ? null : fresh.length / total,
      };
    })
    .sort((a, b) => b.legacyCalls + b.newCalls - (a.legacyCalls + a.newCalls));
}

/** `null` بلا عيّنة — الصفر هنا يوهم بفشل كامل وهو لا معلومة. */
function avg(values: number[]): number | null {
  if (values.length === 0) return null;
  return Math.round(values.reduce((a, b) => a + b, 0) / values.length);
}

function rate(rows: Row[]): number | null {
  if (rows.length === 0) return null;
  return rows.filter((r) => r.success).length / rows.length;
}

/**
 * هل المسار الجديد أسوأ بشكل يستدعي الرجوع؟
 *
 * القاعدة مقصودة التحفّظ: نطالب بعيّنة كافية قبل الحكم. الحكم على
 * ثلاث عمليات يقلب القرار مع أول تذبذب شبكة.
 */
export const MIN_SAMPLE_FOR_VERDICT = 20;

export type MigrationVerdict =
  | { verdict: "insufficient_data"; reason: string }
  | { verdict: "healthy"; reason: string }
  | { verdict: "degraded"; reason: string; recommendRollback: boolean };

export function assessMigration(comparison: ServiceComparison): MigrationVerdict {
  if (comparison.newCalls < MIN_SAMPLE_FOR_VERDICT) {
    return {
      verdict: "insufficient_data",
      reason: `${comparison.newCalls} تنفيذ فقط في المسار الجديد — أقل من ${MIN_SAMPLE_FOR_VERDICT}.`,
    };
  }

  const newRate = comparison.newSuccessRate ?? 0;
  const legacyRate = comparison.legacySuccessRate;

  // الرجوع المتكرر أخطر من البطء: كل رجوع معناه أن المسار الجديد لم
  // يعمل، والمستخدم نجا بالقديم فقط.
  const fallbackShare = comparison.fallbacks / Math.max(1, comparison.newCalls + comparison.fallbacks);
  if (fallbackShare > 0.2) {
    return {
      verdict: "degraded",
      reason: `${Math.round(fallbackShare * 100)}٪ من المحاولات رجعت للمسار القديم.`,
      recommendRollback: true,
    };
  }

  if (legacyRate !== null && newRate < legacyRate - 0.1) {
    return {
      verdict: "degraded",
      reason: `نسبة نجاح المسار الجديد ${Math.round(newRate * 100)}٪ مقابل ${Math.round(legacyRate * 100)}٪ للقديم.`,
      recommendRollback: true,
    };
  }

  if (
    comparison.newAvgMs !== null &&
    comparison.legacyAvgMs !== null &&
    comparison.newAvgMs > comparison.legacyAvgMs * 2
  ) {
    return {
      verdict: "degraded",
      reason: `زمن المسار الجديد ${comparison.newAvgMs} م.ث مقابل ${comparison.legacyAvgMs} للقديم.`,
      // البطء وحده لا يستدعي الرجوع: الانتقال ينقل العمل من Vercel،
      // وزمن أطول قليلًا مقابل حمل أقل قد يكون مقايضة مقصودة.
      recommendRollback: false,
    };
  }

  return { verdict: "healthy", reason: `${comparison.newCalls} تنفيذ ناجح في المسار الجديد.` };
}
