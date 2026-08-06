import type { SupabaseClient } from "@supabase/supabase-js";
import { createServiceClient } from "@/lib/supabase/service";

/** لوحة مركز الترحيل الحقيقي — تجميع للعرض. رشيقة: أي جدول مفقود = قيم صفرية. */

export interface PmSource {
  id: string;
  name: string;
  source_type: string;
  simulation_approved: boolean;
}

export interface PmExecutionRow {
  id: string;
  source_id: string | null;
  status: string;
  phase: string;
  progress: number;
  total_rows: number;
  migrated_rows: number;
  failed_rows: number;
  approval_score: number;
  created_at: string;
}

export interface PmDashboard {
  sources: PmSource[];
  executions: PmExecutionRow[];
  totals: { runs: number; completed: number; running: number; rolledBack: number };
}

export async function getPmDashboard(projectId: string | null, client?: SupabaseClient): Promise<PmDashboard> {
  const db = client ?? createServiceClient();

  const sources: PmSource[] = [];
  try {
    let sq = db.from("migration_sources").select("id, name, source_type").eq("status", "analyzed").order("created_at", { ascending: false });
    if (projectId) sq = sq.eq("project_id", projectId);
    const { data: srcData } = await sq;
    const srcs = (srcData ?? []) as Array<{ id: string; name: string; source_type: string }>;
    if (srcs.length) {
      const ids = srcs.map((s) => s.id);
      const { data: sims } = await db.from("migration_simulations").select("source_id").in("source_id", ids).eq("status", "approved").eq("blocked", false);
      const approved = new Set(((sims ?? []) as Array<{ source_id: string }>).map((s) => s.source_id));
      for (const s of srcs) sources.push({ ...s, simulation_approved: approved.has(s.id) });
    }
  } catch {
    /* غير مطبَّق */
  }

  let executions: PmExecutionRow[] = [];
  try {
    let q = db.from("migration_executions").select("id, source_id, status, phase, progress, total_rows, migrated_rows, failed_rows, approval_score, created_at").order("created_at", { ascending: false }).limit(50);
    if (projectId) q = q.eq("project_id", projectId);
    const { data } = await q;
    if (data) executions = data as PmExecutionRow[];
  } catch {
    /* غير مطبَّق */
  }

  return {
    sources,
    executions,
    totals: {
      runs: executions.length,
      completed: executions.filter((e) => e.status === "completed").length,
      running: executions.filter((e) => e.status === "running" || e.status === "paused").length,
      rolledBack: executions.filter((e) => e.status === "rolled_back").length,
    },
  };
}

/** تفاصيل عملية كاملة (الصفّ + المهام + الفحوص + الأحداث). */
export async function getExecutionDetail(executionId: string, client?: SupabaseClient) {
  const db = client ?? createServiceClient();
  const [exec, tasks, preflight, events, backup, rollback] = await Promise.all([
    db.from("migration_executions").select("*").eq("id", executionId).maybeSingle(),
    db.from("migration_execution_tasks").select("id, entity, label, task_order, level, chunk_index, status, processed, migrated, failed, retry_count, last_error").eq("execution_id", executionId).order("task_order", { ascending: true }),
    db.from("migration_preflight_checks").select("check_key, label, passed, blocking, detail").eq("execution_id", executionId),
    db.from("migration_execution_events").select("event_type, actor_id, detail, created_at").eq("execution_id", executionId).order("created_at", { ascending: false }).limit(100),
    db.from("migration_backups").select("backup_key, size_bytes, duration_ms, restore_command, status").eq("execution_id", executionId).order("created_at", { ascending: false }).limit(1).maybeSingle(),
    db.from("migration_rollback_packages").select("status, data_loss, steps, executed_at").eq("execution_id", executionId).order("created_at", { ascending: false }).limit(1).maybeSingle(),
  ]);
  if (!exec.data) return null;
  return {
    execution: exec.data,
    tasks: tasks.data ?? [],
    preflight: preflight.data ?? [],
    events: events.data ?? [],
    backup: backup.data ?? null,
    rollback: rollback.data ?? null,
  };
}
