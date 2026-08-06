"use server";

import { revalidatePath } from "next/cache";
import { after } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { ProductionMonitoringEngine } from "@/lib/production-monitoring/generation-service";
import { requireManageIncidents, requireRunCheck, requireViewMonitoring } from "@/lib/production-monitoring/permissions";
import { generateFixPromptsForIncident } from "@/lib/production-monitoring/fix-prompt-service";
import { runReviewVerdict } from "@/lib/production-monitoring/review-service";

export type RunCheckActionResult = { status: "started" } | { status: "already_running" } | { status: "error"; message: string };

export async function updateProjectProductionUrl(projectId: string, productionUrl: string): Promise<{ ok: boolean; message?: string }> {
  const auth = await requireRunCheck();
  if (!auth.ok) return { ok: false, message: auth.message ?? "غير مسموح." };

  const supabase = await createClient();
  const { error } = await supabase.from("projects").update({ production_url: productionUrl.trim() }).eq("id", projectId);
  if (error) return { ok: false, message: error.message };

  revalidatePath(`/dashboard/projects/${projectId}`);
  return { ok: true };
}

export async function runMonitoringCheckNow(projectId: string): Promise<RunCheckActionResult> {
  const auth = await requireRunCheck();
  if (!auth.ok) return { status: "error", message: auth.message ?? "غير مسموح." };

  const result = await ProductionMonitoringEngine.runCheck(projectId, "manual");
  if (result.status !== "started") {
    revalidatePath(`/dashboard/projects/${projectId}`);
    return result.status === "already_running" ? { status: "already_running" } : { status: "error", message: result.message };
  }

  after(async () => {
    try {
      await ProductionMonitoringEngine.runCheckCore(result.checkId);
    } catch (err) {
      console.error("[ProductionMonitoring check background] failed:", err);
    }
  });

  revalidatePath(`/dashboard/projects/${projectId}`);
  return { status: "started" };
}

export async function acknowledgeMonitoringIncident(projectId: string, incidentId: string): Promise<void> {
  const auth = await requireManageIncidents();
  if (!auth.ok) return;
  await ProductionMonitoringEngine.acknowledgeIncident(incidentId, auth.userId);
  revalidatePath(`/dashboard/projects/${projectId}`);
}

export async function resolveMonitoringIncident(projectId: string, incidentId: string): Promise<void> {
  const auth = await requireManageIncidents();
  if (!auth.ok) return;
  await ProductionMonitoringEngine.resolveIncident(incidentId, auth.userId);
  revalidatePath(`/dashboard/projects/${projectId}`);
}

export async function getProductionMonitoringState(projectId: string) {
  const auth = await requireViewMonitoring();
  if (!auth.ok) return { ok: false as const, message: auth.message ?? "غير مسموح." };
  const state = await ProductionMonitoringEngine.getState(projectId);
  return { ok: true as const, ...state };
}

export type GenerateFixPromptsActionResult = { status: "started" } | { status: "error"; message: string };

/** Claude Architect — توليد Prompts إصلاح مقسّمة حسب المحور لحادثة واحدة (Phase 6). */
export async function generateFixPromptsAction(projectId: string, incidentId: string): Promise<GenerateFixPromptsActionResult> {
  const auth = await requireManageIncidents();
  if (!auth.ok) return { status: "error", message: auth.message ?? "غير مسموح." };

  after(async () => {
    try {
      await generateFixPromptsForIncident(incidentId, auth.userId ?? null);
    } catch (err) {
      console.error("[FixPromptGeneration background] failed:", err);
    }
    revalidatePath(`/dashboard/projects/${projectId}`);
  });

  return { status: "started" };
}

export type RunReviewVerdictActionResult = { status: "started" } | { status: "error"; message: string };

/** "هل الإصلاح نجح فعلًا؟" — تحقّق AI + درجة إجمالية محسوبة بالكود (Phase 6). */
export async function runReviewVerdictAction(projectId: string): Promise<RunReviewVerdictActionResult> {
  const auth = await requireManageIncidents();
  if (!auth.ok) return { status: "error", message: auth.message ?? "غير مسموح." };

  after(async () => {
    try {
      await runReviewVerdict(projectId, auth.userId ?? null);
    } catch (err) {
      console.error("[ProductionReviewVerdict background] failed:", err);
    }
    revalidatePath(`/dashboard/projects/${projectId}`);
  });

  return { status: "started" };
}

export async function promoteSupportTicketToIncidentAction(
  projectId: string,
  supportRequestId: string
): Promise<{ ok: boolean; message?: string }> {
  const auth = await requireManageIncidents();
  if (!auth.ok) return { ok: false, message: auth.message ?? "غير مسموح." };

  const result = await ProductionMonitoringEngine.promoteSupportTicketToIncident(supportRequestId, auth.userId ?? null);
  if (result.status !== "success") return { ok: false, message: result.message };

  revalidatePath(`/dashboard/projects/${projectId}`);
  return { ok: true };
}
