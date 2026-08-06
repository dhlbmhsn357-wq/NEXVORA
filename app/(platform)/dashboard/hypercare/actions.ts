"use server";

import { requireRole } from "@/lib/auth/rbac";
import { getHypercareDashboard, getPeriodDetail, type HypercareDashboard } from "@/lib/hypercare/dashboard";
import { startHypercare, recordSnapshot } from "@/lib/hypercare/hypercare-service";
import { createIncident, resolveIncident, suggestRootCause } from "@/lib/hypercare/incident-service";
import { decideOptimization } from "@/lib/hypercare/optimization-service";
import { approveKnowledge, rejectKnowledge, submitFeedback } from "@/lib/hypercare/learning-service";
import { closeHypercare } from "@/lib/hypercare/closure-service";
import type { MetricPoint } from "@/lib/hypercare/hypercare-types";

/**
 * إجراءات مركز Hypercare.
 * Director: كامل (اعتماد المعرفة + الإغلاق). Admin: إدارة Hypercare.
 * Supervisor: مراقبة/عرض. Executor: لا وصول. كل شيء خاضع للتدقيق.
 */

const DIRECTOR = ["owner", "admin"] as const;
const MONITOR = ["owner", "admin", "supervisor"] as const;

export async function getDashboard(projectId: string | null = null): Promise<{ ok: boolean; message?: string; data?: HypercareDashboard }> {
  const auth = await requireRole([...MONITOR]);
  if (!auth.ok) return { ok: false, message: auth.message };
  return { ok: true, data: await getHypercareDashboard(projectId) };
}

export async function start(verificationId: string, durationDays: number): Promise<{ ok: boolean; message?: string; periodId?: string }> {
  const auth = await requireRole([...DIRECTOR]);
  if (!auth.ok) return { ok: false, message: auth.message };
  return startHypercare(verificationId, durationDays, auth.userId ?? null);
}

export async function getDetail(periodId: string): Promise<{ ok: boolean; detail?: unknown }> {
  const auth = await requireRole([...MONITOR]);
  if (!auth.ok) return { ok: false };
  return { ok: true, detail: await getPeriodDetail(periodId) };
}

export async function runTick(periodId: string, metrics: MetricPoint[], avgQueryMs: number, errorRatePercent: number): Promise<{ ok: boolean; message?: string; health?: number; incidents?: number }> {
  const auth = await requireRole([...DIRECTOR]);
  if (!auth.ok) return { ok: false, message: auth.message };
  return recordSnapshot(periodId, metrics ?? [], auth.userId ?? null, { avgQueryMs, errorRatePercent });
}

export async function addIncident(periodId: string, title: string, severity: "critical" | "high" | "medium" | "low", impact: string): Promise<{ ok: boolean; message?: string }> {
  const auth = await requireRole([...MONITOR]);
  if (!auth.ok) return { ok: false, message: auth.message };
  return createIncident(periodId, title, severity, impact, auth.userId ?? null);
}

export async function resolveInc(incidentId: string, rootCause: string, resolution: string): Promise<{ ok: boolean; message?: string }> {
  const auth = await requireRole([...DIRECTOR]);
  if (!auth.ok) return { ok: false, message: auth.message };
  return resolveIncident(incidentId, rootCause, resolution, auth.userId ?? null);
}

export async function rootCause(incidentId: string): Promise<{ ok: boolean; rootCause?: string; message?: string }> {
  const auth = await requireRole([...DIRECTOR]);
  if (!auth.ok) return { ok: false, message: auth.message };
  return suggestRootCause(incidentId, auth.userId ?? null);
}

export async function decideOpt(optId: string, decision: "approved" | "applied" | "dismissed", gain: string): Promise<{ ok: boolean; message?: string }> {
  const auth = await requireRole([...DIRECTOR]);
  if (!auth.ok) return { ok: false, message: auth.message };
  return decideOptimization(optId, decision, gain, auth.userId ?? null);
}

export async function decideKnowledge(suggestionId: string, decision: "approved" | "rejected"): Promise<{ ok: boolean; message?: string }> {
  const auth = await requireRole([...DIRECTOR]);
  if (!auth.ok) return { ok: false, message: auth.message };
  return decision === "approved" ? approveKnowledge(suggestionId, auth.userId ?? null) : rejectKnowledge(suggestionId, auth.userId ?? null);
}

export async function feedback(periodId: string, kind: "problem" | "suggestion" | "bug" | "improvement" | "question", title: string, detail: string): Promise<{ ok: boolean; message?: string }> {
  const auth = await requireRole([...MONITOR]);
  if (!auth.ok) return { ok: false, message: auth.message };
  return submitFeedback(periodId, kind, title, detail, auth.userId ?? null);
}

export async function close(periodId: string, satisfactionScore: number): Promise<{ ok: boolean; message?: string; blockers?: string[] }> {
  const auth = await requireRole([...DIRECTOR]);
  if (!auth.ok) return { ok: false, message: auth.message };
  return closeHypercare(periodId, satisfactionScore, auth.userId ?? null);
}
