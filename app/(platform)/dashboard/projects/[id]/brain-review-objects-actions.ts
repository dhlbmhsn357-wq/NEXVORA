"use server";

import { revalidatePath } from "next/cache";
import { requireRole } from "@/lib/auth/rbac";
import { setReviewObjectState } from "@/lib/brain-v2/review-objects-service";
import { addReviewComment, setCommentResolved } from "@/lib/brain-v2/review-comments-service";
import { createServiceClient } from "@/lib/supabase/service";
import type { BrainReviewObjectState } from "@/lib/types/database";

type Result = { ok: true } | { ok: false; message: string };

function authErr(m: string | undefined): Result {
  return { ok: false, message: m ?? "غير مسموح." };
}

export async function setReviewObjectStateAction(
  reviewObjectId: string,
  projectId: string,
  state: BrainReviewObjectState,
  reason: string | null
): Promise<Result> {
  const auth = await requireRole(["owner", "admin", "member"]);
  if (!auth.ok) return authErr(auth.message);
  await setReviewObjectState(createServiceClient(), reviewObjectId, state, reason, auth.userId ?? null);
  revalidatePath(`/dashboard/projects/${projectId}`);
  return { ok: true };
}

export async function addReviewCommentAction(input: {
  documentId: string;
  projectId: string;
  reviewObjectId: string | null;
  parentCommentId: string | null;
  body: string;
  mentions?: string[];
}): Promise<Result> {
  const auth = await requireRole(["owner", "admin", "member"]);
  if (!auth.ok) return authErr(auth.message);
  const r = await addReviewComment({
    documentId: input.documentId,
    projectId: input.projectId,
    reviewObjectId: input.reviewObjectId,
    parentCommentId: input.parentCommentId,
    authorId: auth.userId ?? null,
    body: input.body,
    mentions: input.mentions,
  });
  if (!r.ok) return { ok: false, message: r.message ?? "فشل إضافة التعليق." };
  revalidatePath(`/dashboard/projects/${input.projectId}`);
  return { ok: true };
}

export async function setCommentResolvedAction(commentId: string, projectId: string, resolved: boolean): Promise<Result> {
  const auth = await requireRole(["owner", "admin", "member"]);
  if (!auth.ok) return authErr(auth.message);
  const r = await setCommentResolved(commentId, resolved, auth.userId ?? null);
  if (!r.ok) return { ok: false, message: r.message ?? "فشلت العملية." };
  revalidatePath(`/dashboard/projects/${projectId}`);
  return { ok: true };
}
