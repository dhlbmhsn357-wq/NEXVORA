"use server";

import { after } from "next/server";
import { requireRole } from "@/lib/auth/rbac";
import { getPmDashboard, getExecutionDetail, type PmDashboard } from "@/lib/production-migration/dashboard";
import { startExecution, runExecution, pauseExecution, resumeExecution, abortExecution } from "@/lib/production-migration/execution-service";
import { getMonitoring, type LiveMonitoring } from "@/lib/production-migration/monitoring-service";
import { suggestRecovery, applyRecovery } from "@/lib/production-migration/recovery-service";
import { promoteExecutionToOrgMemory } from "@/lib/production-migration/org-memory-integration";
import { buildReports, type ExecutionReports } from "@/lib/production-migration/reports";
import { getLoadBridgeState, type LoadBridgeState } from "@/lib/load-bridge/dashboard";
import { runLoad } from "@/lib/load-bridge/load-run-service";
import { getPackageUrl, type BuildPackageResult } from "@/lib/load-bridge/load-package-service";
import { createTarget, deleteTarget, testTarget, type CreateTargetInput } from "@/lib/load-bridge/target-service";
import type { LoadFormat } from "@/lib/load-bridge/load-types";
import { createServiceClient } from "@/lib/supabase/service";

/**
 * إجراءات مركز الترحيل الحقيقي (Production Migration Center).
 * Director: تحكّم كامل. Admin: تشغيل ومراقبة. Supervisor: قراءة.
 * Executor: لا وصول. **لا يبدأ إلا بمحاكاة معتمَدة غير محظورة.**
 */

const EDITOR = ["owner", "admin"] as const;
const READER = ["owner", "admin", "supervisor"] as const;

export async function getDashboard(projectId: string | null = null): Promise<{ ok: boolean; message?: string; data?: PmDashboard }> {
  const auth = await requireRole([...READER]);
  if (!auth.ok) return { ok: false, message: auth.message };
  return { ok: true, data: await getPmDashboard(projectId) };
}

export async function startMigration(sourceId: string, content: string, chunkSize: number, workerCount: number): Promise<{ ok: boolean; message?: string; executionId?: string; blockers?: string[] }> {
  const auth = await requireRole([...EDITOR]);
  if (!auth.ok) return { ok: false, message: auth.message };
  if (!content || content.trim().length < 5) return { ok: false, message: "الصق بيانات المصدر (CSV/JSON) لبدء الترحيل الحقيقي." };
  const actorId = auth.userId ?? null;

  const start = await startExecution(sourceId, content, chunkSize, workerCount, actorId);
  if (!start.ok || !start.executionId) return { ok: false, message: start.message, blockers: start.blockers };

  const executionId = start.executionId;
  after(async () => {
    await runExecution(executionId, content);
  });
  return { ok: true, executionId, message: "بدأ الترحيل الحقيقي بعد اجتياز فحوص ما قبل التنفيذ." };
}

export async function getDetail(executionId: string): Promise<{ ok: boolean; detail?: unknown }> {
  const auth = await requireRole([...READER]);
  if (!auth.ok) return { ok: false };
  return { ok: true, detail: await getExecutionDetail(executionId) };
}

export async function getLive(executionId: string): Promise<{ ok: boolean; live?: LiveMonitoring | null }> {
  const auth = await requireRole([...READER]);
  if (!auth.ok) return { ok: false };
  return { ok: true, live: await getMonitoring(executionId) };
}

export async function getStatus(executionId: string): Promise<{ ok: boolean; status?: string; progress?: number }> {
  const auth = await requireRole([...READER]);
  if (!auth.ok) return { ok: false };
  const db = createServiceClient();
  const { data } = await db.from("migration_executions").select("status, progress").eq("id", executionId).maybeSingle();
  const row = data as { status: string; progress: number } | null;
  return { ok: true, status: row?.status, progress: row?.progress };
}

export async function pause(executionId: string): Promise<{ ok: boolean; message?: string }> {
  const auth = await requireRole([...EDITOR]);
  if (!auth.ok) return { ok: false, message: auth.message };
  return pauseExecution(executionId, auth.userId ?? null);
}

export async function resume(executionId: string): Promise<{ ok: boolean; message?: string }> {
  const auth = await requireRole([...EDITOR]);
  if (!auth.ok) return { ok: false, message: auth.message };
  return resumeExecution(executionId, auth.userId ?? null);
}

export async function abort(executionId: string): Promise<{ ok: boolean; message?: string }> {
  const auth = await requireRole([...EDITOR]);
  if (!auth.ok) return { ok: false, message: auth.message };
  return abortExecution(executionId, auth.userId ?? null);
}

export async function recover(taskId: string): Promise<{ ok: boolean; suggestion?: unknown; message?: string }> {
  const auth = await requireRole([...EDITOR]);
  if (!auth.ok) return { ok: false, message: auth.message };
  const r = await suggestRecovery(taskId, auth.userId ?? null);
  return { ok: r.ok, suggestion: r.suggestion, message: r.message };
}

export async function applyRecoveryAction(taskId: string, action: "retry" | "skip"): Promise<{ ok: boolean; message?: string }> {
  const auth = await requireRole([...EDITOR]);
  if (!auth.ok) return { ok: false, message: auth.message };
  return applyRecovery(taskId, action, auth.userId ?? null);
}

export async function promote(executionId: string): Promise<{ ok: boolean; message?: string }> {
  const auth = await requireRole([...EDITOR]);
  if (!auth.ok) return { ok: false, message: auth.message };
  return promoteExecutionToOrgMemory(executionId, auth.userId ?? null);
}

export async function getReports(executionId: string): Promise<{ ok: boolean; reports?: ExecutionReports | null }> {
  const auth = await requireRole([...READER]);
  if (!auth.ok) return { ok: false };
  return { ok: true, reports: await buildReports(executionId) };
}

// ── جسر الحمل (Load Bridge) — إغلاق فجوة الضخّ ──

async function projectOfExecution(executionId: string): Promise<string | null> {
  const db = createServiceClient();
  const { data } = await db.from("migration_executions").select("project_id").eq("id", executionId).maybeSingle();
  return (data as { project_id: string | null } | null)?.project_id ?? null;
}

export async function getLoadState(executionId: string): Promise<{ ok: boolean; state?: LoadBridgeState }> {
  const auth = await requireRole([...READER]);
  if (!auth.ok) return { ok: false };
  const projectId = await projectOfExecution(executionId);
  return { ok: true, state: await getLoadBridgeState(executionId, projectId) };
}

export async function buildPackage(executionId: string, format: LoadFormat, targetId: string | null = null): Promise<BuildPackageResult> {
  const auth = await requireRole([...EDITOR]);
  if (!auth.ok) return { ok: false, message: auth.message };
  return runLoad(executionId, targetId, format, auth.userId ?? null);
}

export async function getPackageLink(runId: string): Promise<{ ok: boolean; url?: string | null }> {
  const auth = await requireRole([...READER]);
  if (!auth.ok) return { ok: false };
  return { ok: true, url: await getPackageUrl(runId) };
}

export async function addLoadTarget(input: CreateTargetInput): Promise<{ ok: boolean; id?: string; message?: string }> {
  const auth = await requireRole([...EDITOR]);
  if (!auth.ok) return { ok: false, message: auth.message };
  return createTarget(input, auth.userId ?? null);
}

export async function removeLoadTarget(id: string): Promise<{ ok: boolean; message?: string }> {
  const auth = await requireRole([...EDITOR]);
  if (!auth.ok) return { ok: false, message: auth.message };
  return deleteTarget(id);
}

export async function checkLoadTarget(id: string): Promise<{ ok: boolean; configured?: boolean; message?: string }> {
  const auth = await requireRole([...EDITOR]);
  if (!auth.ok) return { ok: false, message: auth.message };
  return testTarget(id);
}
