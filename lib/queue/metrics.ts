import type { SupabaseClient } from "@supabase/supabase-js";
import { createServiceClient } from "@/lib/supabase/service";
import type { JobStatus } from "./types";
import type { QueueSnapshot, WorkerSnapshot } from "./health";

/**
 * جمع مقاييس الطابور — القراءة فقط، بلا أي قرار.
 *
 * الحكم على الأرقام في `health.ts` (وحدة نقية مغطّاة بالاختبار)،
 * والجمع هنا. الفصل بيخلّي المنطق قابلًا للاختبار بلا قاعدة بيانات.
 */

const ALL_STATUSES: JobStatus[] = [
  "pending",
  "queued",
  "waiting",
  "running",
  "retrying",
  "paused",
  "canceled",
  "completed",
  "failed",
  "dead_letter",
  "timeout",
];

export interface QueueOverview {
  countsByStatus: Record<JobStatus, number>;
  oldestWaitingMs: number | null;
  completedRecently: number;
  failedRecently: number;
  deadLetterCount: number;
  avgExecutionMs: number | null;
  avgQueueMs: number | null;
}

/** نافذة حساب نسبة الفشل. */
const RECENT_WINDOW_MS = 60 * 60 * 1000;

export async function collectQueueOverview(client?: SupabaseClient): Promise<QueueOverview> {
  const supabase = client ?? createServiceClient();
  const since = new Date(Date.now() - RECENT_WINDOW_MS).toISOString();

  // استعلام واحد لكل الحالات بدل أحد عشر: التعداد بالتجميع في القاعدة
  // أرخص بكثير من نداء لكل حالة — وهذا بالضبط نمط N+1 الذي أسقط
  // المنصة في موضع آخر.
  const [statusRows, oldest, recent, deadLetters, timings] = await Promise.all([
    supabase.from("jobs").select("status"),
    supabase
      .from("jobs")
      .select("created_at")
      .in("status", ["pending", "queued", "waiting", "retrying"])
      .order("created_at", { ascending: true })
      .limit(1)
      .maybeSingle(),
    supabase.from("jobs").select("status").gte("finished_at", since),
    supabase.from("job_dead_letters").select("id", { count: "exact", head: true }).is("reviewed_at", null),
    supabase
      .from("jobs")
      .select("execution_time_ms, queue_time_ms")
      .eq("status", "completed")
      .gte("finished_at", since)
      .limit(500),
  ]);

  const countsByStatus = Object.fromEntries(ALL_STATUSES.map((s) => [s, 0])) as Record<
    JobStatus,
    number
  >;
  for (const row of (statusRows.data ?? []) as Array<{ status: JobStatus }>) {
    countsByStatus[row.status] = (countsByStatus[row.status] ?? 0) + 1;
  }

  const recentRows = (recent.data ?? []) as Array<{ status: JobStatus }>;
  const completedRecently = recentRows.filter((r) => r.status === "completed").length;
  const failedRecently = recentRows.filter(
    (r) => r.status === "failed" || r.status === "timeout" || r.status === "dead_letter"
  ).length;

  const timingRows = (timings.data ?? []) as Array<{
    execution_time_ms: number | null;
    queue_time_ms: number | null;
  }>;

  return {
    countsByStatus,
    oldestWaitingMs: oldest.data?.created_at
      ? Date.now() - new Date(oldest.data.created_at).getTime()
      : null,
    completedRecently,
    failedRecently,
    deadLetterCount: deadLetters.count ?? 0,
    avgExecutionMs: average(timingRows.map((r) => r.execution_time_ms)),
    avgQueueMs: average(timingRows.map((r) => r.queue_time_ms)),
  };
}

export async function collectWorkerSnapshots(
  client?: SupabaseClient
): Promise<WorkerSnapshot[]> {
  const supabase = client ?? createServiceClient();
  const { data } = await supabase
    .from("queue_workers")
    .select("worker_key, worker_type, status, heartbeat_at, active_jobs, concurrency")
    .order("worker_type");

  const now = Date.now();
  return ((data ?? []) as Array<{
    worker_key: string;
    worker_type: string;
    status: WorkerSnapshot["status"];
    heartbeat_at: string;
    active_jobs: number;
    concurrency: number;
  }>).map((w) => ({
    workerKey: w.worker_key,
    workerType: w.worker_type,
    status: w.status,
    heartbeatAgeMs: now - new Date(w.heartbeat_at).getTime(),
    activeJobs: w.active_jobs,
    concurrency: w.concurrency,
  }));
}

/** يحوّل النظرة العامة لصورة يفهمها `health.ts`. */
export function toHealthSnapshot(overview: QueueOverview): QueueSnapshot {
  return {
    countsByStatus: overview.countsByStatus,
    oldestWaitingMs: overview.oldestWaitingMs,
    completedRecently: overview.completedRecently,
    failedRecently: overview.failedRecently,
    deadLetterCount: overview.deadLetterCount,
  };
}

/** يسجّل مقياسًا للتتبّع التاريخي. */
export async function recordMetric(
  name: string,
  value: number,
  labels: Record<string, unknown> = {},
  client?: SupabaseClient
): Promise<void> {
  await (client ?? createServiceClient())
    .from("queue_metrics")
    .insert({ metric_name: name, value, labels });
}

function average(values: Array<number | null>): number | null {
  const nums = values.filter((v): v is number => typeof v === "number");
  if (nums.length === 0) return null;
  return Math.round(nums.reduce((sum, n) => sum + n, 0) / nums.length);
}
