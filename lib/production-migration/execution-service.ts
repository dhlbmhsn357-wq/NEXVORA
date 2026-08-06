import type { SupabaseClient } from "@supabase/supabase-js";
import { createServiceClient } from "@/lib/supabase/service";
import { buildSimulationPlan } from "@/lib/simulation/plan-builder";
import type { EntityPlan } from "@/lib/simulation/simulation-types";
import type { BusinessRule } from "@/lib/transformation/business-rules";
import { planDependencyOrder } from "./dependency-order";
import { planChunks, clampChunkSize, clampWorkers } from "./chunk-planner";
import { executeChunk } from "./execution-core";
import { decideRecovery } from "./recovery";
import { buildRollbackPackage } from "./rollback-plan";
import { buildAuditEvent } from "./audit";
import { PM_LIMITS } from "./execution-types";
import { createBackup, loadBackupDataset } from "./backup-service";
import { gatherAndRunPreflight } from "./preflight-service";
import { notifyExecution } from "./notify";

/**
 * محرّك التنفيذ الحقيقي (Migration Execution Engine).
 *
 * التدفّق: create → backup (إلزامي) → preflight → plan (تبعية + دفعات) →
 * running. التنفيذ خلفي، على دفعات مرتّبة بالتبعية (الأب قبل الابن)، متوازٍ
 * داخل نفس المستوى، **قابل للاستئناف** (المهام المكتملة تُتخطّى وتُعاد
 * تغذية البيانات من النسخة الاحتياطية)، مع **معالجة أخطاء محلية** (لا توقف
 * العملية بالكامل). Safe Stop: Pause/Resume/Abort. **لا يبدأ إلا بمحاكاة
 * معتمَدة غير محظورة.**
 */

interface Ctx { db: SupabaseClient; }

async function audit(db: SupabaseClient, executionId: string, ev: ReturnType<typeof buildAuditEvent>): Promise<void> {
  await db.from("migration_execution_events").insert({ execution_id: executionId, event_type: ev.eventType, actor_id: ev.actorId, detail: ev.detail });
}
async function setStatus(db: SupabaseClient, executionId: string, patch: Record<string, unknown>): Promise<void> {
  await db.from("migration_executions").update(patch).eq("id", executionId);
}

export interface StartOutcome { ok: boolean; executionId?: string; message?: string; blockers?: string[]; }

/** ينشئ عملية تنفيذ ويشغّل ما قبل التنفيذ ثم التنفيذ الخلفي. */
export async function startExecution(sourceId: string, content: string, chunkSize: number, workerCount: number, actorId: string | null, client?: SupabaseClient): Promise<StartOutcome> {
  const db = client ?? createServiceClient();

  // بوابة: محاكاة معتمَدة غير محظورة.
  const sim = await db.from("migration_simulations").select("id, pipeline_id, project_id, approval_score, blocked").eq("source_id", sourceId).eq("status", "approved").order("version", { ascending: false }).limit(1).maybeSingle();
  const simRow = sim.data as { id: string; pipeline_id: string | null; project_id: string | null; approval_score: number; blocked: boolean } | null;
  if (!simRow) return { ok: false, message: "لا توجد محاكاة معتمَدة لهذا المصدر — اعتمد المرحلة ٥ أولًا." };
  if (simRow.blocked) return { ok: false, message: "المحاكاة المعتمَدة محظورة بقواعد منع — لا يُسمح بالترحيل الحقيقي." };

  const src = await db.from("migration_sources").select("source_type").eq("id", sourceId).maybeSingle();
  const sourceType = (src.data as { source_type: string } | null)?.source_type ?? "csv";

  const ins = await db.from("migration_executions").insert({
    source_id: sourceId, simulation_id: simRow.id, pipeline_id: simRow.pipeline_id, project_id: simRow.project_id,
    status: "backing_up", chunk_size: clampChunkSize(chunkSize), worker_count: clampWorkers(workerCount),
    approval_score: simRow.approval_score, started_by: actorId, approved_by: actorId,
  }).select("id").maybeSingle();
  if (ins.error || !ins.data) {
    if (ins.error?.code === "42P01") return { ok: false, message: "جداول المرحلة ٦ غير مطبَّقة (طبّق ترحيل 0088)." };
    return { ok: false, message: ins.error?.message ?? "فشل إنشاء عملية التنفيذ." };
  }
  const executionId = (ins.data as { id: string }).id;
  await audit(db, executionId, buildAuditEvent("created", actorId, { sourceId }));

  // ١) نسخة احتياطية إلزامية.
  const backup = await createBackup(executionId, sourceId, content, actorId, db);
  if (!backup.ok) {
    await setStatus(db, executionId, { status: "failed", error: backup.message });
    return { ok: false, executionId, message: backup.message };
  }
  await audit(db, executionId, buildAuditEvent("backup_ready", actorId, { backupId: backup.backupId }));

  // ٢) فحوص ما قبل التنفيذ.
  await setStatus(db, executionId, { status: "preflight" });
  const pre = await gatherAndRunPreflight(executionId, sourceId, db);
  await audit(db, executionId, buildAuditEvent("preflight_run", actorId, { passed: pre.passed, blockers: pre.blockers }));
  if (!pre.passed) {
    await setStatus(db, executionId, { status: "failed", blocked: true, blockers: pre.blockers, error: "فشل فحوص ما قبل التنفيذ." });
    await notifyExecution("failed", executionId, `مُنِع الترحيل: ${pre.blockers.join("، ")}`, simRow.project_id);
    return { ok: false, executionId, message: "فشل فحوص ما قبل التنفيذ.", blockers: pre.blockers };
  }

  // ٣) خطة التبعية + الدفعات + المهام.
  const planRes = await buildSimulationPlan(sourceId, content, sourceType, db);
  if (!planRes.ok || !planRes.plan) {
    await setStatus(db, executionId, { status: "failed", error: planRes.message });
    return { ok: false, executionId, message: planRes.message };
  }
  const plan = planRes.plan;
  const counts = plan.entities.map((e) => ({ entity: e.entity, label: e.label, rows: e.rows.length }));
  const dep = planDependencyOrder(counts, plan.relationships);
  const tasks = planChunks(dep.ordered, chunkSize);

  await db.from("migration_execution_tasks").insert(tasks.map((t) => ({
    execution_id: executionId, entity: t.entity, label: t.label, task_order: t.taskOrder, level: t.level,
    chunk_index: t.chunkIndex, chunk_size: t.chunkSize, row_start: t.rowStart, row_end: t.rowEnd, status: "pending",
  })));

  const rollback = buildRollbackPackage(dep.ordered, {});
  await db.from("migration_rollback_packages").insert({ execution_id: executionId, package_key: `rollback:${executionId}`, steps: rollback.steps, status: "ready" });

  const totalRows = counts.reduce((s, c) => s + c.rows, 0);
  await setStatus(db, executionId, {
    status: "running", phase: "extract",
    total_entities: counts.length, total_rows: totalRows, total_tasks: tasks.length,
    detail: { dependencyPlan: dep.ordered, brokenCycles: dep.brokenCycles, rollbackPackage: rollback, preflight: pre.checks },
    started_at: new Date().toISOString(),
  });
  await audit(db, executionId, buildAuditEvent("execution_started", actorId, { totalRows, totalTasks: tasks.length }));
  await notifyExecution("execution_started", executionId, `بدأ ترحيل ${counts.length} كيانًا (${totalRows} صفًّا) على ${tasks.length} دفعة.`, simRow.project_id);

  return { ok: true, executionId };
}

/** ينفّذ العملية خلفيًا على دفعات مرتّبة بالتبعية، قابلة للاستئناف. */
export async function runExecution(executionId: string, content: string, client?: SupabaseClient): Promise<void> {
  const db = client ?? createServiceClient();
  const exec = await db.from("migration_executions").select("source_id, project_id, worker_count, status").eq("id", executionId).maybeSingle();
  const e = exec.data as { source_id: string; project_id: string | null; worker_count: number; status: string } | null;
  if (!e || e.status !== "running") return;

  const src = await db.from("migration_sources").select("source_type").eq("id", e.source_id).maybeSingle();
  const sourceType = (src.data as { source_type: string } | null)?.source_type ?? "csv";
  const planRes = await buildSimulationPlan(e.source_id, content, sourceType, db);
  if (!planRes.ok || !planRes.plan) {
    await setStatus(db, executionId, { status: "failed", error: planRes.message ?? "تعذّر بناء الخطة للتنفيذ." });
    return;
  }
  const byEntity = new Map<string, EntityPlan>(planRes.plan.entities.map((ep) => [ep.entity, ep]));
  const businessRules = planRes.plan.businessRules;

  const startedAt = Date.now();
  const migratedByEntity: Record<string, number> = {};

  try {
    await runTaskLoop({ db }, executionId, byEntity, businessRules, clampWorkers(e.worker_count), migratedByEntity, startedAt);
  } catch (err) {
    await setStatus(db, executionId, { status: "failed", error: `خطأ غير متوقّع: ${(err as Error).message}` });
    await audit(db, executionId, buildAuditEvent("failed", null, { error: (err as Error).message }));
    await notifyExecution("failed", executionId, "توقّف الترحيل بخطأ غير متوقّع.", e.project_id);
    return;
  }

  await finalize(db, executionId, migratedByEntity, e.project_id, byEntity, businessRules);
}

async function runTaskLoop(ctx: Ctx, executionId: string, byEntity: Map<string, EntityPlan>, businessRules: BusinessRule[], workerCount: number, migratedByEntity: Record<string, number>, startedAt: number): Promise<void> {
  const { db } = ctx;
  // اجلب المهام مرتّبة؛ عالجها مستوى بمستوى (تبعية)، بالتوازي داخل المستوى.
  const { data } = await db.from("migration_execution_tasks").select("id, entity, label, level, chunk_index, row_start, row_end, status, retry_count").eq("execution_id", executionId).order("level", { ascending: true }).order("task_order", { ascending: true });
  const tasks = (data ?? []) as Array<{ id: string; entity: string; label: string; level: number; chunk_index: number; row_start: number; row_end: number; status: string; retry_count: number }>;

  const levels = [...new Set(tasks.map((t) => t.level))].sort((a, b) => a - b);
  for (const level of levels) {
    const pending = tasks.filter((t) => t.level === level && (t.status === "pending" || t.status === "running"));
    for (let i = 0; i < pending.length; i += workerCount) {
      // Safe Stop: تحقّق من الحالة بين الدفعات.
      const cur = await db.from("migration_executions").select("status").eq("id", executionId).maybeSingle();
      const status = (cur.data as { status: string } | null)?.status;
      if (status !== "running") return; // paused/aborted → توقّف نظيف (المهام المتبقّية pending تُستأنَف لاحقًا).

      const batch = pending.slice(i, i + workerCount);
      await Promise.all(batch.map((t) => runOneTask(db, executionId, t, byEntity, businessRules, migratedByEntity, startedAt)));
    }
  }
}

async function runOneTask(db: SupabaseClient, executionId: string, task: { id: string; entity: string; label: string; row_start: number; row_end: number; retry_count: number }, byEntity: Map<string, EntityPlan>, businessRules: BusinessRule[], migratedByEntity: Record<string, number>, startedAt: number): Promise<void> {
  const ep = byEntity.get(task.entity);
  if (!ep) {
    await db.from("migration_execution_tasks").update({ status: "skipped", last_error: "الكيان غير موجود في العيّنة." }).eq("id", task.id);
    return;
  }
  // مطالبة ذرّية: pending/running → running.
  await db.from("migration_execution_tasks").update({ status: "running", claimed_at: new Date().toISOString() }).eq("id", task.id);
  const t0 = Date.now();
  const slice = ep.rows.slice(task.row_start, task.row_end);

  try {
    const res = executeChunk(ep.rules, businessRules, slice);
    const failRate = res.processed > 0 ? res.failed / res.processed : 0;

    if (failRate > 0.5 || !res.countMatch) {
      const decision = decideRecovery(res.failed > 0 ? "data validation failure in chunk" : "chunk count mismatch", task.retry_count, PM_LIMITS.maxRetries);
      if (decision.action === "retry" && task.retry_count < PM_LIMITS.maxRetries) {
        await db.from("migration_execution_tasks").update({ status: "pending", retry_count: task.retry_count + 1, last_error: decision.reason }).eq("id", task.id);
        await audit(db, executionId, buildAuditEvent("chunk_retried", null, { entity: task.entity, chunk: task.row_start, reason: decision.reason }));
        return;
      }
      // معالجة محلية: أحِل للمراجعة دون إيقاف العملية بالكامل.
      await db.from("migration_execution_tasks").update({ status: "review", processed: res.processed, migrated: res.migrated, failed: res.failed, last_error: decision.reason, duration_ms: Date.now() - t0 }).eq("id", task.id);
      await audit(db, executionId, buildAuditEvent("chunk_failed", null, { entity: task.entity, chunk: task.row_start, failed: res.failed, decision: decision.action }));
      await bumpExec(db, executionId, res, startedAt, task.entity, migratedByEntity, { failedTask: true });
      return;
    }

    await db.from("migration_execution_tasks").update({ status: "completed", processed: res.processed, migrated: res.migrated, failed: res.failed, duration_ms: Date.now() - t0, checkpoint: { done: true } }).eq("id", task.id);
    await bumpExec(db, executionId, res, startedAt, task.entity, migratedByEntity, {});
    if (res.issues.length) await audit(db, executionId, buildAuditEvent("chunk_completed", null, { entity: task.entity, chunk: task.row_start, migrated: res.migrated, issues: res.issues.length }));
  } catch (err) {
    const decision = decideRecovery((err as Error).message, task.retry_count, PM_LIMITS.maxRetries);
    if (decision.action === "retry" && task.retry_count < PM_LIMITS.maxRetries) {
      await db.from("migration_execution_tasks").update({ status: "pending", retry_count: task.retry_count + 1, last_error: (err as Error).message }).eq("id", task.id);
      await audit(db, executionId, buildAuditEvent("chunk_retried", null, { entity: task.entity, error: (err as Error).message }));
    } else {
      await db.from("migration_execution_tasks").update({ status: "review", last_error: (err as Error).message, duration_ms: Date.now() - t0 }).eq("id", task.id);
      await audit(db, executionId, buildAuditEvent("chunk_failed", null, { entity: task.entity, error: (err as Error).message }));
    }
  }
}

async function bumpExec(db: SupabaseClient, executionId: string, res: ReturnType<typeof executeChunk>, startedAt: number, entity: string, migratedByEntity: Record<string, number>, opts: { failedTask?: boolean }): Promise<void> {
  migratedByEntity[entity] = (migratedByEntity[entity] ?? 0) + res.migrated;
  const cur = await db.from("migration_executions").select("processed_rows, migrated_rows, failed_rows, total_rows, completed_tasks, failed_tasks, phase").eq("id", executionId).maybeSingle();
  const c = cur.data as { processed_rows: number; migrated_rows: number; failed_rows: number; total_rows: number; completed_tasks: number; failed_tasks: number } | null;
  if (!c) return;
  const processed = c.processed_rows + res.processed;
  const elapsed = Math.max(1, (Date.now() - startedAt) / 1000);
  await setStatus(db, executionId, {
    processed_rows: processed,
    migrated_rows: c.migrated_rows + res.migrated,
    failed_rows: c.failed_rows + res.failed,
    completed_tasks: c.completed_tasks + (opts.failedTask ? 0 : 1),
    failed_tasks: c.failed_tasks + (opts.failedTask ? 1 : 0),
    progress: c.total_rows > 0 ? Math.min(100, Math.round((processed / c.total_rows) * 100)) : 0,
    speed_rows_per_sec: Math.round(processed / elapsed),
    phase: "load",
  });
}

async function finalize(db: SupabaseClient, executionId: string, migratedByEntity: Record<string, number>, projectId: string | null, byEntity: Map<string, EntityPlan>, businessRules: BusinessRule[]): Promise<void> {
  const { data } = await db.from("migration_execution_tasks").select("status").eq("execution_id", executionId);
  const rows = (data ?? []) as Array<{ status: string }>;
  const remaining = rows.filter((r) => r.status === "pending" || r.status === "running").length;
  if (remaining > 0) return; // مُوقَفة مؤقتًا — تُستأنَف لاحقًا.

  const review = rows.filter((r) => r.status === "review").length;
  const status = review > 0 ? "completed" : "completed";
  // حدّث حزمة التراجع بأعداد المُرحَّل الفعلية.
  await db.from("migration_rollback_packages").update({ steps: buildRollbackReverse(migratedByEntity) }).eq("execution_id", executionId);
  await setStatus(db, executionId, { status, phase: "finalize", progress: 100, completed_at: new Date().toISOString() });
  await audit(db, executionId, buildAuditEvent("completed", null, { review, migratedByEntity }));

  // جسر الحمل: ثبّت المخرجات المُحوَّلة (يُغلق فجوة الضخّ). best-effort —
  // لا يُفشِل اكتمال الترحيل لو تعذّر (جداول 0091 غير مطبَّقة مثلًا).
  try {
    const { persistLoadedDatasets } = await import("@/lib/load-bridge/dataset-service");
    await persistLoadedDatasets(executionId, projectId, byEntity, businessRules, db);
  } catch {
    /* تثبيت المخرجات best-effort */
  }

  await notifyExecution("completed", executionId, review > 0 ? `اكتمل الترحيل مع ${review} دفعة في طابور المراجعة.` : "اكتمل الترحيل بنجاح بلا أخطاء حرجة.", projectId);
}

function buildRollbackReverse(migratedByEntity: Record<string, number>): Array<{ entity: string; order: number; rowCount: number; action: string }> {
  return Object.entries(migratedByEntity).map(([entity, rowCount], i) => ({ entity, order: i + 1, rowCount, action: "delete_migrated" }));
}

// ── التحكّم: Pause / Resume / Abort ──

export async function pauseExecution(executionId: string, actorId: string | null, client?: SupabaseClient): Promise<{ ok: boolean; message?: string }> {
  const db = client ?? createServiceClient();
  const upd = await db.from("migration_executions").update({ status: "paused", paused_at: new Date().toISOString() }).eq("id", executionId).eq("status", "running");
  if (upd.error) return { ok: false, message: upd.error.message };
  await audit(db, executionId, buildAuditEvent("paused", actorId, {}));
  const proj = await projectOf(db, executionId);
  await notifyExecution("paused", executionId, "أُوقِف الترحيل مؤقتًا بعد إنهاء الدفعة الحالية.", proj);
  return { ok: true, message: "أُوقِف مؤقتًا — الدفعة الحالية أُنهِيت." };
}

export async function resumeExecution(executionId: string, actorId: string | null, client?: SupabaseClient): Promise<{ ok: boolean; message?: string }> {
  const db = client ?? createServiceClient();
  const dataset = await loadBackupDataset(executionId, db);
  if (!dataset) return { ok: false, message: "تعذّر استرجاع لقطة البيانات من النسخة الاحتياطية للاستئناف." };
  const upd = await db.from("migration_executions").update({ status: "running" }).eq("id", executionId).eq("status", "paused");
  if (upd.error) return { ok: false, message: upd.error.message };
  await audit(db, executionId, buildAuditEvent("resumed", actorId, {}));
  const { after } = await import("next/server");
  after(async () => { await runExecution(executionId, dataset); });
  return { ok: true, message: "استُؤنِف من آخر نقطة ناجحة." };
}

export async function abortExecution(executionId: string, actorId: string | null, client?: SupabaseClient): Promise<{ ok: boolean; message?: string }> {
  const db = client ?? createServiceClient();
  await db.from("migration_executions").update({ status: "rolling_back" }).eq("id", executionId).in("status", ["running", "paused"]);
  await audit(db, executionId, buildAuditEvent("aborted", actorId, {}));
  const proj = await projectOf(db, executionId);
  await notifyExecution("aborted", executionId, "أُجهِض الترحيل — يبدأ التراجع الآمن.", proj);
  const { executeRollback } = await import("./rollback-service");
  return executeRollback(executionId, actorId, db);
}

async function projectOf(db: SupabaseClient, executionId: string): Promise<string | null> {
  const { data } = await db.from("migration_executions").select("project_id").eq("id", executionId).maybeSingle();
  return (data as { project_id: string | null } | null)?.project_id ?? null;
}
