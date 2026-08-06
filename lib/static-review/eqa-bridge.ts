import { createServiceClient } from "@/lib/supabase/service";
import { StaticReviewEngine } from "./generation-service";
import type { StageRunContext, StageRunResult } from "@/lib/engineering-qa/stage-registry";
import type { StaticReview, StaticReviewFinding } from "@/lib/types/database";

const IN_PROGRESS_SUMMARY =
  "مراجعة Static Architecture Review شغّالة في الخلفية — محاورها السبعة (Architecture, Clean Code, SOLID, DRY/KISS, AI Code Smell, Naming, Documentation) بتتحلل بالتسلسل. افتح تفاصيل هذه المرحلة لمتابعة التقدم أو لتشغيل المحاور يدويًا.";

/**
 * الجسر الوحيد بين Engineering QA Engine (Phase 12.1) وStatic Review
 * Engine (Phase 12.2) — الملف الوحيد اللي بيلمس عقد stage-registry.ts.
 * الفحص الفعلي (7 محاور AI متتالية) بيتشغّل بالكامل من جوّه لوحة
 * Static Review المدمجة تحت هذه المرحلة (Client-driven auto-chain، نفس
 * نمط Engineering Audit بالظبط) — مش من هنا. الدالة دي مجرد جسر خفيف
 * وسريع ("هل المراجعة خلصت؟")، بيترجّع inProgress=true لحد ما تبقى
 * "ready"، وده اللي بيخلي المرحلة Continuable بدل ما تتقفل بنتيجة واحدة.
 */
export async function runStaticCodeAuditStage(context: StageRunContext): Promise<StageRunResult> {
  const supabase = createServiceClient();

  const { data: existing } = await supabase
    .from("static_reviews")
    .select("*")
    .eq("engineering_stage_id", context.stageId)
    .maybeSingle();

  if (!existing) {
    const result = await StaticReviewEngine.startReview(
      context.projectId,
      context.repositoryUrl,
      context.repositoryBranch,
      undefined,
      { engineeringReviewId: context.reviewId, engineeringStageId: context.stageId }
    );
    if (result.status === "started") {
      // التهيئة بتتشغّل هنا فورًا (مش after() منفصل) لأن إحنا بالفعل جوّه
      // Background Job بتاع EQA، والتهيئة نفسها سريعة (قراءة فرق الـ Repo
      // بس عبر GitHub Compare API) — صفر استدعاء AI في الخطوة دي.
      await StaticReviewEngine.runInitCore(result.reviewId);
    }
    return { score: null, summary: IN_PROGRESS_SUMMARY, findingsJson: [], recommendationsJson: [], inProgress: true };
  }

  const review = existing as StaticReview;

  if (review.status === "generating") {
    return { score: null, summary: IN_PROGRESS_SUMMARY, findingsJson: [], recommendationsJson: [], inProgress: true };
  }

  if (review.status === "failed") {
    throw new Error(review.last_error ?? "فشلت مراجعة Static Architecture Review لسبب غير معروف.");
  }

  // status === "ready" — المراجعة خلصت، نلخّص النتيجة للمرحلة العامة.
  const { data: findings } = await supabase
    .from("static_review_findings")
    .select("*")
    .eq("static_review_id", review.id);
  const topFindings = ((findings ?? []) as StaticReviewFinding[])
    .filter((f) => f.severity === "critical" || f.severity === "high")
    .slice(0, 20);

  return {
    score: review.score_summary?.overall_static_score ?? null,
    summary: `مراجعة Static Architecture Review اكتملت — ${(findings ?? []).length} Finding عبر 7 محاور. الدرجة الكلية: ${review.score_summary?.overall_static_score ?? "-"}/100.`,
    findingsJson: topFindings,
    recommendationsJson: [],
    inProgress: false,
  };
}
