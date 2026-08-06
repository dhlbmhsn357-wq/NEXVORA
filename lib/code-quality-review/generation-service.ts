import type { SupabaseClient } from "@supabase/supabase-js";
import { truncateForLog } from "@/lib/observability/safe-log";
import { createServiceClient } from "@/lib/supabase/service";
import { AITaskType } from "@/lib/ai/types";
import { friendlyAiErrorMessage } from "@/lib/ai/error-messages";
import { executeAIWithRateLimitWait } from "@/lib/ai/execute-with-rate-limit-wait";
import { readRepositoryDiff } from "@/lib/github/repo-diff-reader";
import type { RepoFile } from "@/lib/github/repo-reader";
import { buildCodeQualityCategoryPrompt } from "./prompts";
import { isCategoryRelevantToChangedFiles } from "./relevance";
import { maskFindingEvidence } from "@/lib/security-review/masking";
import {
  computePhaseCategoryScore,
  computePhaseFindingKey,
  validatePhaseCategoryReview,
  verifyPhaseFindingsGrounding,
} from "@/lib/ai/validation/phase-audit-findings";
import { STALE_LOCK_MS } from "./next-category";
import { computeCodeQualityScoreSummary } from "./score-summary";
import { CODE_QUALITY_REVIEW_CATEGORY_KEYS } from "@/lib/types/database";
import type { CodeQualityReview, CodeQualityReviewCategoryKey, CodeQualityReviewFinding } from "@/lib/types/database";

/** ميزانية انتظار الـ Rate Limit لكل محور — نفس قيمة Static/Security/Database Review، تحت سقف maxDuration=260s بهامش أمان. */
const CATEGORY_RATE_LIMIT_BUDGET_MS = 170_000;

export type CodeQualityReviewStartResult =
  | { status: "started"; reviewId: string }
  | { status: "already_generating" }
  | { status: "error"; message: string };

export type CodeQualityReviewStageResult = { status: "started" } | { status: "already_generating" };

async function releaseReviewAsFailed(supabase: SupabaseClient, reviewId: string, message: string): Promise<void> {
  await supabase.from("code_quality_reviews").update({ status: "failed", last_error: message }).eq("id", reviewId);
}

async function releaseCategoryAsFailed(
  supabase: SupabaseClient,
  reviewId: string,
  categoryKey: CodeQualityReviewCategoryKey,
  message: string
): Promise<void> {
  await supabase
    .from("code_quality_review_categories")
    .update({ status: "failed", last_error: message })
    .eq("code_quality_review_id", reviewId)
    .eq("category_key", categoryKey);
}

/**
 * Code Quality Audit Engine (EngQA-Merge) — محرك مستقل تمامًا عن باقي
 * محركات Engineering QA (Single Responsibility). نفس بنية Database
 * Integrity Engine (Phase 12.3) بالضبط.
 */
export class CodeQualityReviewEngine {
  static async startReview(
    projectId: string,
    repoUrl: string,
    repoRef: string,
    actorId?: string,
    linkage?: { engineeringReviewId?: string; engineeringStageId?: string }
  ): Promise<CodeQualityReviewStartResult> {
    const supabase = createServiceClient();

    const { data: active } = await supabase
      .from("code_quality_reviews")
      .select("id, updated_at")
      .eq("project_id", projectId)
      .eq("status", "generating")
      .maybeSingle();
    if (active) {
      const isStale = Date.now() - new Date(active.updated_at).getTime() > STALE_LOCK_MS;
      if (!isStale) return { status: "already_generating" };
      await supabase.from("code_quality_reviews").update({ status: "failed", last_error: "توقّفت المراجعة من غير سبب واضح (تجاوز الوقت المسموح)." }).eq("id", active.id);
    }

    const { data: last } = await supabase
      .from("code_quality_reviews")
      .select("version")
      .eq("project_id", projectId)
      .order("version", { ascending: false })
      .limit(1)
      .maybeSingle();
    const nextVersion = (last?.version ?? 0) + 1;

    const { data: review, error } = await supabase
      .from("code_quality_reviews")
      .insert({
        project_id: projectId,
        engineering_review_id: linkage?.engineeringReviewId ?? null,
        engineering_stage_id: linkage?.engineeringStageId ?? null,
        version: nextVersion,
        status: "generating",
        repo_url: repoUrl,
        repo_ref: repoRef || "main",
        created_by: actorId ?? null,
      })
      .select("id")
      .single();

    if (error || !review) {
      return { status: "error", message: `فشل إنشاء المراجعة: ${error?.message ?? "سبب غير معروف"}` };
    }
    return { status: "started", reviewId: review.id };
  }

  static async runInitCore(reviewId: string): Promise<void> {
    const supabase = createServiceClient();

    try {
      const { data: review } = await supabase.from("code_quality_reviews").select("*").eq("id", reviewId).maybeSingle();
      if (!review) return;
      const r = review as CodeQualityReview;

      const githubToken = process.env.GITHUB_TOKEN;
      if (!githubToken) {
        await releaseReviewAsFailed(supabase, reviewId, "خدمة GitHub غير مُعدّة حاليًا.");
        return;
      }

      const { data: previousReady } = await supabase
        .from("code_quality_reviews")
        .select("id, resolved_sha")
        .eq("project_id", r.project_id)
        .eq("status", "ready")
        .neq("id", reviewId)
        .order("version", { ascending: false })
        .limit(1)
        .maybeSingle();

      let diff;
      try {
        diff = await readRepositoryDiff(r.repo_url, r.repo_ref, githubToken, previousReady?.resolved_sha ?? null);
      } catch (err) {
        await releaseReviewAsFailed(supabase, reviewId, err instanceof Error ? err.message : "تعذّر قراءة الـ Repository.");
        return;
      }

      if (diff.fileTree.length === 0) {
        await releaseReviewAsFailed(supabase, reviewId, "مفيش ملفات كود مصدري مقروءة في هذا الـ Repository أو الـ Branch.");
        return;
      }

      const canSkipByRelevance = !!previousReady && !diff.isFullAnalysis;
      const changedPaths = diff.changedFiles.map((f) => f.path);

      let carriedFindings: CodeQualityReviewFinding[] = [];
      if (previousReady && !diff.isFullAnalysis) {
        const changedOrRemoved = new Set([...changedPaths, ...diff.removedPaths]);
        const { data: previousFindings } = await supabase
          .from("code_quality_review_findings")
          .select("*")
          .eq("code_quality_review_id", previousReady.id);
        carriedFindings = ((previousFindings ?? []) as CodeQualityReviewFinding[]).filter((f) => !changedOrRemoved.has(f.file_path));
      }
      if (carriedFindings.length > 0) {
        await supabase.from("code_quality_review_findings").insert(
          carriedFindings.map((f) => ({
            code_quality_review_id: reviewId,
            project_id: r.project_id,
            category_key: f.category_key,
            finding_key: f.finding_key,
            severity: f.severity,
            title: f.title,
            description: f.description,
            impact: f.impact,
            file_path: f.file_path,
            component_name: f.component_name,
            function_name: f.function_name,
            class_name: f.class_name,
            line_start: f.line_start,
            line_end: f.line_end,
            code_snippet: f.code_snippet,
            root_cause: f.root_cause,
            attack_scenario: f.attack_scenario,
            recommended_fix: f.recommended_fix,
            patch_suggestion: f.patch_suggestion,
            validation_steps: f.validation_steps,
            reference_links: f.reference_links,
            confidence_score: f.confidence_score,
            carried_over: true,
          }))
        );
      }

      const changedPathSet = new Set(changedPaths);
      const unchangedPaths = diff.fileTree.filter((p) => !changedPathSet.has(p));
      const fileRows = [
        ...diff.changedFiles.map((f) => ({
          code_quality_review_id: reviewId,
          project_id: r.project_id,
          file_path: f.path,
          file_status: diff.addedPaths.includes(f.path) ? ("added" as const) : ("modified" as const),
          findings_count: 0,
        })),
        ...unchangedPaths.map((p) => ({
          code_quality_review_id: reviewId,
          project_id: r.project_id,
          file_path: p,
          file_status: "unchanged" as const,
          findings_count: carriedFindings.filter((f) => f.file_path === p).length,
        })),
      ];
      if (fileRows.length > 0) await supabase.from("code_quality_review_files").insert(fileRows);

      await supabase
        .from("code_quality_reviews")
        .update({
          base_sha: previousReady?.resolved_sha ?? null,
          resolved_sha: diff.headSha,
          is_incremental: !diff.isFullAnalysis,
          total_files_in_repo: diff.totalFilesInRepo,
          files_analyzed_count: diff.changedFiles.length,
          files_reused_count: carriedFindings.length,
          file_tree: diff.fileTree,
          changed_files_snapshot: diff.changedFiles,
          category_count: CODE_QUALITY_REVIEW_CATEGORY_KEYS.length,
        })
        .eq("id", reviewId);

      if (diff.changedFiles.length === 0) {
        if (previousReady) {
          await copyPreviousCategoriesVerbatim(supabase, reviewId, r.project_id, previousReady.id);
          await CodeQualityReviewEngine.finalizeReview(reviewId);
          return;
        }
        await releaseReviewAsFailed(supabase, reviewId, "تعذّر قراءة محتوى أي ملف من الـ Repository رغم وجود ملفات في الشجرة.");
        return;
      }

      const categoryRows: { static_key: CodeQualityReviewCategoryKey; skip: boolean }[] = CODE_QUALITY_REVIEW_CATEGORY_KEYS.map((key) => ({
        static_key: key,
        skip: canSkipByRelevance && !isCategoryRelevantToChangedFiles(key, changedPaths),
      }));

      for (const { static_key, skip } of categoryRows) {
        if (!skip) {
          await supabase.from("code_quality_review_categories").insert({
            code_quality_review_id: reviewId,
            project_id: r.project_id,
            category_key: static_key,
            status: "pending",
          });
          continue;
        }
        const { data: prevCategory } = await supabase
          .from("code_quality_review_categories")
          .select("score, summary")
          .eq("code_quality_review_id", previousReady!.id)
          .eq("category_key", static_key)
          .maybeSingle();
        await supabase.from("code_quality_review_categories").insert({
          code_quality_review_id: reviewId,
          project_id: r.project_id,
          category_key: static_key,
          status: "ready",
          score: prevCategory?.score ?? 100,
          summary: prevCategory?.summary ?? "مفيش ملفات مرتبطة بهذا المحور اتغيّرت — النتائج منقولة من آخر مراجعة.",
        });
        const { data: prevFindings } = await supabase
          .from("code_quality_review_findings")
          .select("*")
          .eq("code_quality_review_id", previousReady!.id)
          .eq("category_key", static_key);
        const alreadyCarried = new Set(carriedFindings.map((f) => f.finding_key));
        const toInsert = ((prevFindings ?? []) as CodeQualityReviewFinding[]).filter((f) => !alreadyCarried.has(f.finding_key));
        if (toInsert.length > 0) {
          await supabase.from("code_quality_review_findings").insert(
            toInsert.map((f) => ({
              code_quality_review_id: reviewId,
              project_id: r.project_id,
              category_key: f.category_key,
              finding_key: f.finding_key,
              severity: f.severity,
              title: f.title,
              description: f.description,
              impact: f.impact,
              file_path: f.file_path,
              component_name: f.component_name,
              function_name: f.function_name,
              class_name: f.class_name,
              line_start: f.line_start,
              line_end: f.line_end,
              code_snippet: f.code_snippet,
              root_cause: f.root_cause,
              attack_scenario: f.attack_scenario,
              recommended_fix: f.recommended_fix,
              patch_suggestion: f.patch_suggestion,
              validation_steps: f.validation_steps,
              reference_links: f.reference_links,
              confidence_score: f.confidence_score,
              carried_over: true,
            }))
          );
        }
      }

      const { data: categoriesAfterInit } = await supabase.from("code_quality_review_categories").select("status").eq("code_quality_review_id", reviewId);
      const allReady = (categoriesAfterInit ?? []).length === CODE_QUALITY_REVIEW_CATEGORY_KEYS.length && (categoriesAfterInit ?? []).every((c) => c.status === "ready");
      if (allReady) await CodeQualityReviewEngine.finalizeReview(reviewId);
    } catch (err) {
      console.error(`[CodeQualityReview] Unexpected init failure for review ${reviewId}:`, err);
      await releaseReviewAsFailed(supabase, reviewId, err instanceof Error ? err.message : "حدث خطأ غير متوقع أثناء التهيئة.");
    }
  }

  static async tryClaimCategoryLock(reviewId: string, categoryKey: CodeQualityReviewCategoryKey): Promise<boolean> {
    const supabase = createServiceClient();
    const staleCutoff = new Date(Date.now() - STALE_LOCK_MS).toISOString();
    const { data, error } = await supabase
      .from("code_quality_review_categories")
      .update({ status: "generating", last_error: null })
      .eq("code_quality_review_id", reviewId)
      .eq("category_key", categoryKey)
      .or(`status.neq.generating,updated_at.lt.${staleCutoff}`)
      .select("id");
    if (error) return false;
    return (data?.length ?? 0) > 0;
  }

  static async runCategoryCore(reviewId: string, categoryKey: CodeQualityReviewCategoryKey): Promise<void> {
    const supabase = createServiceClient();

    try {
      const { data: review } = await supabase.from("code_quality_reviews").select("*").eq("id", reviewId).maybeSingle();
      if (!review) return;
      const r = review as CodeQualityReview;
      const changedFiles = r.changed_files_snapshot as RepoFile[];

      if (!changedFiles || changedFiles.length === 0) {
        await releaseCategoryAsFailed(supabase, reviewId, categoryKey, "لا توجد ملفات متغيّرة محفوظة لهذه المراجعة.");
        return;
      }

      const prompt = buildCodeQualityCategoryPrompt(categoryKey, changedFiles, r.file_tree, r.is_incremental);
      const response = await executeAIWithRateLimitWait(
        AITaskType.CODE_QUALITY_REVIEW_CATEGORY,
        prompt,
        { projectId: r.project_id },
        CATEGORY_RATE_LIMIT_BUDGET_MS
      );

      if (!response.success) {
        const friendly =
          response.error?.code === "RATE_LIMIT"
            ? friendlyAiErrorMessage("RATE_LIMIT", response.error?.message ?? "")
            : response.error?.message ?? "فشل تحليل هذا المحور.";
        await releaseCategoryAsFailed(supabase, reviewId, categoryKey, friendly);
        return;
      }

      const validation = validatePhaseCategoryReview(response.output);
      if (!validation.ok) {
        console.error(`[CodeQualityReview] Category validation failed (${categoryKey}) review ${reviewId}: ${truncateForLog(validation.reason)}`);
        await releaseCategoryAsFailed(supabase, reviewId, categoryKey, "لم نتمكن من فهم نتيجة التحليل.");
        return;
      }

      const { grounded, droppedCount } = verifyPhaseFindingsGrounding(validation.data.findings, changedFiles);
      if (droppedCount > 0) {
        console.warn(`[CodeQualityReview] Dropped ${droppedCount} ungrounded finding(s) for category ${categoryKey}, review ${reviewId}`);
      }

      if (grounded.length > 0) {
        const masked = grounded.map((f) => maskFindingEvidence(f));
        await supabase.from("code_quality_review_findings").insert(
          masked.map((f) => ({
            code_quality_review_id: reviewId,
            project_id: r.project_id,
            category_key: categoryKey,
            finding_key: computePhaseFindingKey(categoryKey, f.file_path, f.title),
            severity: f.severity,
            title: f.title,
            description: f.description,
            impact: f.impact,
            file_path: f.file_path,
            component_name: f.component_name,
            function_name: f.function_name,
            class_name: f.class_name,
            line_start: f.line_start,
            line_end: f.line_end,
            code_snippet: f.code_snippet,
            root_cause: f.root_cause,
            attack_scenario: f.attack_scenario,
            recommended_fix: f.recommended_fix,
            patch_suggestion: f.patch_suggestion,
            validation_steps: f.validation_steps,
            reference_links: f.reference_links,
            confidence_score: f.confidence_score,
            carried_over: false,
          }))
        );
      }

      const { data: allCategoryFindings } = await supabase
        .from("code_quality_review_findings")
        .select("severity")
        .eq("code_quality_review_id", reviewId)
        .eq("category_key", categoryKey);
      const score = computePhaseCategoryScore((allCategoryFindings ?? []) as { severity: CodeQualityReviewFinding["severity"] }[]);

      await supabase
        .from("code_quality_review_categories")
        .update({ status: "ready", summary: validation.data.summary, score, last_error: null })
        .eq("code_quality_review_id", reviewId)
        .eq("category_key", categoryKey);

      const { data: categories } = await supabase.from("code_quality_review_categories").select("status").eq("code_quality_review_id", reviewId);
      const allReady = (categories ?? []).length === CODE_QUALITY_REVIEW_CATEGORY_KEYS.length && (categories ?? []).every((c) => c.status === "ready");
      if (allReady) await CodeQualityReviewEngine.finalizeReview(reviewId);
    } catch (err) {
      console.error(`[CodeQualityReview] Unexpected category failure (${categoryKey}) review ${reviewId}:`, err);
      await releaseCategoryAsFailed(supabase, reviewId, categoryKey, err instanceof Error ? err.message : "حدث خطأ غير متوقع.");
    }
  }

  private static async finalizeReview(reviewId: string): Promise<void> {
    const supabase = createServiceClient();

    const { data: categories } = await supabase.from("code_quality_review_categories").select("category_key, score").eq("code_quality_review_id", reviewId);
    const categoryScores = Object.fromEntries((categories ?? []).map((c) => [c.category_key, c.score ?? 100])) as Record<CodeQualityReviewCategoryKey, number>;
    const scoreSummary = computeCodeQualityScoreSummary(categoryScores);

    const { data: findings } = await supabase.from("code_quality_review_findings").select("file_path").eq("code_quality_review_id", reviewId);
    const countByFile = new Map<string, number>();
    for (const f of findings ?? []) countByFile.set(f.file_path, (countByFile.get(f.file_path) ?? 0) + 1);
    const { data: fileRows } = await supabase.from("code_quality_review_files").select("id, file_path").eq("code_quality_review_id", reviewId);
    for (const row of fileRows ?? []) {
      await supabase.from("code_quality_review_files").update({ findings_count: countByFile.get(row.file_path) ?? 0 }).eq("id", row.id);
    }

    await supabase
      .from("code_quality_reviews")
      .update({ status: "ready", score_summary: scoreSummary, generated_at: new Date().toISOString(), last_error: null })
      .eq("id", reviewId);
  }

  static async getState(projectId: string) {
    const supabase = createServiceClient();
    const { data: reviews } = await supabase.from("code_quality_reviews").select("*").eq("project_id", projectId).order("version", { ascending: false });
    const reviewList = (reviews ?? []) as CodeQualityReview[];
    const currentReview = reviewList[0] ?? null;
    if (!currentReview) return { reviews: reviewList, currentReview: null, categories: [], findings: [], files: [] };

    const [categories, findings, files] = await Promise.all([
      fetchCategories(supabase, currentReview.id),
      fetchFindings(supabase, currentReview.id),
      fetchFiles(supabase, currentReview.id),
    ]);
    return { reviews: reviewList, currentReview, categories, findings, files };
  }

  static async getReviewWithFindings(reviewId: string): Promise<{ review: CodeQualityReview; findings: CodeQualityReviewFinding[] } | null> {
    const supabase = createServiceClient();
    const { data: review } = await supabase.from("code_quality_reviews").select("*").eq("id", reviewId).maybeSingle();
    if (!review) return null;
    return { review: review as CodeQualityReview, findings: await fetchFindings(supabase, reviewId) };
  }
}

async function copyPreviousCategoriesVerbatim(supabase: SupabaseClient, reviewId: string, projectId: string, previousReviewId: string): Promise<void> {
  const { data: previousCategories } = await supabase
    .from("code_quality_review_categories")
    .select("category_key, status, score, summary")
    .eq("code_quality_review_id", previousReviewId);
  const rows = (previousCategories ?? []).map((c) => ({
    code_quality_review_id: reviewId,
    project_id: projectId,
    category_key: c.category_key,
    status: c.status,
    score: c.score,
    summary: c.summary,
  }));
  if (rows.length > 0) await supabase.from("code_quality_review_categories").insert(rows);
}

async function fetchCategories(supabase: SupabaseClient, reviewId: string) {
  const { data } = await supabase.from("code_quality_review_categories").select("*").eq("code_quality_review_id", reviewId).order("category_key", { ascending: true });
  return data ?? [];
}

async function fetchFindings(supabase: SupabaseClient, reviewId: string): Promise<CodeQualityReviewFinding[]> {
  const { data } = await supabase.from("code_quality_review_findings").select("*").eq("code_quality_review_id", reviewId).order("severity", { ascending: true });
  return (data ?? []) as CodeQualityReviewFinding[];
}

async function fetchFiles(supabase: SupabaseClient, reviewId: string) {
  const { data } = await supabase.from("code_quality_review_files").select("*").eq("code_quality_review_id", reviewId).order("file_path", { ascending: true });
  return data ?? [];
}
