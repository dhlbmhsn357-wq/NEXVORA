"use server";

import { after } from "next/server";
import { requireRole } from "@/lib/auth/rbac";
import { createServiceClient } from "@/lib/supabase/service";
import { getSimDashboard, type SimDashboard } from "@/lib/simulation/simulation-dashboard";
import { startSimulation, runSimulation, getSimulationDetail } from "@/lib/simulation/simulation-service";
import { approveSimulation, rejectSimulation, archiveSimulation, getSimulationHistory } from "@/lib/simulation/approval-service";
import { promoteSimulationToOrgMemory } from "@/lib/simulation/org-memory-integration";

/**
 * إجراءات مركز محاكاة الترحيل.
 * Director/Admin: تشغيل/اعتماد/رفض/أرشفة/ترقية. Supervisor: قراءة.
 * Executor: لا وصول. **لا تنفيذ على Production** — كل شيء داخل Digital Twin.
 */

const EDITOR = ["owner", "admin"] as const;
const READER = ["owner", "admin", "supervisor"] as const;

export async function getDashboard(projectId: string | null = null): Promise<{ ok: boolean; message?: string; data?: SimDashboard }> {
  const auth = await requireRole([...READER]);
  if (!auth.ok) return { ok: false, message: auth.message };
  return { ok: true, data: await getSimDashboard(projectId) };
}

export async function runDryRun(sourceId: string, content: string): Promise<{ ok: boolean; message?: string; simulationId?: string }> {
  const auth = await requireRole([...EDITOR]);
  if (!auth.ok) return { ok: false, message: auth.message };
  if (!content || content.trim().length < 5) return { ok: false, message: "الصق بيانات عيّنة من النظام القديم (CSV/JSON) للمحاكاة." };

  const actorId = auth.userId ?? null;
  const start = await startSimulation(sourceId, actorId);
  if (!start.ok || !start.simulationId) return { ok: false, message: start.message };

  const db = createServiceClient();
  const { data } = await db.from("migration_sources").select("source_type").eq("id", sourceId).maybeSingle();
  const sourceType = (data as { source_type: string } | null)?.source_type ?? "csv";
  const simulationId = start.simulationId;

  after(async () => {
    await runSimulation(simulationId, sourceId, content, sourceType, actorId);
  });
  return { ok: true, simulationId, message: "بدأت المحاكاة داخل الـDigital Twin — ستظهر النتائج عند الاكتمال." };
}

export async function getDetail(simulationId: string): Promise<{ ok: boolean; detail?: unknown }> {
  const auth = await requireRole([...READER]);
  if (!auth.ok) return { ok: false };
  return { ok: true, detail: await getSimulationDetail(simulationId) };
}

export async function getStatus(simulationId: string): Promise<{ ok: boolean; status?: string }> {
  const auth = await requireRole([...READER]);
  if (!auth.ok) return { ok: false };
  const db = createServiceClient();
  const { data } = await db.from("migration_simulations").select("status").eq("id", simulationId).maybeSingle();
  return { ok: true, status: (data as { status: string } | null)?.status };
}

export async function getHistory(sourceId: string): Promise<{ ok: boolean; history?: unknown[] }> {
  const auth = await requireRole([...READER]);
  if (!auth.ok) return { ok: false };
  return { ok: true, history: await getSimulationHistory(sourceId) };
}

export async function approve(simulationId: string): Promise<{ ok: boolean; message?: string }> {
  const auth = await requireRole([...EDITOR]);
  if (!auth.ok) return { ok: false, message: auth.message };
  return approveSimulation(simulationId, auth.userId ?? null);
}

export async function reject(simulationId: string, reason: string): Promise<{ ok: boolean; message?: string }> {
  const auth = await requireRole([...EDITOR]);
  if (!auth.ok) return { ok: false, message: auth.message };
  return rejectSimulation(simulationId, reason, auth.userId ?? null);
}

export async function archive(simulationId: string): Promise<{ ok: boolean; message?: string }> {
  const auth = await requireRole([...EDITOR]);
  if (!auth.ok) return { ok: false, message: auth.message };
  return archiveSimulation(simulationId);
}

export async function promote(simulationId: string): Promise<{ ok: boolean; message?: string }> {
  const auth = await requireRole([...EDITOR]);
  if (!auth.ok) return { ok: false, message: auth.message };
  return promoteSimulationToOrgMemory(simulationId, auth.userId ?? null);
}
