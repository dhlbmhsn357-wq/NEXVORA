import type { SupabaseClient } from "@supabase/supabase-js";
import type { BrainContent } from "./types";
import { enumerateReviewObjects, computeMissingReviewObjects, detectChangedItemKeys, cascadeRevalidation, isBlockingReviewState } from "./review-objects";
import { issueStableKey, type IssueDispositionsMap } from "./review-types";
import type { BrainReviewIssue, BrainReviewObject, BrainReviewObjectDependency, BrainReviewObjectState } from "@/lib/types/database";

/**
 * يزامن جدول brain_review_objects مع محتوى المستند الحالي — بيضيف صفوف
 * للعناصر الجديدة بحالة pending_review بس (مفيش حذف/تعديل لصفوف قديمة،
 * الأرشيف يفضل زي ما هو). Idempotent — استدعاء متكرر بلا أثر إضافي.
 */
export async function syncReviewObjectsForDocument(
  supabase: SupabaseClient,
  documentId: string,
  projectId: string,
  content: BrainContent
): Promise<void> {
  const enumerated = enumerateReviewObjects(content);
  const { data: existingRaw } = await supabase.from("brain_review_objects").select("*").eq("document_id", documentId);
  const existing = (existingRaw as BrainReviewObject[] | null) ?? [];

  const missing = computeMissingReviewObjects(enumerated, existing);
  if (missing.length === 0) return;

  const { data: inserted } = await supabase
    .from("brain_review_objects")
    .insert(
      missing.map((m) => ({
        document_id: documentId,
        project_id: projectId,
        section_key: m.section_key,
        item_key: m.item_key,
        item_title: m.item_title,
        state: "pending_review",
      }))
    )
    .select("id");

  if (inserted && inserted.length > 0) {
    await supabase.from("brain_review_events").insert(
      inserted.map((row) => ({
        document_id: documentId,
        project_id: projectId,
        event_type: "object_reviewed",
        review_object_id: row.id,
        payload: { action: "created", state: "pending_review" },
      }))
    );
  }
}

export async function getReviewObjects(supabase: SupabaseClient, documentId: string): Promise<BrainReviewObject[]> {
  const { data } = await supabase.from("brain_review_objects").select("*").eq("document_id", documentId).order("section_key");
  return (data as BrainReviewObject[] | null) ?? [];
}

export async function getReviewObjectDependencies(supabase: SupabaseClient, documentId: string): Promise<BrainReviewObjectDependency[]> {
  const { data } = await supabase.from("brain_review_object_dependencies").select("*").eq("document_id", documentId);
  return (data as BrainReviewObjectDependency[] | null) ?? [];
}

export interface ReviewGateInputs {
  pendingReviewObjectsCount: number;
  criticalValidationIssuesCount: number;
  needsRevalidationCount: number;
}

/** يجمّع مدخلات البوابة الثلاثة الجديدة (Phase 5) — يستخدمها checkApprovalGate في service.ts. */
export async function getReviewGateInputs(supabase: SupabaseClient, documentId: string): Promise<ReviewGateInputs> {
  const [{ data: objectsRaw }, { data: latestReport }, { data: doc }] = await Promise.all([
    supabase.from("brain_review_objects").select("state, needs_revalidation").eq("document_id", documentId),
    supabase
      .from("brain_review_validation_reports")
      .select("issues")
      .eq("document_id", documentId)
      .order("generated_at", { ascending: false })
      .limit(1)
      .maybeSingle(),
    supabase.from("project_brain_documents").select("issue_dispositions").eq("id", documentId).maybeSingle(),
  ]);
  const objects = (objectsRaw as Array<{ state: BrainReviewObjectState; needs_revalidation: boolean }> | null) ?? [];
  const issues = (latestReport?.issues as BrainReviewIssue[] | null) ?? [];
  const issueDispositions = (doc?.issue_dispositions as IssueDispositionsMap | null) ?? {};

  // مشكلة اتأجّلت/اتجوهلت بقرار صريح (سبب مسجّل) ما بتفضلش تمنع الاعتماد —
  // فقط اللي لسه pending (أو بدون قرار خالص) بتُحسب هنا.
  const blockingIssues = issues.filter((i) => {
    if (i.severity !== "critical" && i.severity !== "high") return false;
    const d = issueDispositions[issueStableKey(i)];
    return !d || d.state === "pending";
  });

  return {
    pendingReviewObjectsCount: objects.filter((o) => isBlockingReviewState(o.state)).length,
    criticalValidationIssuesCount: blockingIssues.length,
    needsRevalidationCount: objects.filter((o) => o.needs_revalidation).length,
  };
}

/**
 * تغيير حالة عنصر مراجعة — نسخة جديدة دايمًا (مفيش استبدال صامت)، وبيلغي
 * needs_revalidation لأن القرار الجديد ده مبني على المحتوى الحالي فعليًا.
 */
export async function setReviewObjectState(
  supabase: SupabaseClient,
  reviewObjectId: string,
  state: BrainReviewObjectState,
  reason: string | null,
  actorId: string | null
): Promise<void> {
  const { data: current } = await supabase.from("brain_review_objects").select("*").eq("id", reviewObjectId).maybeSingle();
  if (!current) return;

  const nextVersion = (current.version ?? 1) + 1;
  const nowIso = new Date().toISOString();

  await supabase
    .from("brain_review_objects")
    .update({
      state,
      reason,
      reviewer_id: actorId,
      reviewed_at: nowIso,
      version: nextVersion,
      needs_revalidation: false,
      revalidation_reason: null,
    })
    .eq("id", reviewObjectId);

  await supabase.from("brain_review_object_versions").insert({
    review_object_id: reviewObjectId,
    document_id: current.document_id,
    project_id: current.project_id,
    version: nextVersion,
    state,
    reason,
    snapshot: { ...current, state, reason },
    changed_by: actorId,
  });

  await supabase.from("brain_review_events").insert({
    document_id: current.document_id,
    project_id: current.project_id,
    event_type: "object_reviewed",
    actor_id: actorId,
    review_object_id: reviewObjectId,
    payload: { state, reason },
  });
}

/**
 * اعتماد الكل — دفعة من عناصر المراجعة الفردية دفعة واحدة. كل عنصر صف
 * مستقل (بلا مستند مشترك بيتقرا/يتكتب زي البنود المفتوحة)، فالتوازي هنا
 * آمن ومش هيتسبب في تدهيس كتابة فوق كتابة.
 */
export async function bulkSetReviewObjectState(
  supabase: SupabaseClient,
  reviewObjectIds: string[],
  state: BrainReviewObjectState,
  reason: string | null,
  actorId: string | null
): Promise<{ resolvedCount: number }> {
  await Promise.all(reviewObjectIds.map((id) => setReviewObjectState(supabase, id, state, reason, actorId)));
  return { resolvedCount: reviewObjectIds.length };
}

/**
 * بيتشغّل عند تعديل قسم/إنشاء Draft جديد من نسخة اتراجعت — بيكتشف أي
 * عنصر اتغيّر محتواه (بإعادة استخدام diffBrainContents) وبيعلّمه هو + أي
 * عنصر تاني بيعتمد عليه (قفزة واحدة) بـ needs_revalidation، عشان "مفيش
 * اعتماد صامت لمعرفة قديمة".
 */
export async function markStaleReviewObjects(
  supabase: SupabaseClient,
  documentId: string,
  oldContent: BrainContent,
  newContent: BrainContent
): Promise<void> {
  const changedKeys = detectChangedItemKeys(oldContent, newContent);
  if (changedKeys.length === 0) return;

  const [objects, dependencies] = await Promise.all([
    getReviewObjects(supabase, documentId),
    getReviewObjectDependencies(supabase, documentId),
  ]);
  if (objects.length === 0) return;

  const changedKeySet = new Set(changedKeys.map((c) => `${c.section_key}::${c.item_key}`));
  const directlyChangedIds = new Set(
    objects.filter((o) => o.state !== "pending_review" && changedKeySet.has(`${o.section_key}::${o.item_key}`)).map((o) => o.id)
  );
  if (directlyChangedIds.size === 0) return;

  const allFlaggedIds = cascadeRevalidation(directlyChangedIds, dependencies);
  const byId = new Map(objects.map((o) => [o.id, o]));

  for (const id of allFlaggedIds) {
    const isDirectlyChanged = directlyChangedIds.has(id);
    const reason = isDirectlyChanged ? "المحتوى تغيّر منذ آخر مراجعة." : "يعتمد على عنصر تغيّر محتواه منذ آخر مراجعة.";
    await supabase.from("brain_review_objects").update({ needs_revalidation: true, revalidation_reason: reason }).eq("id", id);
    const obj = byId.get(id);
    await supabase.from("brain_review_events").insert({
      document_id: documentId,
      project_id: obj?.project_id,
      event_type: "revalidation_triggered",
      review_object_id: id,
      payload: { reason },
    });
  }
}
