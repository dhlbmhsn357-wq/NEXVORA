"use server";

import { after } from "next/server";
import { requireRole } from "@/lib/auth/rbac";
import { getTrDashboard, type TrDashboard } from "@/lib/transformation/dashboard";
import { buildPipeline, getPipelineDetail } from "@/lib/transformation/transformation-service";
import { decideRule, editRule, approvePipeline, type RuleObject } from "@/lib/transformation/approval-service";
import { promotePipelineToOrgMemory } from "@/lib/transformation/org-memory-integration";
import { previewSource } from "@/lib/transformation/preview-service";
import { createServiceClient } from "@/lib/supabase/service";

/**
 * إجراءات محرّك التحويل.
 * Director/Admin: بناء/تعديل/اعتماد/ترقية/معاينة. Supervisor: قراءة.
 * Executor: لا وصول. **لا تنفيذ على Production** — معاينة على عيّنة فقط.
 */

const EDITOR = ["owner", "admin"] as const;
const READER = ["owner", "admin", "supervisor"] as const;

export async function getDashboard(projectId: string | null = null): Promise<{ ok: boolean; message?: string; data?: TrDashboard }> {
  const auth = await requireRole([...READER]);
  if (!auth.ok) return { ok: false, message: auth.message };
  return { ok: true, data: await getTrDashboard(projectId) };
}

export async function startBuild(sourceId: string): Promise<{ ok: boolean; message?: string }> {
  const auth = await requireRole([...EDITOR]);
  if (!auth.ok) return { ok: false, message: auth.message };
  const actorId = auth.userId ?? null;
  after(async () => {
    await buildPipeline(sourceId, actorId);
  });
  return { ok: true, message: "بدأ بناء محرّك التحويل — سيظهر عند الاكتمال." };
}

export async function getDetail(sourceId: string): Promise<{ ok: boolean; detail?: unknown }> {
  const auth = await requireRole([...READER]);
  if (!auth.ok) return { ok: false };
  return { ok: true, detail: await getPipelineDetail(sourceId) };
}

export async function decide(kind: RuleObject, id: string, decision: "approved" | "rejected" | "disabled"): Promise<{ ok: boolean; message?: string }> {
  const auth = await requireRole([...EDITOR]);
  if (!auth.ok) return { ok: false, message: auth.message };
  return decideRule(kind, id, decision, auth.userId ?? null);
}

export async function edit(id: string, patch: { kind?: string; config?: Record<string, unknown> }): Promise<{ ok: boolean; message?: string }> {
  const auth = await requireRole([...EDITOR]);
  if (!auth.ok) return { ok: false, message: auth.message };
  return editRule(id, patch, auth.userId ?? null);
}

export async function approve(pipelineId: string): Promise<{ ok: boolean; message?: string }> {
  const auth = await requireRole([...EDITOR]);
  if (!auth.ok) return { ok: false, message: auth.message };
  return approvePipeline(pipelineId, auth.userId ?? null);
}

export async function promote(pipelineId: string): Promise<{ ok: boolean; message?: string }> {
  const auth = await requireRole([...EDITOR]);
  if (!auth.ok) return { ok: false, message: auth.message };
  return promotePipelineToOrgMemory(pipelineId, auth.userId ?? null);
}

export async function preview(sourceId: string, content: string): Promise<{ ok: boolean; message?: string; results?: unknown }> {
  const auth = await requireRole([...EDITOR]);
  if (!auth.ok) return { ok: false, message: auth.message };
  const src = createServiceClient();
  const { data } = await src.from("migration_sources").select("source_type").eq("id", sourceId).maybeSingle();
  const sourceType = (data as { source_type: string } | null)?.source_type ?? "csv";
  const r = await previewSource(sourceId, sourceType, content);
  return { ok: r.ok, message: r.message, results: r.results };
}

export async function getStatus(sourceId: string): Promise<{ ok: boolean; status?: string }> {
  const auth = await requireRole([...READER]);
  if (!auth.ok) return { ok: false };
  const db = createServiceClient();
  const { data } = await db.from("transformation_pipelines").select("status").eq("source_id", sourceId).order("version", { ascending: false }).limit(1).maybeSingle();
  return { ok: true, status: (data as { status: string } | null)?.status };
}
