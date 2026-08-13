import type { SupabaseClient } from "@supabase/supabase-js";
import { createServiceClient } from "@/lib/supabase/service";
import { mapAnalysisToBrainContent } from "./mapper";
import { computeBrainCompleteness } from "./completeness";
import type { DiscoveryAnalysisOutput } from "@/lib/discovery-analysis/types";
import type { BrainContent, BrainDocumentRow, BrainSectionKey } from "./types";
import { BRAIN_SECTION_LABELS } from "./types";
import { describeMerge, mergeBrainContentAdditive } from "./incremental-merge";
import { recordIncrement, type IncrementSourceType } from "@/lib/increments/service";
import {
  checkApprovalGate,
  computeReadinessScore,
  pruneRejectedAssumptions,
} from "./readiness";
import { markStaleReviewObjects, getReviewGateInputs } from "./review-objects-service";
import type {
  AssumptionDispositionsMap,
  MissingInfoDispositionsMap,
  SectionReviewsMap,
} from "./review-types";

const DOC_COLUMNS =
  "id, project_id, version, status, content, completeness_score, based_on_analysis_id, previous_version, change_summary, created_by, approved_by, approved_at, rejected_by, rejected_at, rejection_reason, created_at, updated_at, section_reviews, missing_info_dispositions, assumption_dispositions, issue_dispositions, readiness_score, review_started_at, review_started_by, changes_requested_at, changes_requested_by, changes_requested_reason";

/**
 * جلب آخر Brain Document للمشروع (بأعلى version). ممكن يبقى draft أو approved.
 */
export async function getLatestBrainDocument(
  supabase: SupabaseClient,
  projectId: string
): Promise<BrainDocumentRow | null> {
  const { data } = await supabase
    .from("project_brain_documents")
    .select(DOC_COLUMNS)
    .eq("project_id", projectId)
    .order("version", { ascending: false })
    .limit(1)
    .maybeSingle();
  return (data as BrainDocumentRow) ?? null;
}

/**
 * آخر نسخة Approved (تُستخدم كأساس للمقارنة عند إنشاء Draft جديد).
 */
export async function getLatestApprovedBrain(
  supabase: SupabaseClient,
  projectId: string
): Promise<BrainDocumentRow | null> {
  const { data } = await supabase
    .from("project_brain_documents")
    .select(DOC_COLUMNS)
    .eq("project_id", projectId)
    .eq("status", "approved")
    .order("version", { ascending: false })
    .limit(1)
    .maybeSingle();
  return (data as BrainDocumentRow) ?? null;
}

/**
 * كل النسخ للمشروع (لعرض تاريخ + diff بين نسختين).
 */
export async function listBrainVersions(
  supabase: SupabaseClient,
  projectId: string
): Promise<BrainDocumentRow[]> {
  const { data } = await supabase
    .from("project_brain_documents")
    .select(DOC_COLUMNS)
    .eq("project_id", projectId)
    .order("version", { ascending: false });
  return (data ?? []) as BrainDocumentRow[];
}

export async function getBrainDocumentById(
  supabase: SupabaseClient,
  id: string
): Promise<BrainDocumentRow | null> {
  const { data } = await supabase
    .from("project_brain_documents")
    .select(DOC_COLUMNS)
    .eq("id", id)
    .maybeSingle();
  return (data as BrainDocumentRow) ?? null;
}

async function nextVersion(supabase: SupabaseClient, projectId: string): Promise<number> {
  const { data } = await supabase
    .from("project_brain_documents")
    .select("version")
    .eq("project_id", projectId)
    .order("version", { ascending: false })
    .limit(1)
    .maybeSingle();
  return ((data?.version as number | undefined) ?? 0) + 1;
}

/**
 * ينشئ draft جديد بناءً على analysis. لا يستدعي AI — pure mapping.
 * إذا كان فيه draft قائم لنفس المشروع، يعيد استخدامه بدل ما ينشئ
 * draft ثاني (نظام "draft واحد نشط" أوضح لـ PM).
 *
 * `mode` بيحدّد إزاي بنتعامل مع الـ Draft القائم:
 * - `"merge"` (الافتراضي) — دمج إضافي: المعلومة الجديدة تتضاف والقديمة
 *   تفضل. ده اللازم لما جلسة اكتشاف تانية أو اجتماع جديد يوصل، لأن
 *   الاستبدال الكامل كان بيدوس على تعديلات الـ PM اليدوية وعلى التوصيات
 *   المعتمدة اللي اتكتبت في الـ Brain.
 * - `"replace"` — إعادة بناء كاملة. للطلب الصريح بس (زرار "إعادة البناء
 *   من التحليل")، مش للتشغيل التلقائي.
 */
export async function createBrainDraftFromAnalysis(
  projectId: string,
  analysisId: string,
  analysis: DiscoveryAnalysisOutput,
  actorId: string | null,
  options?: {
    mode?: "merge" | "replace";
    sourceLabel?: string;
    /** نوع المصدر — بيتسجّل في سجل الزيادات عشان نعرف الجديد جه منين. */
    sourceType?: IncrementSourceType;
    sourceRefId?: string | null;
  }
): Promise<
  | { ok: true; documentId: string; version: number; addedItems: number }
  | { ok: false; message: string }
> {
  const supabase = createServiceClient();
  const mode = options?.mode ?? "merge";
  const sourceLabel = options?.sourceLabel ?? "تحليل جديد";

  const incoming = mapAnalysisToBrainContent(analysis);

  // هل فيه draft حالي؟
  const { data: existingDraft } = await supabase
    .from("project_brain_documents")
    .select("id, version, previous_version, content")
    .eq("project_id", projectId)
    .eq("status", "draft")
    .order("version", { ascending: false })
    .limit(1)
    .maybeSingle();

  const latestApproved = await getLatestApprovedBrain(supabase, projectId);
  const previousVersion = latestApproved?.version ?? null;

  if (existingDraft) {
    const existingContent = existingDraft.content as BrainContent | null;

    let content: BrainContent;
    let changeSummary: string;
    let addedItems: number;

    if (mode === "replace" || !existingContent) {
      content = incoming;
      changeSummary = "إعادة بناء كاملة من AI Analysis";
      addedItems = 0;
    } else {
      const result = mergeBrainContentAdditive(existingContent, incoming, new Date().toISOString());
      content = result.merged;
      changeSummary = describeMerge(result, BRAIN_SECTION_LABELS, sourceLabel);
      addedItems = result.totalAdded;

      // تسجيل الزيادة كوحدة مستقلة — ده اللي بيخلّي المراحل اللي بعد كده
      // (قسم PRD جديد، برومت للمرحلة الجديدة، اختبار مخصّص لها) تشتغل على
      // الجزء الجديد بس. الفشل هنا مابيوقفش الدمج نفسه.
      if (result.totalAdded > 0) {
        await recordIncrement({
          projectId,
          title: sourceLabel,
          sourceType: options?.sourceType ?? "manual",
          sourceRefId: options?.sourceRefId ?? null,
          summary: changeSummary,
          delta: result.addedItems,
          addedCount: result.totalAdded,
          brainDocumentId: existingDraft.id,
          brainVersion: existingDraft.version,
          actorId,
        });
      }
    }

    const { error } = await supabase
      .from("project_brain_documents")
      .update({
        content,
        completeness_score: computeBrainCompleteness(content),
        based_on_analysis_id: analysisId,
        previous_version: previousVersion,
        change_summary: changeSummary,
      })
      .eq("id", existingDraft.id);
    if (error) return { ok: false, message: error.message };
    return { ok: true, documentId: existingDraft.id, version: existingDraft.version, addedItems };
  }

  const content = incoming;
  const completeness = computeBrainCompleteness(content);

  const v = await nextVersion(supabase, projectId);
  const { data, error } = await supabase
    .from("project_brain_documents")
    .insert({
      project_id: projectId,
      version: v,
      status: "draft",
      content,
      completeness_score: completeness,
      based_on_analysis_id: analysisId,
      previous_version: previousVersion,
      change_summary: "أُنشئ من AI Analysis",
      created_by: actorId,
    })
    .select("id")
    .single();
  if (error || !data) return { ok: false, message: error?.message ?? "تعذّر إنشاء الـ Draft." };
  return { ok: true, documentId: data.id, version: v, addedItems: 0 };
}

/**
 * اعتماد Draft — يحوّله إلى approved وينقل الـ approved السابق إلى archived.
 */
export async function approveBrainDocument(
  documentId: string,
  actorId: string | null
): Promise<{ ok: boolean; message?: string }> {
  const supabase = createServiceClient();

  const { data: doc } = await supabase
    .from("project_brain_documents")
    .select(
      "id, project_id, status, content, section_reviews, missing_info_dispositions, assumption_dispositions"
    )
    .eq("id", documentId)
    .maybeSingle();
  if (!doc) return { ok: false, message: "الوثيقة غير موجودة." };
  if (doc.status !== "draft" && doc.status !== "in_review") {
    return { ok: false, message: "لا يمكن اعتماد وثيقة غير draft/in_review." };
  }

  const content = doc.content as BrainContent;
  const section_reviews = (doc.section_reviews as SectionReviewsMap) ?? {};
  const missing_info_dispositions =
    (doc.missing_info_dispositions as MissingInfoDispositionsMap) ?? {};
  const assumption_dispositions =
    (doc.assumption_dispositions as AssumptionDispositionsMap) ?? {};

  const [{ count: pendingRecommendationsCount }, reviewGateInputs] = await Promise.all([
    supabase
      .from("project_recommendations")
      .select("id", { count: "exact", head: true })
      .eq("project_id", doc.project_id)
      .eq("status", "suggested"),
    getReviewGateInputs(supabase, documentId),
  ]);

  // بوابة اعتماد Phase 4C — لا يمكن الاعتماد لو فيه blockers (+ Phase 4 SR: توصيات معلّقة + Phase 5 BR: مراجعة فردية/تحقّق/إعادة تحقّق)
  const gate = checkApprovalGate({
    content,
    sectionReviews: section_reviews,
    missingInfoDispositions: missing_info_dispositions,
    assumptionDispositions: assumption_dispositions,
    pendingRecommendationsCount: pendingRecommendationsCount ?? 0,
    pendingReviewObjectsCount: reviewGateInputs.pendingReviewObjectsCount,
    criticalValidationIssuesCount: reviewGateInputs.criticalValidationIssuesCount,
    needsRevalidationCount: reviewGateInputs.needsRevalidationCount,
  });
  if (!gate.canApprove) {
    return { ok: false, message: gate.blockers.join(" · ") };
  }

  // إزالة الافتراضات المرفوضة قبل الحفظ النهائي
  const finalContent = pruneRejectedAssumptions(content, assumption_dispositions);
  const completeness = computeBrainCompleteness(finalContent);
  const readiness = computeReadinessScore({
    completeness,
    content: finalContent,
    sectionReviews: section_reviews,
    missingInfoDispositions: missing_info_dispositions,
    assumptionDispositions: assumption_dispositions,
  });

  const nowIso = new Date().toISOString();
  // أرشف الـ approved القديم
  await supabase
    .from("project_brain_documents")
    .update({ status: "archived" })
    .eq("project_id", doc.project_id)
    .eq("status", "approved");

  const { error } = await supabase
    .from("project_brain_documents")
    .update({
      status: "approved",
      content: finalContent,
      completeness_score: completeness,
      readiness_score: readiness.score,
      approved_by: actorId,
      approved_at: nowIso,
      rejected_by: null,
      rejected_at: null,
      rejection_reason: null,
    })
    .eq("id", documentId);
  if (error) return { ok: false, message: error.message };
  return { ok: true };
}

/**
 * رفض Draft — لا يُكتب فوق أي شيء، يبقى محفوظًا بحالة rejected.
 * الـ approved الحالي يبقى كما هو دون تغيير.
 */
export async function rejectBrainDocument(
  documentId: string,
  actorId: string | null,
  reason: string
): Promise<{ ok: boolean; message?: string }> {
  const supabase = createServiceClient();
  const { data: doc } = await supabase
    .from("project_brain_documents")
    .select("status")
    .eq("id", documentId)
    .maybeSingle();
  if (!doc) return { ok: false, message: "الوثيقة غير موجودة." };
  if (doc.status !== "draft") return { ok: false, message: "لا يمكن رفض وثيقة غير draft." };

  const { error } = await supabase
    .from("project_brain_documents")
    .update({
      status: "rejected",
      rejected_by: actorId,
      rejected_at: new Date().toISOString(),
      rejection_reason: reason.trim() || null,
    })
    .eq("id", documentId);
  if (error) return { ok: false, message: error.message };
  return { ok: true };
}

/**
 * تعديل قسم واحد داخل الوثيقة — بحماية Conflict Detection عن طريق
 * expectedUpdatedAt (optimistic lock). لو حد ثاني عدّل بين الوقتين → رفض.
 */
export async function editBrainSection(input: {
  documentId: string;
  sectionKey: BrainSectionKey;
  newContent: unknown;
  expectedUpdatedAt: string;
  reason: string | null;
  actorId: string | null;
}): Promise<{ ok: boolean; message?: string; conflict?: boolean }> {
  const supabase = createServiceClient();

  const { data: doc } = await supabase
    .from("project_brain_documents")
    .select("id, project_id, status, content, updated_at")
    .eq("id", input.documentId)
    .maybeSingle();
  if (!doc) return { ok: false, message: "الوثيقة غير موجودة." };
  if (doc.status !== "draft" && doc.status !== "in_review") {
    return { ok: false, message: "التعديل مسموح على draft/in_review فقط. أنشئ draft جديد أولاً." };
  }
  if (doc.updated_at !== input.expectedUpdatedAt) {
    return { ok: false, message: "تم تعديل الوثيقة بواسطة شخص آخر — أعد التحميل أولاً.", conflict: true };
  }

  const content = doc.content as BrainContent;
  const before = content[input.sectionKey];
  const now = new Date().toISOString();

  const nextSection = {
    ...before,
    content: input.newContent,
    meta: {
      ...before.meta,
      source: "pm_manual_edit" as const,
      last_updated: now,
    },
  };

  const nextContent = { ...content, [input.sectionKey]: nextSection };
  const completeness = computeBrainCompleteness(nextContent);

  const { error } = await supabase
    .from("project_brain_documents")
    .update({ content: nextContent, completeness_score: completeness })
    .eq("id", input.documentId)
    .eq("updated_at", input.expectedUpdatedAt);
  if (error) return { ok: false, message: error.message };

  // recompute readiness بشكل منفصل بحيث ما تنكسرش لو نفس القسم في تعديل متزامن
  await recomputeReadiness(supabase, input.documentId);

  // Phase 5 — أي عنصر مراجعة اتغيّر محتواه (أو بيعتمد على عنصر اتغيّر) يتعلّم needs_revalidation.
  await markStaleReviewObjects(supabase, input.documentId, content, nextContent);

  // Audit trail
  await supabase.from("project_brain_edits").insert({
    document_id: input.documentId,
    project_id: doc.project_id,
    section_key: input.sectionKey,
    before_value: before.content,
    after_value: input.newContent,
    reason: input.reason,
    edited_by: input.actorId,
  });

  return { ok: true };
}

/**
 * إعادة حساب readiness من الحالة الكاملة للوثيقة (بعد تعديل قسم أو
 * تغيير disposition). لا يمس updated_at لأنه internal recompute.
 */
export async function recomputeReadiness(
  supabase: SupabaseClient,
  documentId: string
): Promise<void> {
  const { data: doc } = await supabase
    .from("project_brain_documents")
    .select("content, section_reviews, missing_info_dispositions, assumption_dispositions, completeness_score")
    .eq("id", documentId)
    .maybeSingle();
  if (!doc) return;
  const readiness = computeReadinessScore({
    completeness: (doc.completeness_score as number) ?? 0,
    content: doc.content as BrainContent,
    sectionReviews: (doc.section_reviews as SectionReviewsMap) ?? {},
    missingInfoDispositions: (doc.missing_info_dispositions as MissingInfoDispositionsMap) ?? {},
    assumptionDispositions: (doc.assumption_dispositions as AssumptionDispositionsMap) ?? {},
  });
  await supabase
    .from("project_brain_documents")
    .update({ readiness_score: readiness.score })
    .eq("id", documentId);
}
