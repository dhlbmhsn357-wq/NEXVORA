import type { SupabaseClient } from "@supabase/supabase-js";
import { createServiceClient } from "@/lib/supabase/service";
import type { BrainReviewComment } from "@/lib/types/database";

/**
 * تعليقات Brain Review — Threaded (parent_comment_id)، عامة على
 * المستند (review_object_id = null) أو مربوطة بعنصر مراجعة محدد.
 * الإشارات (@mentions) بتتخزّن كـ IDs جاهزة (المُختارة من واجهة الاختيار
 * جانب العميل) — مفيش استخراج نص خام هنا، عشان نتجنّب مطابقة أسماء هشة.
 * ربط الإشعارات الفعلي بنظام Notifications المُقام على مصالحة مصادر حية
 * (lib/notifications/reconciliation-service.ts) مؤجّل — التعليقات نفسها
 * ظاهرة في الواجهة فورًا، التوسّع المستقبلي موثّق في التقرير النهائي.
 */
export async function addReviewComment(input: {
  documentId: string;
  projectId: string;
  reviewObjectId: string | null;
  parentCommentId: string | null;
  authorId: string | null;
  body: string;
  mentions?: string[];
}): Promise<{ ok: boolean; message?: string; commentId?: string }> {
  if (!input.body.trim()) return { ok: false, message: "التعليق فارغ." };
  const supabase = createServiceClient();

  const { data: inserted, error } = await supabase
    .from("brain_review_comments")
    .insert({
      document_id: input.documentId,
      project_id: input.projectId,
      review_object_id: input.reviewObjectId,
      parent_comment_id: input.parentCommentId,
      author_id: input.authorId,
      body: input.body.trim(),
      mentions: input.mentions ?? [],
    })
    .select("id")
    .single();
  if (error || !inserted) return { ok: false, message: error?.message ?? "فشل إضافة التعليق." };

  await supabase.from("brain_review_events").insert({
    document_id: input.documentId,
    project_id: input.projectId,
    event_type: "comment_added",
    actor_id: input.authorId,
    review_object_id: input.reviewObjectId,
    payload: { comment_id: inserted.id },
  });

  return { ok: true, commentId: inserted.id };
}

export async function setCommentResolved(
  commentId: string,
  resolved: boolean,
  actorId: string | null
): Promise<{ ok: boolean; message?: string }> {
  const supabase = createServiceClient();
  const { data: current } = await supabase.from("brain_review_comments").select("*").eq("id", commentId).maybeSingle();
  if (!current) return { ok: false, message: "التعليق غير موجود." };

  await supabase
    .from("brain_review_comments")
    .update({
      is_resolved: resolved,
      resolved_by: resolved ? actorId : null,
      resolved_at: resolved ? new Date().toISOString() : null,
    })
    .eq("id", commentId);

  if (resolved) {
    await supabase.from("brain_review_events").insert({
      document_id: current.document_id,
      project_id: current.project_id,
      event_type: "comment_resolved",
      actor_id: actorId,
      review_object_id: current.review_object_id,
      payload: { comment_id: commentId },
    });
  }

  return { ok: true };
}

export async function getReviewComments(supabase: SupabaseClient, documentId: string): Promise<BrainReviewComment[]> {
  const { data } = await supabase.from("brain_review_comments").select("*").eq("document_id", documentId).order("created_at", { ascending: true });
  return (data as BrainReviewComment[] | null) ?? [];
}
