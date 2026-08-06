import type { SupabaseClient } from "@supabase/supabase-js";
import { truncateForLog } from "@/lib/observability/safe-log";
import { createServiceClient } from "@/lib/supabase/service";
import { AITaskType } from "@/lib/ai/types";
import { friendlyAiErrorMessage } from "@/lib/ai/error-messages";
import { executeAIWithRateLimitWait } from "@/lib/ai/execute-with-rate-limit-wait";
import { readRepositoryDiff } from "@/lib/github/repo-diff-reader";
import type { RepoFile } from "@/lib/github/repo-reader";
import { buildCategoryReviewPrompt } from "@/lib/ai/prompts/static-review";
import {
  computeCategoryScore,
  computeFindingKey,
  validateCategoryReview,
  verifyFindingsGrounding,
} from "@/lib/ai/validation/static-review";
import { computeScoreSummary } from "./score-summary";
import { STALE_LOCK_MS } from "./next-category";
import { STATIC_REVIEW_CATEGORY_KEYS } from "@/lib/types/database";
import type { StaticReview, StaticReviewCategoryKey, StaticReviewFinding } from "@/lib/types/database";

/** ميزانية انتظار الـ Rate Limit لكل محور — نفس قيمة Engineering Audit المُصلَّحة، تحت سقف maxDuration=260s بهامش أمان. */
const CATEGORY_RATE_LIMIT_BUDGET_MS = 170_000;

export type StaticReviewStartResult =
  | { status: "started"; reviewId: string }
  | { status: "already_generating" }
  | { status: "error"; message: string };

export type StaticReviewStageResult = { status: "started" } | { status: "already_generating" };

async function releaseReviewAsFailed(supabase: SupabaseClient, reviewId: string, message: string): Promise<void> {
  await supabase.from("static_reviews").update({ status: "failed", last_error: message }).eq("id", reviewId);
}

async function releaseCategoryAsFailed(
  supabase: SupabaseClient,
  reviewId: string,
  categoryKey: StaticReviewCategoryKey,
  message: string
): Promise<void> {
  await supabase
    .from("static_review_categories")
    .update({ status: "failed", last_error: message })
    .eq("static_review_id", reviewId)
    .eq("category_key", categoryKey);
}

/**
 * Static Architecture Review Engine (Phase 12.2) — أول محرك مراجعة
 * هندسية حقيقي: بيقرا فرق الـ Repository (تدريجي عبر git diff) ويطلّع
 * 7 محاور تحليل ثابت مستقلة (كل واحد Background Job منفصل بالتسلسل)،
 * ثم يبني درجات نهائية حسابيًا (بدون AI إضافي — راجع score-summary.ts).
 * مستقل تمامًا عن Engineering QA Engine (Phase 12.1) — بيتربط بيه
 * اختياريًا (engineering_review_id/engineering_stage_id) لو اتشغّل من
 * جوّه مرحلة "static_code_audit"، لكن جداوله وتاريخه Project-Scoped.
 */
export class StaticReviewEngine {
  /** ينشئ صف مراجعة جديد (نسخة جديدة تحمل version أعلى) ويحجز قفل التهيئة. */
  static async startReview(
    projectId: string,
    repoUrl: string,
    repoRef: string,
    actorId?: string,
    linkage?: { engineeringReviewId?: string; engineeringStageId?: string }
  ): Promise<StaticReviewStartResult> {
    const supabase = createServiceClient();

    const { data: active } = await supabase
      .from("static_reviews")
      .select("id, updated_at")
      .eq("project_id", projectId)
      .eq("status", "generating")
      .maybeSingle();
    if (active) {
      const isStale = Date.now() - new Date(active.updated_at).getTime() > STALE_LOCK_MS;
      if (!isStale) return { status: "already_generating" };
      // مراجعة "شغّالة" بس معلّقة من Job مات (تجاوزت مدة الـ Stale Lock) —
      // اعتبرها فشلت واسمح بمراجعة جديدة بدل ما تقفل المشروع للأبد
      // (نفس الفخ اللي اتصلح في Engineering Audit: قفل بدون استعادة تلقائية).
      await supabase.from("static_reviews").update({ status: "failed", last_error: "توقّفت المراجعة من غير سبب واضح (تجاوز الوقت المسموح)." }).eq("id", active.id);
    }

    const { data: last } = await supabase
      .from("static_reviews")
      .select("version")
      .eq("project_id", projectId)
      .order("version", { ascending: false })
      .limit(1)
      .maybeSingle();
    const nextVersion = (last?.version ?? 0) + 1;

    const { data: review, error } = await supabase
      .from("static_reviews")
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

  /**
   * جوهر التهيئة — بيقرا فرق الـ Repo مقارنةً بآخر مراجعة "ready" لنفس
   * المشروع (أو تحليل كامل لو مفيش مراجعة سابقة)، بينقل Findings الملفات
   * اللي ملمستهاش (Carry-over)، وينشئ صفوف المحاور السبعة + File Explorer.
   */
  static async runInitCore(reviewId: string): Promise<void> {
    const supabase = createServiceClient();

    try {
      const { data: review } = await supabase.from("static_reviews").select("*").eq("id", reviewId).maybeSingle();
      if (!review) return;
      const r = review as StaticReview;

      const githubToken = process.env.GITHUB_TOKEN;
      if (!githubToken) {
        await releaseReviewAsFailed(supabase, reviewId, "خدمة GitHub غير مُعدّة حاليًا.");
        return;
      }

      const { data: previousReady } = await supabase
        .from("static_reviews")
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

      let carriedFindings: StaticReviewFinding[] = [];
      if (previousReady && !diff.isFullAnalysis) {
        const changedOrRemoved = new Set([...diff.changedFiles.map((f) => f.path), ...diff.removedPaths]);
        const { data: previousFindings } = await supabase
          .from("static_review_findings")
          .select("*")
          .eq("static_review_id", previousReady.id);
        carriedFindings = ((previousFindings ?? []) as StaticReviewFinding[]).filter((f) => !changedOrRemoved.has(f.file_path));
      }

      if (carriedFindings.length > 0) {
        const rows = carriedFindings.map((f) => ({
          static_review_id: reviewId,
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
          recommended_fix: f.recommended_fix,
          patch_suggestion: f.patch_suggestion,
          validation_steps: f.validation_steps,
          confidence_score: f.confidence_score,
          carried_over: true,
        }));
        await supabase.from("static_review_findings").insert(rows);
      }

      const changedPathSet = new Set(diff.changedFiles.map((f) => f.path));
      const unchangedPaths = diff.fileTree.filter((p) => !changedPathSet.has(p));
      const fileRows = [
        ...diff.changedFiles.map((f) => ({
          static_review_id: reviewId,
          project_id: r.project_id,
          file_path: f.path,
          file_status: diff.addedPaths.includes(f.path) ? ("added" as const) : ("modified" as const),
          findings_count: 0,
        })),
        ...unchangedPaths.map((p) => ({
          static_review_id: reviewId,
          project_id: r.project_id,
          file_path: p,
          file_status: "unchanged" as const,
          findings_count: carriedFindings.filter((f) => f.file_path === p).length,
        })),
      ];
      if (fileRows.length > 0) {
        await supabase.from("static_review_files").insert(fileRows);
      }

      await supabase
        .from("static_reviews")
        .update({
          base_sha: previousReady?.resolved_sha ?? null,
          resolved_sha: diff.headSha,
          is_incremental: !diff.isFullAnalysis,
          total_files_in_repo: diff.totalFilesInRepo,
          files_analyzed_count: diff.changedFiles.length,
          files_reused_count: carriedFindings.length,
          file_tree: diff.fileTree,
          changed_files_snapshot: diff.changedFiles,
          category_count: STATIC_REVIEW_CATEGORY_KEYS.length,
        })
        .eq("id", reviewId);

      if (diff.changedFiles.length === 0) {
        if (previousReady) {
          // مفيش ولا ملف اتغيّر — كل الـ Findings اتنقلت خلاص فوق. لازم
          // ننقل صفوف المحاور نفسها (بدرجاتها الجاهزة) من المراجعة
          // السابقة برضه، وإلا finalizeReview هيحسب score_summary من
          // مصفوفة محاور فاضية (NaN) بدل ما يحافظ على نفس الدرجات.
          const { data: previousCategories } = await supabase
            .from("static_review_categories")
            .select("category_key, status, score, summary")
            .eq("static_review_id", previousReady.id);
          const categoryRows = (previousCategories ?? []).map((c) => ({
            static_review_id: reviewId,
            project_id: r.project_id,
            category_key: c.category_key,
            status: c.status,
            score: c.score,
            summary: c.summary,
          }));
          if (categoryRows.length > 0) {
            await supabase.from("static_review_categories").insert(categoryRows);
          }
          await StaticReviewEngine.finalizeReview(reviewId);
          return;
        }
        // أول مراجعة على الإطلاق بس مفيش أي محتوى اتقرا فعليًا (كل محاولات
        // جلب الملفات فشلت رغم وجود ملفات في الشجرة) — مفيش أساس نبني عليه.
        await releaseReviewAsFailed(supabase, reviewId, "تعذّر قراءة محتوى أي ملف من الـ Repository رغم وجود ملفات في الشجرة.");
        return;
      }

      const categoryRows = STATIC_REVIEW_CATEGORY_KEYS.map((key) => ({
        static_review_id: reviewId,
        project_id: r.project_id,
        category_key: key,
        status: "pending" as const,
      }));
      await supabase.from("static_review_categories").insert(categoryRows);
    } catch (err) {
      console.error(`[StaticReview] Unexpected init failure for review ${reviewId}:`, err);
      await releaseReviewAsFailed(supabase, reviewId, err instanceof Error ? err.message : "حدث خطأ غير متوقع أثناء التهيئة.");
    }
  }

  static async tryClaimCategoryLock(reviewId: string, categoryKey: StaticReviewCategoryKey): Promise<boolean> {
    const supabase = createServiceClient();
    const staleCutoff = new Date(Date.now() - STALE_LOCK_MS).toISOString();
    const { data, error } = await supabase
      .from("static_review_categories")
      .update({ status: "generating", last_error: null })
      .eq("static_review_id", reviewId)
      .eq("category_key", categoryKey)
      .or(`status.neq.generating,updated_at.lt.${staleCutoff}`)
      .select("id");
    if (error) return false;
    return (data?.length ?? 0) > 0;
  }

  /** جوهر تدقيق محور واحد — بيستخدم changed_files_snapshot المخزّن، من غير أي قراءة تانية من GitHub. */
  static async runCategoryCore(reviewId: string, categoryKey: StaticReviewCategoryKey): Promise<void> {
    const supabase = createServiceClient();

    try {
      const { data: review } = await supabase.from("static_reviews").select("*").eq("id", reviewId).maybeSingle();
      if (!review) return;
      const r = review as StaticReview;
      const changedFiles = r.changed_files_snapshot as RepoFile[];

      if (!changedFiles || changedFiles.length === 0) {
        await releaseCategoryAsFailed(supabase, reviewId, categoryKey, "لا توجد ملفات متغيّرة محفوظة لهذه المراجعة.");
        return;
      }

      const prompt = buildCategoryReviewPrompt(categoryKey, changedFiles, r.file_tree, r.is_incremental);
      const response = await executeAIWithRateLimitWait(
        AITaskType.STATIC_REVIEW_CATEGORY,
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

      const validation = validateCategoryReview(response.output);
      if (!validation.ok) {
        console.error(`[StaticReview] Category validation failed (${categoryKey}) review ${reviewId}: ${truncateForLog(validation.reason)}`);
        await releaseCategoryAsFailed(supabase, reviewId, categoryKey, "لم نتمكن من فهم نتيجة التحليل.");
        return;
      }

      const { grounded, droppedCount } = verifyFindingsGrounding(validation.data.findings, changedFiles);
      if (droppedCount > 0) {
        console.warn(`[StaticReview] Dropped ${droppedCount} ungrounded finding(s) for category ${categoryKey}, review ${reviewId}`);
      }

      if (grounded.length > 0) {
        const rows = grounded.map((f) => ({
          static_review_id: reviewId,
          project_id: r.project_id,
          category_key: categoryKey,
          finding_key: computeFindingKey(categoryKey, f.file_path, f.title),
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
          recommended_fix: f.recommended_fix,
          patch_suggestion: f.patch_suggestion,
          validation_steps: f.validation_steps,
          confidence_score: f.confidence_score,
          carried_over: false,
        }));
        await supabase.from("static_review_findings").insert(rows);
      }

      // درجة المحور بتتحسب من كل Findings المحور ده في المراجعة دي (الجديدة + المنقولة سابقًا من init).
      const { data: allCategoryFindings } = await supabase
        .from("static_review_findings")
        .select("severity")
        .eq("static_review_id", reviewId)
        .eq("category_key", categoryKey);
      const score = computeCategoryScore((allCategoryFindings ?? []) as { severity: StaticReviewFinding["severity"] }[]);

      await supabase
        .from("static_review_categories")
        .update({ status: "ready", summary: validation.data.summary, score, last_error: null })
        .eq("static_review_id", reviewId)
        .eq("category_key", categoryKey);

      const { data: categories } = await supabase.from("static_review_categories").select("status").eq("static_review_id", reviewId);
      const allReady = (categories ?? []).length === STATIC_REVIEW_CATEGORY_KEYS.length && (categories ?? []).every((c) => c.status === "ready");
      if (allReady) {
        await StaticReviewEngine.finalizeReview(reviewId);
      }
    } catch (err) {
      console.error(`[StaticReview] Unexpected category failure (${categoryKey}) review ${reviewId}:`, err);
      await releaseCategoryAsFailed(supabase, reviewId, categoryKey, err instanceof Error ? err.message : "حدث خطأ غير متوقع.");
    }
  }

  /**
   * يقفل المراجعة بعد ما كل المحاور تخلص (أو مفيش تغييرات خالص) — بيبني
   * score_summary حسابيًا ويحدّث findings_count لكل صف File Explorer.
   * مش Background Job منفصل — بيتنادى من جوّه runCategoryCore/runInitCore
   * مباشرة لأنه حساب فوري (بدون AI) ومايستهلكش وقت يُذكر.
   */
  private static async finalizeReview(reviewId: string): Promise<void> {
    const supabase = createServiceClient();

    const { data: categories } = await supabase
      .from("static_review_categories")
      .select("category_key, score")
      .eq("static_review_id", reviewId);

    const categoryScores = Object.fromEntries(
      (categories ?? []).map((c) => [c.category_key, c.score ?? 100])
    ) as Record<StaticReviewCategoryKey, number>;
    const scoreSummary = computeScoreSummary(categoryScores);

    const { data: findings } = await supabase.from("static_review_findings").select("file_path").eq("static_review_id", reviewId);
    const countByFile = new Map<string, number>();
    for (const f of findings ?? []) {
      countByFile.set(f.file_path, (countByFile.get(f.file_path) ?? 0) + 1);
    }
    const { data: fileRows } = await supabase.from("static_review_files").select("id, file_path").eq("static_review_id", reviewId);
    for (const row of fileRows ?? []) {
      const count = countByFile.get(row.file_path) ?? 0;
      await supabase.from("static_review_files").update({ findings_count: count }).eq("id", row.id);
    }

    await supabase
      .from("static_reviews")
      .update({ status: "ready", score_summary: scoreSummary, generated_at: new Date().toISOString(), last_error: null })
      .eq("id", reviewId);
  }

  static async getState(projectId: string): Promise<{
    reviews: StaticReview[];
    currentReview: StaticReview | null;
    categories: Awaited<ReturnType<typeof fetchCategories>>;
    findings: Awaited<ReturnType<typeof fetchFindings>>;
    files: Awaited<ReturnType<typeof fetchFiles>>;
  }> {
    const supabase = createServiceClient();
    const { data: reviews } = await supabase
      .from("static_reviews")
      .select("*")
      .eq("project_id", projectId)
      .order("version", { ascending: false });
    const reviewList = (reviews ?? []) as StaticReview[];
    const currentReview = reviewList[0] ?? null;

    if (!currentReview) {
      return { reviews: reviewList, currentReview: null, categories: [], findings: [], files: [] };
    }

    const [categories, findings, files] = await Promise.all([
      fetchCategories(supabase, currentReview.id),
      fetchFindings(supabase, currentReview.id),
      fetchFiles(supabase, currentReview.id),
    ]);

    return { reviews: reviewList, currentReview, categories, findings, files };
  }

  /** أحدث مراجعة "ready" لمشروع معيّن — تُستخدم لمقارنة مراجعتين (Versioning). */
  static async getReviewWithFindings(reviewId: string): Promise<{ review: StaticReview; findings: StaticReviewFinding[] } | null> {
    const supabase = createServiceClient();
    const { data: review } = await supabase.from("static_reviews").select("*").eq("id", reviewId).maybeSingle();
    if (!review) return null;
    const findings = await fetchFindings(supabase, reviewId);
    return { review: review as StaticReview, findings };
  }
}

async function fetchCategories(supabase: SupabaseClient, reviewId: string) {
  const { data } = await supabase
    .from("static_review_categories")
    .select("*")
    .eq("static_review_id", reviewId)
    .order("category_key", { ascending: true });
  return data ?? [];
}

async function fetchFindings(supabase: SupabaseClient, reviewId: string): Promise<StaticReviewFinding[]> {
  const { data } = await supabase
    .from("static_review_findings")
    .select("*")
    .eq("static_review_id", reviewId)
    .order("severity", { ascending: true });
  return (data ?? []) as StaticReviewFinding[];
}

async function fetchFiles(supabase: SupabaseClient, reviewId: string) {
  const { data } = await supabase
    .from("static_review_files")
    .select("*")
    .eq("static_review_id", reviewId)
    .order("file_path", { ascending: true });
  return data ?? [];
}
