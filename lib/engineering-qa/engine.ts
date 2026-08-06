import type { SupabaseClient } from "@supabase/supabase-js";
import { createServiceClient } from "@/lib/supabase/service";
import { STAGE_REGISTRY, getStageDefinition, runPlaceholderStage } from "./stage-registry";
import { allStagesCompleted } from "./next-stage";
import { shouldDiscardCallback } from "@/lib/jobs/cancellation";
import type {
  EngineeringCertificate,
  EngineeringReview,
  EngineeringReviewEvent,
  EngineeringReviewEventType,
  EngineeringReviewStage,
  EngineeringStageResult,
} from "@/lib/types/database";

/** أي Lock معلّق أقدم من كده يُعتبر Job مات ويُعاد المحاولة فوقه — نفس نمط باقي المحركات في المشروع. */
const STALE_LOCK_MS = 6 * 60_000;

export type CreateReviewResult =
  | { ok: true; review: EngineeringReview }
  | { ok: false; message: string };

async function logEvent(
  supabase: SupabaseClient,
  reviewId: string,
  projectId: string,
  eventType: EngineeringReviewEventType,
  options: { stageKey?: string; detail?: string; actorId?: string } = {}
): Promise<void> {
  await supabase.from("engineering_review_events").insert({
    review_id: reviewId,
    project_id: projectId,
    event_type: eventType,
    stage_key: options.stageKey ?? null,
    detail: options.detail ?? null,
    actor_id: options.actorId ?? null,
  });
}

async function getReviewOrNull(supabase: SupabaseClient, reviewId: string): Promise<EngineeringReview | null> {
  const { data } = await supabase.from("engineering_reviews").select("*").eq("id", reviewId).maybeSingle();
  return data as EngineeringReview | null;
}

async function getStagesForReview(supabase: SupabaseClient, reviewId: string): Promise<EngineeringReviewStage[]> {
  const { data } = await supabase
    .from("engineering_review_stages")
    .select("*")
    .eq("review_id", reviewId)
    .order("execution_order", { ascending: true });
  return (data ?? []) as EngineeringReviewStage[];
}

/**
 * Engineering QA Engine — المدخل الوحيد لإدارة دورة حياة أي مراجعة
 * هندسية. الترتيب الداخلي بين المراحل (منع تشغيل مرحلتين متعارضتين،
 * الانتقال التلقائي بينها) هو مسؤولية "Orchestrator" اللي بيعيش هنا
 * كمنطق (findNextStageToRun في next-stage.ts + runStageCore تحت) بدل
 * ملف منفصل — الاتنين مترابطين جدًا (Orchestrator بيحتاج يقفل نفس
 * الأقفال ويقرا نفس حالة الـ Engine) وفصلهم كان هيسبّب تزامن بين ملفين
 * بدل تماسك داخل واحد؛ قرار معماري موثّق هنا صراحةً.
 */
export class EngineeringQAEngine {
  /**
   * إنشاء مراجعة جديدة — بينشئ صف المراجعة + كل المراحل التسعة من
   * الـ Registry بحالة "pending". بيرفض الإنشاء لو فيه مراجعة نشطة
   * بالفعل لنفس المشروع (فحص ودّي في الكود؛ الـ Partial Unique Index
   * في الـ DB هو الحارس الحقيقي غير القابل للكسر بالسباق).
   */
  static async createReview(
    projectId: string,
    repoUrl: string,
    repoRef: string,
    actorId?: string
  ): Promise<CreateReviewResult> {
    const supabase = createServiceClient();

    const { data: active } = await supabase
      .from("engineering_reviews")
      .select("id")
      .eq("project_id", projectId)
      .in("review_status", ["queued", "running"])
      .maybeSingle();
    if (active) {
      return { ok: false, message: "فيه مراجعة هندسية نشطة بالفعل لهذا المشروع — استنى تخلص أو ألغيها الأول." };
    }

    const { data: lastReview } = await supabase
      .from("engineering_reviews")
      .select("review_number")
      .eq("project_id", projectId)
      .order("review_number", { ascending: false })
      .limit(1)
      .maybeSingle();
    const nextNumber = (lastReview?.review_number ?? 0) + 1;

    const { data: review, error } = await supabase
      .from("engineering_reviews")
      .insert({
        project_id: projectId,
        review_number: nextNumber,
        repository_url: repoUrl,
        repository_branch: repoRef || "main",
        review_status: "pending",
        created_by: actorId ?? null,
      })
      .select("*")
      .single();

    if (error || !review) {
      return { ok: false, message: `فشل إنشاء المراجعة: ${error?.message ?? "سبب غير معروف"}` };
    }

    const stageRows = STAGE_REGISTRY.map((s) => ({
      review_id: review.id,
      project_id: projectId,
      stage_key: s.key,
      stage_name: s.label,
      execution_order: s.order,
      stage_status: "pending" as const,
    }));
    const { error: stagesError } = await supabase.from("engineering_review_stages").insert(stageRows);
    if (stagesError) {
      await supabase.from("engineering_reviews").update({ review_status: "failed", last_error: stagesError.message }).eq("id", review.id);
      return { ok: false, message: `فشل إنشاء مراحل المراجعة: ${stagesError.message}` };
    }

    await logEvent(supabase, review.id, projectId, "review_created", { actorId });

    return { ok: true, review: review as EngineeringReview };
  }

  /** يحجز Lock بدء المراجعة (أو يستعيده لو معلّق من Job مات). */
  static async tryClaimStartLock(reviewId: string): Promise<boolean> {
    const supabase = createServiceClient();
    const staleCutoff = new Date(Date.now() - STALE_LOCK_MS).toISOString();
    const { data, error } = await supabase
      .from("engineering_reviews")
      .update({ review_status: "queued", last_error: null })
      .eq("id", reviewId)
      .in("review_status", ["pending", "failed", "cancelled"])
      .select("id");
    if (error) return false;
    if ((data?.length ?? 0) > 0) return true;

    // لو الحالة الحالية "queued"/"running" بس معلّقة (Job مات)، اسمح بالاستعادة.
    const { data: staleData, error: staleError } = await supabase
      .from("engineering_reviews")
      .update({ review_status: "queued", last_error: null })
      .eq("id", reviewId)
      .in("review_status", ["queued", "running"])
      .lt("updated_at", staleCutoff)
      .select("id");
    if (staleError) return false;
    return (staleData?.length ?? 0) > 0;
  }

  /** جوهر بدء المراجعة — بيسجّل بداية التنفيذ بس. الانتقال بين المراحل بعد كده مسؤولية الـ Client (Polling + Auto-chain)، نفس نمط Pipeline/Engineering Audit. */
  static async runStartCore(reviewId: string, actorId?: string): Promise<void> {
    const supabase = createServiceClient();
    const review = await getReviewOrNull(supabase, reviewId);
    if (!review) return;

    await supabase
      .from("engineering_reviews")
      .update({ review_status: "running", started_at: review.started_at ?? new Date().toISOString() })
      .eq("id", reviewId);

    await logEvent(supabase, reviewId, review.project_id, "review_started", { actorId });
  }

  /**
   * يحجز Lock مرحلة واحدة بس — بيسمح بمطالبة مرحلة "failed"/"completed"
   * برضه عشان Retry الصريح. لمرحلة "Continuable" (زي static_code_audit —
   * جسر لمحرك فرعي مستقل لسه بيشتغل، راجع stage-registry.ts)، الاستعادة
   * مسموحة حتى لو المرحلة "running" فعليًا وحديثة — دي مش تعارض تشغيل
   * مزدوج، دي استمرار طبيعي متوقع لنفس المرحلة (الـ Client بيعاود
   * الاستدعاء كل Poll لحد ما المحرك الفرعي يخلص).
   */
  static async tryClaimStageLock(reviewId: string, stageKey: string): Promise<boolean> {
    const supabase = createServiceClient();
    const definition = getStageDefinition(stageKey);

    if (definition?.continuable) {
      const { data: current } = await supabase
        .from("engineering_review_stages")
        .select("stage_status")
        .eq("review_id", reviewId)
        .eq("stage_key", stageKey)
        .maybeSingle();
      const isFreshStart = !current || current.stage_status !== "running";
      const { data, error } = await supabase
        .from("engineering_review_stages")
        .update({
          stage_status: "running",
          last_error: null,
          ...(isFreshStart ? { started_at: new Date().toISOString() } : {}),
        })
        .eq("review_id", reviewId)
        .eq("stage_key", stageKey)
        .select("id");
      if (error) return false;
      return (data?.length ?? 0) > 0;
    }

    const staleCutoff = new Date(Date.now() - STALE_LOCK_MS).toISOString();
    const { data, error } = await supabase
      .from("engineering_review_stages")
      .update({ stage_status: "running", started_at: new Date().toISOString(), last_error: null })
      .eq("review_id", reviewId)
      .eq("stage_key", stageKey)
      .or(`stage_status.neq.running,updated_at.lt.${staleCutoff}`)
      .select("id");
    if (error) return false;
    return (data?.length ?? 0) > 0;
  }

  /** جوهر تشغيل مرحلة واحدة — بيفترض إن الـ Lock محجوز بالفعل. */
  static async runStageCore(reviewId: string, stageKey: string, actorId?: string, isRetry = false): Promise<void> {
    const supabase = createServiceClient();

    try {
      const review = await getReviewOrNull(supabase, reviewId);
      if (!review) return;

      // حارس الإلغاء (بداية): لو المراجعة اتلغت/اتستبدلت/اكتملت قبل ما
      // الـ Job ده يشتغل، منبدأش المرحلة أصلًا. execution_id بيتحفظ عشان
      // نتأكد قبل الكتابة إن نفس التنفيذ لسه هو النشط.
      const startExecutionId = review.execution_id;
      if (shouldDiscardCallback({ status: review.review_status, execution_id: review.execution_id }, startExecutionId)) {
        return;
      }

      const { data: stageRow } = await supabase
        .from("engineering_review_stages")
        .select("*")
        .eq("review_id", reviewId)
        .eq("stage_key", stageKey)
        .maybeSingle();
      if (!stageRow) return;

      const definition = getStageDefinition(stageKey);

      // لمرحلة Continuable، أول استدعاء بس هو اللي بيسجّل "stage_started" —
      // الاستدعاءات المتتالية بعد كده (Poll كل شوية لحد ما المحرك الفرعي
      // يخلص) مش "بداية" جديدة، وتسجيلها كل مرة كان هيغرق الـ Timeline
      // بأحداث مكررة لنفس المرحلة.
      let isContinuationTick = false;
      if (definition?.continuable && !isRetry) {
        const { data: existingStartEvent } = await supabase
          .from("engineering_review_events")
          .select("id")
          .eq("review_id", reviewId)
          .eq("stage_key", stageKey)
          .eq("event_type", "stage_started")
          .limit(1)
          .maybeSingle();
        isContinuationTick = !!existingStartEvent;
      }
      if (!isContinuationTick) {
        await logEvent(supabase, reviewId, review.project_id, isRetry ? "stage_retried" : "stage_started", { stageKey, actorId });
      }

      const start = Date.now();
      const result = definition?.run
        ? await definition.run({
            projectId: review.project_id,
            reviewId,
            stageId: stageRow.id,
            repositoryUrl: review.repository_url,
            repositoryBranch: review.repository_branch,
            repositoryCommit: review.repository_commit,
          })
        : await runPlaceholderStage();
      const durationSeconds = Math.round((Date.now() - start) / 1000);

      // حارس الإلغاء (قبل الكتابة): ده أهم جزء. لو أثناء تشغيل المرحلة
      // (ممكن تاخد وقت مع الـ AI) اتلغت المراجعة أو اتستبدلت بأحدث منها،
      // نتجاهل النتيجة تمامًا — لا نكتب findings، لا نقفل المرحلة، لا نحدّث
      // التقدّم. بكده أي Callback متأخر من تنفيذ قديم لا يكتب فوق الجديد.
      const freshReview = await getReviewOrNull(supabase, reviewId);
      if (shouldDiscardCallback(freshReview ? { status: freshReview.review_status, execution_id: freshReview.execution_id } : null, startExecutionId)) {
        return;
      }

      if (result.inProgress) {
        // لسه شغّال داخليًا (Sub-pipeline Continuable) — منسجّلش نتيجة
        // نهائية ولا نقفل المرحلة؛ نسيبها "running" (محجوزة بالفعل) عشان
        // الـ Client يعاود استدعاء runEngineeringQAStage تاني في الـ Poll الجاي.
        return;
      }

      await supabase.from("engineering_stage_results").insert({
        stage_id: stageRow.id,
        review_id: reviewId,
        project_id: review.project_id,
        score: result.score,
        summary: result.summary,
        findings_json: result.findingsJson,
        recommendations_json: result.recommendationsJson,
      });

      await supabase
        .from("engineering_review_stages")
        .update({
          stage_status: "completed",
          finished_at: new Date().toISOString(),
          duration_seconds: durationSeconds,
          retry_count: isRetry ? stageRow.retry_count + 1 : stageRow.retry_count,
        })
        .eq("id", stageRow.id);

      await logEvent(supabase, reviewId, review.project_id, "stage_finished", { stageKey, actorId });

      const allStages = await getStagesForReview(supabase, reviewId);
      if (allStagesCompleted(allStages)) {
        await supabase
          .from("engineering_reviews")
          .update({ review_status: "completed", completed_at: new Date().toISOString(), overall_progress: 100, last_error: null })
          .eq("id", reviewId);
        await logEvent(supabase, reviewId, review.project_id, "review_completed", { actorId });
      } else {
        const completedCount = allStages.filter((s) => s.stage_status === "completed").length;
        await supabase
          .from("engineering_reviews")
          .update({
            review_status: "running",
            overall_progress: Math.round((completedCount / allStages.length) * 100),
            last_error: null,
          })
          .eq("id", reviewId);
      }
    } catch (err) {
      console.error(`[EngineeringQA] Unexpected stage failure (${stageKey}) review ${reviewId}:`, err);
      const message = err instanceof Error ? err.message : "حدث خطأ غير متوقع أثناء تنفيذ المرحلة.";
      // لو المراجعة اتلغت/اتستبدلت في الأثناء، مانقلبش حالتها لـ failed —
      // الفشل ده بقى تابع لتنفيذ ميت، نتجاهله بهدوء.
      const review = await getReviewOrNull(supabase, reviewId);
      if (!review || review.review_status === "cancelled" || review.review_status === "cancelling") {
        return;
      }
      await supabase
        .from("engineering_review_stages")
        .update({ stage_status: "failed", finished_at: new Date().toISOString(), last_error: message })
        .eq("review_id", reviewId)
        .eq("stage_key", stageKey);
      await supabase.from("engineering_reviews").update({ review_status: "failed", last_error: message }).eq("id", reviewId);
      await logEvent(supabase, reviewId, review.project_id, "stage_failed", { stageKey, detail: message, actorId });
    }
  }

  /**
   * الجوهر المشترك للإلغاء — نقلة آمنة cancelling → cancelled، توقف كل
   * المراحل المعلّقة/الشغّالة، وتسجّل الحدث. cancelling حالة انتقالية
   * بتحرّر الـ Partial Unique Index فورًا (مش ضمن الحالات النشطة)، فتسمح
   * ببدء مراجعة جديدة على طول من غير سباق. مش Background Job — فوري.
   */
  private static async cancelReviewInternal(
    supabase: SupabaseClient,
    review: EngineeringReview,
    options: { actorId?: string; reason: string; superseded?: boolean } = { reason: "cancelled_by_user" }
  ): Promise<void> {
    const reviewId = review.id;
    const nowIso = new Date().toISOString();

    // 1) نقلة انتقالية — تحرّر القفل النشط فورًا
    await supabase.from("engineering_reviews").update({ review_status: "cancelling" }).eq("id", reviewId);

    const { data: affectedStages } = await supabase
      .from("engineering_review_stages")
      .select("stage_key")
      .eq("review_id", reviewId)
      .in("stage_status", ["pending", "running"]);

    await supabase
      .from("engineering_review_stages")
      .update({ stage_status: "cancelled", finished_at: nowIso })
      .eq("review_id", reviewId)
      .in("stage_status", ["pending", "running"]);

    // 2) الحالة النهائية + حقول الإلغاء
    await supabase
      .from("engineering_reviews")
      .update({
        review_status: "cancelled",
        completed_at: nowIso,
        cancelled_at: nowIso,
        cancelled_by: options.actorId ?? null,
        cancel_reason: options.reason,
      })
      .eq("id", reviewId);

    await logEvent(supabase, reviewId, review.project_id, options.superseded ? "review_superseded" : "review_cancelled", {
      actorId: options.actorId,
      detail: options.reason,
    });
    for (const s of affectedStages ?? []) {
      await logEvent(supabase, reviewId, review.project_id, "stage_cancelled", { stageKey: s.stage_key, actorId: options.actorId });
    }
  }

  /** إلغاء مراجعة صريح من المستخدم (زر Cancel). */
  static async cancelReview(reviewId: string, actorId?: string): Promise<void> {
    const supabase = createServiceClient();
    const review = await getReviewOrNull(supabase, reviewId);
    if (!review) return;
    await EngineeringQAEngine.cancelReviewInternal(supabase, review, { actorId, reason: "cancelled_by_user" });
  }

  /**
   * يلغي المراجعة النشطة (لو وجدت) لمشروع عشان تبدأ أحدث منها مكانها —
   * "Cancel & Supersede". بيرجّع معرّف المراجعة الملغاة (أو null). بيتنادى
   * قبل createReview مباشرة عشان يحرّر الـ Partial Unique Index.
   */
  static async supersedeActiveReview(projectId: string, actorId?: string): Promise<string | null> {
    const supabase = createServiceClient();
    const { data: active } = await supabase
      .from("engineering_reviews")
      .select("*")
      .eq("project_id", projectId)
      .in("review_status", ["queued", "running"])
      .maybeSingle();
    if (!active) return null;

    await EngineeringQAEngine.cancelReviewInternal(supabase, active as EngineeringReview, {
      actorId,
      reason: "superseded_by_newer_review",
      superseded: true,
    });
    return (active as EngineeringReview).id;
  }

  /** يربط المراجعة الملغاة بالمراجعة الأحدث اللي استبدلتها (للتتبّع في History). */
  static async linkSuperseded(oldReviewId: string, newReviewId: string): Promise<void> {
    const supabase = createServiceClient();
    await supabase.from("engineering_reviews").update({ superseded_by_review_id: newReviewId }).eq("id", oldReviewId);
  }

  static async getState(projectId: string): Promise<{
    reviews: EngineeringReview[];
    currentReview: EngineeringReview | null;
    stages: EngineeringReviewStage[];
    results: EngineeringStageResult[];
    certificate: EngineeringCertificate | null;
    events: EngineeringReviewEvent[];
  }> {
    const supabase = createServiceClient();
    const { data: reviews } = await supabase
      .from("engineering_reviews")
      .select("*")
      .eq("project_id", projectId)
      .order("review_number", { ascending: false });
    const reviewList = (reviews ?? []) as EngineeringReview[];
    const currentReview = reviewList[0] ?? null;

    if (!currentReview) {
      return { reviews: reviewList, currentReview: null, stages: [], results: [], certificate: null, events: [] };
    }

    const [stages, results, certificate, events] = await Promise.all([
      getStagesForReview(supabase, currentReview.id),
      supabase.from("engineering_stage_results").select("*").eq("review_id", currentReview.id),
      supabase.from("engineering_certificates").select("*").eq("review_id", currentReview.id).maybeSingle(),
      supabase
        .from("engineering_review_events")
        .select("*")
        .eq("review_id", currentReview.id)
        .order("created_at", { ascending: false })
        .limit(50),
    ]);

    return {
      reviews: reviewList,
      currentReview,
      stages,
      results: (results.data ?? []) as EngineeringStageResult[],
      certificate: (certificate.data as EngineeringCertificate | null) ?? null,
      events: (events.data ?? []) as EngineeringReviewEvent[],
    };
  }
}
