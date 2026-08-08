"use server";

import { revalidatePath } from "next/cache";
import { after } from "next/server";
import { AICodeExecutionEngine, type StartPlanResult } from "@/lib/claude-exec/execution-engine";
import { requireStartExecution, requireViewExecution } from "@/lib/claude-exec/permissions";
import type { AccessibilityScan, ExecutionPlan, ExecutionTask, QaFixLoop, ReleaseCandidate } from "@/lib/types/database";
import { requireExtendedTechnical } from "@/lib/feature-flags/guards";

export async function startCodeExecutionAction(
  projectId: string,
  repoUrl: string,
  repoBranch: string
): Promise<StartPlanResult> {
  await requireExtendedTechnical();
  const auth = await requireStartExecution();
  if (!auth.ok) return { status: "error", message: auth.message ?? "غير مسموح." };

  const result = await AICodeExecutionEngine.startPlan(projectId, repoUrl, repoBranch, auth.userId ?? null);
  if (result.status !== "started") {
    revalidatePath(`/dashboard/projects/${projectId}`);
    return result;
  }

  after(async () => {
    try {
      await AICodeExecutionEngine.runPlanningCore(result.planId);
    } catch (err) {
      console.error("[ClaudeExec planning background] failed:", err);
    }
  });

  revalidatePath(`/dashboard/projects/${projectId}`);
  return result;
}

export async function startExecutionRunAction(projectId: string, planId: string): Promise<{
  ok: boolean; message?: string }> {
  await requireExtendedTechnical();
  const auth = await requireStartExecution();
  if (!auth.ok) return { ok: false, message: auth.message ?? "غير مسموح." };

  const result = await AICodeExecutionEngine.startExecution(planId);
  if (!result.ok) {
    revalidatePath(`/dashboard/projects/${projectId}`);
    return result;
  }

  after(async () => {
    try {
      await AICodeExecutionEngine.runNextTask(planId);
    } catch (err) {
      console.error("[ClaudeExec task background] failed:", err);
    }
  });

  revalidatePath(`/dashboard/projects/${projectId}`);
  return { ok: true };
}

export async function pollNextExecutionTaskAction(projectId: string, planId: string): Promise<{
  ok: boolean }> {
  await requireExtendedTechnical();
  const auth = await requireStartExecution();
  if (!auth.ok) return { ok: false };

  after(async () => {
    try {
      await AICodeExecutionEngine.runNextTask(planId);
    } catch (err) {
      console.error("[ClaudeExec poll background] failed:", err);
    }
  });

  revalidatePath(`/dashboard/projects/${projectId}`);
  return { ok: true };
}

export interface CodeExecutionState {
  plans: ExecutionPlan[];
  currentPlan: ExecutionPlan | null;
  tasks: ExecutionTask[];
  qaFixLoops: QaFixLoop[];
  accessibilityScans: AccessibilityScan[];
  releaseCandidate: ReleaseCandidate | null;
}

export async function getCodeExecutionState(projectId: string): Promise<{
  ok: true; state: CodeExecutionState } | { ok: false; message: string }> {
  await requireExtendedTechnical();
  const auth = await requireViewExecution();
  if (!auth.ok) return { ok: false, message: auth.message ?? "غير مسموح." };

  const { plans, currentPlan, tasks } = await AICodeExecutionEngine.getState(projectId);

  if (!currentPlan) {
    return { ok: true, state: { plans, currentPlan: null, tasks: [], qaFixLoops: [], accessibilityScans: [], releaseCandidate: null } };
  }

  const { createServiceClient } = await import("@/lib/supabase/service");
  const supabase = createServiceClient();
  const [{ data: qaFixLoops }, { data: accessibilityScans }, { data: releaseCandidate }] = await Promise.all([
    supabase.from("qa_fix_loops").select("*").eq("plan_id", currentPlan.id).order("created_at", { ascending: true }),
    supabase.from("accessibility_scans").select("*").eq("plan_id", currentPlan.id).order("created_at", { ascending: true }),
    supabase.from("release_candidates").select("*").eq("plan_id", currentPlan.id).maybeSingle(),
  ]);

  return {
    ok: true,
    state: {
      plans,
      currentPlan,
      tasks,
      qaFixLoops: (qaFixLoops as QaFixLoop[] | null) ?? [],
      accessibilityScans: (accessibilityScans as AccessibilityScan[] | null) ?? [],
      releaseCandidate: (releaseCandidate as ReleaseCandidate | null) ?? null,
    },
  };
}
