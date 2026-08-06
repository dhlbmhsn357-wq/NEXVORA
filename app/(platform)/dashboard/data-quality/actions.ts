"use server";

import { after } from "next/server";
import { requireRole } from "@/lib/auth/rbac";
import { getDqDashboard, type DqDashboard } from "@/lib/data-quality/dashboard";
import { runCleansing, getRunDetail } from "@/lib/data-quality/cleansing-service";
import { decideDq, approveHighConfidence, approveRun, type DqObject } from "@/lib/data-quality/approval-service";
import { promoteRulesToOrgMemory } from "@/lib/data-quality/org-memory-integration";
import { createServiceClient } from "@/lib/supabase/service";

/**
 * إجراءات جودة البيانات.
 * Director/Admin: تشغيل/اعتماد/ترقية. Supervisor: قراءة. Executor: لا وصول.
 */

const EDITOR = ["owner", "admin"] as const;
const READER = ["owner", "admin", "supervisor"] as const;

export async function getDashboard(projectId: string | null = null): Promise<{ ok: boolean; message?: string; data?: DqDashboard }> {
  const auth = await requireRole([...READER]);
  if (!auth.ok) return { ok: false, message: auth.message };
  return { ok: true, data: await getDqDashboard(projectId) };
}

/** يشغّل التنظيف في الخلفية على المحتوى المُمرَّر (لا يُخزَّن الخام). */
export async function startCleansing(sourceId: string, content: string, domain: string): Promise<{ ok: boolean; message?: string }> {
  const auth = await requireRole([...EDITOR]);
  if (!auth.ok) return { ok: false, message: auth.message };
  if (!content?.trim()) return { ok: false, message: "ارفع بيانات فعلية (CSV/JSON) لتحليل جودتها." };
  const actorId = auth.userId ?? null;
  after(async () => {
    await runCleansing(sourceId, content, domain || "generic", actorId);
  });
  return { ok: true, message: "بدأ تحليل الجودة — سيظهر التقرير عند الاكتمال." };
}

export async function getDetail(sourceId: string): Promise<{ ok: boolean; detail?: unknown }> {
  const auth = await requireRole([...READER]);
  if (!auth.ok) return { ok: false };
  return { ok: true, detail: await getRunDetail(sourceId) };
}

export async function decide(kind: DqObject, id: string, decision: "approved" | "rejected" | "ignored"): Promise<{ ok: boolean; message?: string }> {
  const auth = await requireRole([...EDITOR]);
  if (!auth.ok) return { ok: false, message: auth.message };
  return decideDq(kind, id, decision, auth.userId ?? null);
}

export async function approveHighConf(runId: string): Promise<{ ok: boolean; message?: string; count?: number }> {
  const auth = await requireRole([...EDITOR]);
  if (!auth.ok) return { ok: false, message: auth.message };
  return approveHighConfidence(runId, auth.userId ?? null);
}

export async function approve(runId: string): Promise<{ ok: boolean; message?: string }> {
  const auth = await requireRole([...EDITOR]);
  if (!auth.ok) return { ok: false, message: auth.message };
  return approveRun(runId, auth.userId ?? null);
}

export async function promote(runId: string): Promise<{ ok: boolean; message?: string }> {
  const auth = await requireRole([...EDITOR]);
  if (!auth.ok) return { ok: false, message: auth.message };
  return promoteRulesToOrgMemory(runId, auth.userId ?? null);
}

export async function getStatus(sourceId: string): Promise<{ ok: boolean; status?: string }> {
  const auth = await requireRole([...READER]);
  if (!auth.ok) return { ok: false };
  const db = createServiceClient();
  const { data } = await db.from("data_quality_runs").select("status").eq("source_id", sourceId).order("version", { ascending: false }).limit(1).maybeSingle();
  return { ok: true, status: (data as { status: string } | null)?.status };
}
