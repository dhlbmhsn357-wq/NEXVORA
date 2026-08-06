import { createServiceClient } from "@/lib/supabase/service";
import { EngineeringQAEngine } from "@/lib/engineering-qa/engine";
import { findNextStageToRun, allStagesCompleted } from "@/lib/engineering-qa/next-stage";
import { launchBrowser, newTrackedContext, runAccessibilityScan } from "@/lib/production-validation/browser-runner";
import { AITaskType } from "@/lib/ai/types";
import { executeAIWithRateLimitWait } from "@/lib/ai/execute-with-rate-limit-wait";
import { buildFixPromptGenerationPrompt } from "@/lib/ai/prompts/code-execution";
import { validateFixPrompt } from "@/lib/ai/validation/code-execution";
import { friendlyAiErrorMessage } from "@/lib/ai/error-messages";
import { hasBlockingFindings, countBySeverity } from "./severity-gate";
import type { EngineeringReview, EngineeringReviewStage, ExecutionPlan, QaFixLoop } from "@/lib/types/database";

const MAX_FIX_ATTEMPTS = 3;

async function getPlanOrNull(supabase: ReturnType<typeof createServiceClient>, planId: string): Promise<ExecutionPlan | null> {
  const { data } = await supabase.from("execution_plans").select("*").eq("id", planId).maybeSingle();
  return (data as ExecutionPlan | null) ?? null;
}

async function getRunningFixLoop(supabase: ReturnType<typeof createServiceClient>, planId: string): Promise<QaFixLoop | null> {
  const { data } = await supabase
    .from("qa_fix_loops")
    .select("*")
    .eq("plan_id", planId)
    .eq("status", "running")
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  return (data as QaFixLoop | null) ?? null;
}

async function markReleaseCandidate(
  supabase: ReturnType<typeof createServiceClient>,
  planId: string,
  projectId: string,
  patch: { status?: "pending" | "blocked" | "ready"; engineering_qa_passed?: boolean; accessibility_qa_passed?: boolean }
): Promise<void> {
  const { data: existing } = await supabase.from("release_candidates").select("id").eq("plan_id", planId).maybeSingle();
  if (existing) {
    await supabase.from("release_candidates").update(patch).eq("id", existing.id);
  } else {
    await supabase.from("release_candidates").insert({ plan_id: planId, project_id: projectId, ...patch });
  }
}

/** أول مرة كل مهام التنفيذ تخلص بنجاح — يبدأ دورة Engineering QA. */
export async function startQaFixLoops(planId: string, projectId: string): Promise<void> {
  const supabase = createServiceClient();
  const plan = await getPlanOrNull(supabase, planId);
  if (!plan) return;

  await markReleaseCandidate(supabase, planId, projectId, { status: "pending" });
  await startNewEngineeringReviewAttempt(supabase, planId, projectId, plan, 1);
}

async function startNewEngineeringReviewAttempt(
  supabase: ReturnType<typeof createServiceClient>,
  planId: string,
  projectId: string,
  plan: ExecutionPlan,
  attemptNumber: number
): Promise<void> {
  const created = await EngineeringQAEngine.createReview(projectId, plan.repo_url, plan.repo_branch);
  if (!created.ok) {
    await supabase.from("execution_plans").update({ last_error: created.message }).eq("id", planId);
    return;
  }

  await supabase.from("qa_fix_loops").insert({
    plan_id: planId,
    project_id: projectId,
    qa_stage: "engineering_qa",
    attempt_number: attemptNumber,
    status: "running",
    qa_reference_id: created.review.id,
  });

  const claimed = await EngineeringQAEngine.tryClaimStartLock(created.review.id);
  if (claimed) await EngineeringQAEngine.runStartCore(created.review.id);
}

/**
 * خطوة واحدة في دورة QA — بتتنادى بشكل متكرر من الـ Dashboard (Polling)
 * زي بالظبط نمط Engineering QA نفسه. بتتعامل مع 3 حالات: (1) مرحلة
 * Engineering QA لسه شغّالة → تقدّمها خطوة، (2) خلصت ومفيش مشاكل حرجة →
 * تنتقل لـ Accessibility، (3) خلصت وفيها مشاكل → تولّد Fix وتضيفه كمهمة
 * تنفيذ جديدة (الـ Dashboard هيكمّلها تلقائيًا زي أي مهمة عادية).
 */
export async function advanceQaFixLoop(planId: string): Promise<void> {
  const supabase = createServiceClient();
  const plan = await getPlanOrNull(supabase, planId);
  if (!plan) return;

  const fixLoop = await getRunningFixLoop(supabase, planId);
  if (!fixLoop) return;

  if (fixLoop.qa_stage === "engineering_qa") {
    await advanceEngineeringQaLoop(supabase, plan, fixLoop);
    return;
  }
  await advanceAccessibilityLoop(supabase, plan, fixLoop);
}

/** مهمة إصلاح خلصت (Claude نفّذها) — نكمل دورة QA من نفس المرحلة اللي وقفنا عندها. */
export async function resumeAfterFix(planId: string, projectId: string): Promise<void> {
  await advanceQaFixLoop(planId);
  void projectId; // محفوظة للتوقيع فقط — الحالة كلها متاحة عبر planId.
}

async function advanceEngineeringQaLoop(
  supabase: ReturnType<typeof createServiceClient>,
  plan: ExecutionPlan,
  fixLoop: QaFixLoop
): Promise<void> {
  // لو فيه Fix اتولّد أصلًا لمحاولة قبل كده، منعيدش نطلب فحص Findings —
  // ده معناه إن Claude خلص تنفيذ الإصلاح (Task اللي في fix_task_id) لسه
  // شغّالة أو خلصت؛ لما تخلص، runNextTask بينادي resumeAfterFix هنا تاني.
  if (fixLoop.fix_task_id) {
    const { data: fixTask } = await supabase.from("execution_tasks").select("status").eq("id", fixLoop.fix_task_id).maybeSingle();
    if (!fixTask || fixTask.status === "pending" || fixTask.status === "running") return; // لسه مش خلص — استنى الـ Poll الجاي.
    if (fixTask.status === "failed") {
      await supabase.from("qa_fix_loops").update({ status: "failed" }).eq("id", fixLoop.id);
      await markReleaseCandidate(supabase, plan.id, plan.project_id, { status: "blocked" });
      return;
    }
    // الإصلاح اتنفّذ بنجاح — قفل المحاولة دي وابدأ محاولة مراجعة جديدة على الكود المُصلَّح.
    await supabase.from("qa_fix_loops").update({ status: "fixed" }).eq("id", fixLoop.id);
    await startNewEngineeringReviewAttempt(supabase, plan.id, plan.project_id, plan, fixLoop.attempt_number + 1);
    return;
  }

  const reviewId = fixLoop.qa_reference_id;
  if (!reviewId) return;

  const { data: reviewRow } = await supabase.from("engineering_reviews").select("*").eq("id", reviewId).maybeSingle();
  const review = reviewRow as EngineeringReview | null;
  if (!review) return;

  const { data: stagesRow } = await supabase.from("engineering_review_stages").select("*").eq("review_id", reviewId);
  const stages = (stagesRow as EngineeringReviewStage[] | null) ?? [];

  if (!allStagesCompleted(stages)) {
    const next = findNextStageToRun(stages);
    if (next) {
      const claimed = await EngineeringQAEngine.tryClaimStageLock(reviewId, next.stage_key);
      if (claimed) await EngineeringQAEngine.runStageCore(reviewId, next.stage_key);
    }
    // لو مفيش next (مرحلة Continuable لسه شغّالة)، منسيبش حاجة — الـ Poll الجاي هيحاول تاني.
    return;
  }

  // كل المراحل خلصت — نجمع كل الـ Findings من كل المراحل ونشوف فيه حاجة حرجة.
  const { data: results } = await supabase.from("engineering_stage_results").select("findings_json").eq("review_id", reviewId);
  const allFindings = (results ?? []).flatMap((r) => (Array.isArray(r.findings_json) ? r.findings_json : [])) as Array<{ severity?: string }>;

  if (!hasBlockingFindings(allFindings)) {
    await supabase.from("qa_fix_loops").update({ status: "fixed" }).eq("id", fixLoop.id);
    await markReleaseCandidate(supabase, plan.id, plan.project_id, { engineering_qa_passed: true });
    await startAccessibilityLoop(supabase, plan);
    return;
  }

  if (fixLoop.attempt_number >= MAX_FIX_ATTEMPTS) {
    await supabase.from("qa_fix_loops").update({ status: "max_attempts_reached" }).eq("id", fixLoop.id);
    await markReleaseCandidate(supabase, plan.id, plan.project_id, { status: "blocked" });
    return;
  }

  const summary = summarizeFindings(allFindings, countBySeverity(allFindings));
  await generateAndQueueFix(supabase, plan, fixLoop, "engineering_qa", summary);
}

async function startAccessibilityLoop(supabase: ReturnType<typeof createServiceClient>, plan: ExecutionPlan): Promise<void> {
  const { data: scan, error } = await supabase
    .from("accessibility_scans")
    .insert({ plan_id: plan.id, project_id: plan.project_id, status: "running" })
    .select("id")
    .single();
  if (error || !scan) return;

  await supabase.from("qa_fix_loops").insert({
    plan_id: plan.id,
    project_id: plan.project_id,
    qa_stage: "accessibility_qa",
    attempt_number: 1,
    status: "running",
    qa_reference_id: scan.id,
  });

  await runAccessibilityScanCore(supabase, plan, scan.id);
}

async function runAccessibilityScanCore(supabase: ReturnType<typeof createServiceClient>, plan: ExecutionPlan, scanId: string): Promise<void> {
  const { data: project } = await supabase.from("projects").select("production_url, staging_url").eq("id", plan.project_id).maybeSingle();
  const targetUrl = project?.production_url?.trim() || project?.staging_url?.trim();
  if (!targetUrl) {
    await supabase.from("accessibility_scans").update({ status: "failed", last_error: "لا يوجد رابط Production/Staging مضبوط لهذا المشروع." }).eq("id", scanId);
    return;
  }

  let browser: Awaited<ReturnType<typeof launchBrowser>> | null = null;
  try {
    browser = await launchBrowser();
    const { context, page } = await newTrackedContext(browser);
    await page.goto(targetUrl, { waitUntil: "load", timeout: 20_000 });
    const violations = await runAccessibilityScan(page);
    await context.close();

    await supabase
      .from("accessibility_scans")
      .update({ status: "ready", violations, violations_count: violations.length })
      .eq("id", scanId);
  } catch (err) {
    await supabase
      .from("accessibility_scans")
      .update({ status: "failed", last_error: err instanceof Error ? err.message : "فشل فحص Accessibility." })
      .eq("id", scanId);
  } finally {
    if (browser) await browser.close();
  }
}

async function advanceAccessibilityLoop(
  supabase: ReturnType<typeof createServiceClient>,
  plan: ExecutionPlan,
  fixLoop: QaFixLoop
): Promise<void> {
  if (fixLoop.fix_task_id) {
    const { data: fixTask } = await supabase.from("execution_tasks").select("status").eq("id", fixLoop.fix_task_id).maybeSingle();
    if (!fixTask || fixTask.status === "pending" || fixTask.status === "running") return;
    if (fixTask.status === "failed") {
      await supabase.from("qa_fix_loops").update({ status: "failed" }).eq("id", fixLoop.id);
      await markReleaseCandidate(supabase, plan.id, plan.project_id, { status: "blocked" });
      return;
    }
    await supabase.from("qa_fix_loops").update({ status: "fixed" }).eq("id", fixLoop.id);
    const { data: newScan, error } = await supabase
      .from("accessibility_scans")
      .insert({ plan_id: plan.id, project_id: plan.project_id, status: "running" })
      .select("id")
      .single();
    if (error || !newScan) return;
    const nextAttempt = fixLoop.attempt_number + 1;
    await supabase.from("qa_fix_loops").insert({
      plan_id: plan.id,
      project_id: plan.project_id,
      qa_stage: "accessibility_qa",
      attempt_number: nextAttempt,
      status: "running",
      qa_reference_id: newScan.id,
    });
    await runAccessibilityScanCore(supabase, plan, newScan.id);
    return;
  }

  const scanId = fixLoop.qa_reference_id;
  if (!scanId) return;

  const { data: scanRow } = await supabase.from("accessibility_scans").select("*").eq("id", scanId).maybeSingle();
  if (!scanRow || scanRow.status === "running") return; // لسه شغّال — الـ Poll الجاي هيتأكد تاني.

  if (scanRow.status === "failed") {
    // فشل فني (مش مشاكل Accessibility فعلية) — منقفلش الحلقة، بس منمنعش الإصدار كمان. يحتاج تدخّل يدوي.
    await supabase.from("qa_fix_loops").update({ status: "failed" }).eq("id", fixLoop.id);
    return;
  }

  const violations = (scanRow.violations as Array<{ impact: string | null }>) ?? [];
  if (!hasBlockingFindings(violations.map((v) => ({ impact: v.impact })))) {
    await supabase.from("qa_fix_loops").update({ status: "fixed" }).eq("id", fixLoop.id);
    await markReleaseCandidate(supabase, plan.id, plan.project_id, { accessibility_qa_passed: true, status: "ready" });
    return;
  }

  if (fixLoop.attempt_number >= MAX_FIX_ATTEMPTS) {
    await supabase.from("qa_fix_loops").update({ status: "max_attempts_reached" }).eq("id", fixLoop.id);
    await markReleaseCandidate(supabase, plan.id, plan.project_id, { status: "blocked" });
    return;
  }

  const summary = summarizeFindings(violations, countBySeverity(violations.map((v) => ({ severity: v.impact ?? "unknown" }))));
  await generateAndQueueFix(supabase, plan, fixLoop, "accessibility_qa", summary);
}

function summarizeFindings(
  findings: Array<{ severity?: string; impact?: string | null; description?: string; title?: string; help?: string }>,
  counts: Record<string, number>
): string {
  const countsLine = Object.entries(counts)
    .map(([level, n]) => `${level}: ${n}`)
    .join("، ");
  const details = findings
    .slice(0, 25)
    .map((f) => `- [${f.severity ?? f.impact ?? "?"}] ${f.title ?? f.help ?? f.description ?? "بدون وصف"}`)
    .join("\n");
  return `عدد المشاكل حسب الشدة: ${countsLine}\n\n${details}`;
}

async function generateAndQueueFix(
  supabase: ReturnType<typeof createServiceClient>,
  plan: ExecutionPlan,
  fixLoop: QaFixLoop,
  stageLabel: "engineering_qa" | "accessibility_qa",
  findingsSummary: string
): Promise<void> {
  const label = stageLabel === "engineering_qa" ? "Engineering QA" : "Accessibility QA";
  const prompt = buildFixPromptGenerationPrompt(label, findingsSummary, null, fixLoop.attempt_number);
  const response = await executeAIWithRateLimitWait(AITaskType.FIX_PROMPT_GENERATION, prompt, { projectId: plan.project_id }, 170_000);

  if (!response.success) {
    const friendly =
      response.error?.code === "RATE_LIMIT" ? friendlyAiErrorMessage("RATE_LIMIT", response.error?.message ?? "") : response.error?.message ?? "فشل توليد تعليمات الإصلاح.";
    await supabase.from("qa_fix_loops").update({ status: "failed", findings_summary: findingsSummary }).eq("id", fixLoop.id);
    await supabase.from("execution_plans").update({ last_error: friendly }).eq("id", plan.id);
    return;
  }

  const validation = validateFixPrompt(response.output);
  if (!validation.ok) {
    await supabase.from("qa_fix_loops").update({ status: "failed", findings_summary: findingsSummary }).eq("id", fixLoop.id);
    return;
  }

  await supabase
    .from("qa_fix_loops")
    .update({ findings_summary: findingsSummary, fix_prompt: validation.data.fix_prompt })
    .eq("id", fixLoop.id);

  const { data: lastTask } = await supabase
    .from("execution_tasks")
    .select("task_order")
    .eq("plan_id", plan.id)
    .order("task_order", { ascending: false })
    .limit(1)
    .maybeSingle();
  const nextOrder = (lastTask?.task_order ?? 0) + 1;

  const { data: fixTask, error } = await supabase
    .from("execution_tasks")
    .insert({
      plan_id: plan.id,
      project_id: plan.project_id,
      task_order: nextOrder,
      title: `إصلاح — ${label} (محاولة ${fixLoop.attempt_number})`,
      description: validation.data.fix_prompt,
      target_file_hints: validation.data.target_file_hints,
    })
    .select("id")
    .single();
  if (error || !fixTask) return;

  await supabase.from("qa_fix_loops").update({ fix_task_id: fixTask.id }).eq("id", fixLoop.id);
  // الـ Plan يرجع "executing" — الـ Dashboard (اللي بيستدعي runNextTask
  // بشكل دوري) هيلتقط مهمة الإصلاح دي زي أي مهمة عادية وينفّذها. لما
  // تخلص، finalizePlanExecution هيلاقي الحلقة دي لسه "running" ومعاها
  // fix_task_id، فهيستدعي resumeAfterFix اللي هيبدأ محاولة المراجعة
  // الجاية (راجع advanceEngineeringQaLoop/advanceAccessibilityLoop فوق).
  await supabase
    .from("execution_plans")
    .update({ status: "executing", total_tasks: nextOrder })
    .eq("id", plan.id);
}
