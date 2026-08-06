import type { SupabaseClient } from "@supabase/supabase-js";
import { createServiceClient } from "@/lib/supabase/service";
import { computeSnapshot, detectAlerts } from "./monitoring";
import type { MonitoringSnapshot, MonitoringAlert } from "./execution-types";

/**
 * المراقبة الحيّة — يجمّع تقدّم التنفيذ من صفّ العملية والمهام ويُصدر لقطة
 * + تنبيهات تشغيلية (بطء/إعادات/ارتفاع أخطاء). أساس اللوحة المباشرة.
 */

export interface LiveMonitoring {
  snapshot: MonitoringSnapshot;
  alerts: MonitoringAlert[];
  currentEntity: string | null;
}

export async function getMonitoring(executionId: string, client?: SupabaseClient): Promise<LiveMonitoring | null> {
  const db = client ?? createServiceClient();
  const exec = await db.from("migration_executions").select("total_rows, processed_rows, total_tasks, completed_tasks, failed_tasks, started_at, phase").eq("id", executionId).maybeSingle();
  const e = exec.data as { total_rows: number; processed_rows: number; total_tasks: number; completed_tasks: number; failed_tasks: number; started_at: string | null; phase: string } | null;
  if (!e) return null;

  const running = await db.from("migration_execution_tasks").select("entity, chunk_index, retry_count, status").eq("execution_id", executionId).eq("status", "running").limit(1).maybeSingle();
  const cur = running.data as { entity: string; chunk_index: number } | null;

  const retriesAgg = await db.from("migration_execution_tasks").select("retry_count").eq("execution_id", executionId);
  const retries = ((retriesAgg.data ?? []) as Array<{ retry_count: number }>).reduce((s, t) => s + (t.retry_count ?? 0), 0);

  const elapsed = e.started_at ? Math.max(1, (Date.now() - new Date(e.started_at).getTime()) / 1000) : 1;
  const input = {
    totalRows: e.total_rows, processedRows: e.processed_rows, elapsedSeconds: elapsed,
    currentEntity: cur?.entity ?? null, currentChunk: cur?.chunk_index ?? null,
    errors: e.failed_tasks, warnings: 0, retries, completedChunks: e.completed_tasks, totalChunksCount: e.total_tasks,
  };
  return { snapshot: computeSnapshot(input), alerts: detectAlerts(input), currentEntity: cur?.entity ?? null };
}
