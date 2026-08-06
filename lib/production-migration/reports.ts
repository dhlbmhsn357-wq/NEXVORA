import type { SupabaseClient } from "@supabase/supabase-js";
import { createServiceClient } from "@/lib/supabase/service";

/**
 * تقارير التنفيذ — تُجمّع تلقائيًا من صفّ العملية والمهام والأحداث:
 * Migration · Performance · Execution · Validation · Audit · Rollback.
 * مشتقّات فقط (بلا صفوف خام).
 */

export interface ExecutionReports {
  migration: Record<string, unknown>;
  performance: Record<string, unknown>;
  execution: Record<string, unknown>;
  validation: Record<string, unknown>;
  audit: Array<{ event_type: string; created_at: string; detail: Record<string, unknown> }>;
  rollback: Record<string, unknown> | null;
}

export async function buildReports(executionId: string, client?: SupabaseClient): Promise<ExecutionReports | null> {
  const db = client ?? createServiceClient();
  const [exec, tasks, events, rollback] = await Promise.all([
    db.from("migration_executions").select("*").eq("id", executionId).maybeSingle(),
    db.from("migration_execution_tasks").select("entity, status, processed, migrated, failed, retry_count, duration_ms").eq("execution_id", executionId),
    db.from("migration_execution_events").select("event_type, created_at, detail").eq("execution_id", executionId).order("created_at", { ascending: true }).limit(200),
    db.from("migration_rollback_packages").select("status, data_loss, duration_ms, steps, executed_at").eq("execution_id", executionId).order("created_at", { ascending: false }).limit(1).maybeSingle(),
  ]);
  const e = exec.data as Record<string, unknown> | null;
  if (!e) return null;
  const taskRows = (tasks.data ?? []) as Array<{ entity: string; status: string; processed: number; migrated: number; failed: number; retry_count: number; duration_ms: number }>;

  const totalDuration = taskRows.reduce((s, t) => s + (t.duration_ms ?? 0), 0);
  const totalProcessed = taskRows.reduce((s, t) => s + (t.processed ?? 0), 0);
  const byStatus = taskRows.reduce<Record<string, number>>((acc, t) => ((acc[t.status] = (acc[t.status] ?? 0) + 1), acc), {});
  const retries = taskRows.reduce((s, t) => s + (t.retry_count ?? 0), 0);

  return {
    migration: {
      status: e.status, totalEntities: e.total_entities, totalRows: e.total_rows,
      migratedRows: e.migrated_rows, failedRows: e.failed_rows, approvalScore: e.approval_score,
      startedAt: e.started_at, completedAt: e.completed_at,
    },
    performance: {
      chunkSize: e.chunk_size, workerCount: e.worker_count, speedRowsPerSec: e.speed_rows_per_sec,
      totalTaskDurationMs: totalDuration, avgChunkMs: taskRows.length ? Math.round(totalDuration / taskRows.length) : 0,
      throughput: totalDuration > 0 ? Math.round((totalProcessed / totalDuration) * 1000) : 0,
    },
    execution: { totalTasks: e.total_tasks, completedTasks: e.completed_tasks, failedTasks: e.failed_tasks, tasksByStatus: byStatus, retries },
    validation: {
      migratedRows: e.migrated_rows, failedRows: e.failed_rows,
      reviewTasks: byStatus.review ?? 0,
      integrity: (e.failed_rows as number) === 0 && (byStatus.review ?? 0) === 0 ? "clean" : "needs_review",
    },
    audit: (events.data ?? []) as ExecutionReports["audit"],
    rollback: (rollback.data as Record<string, unknown> | null) ?? null,
  };
}
