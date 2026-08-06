import type { SupabaseClient } from "@supabase/supabase-js";
import { createServiceClient } from "@/lib/supabase/service";
import { AITaskType } from "@/lib/ai/types";
import { friendlyAiErrorMessage } from "@/lib/ai/error-messages";
import { executeAIWithRateLimitWait } from "@/lib/ai/execute-with-rate-limit-wait";
import { getBrainForDownstreamGeneration } from "@/lib/brain-v2/downstream-context";
import { VIEWPORT_MATRIX } from "./viewport-matrix";
import { buildJourneyGenerationPrompt, buildCategoryEnrichmentPrompt } from "@/lib/ai/prompts/production-validation";
import { validateJourneyGeneration, validateCategoryEnrichment } from "@/lib/ai/validation/production-validation";
import { maskSecrets } from "@/lib/security-review/masking";
import { computeValidationScoreSummary } from "./score-summary";
import { computeDeploymentGate } from "./deployment-gate";
import { STALE_LOCK_MS } from "./next-task";
import { VALIDATION_CATEGORY_KEYS } from "@/lib/types/database";
import { uploadValidationScreenshot } from "@/lib/storage/validation-screenshots";
import type {
  ValidationCategoryKey,
  ValidationJourney,
  ValidationJourneyStep,
  ValidationSession,
  ValidationStep,
} from "@/lib/types/database";

const MAX_JOURNEY_ATTEMPTS = 3;
const CATEGORY_RATE_LIMIT_BUDGET_MS = 170_000;
const VISUAL_REGRESSION_PLACEHOLDER_SUMMARY =
  "Visual Regression بنية تحتية فقط في هذه النسخة — يحتاج تخزين Baselines ومكتبة Pixel Diffing غير متوفرين حاليًا. الشاشات الحقيقية بتتلقط وتتحفظ كـ Evidence في باقي المحاور، لكن مفيش مقارنة تلقائية بين النسخ لسه.";

export type ProductionValidationStartResult =
  | { status: "started"; sessionId: string }
  | { status: "already_generating" }
  | { status: "error"; message: string };

async function releaseSessionAsFailed(supabase: SupabaseClient, sessionId: string, message: string): Promise<void> {
  await supabase.from("validation_sessions").update({ status: "failed", last_error: message }).eq("id", sessionId);
}

async function releaseCategoryAsFailed(supabase: SupabaseClient, sessionId: string, categoryKey: ValidationCategoryKey, message: string): Promise<void> {
  await supabase.from("validation_categories").update({ status: "failed", last_error: message }).eq("validation_session_id", sessionId).eq("category_key", categoryKey);
}

/**
 * Production Validation Engine (Phase 4) — End-to-End QA حقيقي على
 * نسخة شغّالة فعليًا (Staging/Preview URL) بمتصفح Chromium حقيقي.
 * بخلاف باقي محركات EQA (بتقرا كود مصدري)، هنا مفيش Incremental —
 * كل Session بتختبر الحالة الحيّة الحالية بالكامل.
 *
 * قيد معروف وموثّق: Chromium بس (Firefox/Safari/Edge/Mobile Device
 * Farm محتاجين بنية تحتية غير متوفرة)، وVisual Regression بنية تحتية
 * فقط (بدون Pixel Diffing فعلي بعد).
 */
export class ProductionValidationEngine {
  static async startSession(
    projectId: string,
    actorId?: string,
    linkage?: { engineeringReviewId?: string; engineeringStageId?: string }
  ): Promise<ProductionValidationStartResult> {
    const supabase = createServiceClient();

    const { data: project } = await supabase.from("projects").select("staging_url").eq("id", projectId).maybeSingle();
    if (!project?.staging_url?.trim()) {
      return { status: "error", message: "لازم تحدد رابط Staging/Preview للمشروع أولاً (من إعدادات المشروع) قبل تشغيل Production Validation." };
    }

    const { data: active } = await supabase
      .from("validation_sessions")
      .select("id, updated_at")
      .eq("project_id", projectId)
      .eq("status", "generating")
      .maybeSingle();
    if (active) {
      const isStale = Date.now() - new Date(active.updated_at).getTime() > STALE_LOCK_MS;
      if (!isStale) return { status: "already_generating" };
      await supabase.from("validation_sessions").update({ status: "failed", last_error: "توقّفت الجلسة من غير سبب واضح (تجاوز الوقت المسموح)." }).eq("id", active.id);
    }

    const { data: last } = await supabase
      .from("validation_sessions")
      .select("version")
      .eq("project_id", projectId)
      .order("version", { ascending: false })
      .limit(1)
      .maybeSingle();
    const nextVersion = (last?.version ?? 0) + 1;

    const { data: session, error } = await supabase
      .from("validation_sessions")
      .insert({
        project_id: projectId,
        engineering_review_id: linkage?.engineeringReviewId ?? null,
        engineering_stage_id: linkage?.engineeringStageId ?? null,
        version: nextVersion,
        status: "generating",
        staging_url: project.staging_url,
        viewport_matrix: VIEWPORT_MATRIX.map((v) => v.name),
        created_by: actorId ?? null,
      })
      .select("id")
      .single();

    if (error || !session) {
      return { status: "error", message: `فشل إنشاء الجلسة: ${error?.message ?? "سبب غير معروف"}` };
    }
    return { status: "started", sessionId: session.id };
  }

  /** يزحف على الموقع الحقيقي، يولّد الرحلات بالـ AI، وينشئ صفوف الرحلات والمحاور. */
  static async runInitCore(sessionId: string): Promise<void> {
    const supabase = createServiceClient();

    try {
      const { data: session } = await supabase.from("validation_sessions").select("*").eq("id", sessionId).maybeSingle();
      if (!session) return;
      const s = session as ValidationSession;

      let siteMap;
      try {
        // Import ديناميكي عمدًا — راجع lib/production-validation/viewport-matrix.ts:
        // أي استيراد ثابت لأي حاجة بتسحب Playwright بيوصل لأي Server Component
        // بيستدعي getState/startCore من نفس الملف (زي صفحة المشروع)، وده كان
        // سبب انهيار فعلي في الإنتاج (Vercel).
        const { crawlSiteMap } = await import("./crawler");
        siteMap = await crawlSiteMap(s.staging_url);
      } catch (err) {
        await releaseSessionAsFailed(supabase, sessionId, err instanceof Error ? `تعذّر الوصول لرابط Staging: ${err.message}` : "تعذّر الوصول لرابط Staging.");
        return;
      }

      const [{ data: prd }, brainResult, { data: prompt }, { data: handoff }] = await Promise.all([
        supabase.from("prd").select("*").eq("project_id", s.project_id).maybeSingle(),
        getBrainForDownstreamGeneration(supabase, s.project_id).catch(() => null),
        supabase.from("prototype_prompt").select("project_goal, required_features, user_stories, acceptance_criteria").eq("project_id", s.project_id).maybeSingle(),
        supabase.from("developer_handoff").select("package_content").eq("project_id", s.project_id).maybeSingle(),
      ]);

      const promptSummary = prompt
        ? `Goal: ${prompt.project_goal}\nFeatures: ${prompt.required_features}\nUser Stories: ${prompt.user_stories}\nAcceptance: ${prompt.acceptance_criteria}`.slice(0, 3000)
        : null;
      const handoffSummary = handoff?.package_content ? JSON.stringify(handoff.package_content).slice(0, 3000) : null;

      const journeyPrompt = buildJourneyGenerationPrompt({
        prd: prd ?? null,
        brain: brainResult?.content ?? null,
        prototypePromptSummary: promptSummary,
        developerHandoffSummary: handoffSummary,
        siteMap,
        stagingUrl: s.staging_url,
      });

      const response = await executeAIWithRateLimitWait(
        AITaskType.PRODUCTION_VALIDATION_JOURNEY_GENERATION,
        journeyPrompt,
        { projectId: s.project_id },
        CATEGORY_RATE_LIMIT_BUDGET_MS
      );
      if (!response.success) {
        await releaseSessionAsFailed(supabase, sessionId, response.error?.message ?? "فشل توليد رحلات الاختبار.");
        return;
      }

      const validation = validateJourneyGeneration(response.output);
      if (!validation.ok) {
        await releaseSessionAsFailed(supabase, sessionId, "لم نتمكن من فهم رحلات الاختبار المُولَّدة.");
        return;
      }

      await supabase.from("validation_journeys").insert(
        validation.data.map((j) => ({
          validation_session_id: sessionId,
          project_id: s.project_id,
          journey_key: j.journey_key,
          name: j.name,
          goal: j.goal,
          steps: j.steps,
          status: "pending" as const,
        }))
      );

      const categoryRows = VALIDATION_CATEGORY_KEYS.map((key) => ({
        validation_session_id: sessionId,
        project_id: s.project_id,
        category_key: key,
        status: key === "visual_regression" ? ("ready" as const) : ("pending" as const),
        score: null,
        summary: key === "visual_regression" ? VISUAL_REGRESSION_PLACEHOLDER_SUMMARY : "",
      }));
      await supabase.from("validation_categories").insert(categoryRows);

      await supabase
        .from("validation_sessions")
        .update({ journeys_generated: validation.data.length })
        .eq("id", sessionId);
    } catch (err) {
      console.error(`[ProductionValidation] Unexpected init failure for session ${sessionId}:`, err);
      await releaseSessionAsFailed(supabase, sessionId, err instanceof Error ? err.message : "حدث خطأ غير متوقع أثناء التهيئة.");
    }
  }

  static async tryClaimJourneyLock(sessionId: string, journeyKey: string): Promise<boolean> {
    const supabase = createServiceClient();
    const staleCutoff = new Date(Date.now() - STALE_LOCK_MS).toISOString();
    const { data, error } = await supabase
      .from("validation_journeys")
      .update({ status: "running", started_at: new Date().toISOString(), last_error: null })
      .eq("validation_session_id", sessionId)
      .eq("journey_key", journeyKey)
      .or(`status.neq.running,updated_at.lt.${staleCutoff}`)
      .select("id");
    if (error) return false;
    return (data?.length ?? 0) > 0;
  }

  /** ينفّذ رحلة واحدة فعليًا بمتصفح حقيقي — بمحاولة إعادة تلقائية (3 مرات) واكتشاف Flaky. */
  static async runJourneyCore(sessionId: string, journeyKey: string): Promise<void> {
    const supabase = createServiceClient();

    try {
      const { data: session } = await supabase.from("validation_sessions").select("staging_url, project_id").eq("id", sessionId).maybeSingle();
      const { data: journeyRow } = await supabase
        .from("validation_journeys")
        .select("*")
        .eq("validation_session_id", sessionId)
        .eq("journey_key", journeyKey)
        .maybeSingle();
      if (!session || !journeyRow) return;
      const journey = journeyRow as ValidationJourney;

      const { launchBrowser, newTrackedContext, executeStep, takeScreenshot } = await import("./browser-runner");
      const start = Date.now();
      const browser = await launchBrowser();
      let finalStepResults: Omit<ValidationStep, "id" | "created_at" | "journey_id" | "validation_session_id" | "project_id">[] = [];
      let passed = false;
      let attemptsUsed = 0;

      try {
        for (let attempt = 1; attempt <= MAX_JOURNEY_ATTEMPTS && !passed; attempt++) {
          attemptsUsed = attempt;
          const { context, page, consoleErrors, networkErrors } = await newTrackedContext(browser);
          const stepResults: typeof finalStepResults = [];
          let journeyPassed = true;

          for (let i = 0; i < journey.steps.length; i++) {
            const step = journey.steps[i] as ValidationJourneyStep;
            const consoleBefore = consoleErrors.length;
            const networkBefore = networkErrors.length;
            const result = await executeStep(page, session.staging_url, step);
            const stepConsoleErrors = consoleErrors.slice(consoleBefore).map((e) => maskSecrets(e));
            const stepNetworkErrors = networkErrors.slice(networkBefore).map((e) => maskSecrets(e));

            let screenshotPath: string | null = null;
            if (!result.passed) {
              try {
                const buf = await takeScreenshot(page);
                screenshotPath = await uploadValidationScreenshot(supabase, session.project_id, sessionId, buf);
              } catch {
                // فشل رفع اللقطة مش سبب لإفشال الخطوة نفسها — الدليل الأساسي (النص) موجود برضه.
              }
            }

            stepResults.push({
              step_index: i,
              step_type: step.type,
              step_description: step.description,
              status: result.passed ? "passed" : "failed",
              actual_result: maskSecrets(result.actualResult),
              screenshot_path: screenshotPath,
              console_errors: stepConsoleErrors,
              network_errors: stepNetworkErrors,
            });

            if (!result.passed) {
              journeyPassed = false;
              break;
            }
          }

          await context.close();
          finalStepResults = stepResults;
          passed = journeyPassed;
        }
      } finally {
        await browser.close();
      }

      await supabase.from("validation_steps").insert(
        finalStepResults.map((s) => ({
          ...s,
          journey_id: journey.id,
          validation_session_id: sessionId,
          project_id: session.project_id,
        }))
      );

      const isFlaky = passed && attemptsUsed > 1;
      await supabase
        .from("validation_journeys")
        .update({
          status: passed ? "passed" : "failed",
          retry_count: attemptsUsed - 1,
          is_flaky: isFlaky,
          finished_at: new Date().toISOString(),
          duration_seconds: Math.round((Date.now() - start) / 1000),
          last_error: passed ? null : finalStepResults.find((s) => s.status === "failed")?.actual_result ?? "فشلت الرحلة.",
        })
        .eq("id", journey.id);

      const { data: allJourneys } = await supabase.from("validation_journeys").select("status, is_flaky").eq("validation_session_id", sessionId);
      const passedCount = (allJourneys ?? []).filter((j) => j.status === "passed").length;
      const failedCount = (allJourneys ?? []).filter((j) => j.status === "failed").length;
      const flakyCount = (allJourneys ?? []).filter((j) => j.is_flaky).length;
      await supabase
        .from("validation_sessions")
        .update({ journeys_passed: passedCount, journeys_failed: failedCount, journeys_flaky: flakyCount })
        .eq("id", sessionId);
    } catch (err) {
      console.error(`[ProductionValidation] Unexpected journey failure (${journeyKey}) session ${sessionId}:`, err);
      await supabase
        .from("validation_journeys")
        .update({ status: "failed", last_error: err instanceof Error ? err.message : "حدث خطأ غير متوقع." })
        .eq("validation_session_id", sessionId)
        .eq("journey_key", journeyKey);
    }
  }

  static async tryClaimCategoryLock(sessionId: string, categoryKey: ValidationCategoryKey): Promise<boolean> {
    const supabase = createServiceClient();
    const staleCutoff = new Date(Date.now() - STALE_LOCK_MS).toISOString();
    const { data, error } = await supabase
      .from("validation_categories")
      .update({ status: "generating", last_error: null })
      .eq("validation_session_id", sessionId)
      .eq("category_key", categoryKey)
      .or(`status.neq.generating,updated_at.lt.${staleCutoff}`)
      .select("id");
    if (error) return false;
    return (data?.length ?? 0) > 0;
  }

  /** ينفّذ محور Journey Execution (إثراء من نتائج الرحلات) أو Responsive/Accessibility فعليًا على الصفحة الرئيسية عبر مصفوفة Viewports حقيقية. */
  static async runCategoryCore(sessionId: string, categoryKey: ValidationCategoryKey): Promise<void> {
    const supabase = createServiceClient();

    try {
      const { data: session } = await supabase.from("validation_sessions").select("staging_url, project_id").eq("id", sessionId).maybeSingle();
      if (!session) return;

      if (categoryKey === "journey_execution") {
        const { data: failedSteps } = await supabase
          .from("validation_steps")
          .select("*, validation_journeys!inner(name)")
          .eq("validation_session_id", sessionId)
          .eq("status", "failed");

        const candidates = (failedSteps ?? []).map((s) => ({
          type: "journey_step_failure",
          journeyName: (s as unknown as { validation_journeys: { name: string } }).validation_journeys?.name ?? "",
          stepDescription: s.step_description,
          actualResult: s.actual_result,
          consoleErrors: s.console_errors,
          networkErrors: s.network_errors,
        }));

        await enrichAndInsertFindings(supabase, sessionId, session.project_id, "journey_execution", "Journey Execution", candidates, failedSteps ?? []);
      } else if (categoryKey === "responsive_validation") {
        const { launchBrowser, newTrackedContext, checkResponsiveOverflow } = await import("./browser-runner");
        const candidates: Record<string, unknown>[] = [];
        const browser = await launchBrowser();
        try {
          for (const viewport of VIEWPORT_MATRIX) {
            const { context, page } = await newTrackedContext(browser, viewport);
            await page.goto(session.staging_url, { waitUntil: "load", timeout: 20_000 });
            const result = await checkResponsiveOverflow(page);
            if (result.hasHorizontalOverflow || result.overlappingElementCount > 0) {
              candidates.push({ type: "overflow", viewport: viewport.name, url: session.staging_url, ...result });
            }
            await context.close();
          }
        } finally {
          await browser.close();
        }
        await enrichAndInsertFindings(supabase, sessionId, session.project_id, "responsive_validation", "Responsive Validation", candidates);
      } else if (categoryKey === "accessibility_validation") {
        const { launchBrowser, newTrackedContext, runAccessibilityScan } = await import("./browser-runner");
        const candidates: Record<string, unknown>[] = [];
        const browser = await launchBrowser();
        try {
          const { context, page } = await newTrackedContext(browser);
          await page.goto(session.staging_url, { waitUntil: "load", timeout: 20_000 });
          const violations = await runAccessibilityScan(page);
          for (const v of violations) candidates.push({ type: "axe_violation", url: session.staging_url, ...v });
          await context.close();
        } finally {
          await browser.close();
        }
        await enrichAndInsertFindings(supabase, sessionId, session.project_id, "accessibility_validation", "Accessibility Validation", candidates);
      }

      const { data: categories } = await supabase.from("validation_categories").select("status").eq("validation_session_id", sessionId);
      const allReady = (categories ?? []).length === VALIDATION_CATEGORY_KEYS.length && (categories ?? []).every((c) => c.status === "ready");
      if (allReady) await ProductionValidationEngine.finalizeReview(sessionId);
    } catch (err) {
      console.error(`[ProductionValidation] Unexpected category failure (${categoryKey}) session ${sessionId}:`, err);
      await releaseCategoryAsFailed(supabase, sessionId, categoryKey, err instanceof Error ? err.message : "حدث خطأ غير متوقع.");
    }
  }

  private static async finalizeReview(sessionId: string): Promise<void> {
    const supabase = createServiceClient();

    const { data: journeys } = await supabase.from("validation_journeys").select("status").eq("validation_session_id", sessionId);
    const total = (journeys ?? []).length;
    const passed = (journeys ?? []).filter((j) => j.status === "passed").length;
    const journeySuccessRate = total > 0 ? Math.round((passed / total) * 100) : 100;

    const { data: categories } = await supabase.from("validation_categories").select("category_key, score").eq("validation_session_id", sessionId);
    const responsiveScore = (categories ?? []).find((c) => c.category_key === "responsive_validation")?.score ?? 100;
    const accessibilityScore = (categories ?? []).find((c) => c.category_key === "accessibility_validation")?.score ?? 100;
    const scoreSummary = computeValidationScoreSummary(journeySuccessRate, responsiveScore, accessibilityScore);

    const { data: findings } = await supabase.from("validation_findings").select("severity").eq("validation_session_id", sessionId);
    const gate = computeDeploymentGate(findings ?? []);

    await supabase
      .from("validation_sessions")
      .update({
        status: "ready",
        score_summary: scoreSummary,
        production_ready: gate.productionReady,
        production_ready_reason: gate.reason,
        generated_at: new Date().toISOString(),
        last_error: null,
      })
      .eq("id", sessionId);
  }

  static async getState(projectId: string) {
    const supabase = createServiceClient();
    const { data: sessions } = await supabase.from("validation_sessions").select("*").eq("project_id", projectId).order("version", { ascending: false });
    const sessionList = (sessions ?? []) as ValidationSession[];
    const currentSession = sessionList[0] ?? null;
    if (!currentSession) return { sessions: sessionList, currentSession: null, journeys: [], categories: [], findings: [] };

    const [journeys, categories, findings] = await Promise.all([
      supabase.from("validation_journeys").select("*").eq("validation_session_id", currentSession.id).order("created_at", { ascending: true }).then((r) => (r.data ?? []) as ValidationJourney[]),
      supabase.from("validation_categories").select("*").eq("validation_session_id", currentSession.id).order("category_key", { ascending: true }).then((r) => r.data ?? []),
      supabase.from("validation_findings").select("*").eq("validation_session_id", currentSession.id).order("severity", { ascending: true }).then((r) => r.data ?? []),
    ]);

    return { sessions: sessionList, currentSession, journeys, categories, findings };
  }
}

/** إثراء مرشحين حقيقيين (Candidates) بالـ AI: تصنيف + دمج تكرارات (Auto Grouping) + كتابة النتيجة كـ Findings. */
async function enrichAndInsertFindings(
  supabase: SupabaseClient,
  sessionId: string,
  projectId: string,
  categoryKey: ValidationCategoryKey,
  categoryLabel: string,
  candidates: Record<string, unknown>[],
  rawSteps: Record<string, unknown>[] = []
): Promise<void> {
  if (candidates.length === 0) {
    await supabase
      .from("validation_categories")
      .update({ status: "ready", score: 100, summary: "مفيش مشاكل حقيقية اتكتشفت في هذا المحور.", last_error: null })
      .eq("validation_session_id", sessionId)
      .eq("category_key", categoryKey);
    return;
  }

  const response = await executeAIWithRateLimitWait(
    AITaskType.PRODUCTION_VALIDATION_CATEGORY_ENRICHMENT,
    buildCategoryEnrichmentPrompt(categoryLabel, JSON.stringify(candidates).slice(0, 40_000)),
    { projectId },
    CATEGORY_RATE_LIMIT_BUDGET_MS
  );

  if (!response.success) {
    const friendly =
      response.error?.code === "RATE_LIMIT"
        ? friendlyAiErrorMessage("RATE_LIMIT", response.error?.message ?? "")
        : response.error?.message ?? "فشل تحليل هذا المحور.";
    await releaseCategoryAsFailed(supabase, sessionId, categoryKey, friendly);
    return;
  }

  const validation = validateCategoryEnrichment(response.output);
  if (!validation.ok) {
    await releaseCategoryAsFailed(supabase, sessionId, categoryKey, "لم نتمكن من فهم نتيجة التحليل.");
    return;
  }

  const firstFailedStep = rawSteps[0] as unknown as ValidationStep & { validation_journeys?: { name: string } };
  const rows = validation.data.findings.map((f) => ({
    validation_session_id: sessionId,
    project_id: projectId,
    category_key: categoryKey,
    finding_key: `${categoryKey}::${f.finding_key}`,
    severity: f.severity,
    title: f.title,
    description: maskSecrets(f.description),
    impact: maskSecrets(f.impact),
    root_cause: maskSecrets(f.root_cause),
    recommended_fix: maskSecrets(f.recommended_fix),
    steps_to_reproduce: [],
    expected_result: "",
    actual_result: firstFailedStep?.actual_result ?? "",
    screenshot_path: firstFailedStep?.screenshot_path ?? null,
    console_logs: firstFailedStep?.console_errors ?? [],
    network_logs: firstFailedStep?.network_errors ?? [],
    stack_trace: "",
    browser: "chromium",
    os: process.platform,
    viewport: "",
    journey_name: firstFailedStep?.validation_journeys?.name ?? "",
    occurrence_count: f.occurrence_count,
    is_flaky: false,
    confidence_score: f.confidence_score,
  }));
  if (rows.length > 0) await supabase.from("validation_findings").insert(rows);

  const score = Math.max(0, Math.min(100, 100 - rows.reduce((sum, r) => sum + (r.severity === "critical" ? 20 : r.severity === "high" ? 10 : r.severity === "medium" ? 4 : r.severity === "low" ? 1.5 : 0.5), 0)));
  await supabase
    .from("validation_categories")
    .update({ status: "ready", score: Math.round(score), summary: validation.data.summary, last_error: null })
    .eq("validation_session_id", sessionId)
    .eq("category_key", categoryKey);
}
