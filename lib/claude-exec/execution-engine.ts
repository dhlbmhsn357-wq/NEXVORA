import { createServiceClient } from "@/lib/supabase/service";
import { GitHubClient, parseRepoUrl } from "@/lib/github/client";
import { GitHubWriteClient } from "@/lib/github/write-client";
import type { RepoFile } from "@/lib/github/repo-reader";
import { AITaskType } from "@/lib/ai/types";
import { friendlyAiErrorMessage } from "@/lib/ai/error-messages";
import { executeAIWithRateLimitWait } from "@/lib/ai/execute-with-rate-limit-wait";
import { buildExecutionPlanPrompt } from "@/lib/ai/prompts/code-execution";
import { validateExecutionPlan } from "@/lib/ai/validation/code-execution";
import { ClaudeService } from "@/lib/claude/service";
import { buildTaskExecutionPrompt } from "@/lib/claude/prompts";
import { validateClaudeTaskResult } from "@/lib/claude/validation";
import { startQaFixLoops, resumeAfterFix } from "./qa-orchestrator";
import type { ExecutionPlan, ExecutionTask, PrototypePrompt } from "@/lib/types/database";

const PLANNING_RATE_LIMIT_BUDGET_MS = 170_000;
const TASK_MAX_RETRIES = 2;
/** أقصى عدد ملفات نجيب محتواها لكل مهمة — target_file_hints من الأصل محدودة، ده حماية إضافية. */
const MAX_HINT_FILES = 15;
const STALE_LOCK_MS = 6 * 60_000;

function getGithubToken(): string {
  const token = process.env.GITHUB_TOKEN;
  if (!token) throw new Error("GITHUB_TOKEN غير موجود في متغيرات البيئة.");
  return token;
}

async function releasePlanAsFailed(supabase: ReturnType<typeof createServiceClient>, planId: string, message: string) {
  await supabase.from("execution_plans").update({ status: "failed", last_error: message }).eq("id", planId);
}

export type StartPlanResult =
  | { status: "started"; planId: string }
  | { status: "already_running" }
  | { status: "missing_prompt"; message: string }
  | { status: "error"; message: string };

export type RunTaskResult = { status: "task_started" } | { status: "no_pending_tasks" } | { status: "plan_not_executing" };

/**
 * محرك AI Code Execution — Gemini (عبر lib/ai/*) يخطّط، Claude (عبر
 * lib/claude/*) ينفّذ. كل استدعاء خلفية بيعالج خطوة واحدة بس (تخطيط
 * كامل، أو مهمة تنفيذ واحدة) — نفس نمط الـ Auto-Chain المُستخدم في
 * Engineering QA (Client بيستدعي الخطوة التالية بعد ما السابقة تخلص،
 * مش Loop طويل جوّه Background Job واحد قد يتخطى maxDuration).
 */
export class AICodeExecutionEngine {
  static async startPlan(
    projectId: string,
    repoUrl: string,
    repoBranch: string,
    actorId: string | null
  ): Promise<StartPlanResult> {
    const supabase = createServiceClient();

    const { data: prompt } = await supabase.from("prototype_prompt").select("*").eq("project_id", projectId).maybeSingle();
    if (!prompt || (prompt as PrototypePrompt).version === 0) {
      return { status: "missing_prompt", message: "لا يوجد Prototype Prompt معتمد لهذا المشروع بعد." };
    }

    const { data: existing } = await supabase
      .from("execution_plans")
      .select("id, status")
      .eq("project_id", projectId)
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();

    if (existing && !["completed", "failed"].includes((existing as { status: string }).status)) {
      return { status: "already_running" };
    }

    const { data: created, error } = await supabase
      .from("execution_plans")
      .insert({
        project_id: projectId,
        prototype_prompt_version: (prompt as PrototypePrompt).version,
        repo_url: repoUrl.trim(),
        repo_branch: repoBranch.trim() || "main",
        status: "planning",
        started_at: new Date().toISOString(),
        created_by: actorId,
      })
      .select("id")
      .single();

    if (error || !created) return { status: "error", message: `فشل إنشاء خطة التنفيذ: ${error?.message ?? "سبب غير معروف"}` };
    return { status: "started", planId: created.id };
  }

  /** الخطوة الأولى — Gemini يقسّم Prototype Prompt لمهام صغيرة. */
  static async runPlanningCore(planId: string): Promise<void> {
    const supabase = createServiceClient();

    try {
      const { data: planRow } = await supabase.from("execution_plans").select("*").eq("id", planId).maybeSingle();
      if (!planRow) return;
      const plan = planRow as ExecutionPlan;

      const { data: promptRow } = await supabase.from("prototype_prompt").select("*").eq("project_id", plan.project_id).maybeSingle();
      if (!promptRow) {
        await releasePlanAsFailed(supabase, planId, "لا يوجد Prototype Prompt معتمد.");
        return;
      }

      const parsed = parseRepoUrl(plan.repo_url);
      if (!parsed) {
        await releasePlanAsFailed(supabase, planId, "رابط الـ Repository غير صالح.");
        return;
      }

      let repoFilePaths: string[] = [];
      try {
        const client = new GitHubClient(getGithubToken());
        const sha = await client.resolveRefToSha(parsed.owner, parsed.repo, plan.repo_branch);
        const tree = await client.getTree(parsed.owner, parsed.repo, sha);
        repoFilePaths = tree.map((t) => t.path);
      } catch (err) {
        console.error(`[ClaudeExec] Failed to read repo tree for plan ${planId}:`, err);
        // لو تعذّر قراءة الشجرة (Repo فاضي/مشروع جديد)، نكمل بدون سياق ملفات — مش خطأ قاتل.
      }

      const prompt = buildExecutionPlanPrompt(promptRow as PrototypePrompt, repoFilePaths);
      const response = await executeAIWithRateLimitWait(
        AITaskType.EXECUTION_PLAN_GENERATION,
        prompt,
        { projectId: plan.project_id },
        PLANNING_RATE_LIMIT_BUDGET_MS
      );

      if (!response.success) {
        const friendly =
          response.error?.code === "RATE_LIMIT"
            ? friendlyAiErrorMessage("RATE_LIMIT", response.error?.message ?? "")
            : response.error?.message ?? "فشل تخطيط التنفيذ.";
        await releasePlanAsFailed(supabase, planId, friendly);
        return;
      }

      const validation = validateExecutionPlan(response.output);
      if (!validation.ok) {
        await releasePlanAsFailed(supabase, planId, `لم نتمكن من فهم خطة التنفيذ: ${validation.reason}`);
        return;
      }

      const taskRows = validation.data.map((t, i) => ({
        plan_id: planId,
        project_id: plan.project_id,
        task_order: i + 1,
        title: t.title,
        description: t.description,
        target_file_hints: t.target_file_hints,
      }));

      const { error: insertError } = await supabase.from("execution_tasks").insert(taskRows);
      if (insertError) {
        await releasePlanAsFailed(supabase, planId, `فشل حفظ خطة التنفيذ: ${insertError.message}`);
        return;
      }

      await supabase.from("execution_plans").update({ status: "ready", total_tasks: taskRows.length }).eq("id", planId);
    } catch (err) {
      await releasePlanAsFailed(supabase, planId, err instanceof Error ? err.message : "خطأ غير متوقع أثناء التخطيط.");
    }
  }

  static async startExecution(planId: string): Promise<{ ok: boolean; message?: string }> {
    const supabase = createServiceClient();
    const { data, error } = await supabase
      .from("execution_plans")
      .update({ status: "executing" })
      .eq("id", planId)
      .eq("status", "ready")
      .select("id");
    if (error) return { ok: false, message: error.message };
    if (!data || data.length === 0) return { ok: false, message: "الخطة مش جاهزة للتنفيذ (لازم تكون status=ready)." };
    return { ok: true };
  }

  /**
   * يعالج مهمة واحدة بس (Claim → تنفيذ → تطبيق التغييرات → تسجيل
   * النتيجة) ثم يرجع فورًا — الـ Client هو اللي بيستدعي الخطوة دي تاني
   * للمهمة التالية (Auto-Chain، نفس نمط Engineering QA).
   */
  static async runNextTask(planId: string): Promise<RunTaskResult> {
    const supabase = createServiceClient();

    const { data: planRow } = await supabase.from("execution_plans").select("*").eq("id", planId).maybeSingle();
    if (!planRow || (planRow as ExecutionPlan).status !== "executing") return { status: "plan_not_executing" };
    const plan = planRow as ExecutionPlan;

    const staleCutoff = new Date(Date.now() - STALE_LOCK_MS).toISOString();
    const { data: claimed } = await supabase
      .from("execution_tasks")
      .update({ status: "running", claimed_at: new Date().toISOString(), started_at: new Date().toISOString() })
      .eq("plan_id", planId)
      .eq("status", "pending")
      .or(`claimed_at.is.null,claimed_at.lt.${staleCutoff}`)
      .order("task_order", { ascending: true })
      .limit(1)
      .select("*");

    const task = (claimed as ExecutionTask[] | null)?.[0];
    if (!task) {
      // مفيش مهمة pending — لو مفيش أي مهمة running برضه، يبقى الكل خلص.
      const { data: runningTasks } = await supabase.from("execution_tasks").select("id").eq("plan_id", planId).eq("status", "running");
      if (!runningTasks || runningTasks.length === 0) {
        await finalizePlanExecution(supabase, planId, plan.project_id);
      }
      return { status: "no_pending_tasks" };
    }

    await runTaskCore(supabase, plan, task);
    return { status: "task_started" };
  }

  static async getState(projectId: string) {
    const supabase = createServiceClient();
    const { data: plans } = await supabase
      .from("execution_plans")
      .select("*")
      .eq("project_id", projectId)
      .order("created_at", { ascending: false });
    const currentPlan = (plans as ExecutionPlan[] | null)?.[0] ?? null;

    if (!currentPlan) return { plans: [] as ExecutionPlan[], currentPlan: null, tasks: [] as ExecutionTask[] };

    const { data: tasks } = await supabase
      .from("execution_tasks")
      .select("*")
      .eq("plan_id", currentPlan.id)
      .order("task_order", { ascending: true });

    return { plans: (plans as ExecutionPlan[] | null) ?? [], currentPlan, tasks: (tasks as ExecutionTask[] | null) ?? [] };
  }
}

async function finalizePlanExecution(
  supabase: ReturnType<typeof createServiceClient>,
  planId: string,
  projectId: string
): Promise<void> {
  const { data: tasks } = await supabase.from("execution_tasks").select("status").eq("plan_id", planId);
  const failedCount = (tasks ?? []).filter((t) => t.status === "failed").length;

  if (failedCount > 0) {
    await supabase
      .from("execution_plans")
      .update({ status: "failed", failed_tasks: failedCount, last_error: `${failedCount} مهمة فشلت أثناء التنفيذ.`, completed_at: new Date().toISOString() })
      .eq("id", planId);
    return;
  }

  await supabase
    .from("execution_plans")
    .update({ status: "completed", completed_at: new Date().toISOString() })
    .eq("id", planId);

  // لو فيه دورة QA شغّالة بالفعل (يعني ده مش أول اكتمال، ده مهمة إصلاح
  // خلصت بعد فحص QA لقى مشاكل)، نكمّل نفس الدورة بدل ما نبدأ واحدة جديدة
  // من الصفر — راجع qa-orchestrator.ts لتفاصيل الحالتين.
  const { data: runningLoop } = await supabase
    .from("qa_fix_loops")
    .select("id")
    .eq("plan_id", planId)
    .eq("status", "running")
    .limit(1)
    .maybeSingle();

  try {
    if (runningLoop) {
      await resumeAfterFix(planId, projectId);
    } else {
      await startQaFixLoops(planId, projectId);
    }
  } catch (err) {
    console.error(`[ClaudeExec] Failed to advance QA fix loops for plan ${planId}:`, err);
  }
}

async function runTaskCore(
  supabase: ReturnType<typeof createServiceClient>,
  plan: ExecutionPlan,
  task: ExecutionTask
): Promise<void> {
  const start = Date.now();
  const parsed = parseRepoUrl(plan.repo_url);
  if (!parsed) {
    await markTaskFailed(supabase, plan.id, task, "رابط الـ Repository غير صالح.");
    return;
  }

  try {
    const readClient = new GitHubClient(getGithubToken());
    const existingFiles: RepoFile[] = [];
    for (const path of task.target_file_hints.slice(0, MAX_HINT_FILES)) {
      const content = await readClient.getFileContent(parsed.owner, parsed.repo, path, plan.repo_branch);
      if (content !== null) existingFiles.push({ path, content });
    }

    const { system, prompt } = buildTaskExecutionPrompt(task.title, task.description, existingFiles);
    const response = await ClaudeService.execute({ system, prompt });

    if (!response.success) {
      await handleTaskFailureWithRetry(supabase, plan.id, task, response.error?.message ?? "فشل استدعاء Claude.");
      return;
    }

    const validation = validateClaudeTaskResult(response.output);
    if (!validation.ok) {
      await handleTaskFailureWithRetry(supabase, plan.id, task, `لم نتمكن من فهم رد Claude: ${validation.reason}`);
      return;
    }

    const writeClient = new GitHubWriteClient(getGithubToken());
    const modifiedPaths: string[] = [];
    for (const change of validation.data.files) {
      const commitMessage = `[AI Execution] ${task.title} — ${change.path}`;
      if (change.action === "delete") {
        await writeClient.deleteFile(parsed.owner, parsed.repo, change.path, commitMessage, plan.repo_branch);
      } else {
        await writeClient.createOrUpdateFile(parsed.owner, parsed.repo, change.path, change.content ?? "", commitMessage, plan.repo_branch);
      }
      modifiedPaths.push(change.path);
    }

    await supabase
      .from("execution_tasks")
      .update({
        status: "completed",
        claude_response_summary: validation.data.summary,
        files_modified: modifiedPaths,
        input_tokens: response.token_usage?.input_tokens ?? null,
        output_tokens: response.token_usage?.output_tokens ?? null,
        cost_usd: response.cost_usd,
        duration_seconds: Math.round((Date.now() - start) / 1000),
        finished_at: new Date().toISOString(),
        last_error: null,
      })
      .eq("id", task.id);

    await supabase
      .from("execution_plans")
      .update({ completed_tasks: plan.completed_tasks + 1 })
      .eq("id", plan.id);
  } catch (err) {
    await handleTaskFailureWithRetry(supabase, plan.id, task, err instanceof Error ? err.message : "خطأ غير متوقع أثناء تنفيذ المهمة.");
  }
}

async function handleTaskFailureWithRetry(
  supabase: ReturnType<typeof createServiceClient>,
  planId: string,
  task: ExecutionTask,
  message: string
): Promise<void> {
  if (task.retry_count < TASK_MAX_RETRIES) {
    await supabase
      .from("execution_tasks")
      .update({ status: "pending", retry_count: task.retry_count + 1, claimed_at: null, last_error: message })
      .eq("id", task.id);
    return;
  }
  await markTaskFailed(supabase, planId, task, message);
}

async function markTaskFailed(
  supabase: ReturnType<typeof createServiceClient>,
  planId: string,
  task: ExecutionTask,
  message: string
): Promise<void> {
  await supabase
    .from("execution_tasks")
    .update({ status: "failed", last_error: message, finished_at: new Date().toISOString() })
    .eq("id", task.id);

  const { data: plan } = await supabase.from("execution_plans").select("failed_tasks").eq("id", planId).maybeSingle();
  await supabase
    .from("execution_plans")
    .update({ failed_tasks: (plan?.failed_tasks ?? 0) + 1 })
    .eq("id", planId);
}
