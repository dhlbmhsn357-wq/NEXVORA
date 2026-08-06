"use server";

import { revalidatePath } from "next/cache";
import { after } from "next/server";
import { requireAdmin, requireRole } from "@/lib/auth/rbac";
import {
  reviewSection,
  setMissingInfoDisposition,
  setAssumptionDisposition,
  requestBrainChanges,
  startBrainReview,
} from "@/lib/brain-v2/review-service";
import { runBrainReviewValidation } from "@/lib/brain-v2/review-validation-orchestrator";
import { getReviewObjects, getReviewObjectDependencies } from "@/lib/brain-v2/review-objects-service";
import { getReviewComments } from "@/lib/brain-v2/review-comments-service";
import { createServiceClient } from "@/lib/supabase/service";
import type {
  AssumptionDisposition,
  MissingInfoDisposition,
  SectionReviewState,
} from "@/lib/brain-v2/review-types";
import type { BrainSectionKey } from "@/lib/brain-v2/types";
import type { BrainReviewObject, BrainReviewObjectDependency, BrainReviewComment, BrainReviewValidationReport, BrainReviewEvent } from "@/lib/types/database";

type Ok = { ok: true };
type Err = { ok: false; message: string };
type Result = Ok | Err;

function authErr(m: string | undefined): Err {
  return { ok: false, message: m ?? "غير مسموح." };
}

/** بدء المراجعة — أي admin يقدر يبدأها، أي member يقدر يشارك بعدها. */
export async function startReviewAction(
  documentId: string,
  projectId: string
): Promise<Result> {
  const auth = await requireRole(["owner", "admin", "member"]);
  if (!auth.ok) return authErr(auth.message);
  const r = await startBrainReview(documentId, auth.userId ?? null);
  if (!r.ok) return { ok: false, message: r.message ?? "فشل بدء المراجعة." };

  // Phase 5 — تشغيل تحقّق AI تلقائيًا في الخلفية بمجرد بدء المراجعة.
  after(async () => {
    try {
      await runBrainReviewValidation(documentId, auth.userId ?? null);
    } catch (err) {
      console.error("[BrainReviewValidation background] failed:", err);
    }
  });

  revalidatePath(`/dashboard/projects/${projectId}`);
  return { ok: true };
}

/** إعادة تحقّق عند الطلب — بعد تعديل محتوى أو لو الـ PM حاب يتأكد من جديد. */
export async function runBrainReviewValidationAction(documentId: string, projectId: string): Promise<Result> {
  const auth = await requireRole(["owner", "admin", "member"]);
  if (!auth.ok) return authErr(auth.message);

  after(async () => {
    try {
      await runBrainReviewValidation(documentId, auth.userId ?? null);
    } catch (err) {
      console.error("[BrainReviewValidation background] failed:", err);
    }
    revalidatePath(`/dashboard/projects/${projectId}`);
  });

  return { ok: true };
}

export async function reviewSectionAction(input: {
  documentId: string;
  projectId: string;
  sectionKey: BrainSectionKey;
  state: SectionReviewState;
  reason: string | null;
}): Promise<Result> {
  const auth = await requireRole(["owner", "admin", "member"]);
  if (!auth.ok) return authErr(auth.message);
  const r = await reviewSection({
    documentId: input.documentId,
    sectionKey: input.sectionKey,
    state: input.state,
    reason: input.reason,
    actorId: auth.userId ?? null,
  });
  if (!r.ok) return { ok: false, message: r.message ?? "فشل حفظ المراجعة." };
  revalidatePath(`/dashboard/projects/${input.projectId}`);
  return { ok: true };
}

export async function setMissingInfoDispositionAction(input: {
  documentId: string;
  projectId: string;
  index: number;
  disposition: MissingInfoDisposition;
}): Promise<Result> {
  const auth = await requireRole(["owner", "admin", "member"]);
  if (!auth.ok) return authErr(auth.message);
  // نضيف by/at تلقائيًا بحيث الـ UI يرسل state فقط
  const now = new Date().toISOString();
  const disposition: MissingInfoDisposition =
    input.disposition.state === "pending"
      ? { state: "pending" }
      : { ...input.disposition, by: auth.userId ?? null, at: now };
  const r = await setMissingInfoDisposition({
    documentId: input.documentId,
    index: input.index,
    disposition,
  });
  if (!r.ok) return { ok: false, message: r.message ?? "فشل الحفظ." };
  revalidatePath(`/dashboard/projects/${input.projectId}`);
  return { ok: true };
}

export async function setAssumptionDispositionAction(input: {
  documentId: string;
  projectId: string;
  index: number;
  disposition: AssumptionDisposition;
}): Promise<Result> {
  const auth = await requireRole(["owner", "admin", "member"]);
  if (!auth.ok) return authErr(auth.message);
  const now = new Date().toISOString();
  const disposition: AssumptionDisposition =
    input.disposition.state === "pending"
      ? { state: "pending" }
      : { ...input.disposition, by: auth.userId ?? null, at: now };
  const r = await setAssumptionDisposition({
    documentId: input.documentId,
    index: input.index,
    disposition,
  });
  if (!r.ok) return { ok: false, message: r.message ?? "فشل الحفظ." };
  revalidatePath(`/dashboard/projects/${input.projectId}`);
  return { ok: true };
}

export interface BrainReviewV2State {
  objects: BrainReviewObject[];
  dependencies: BrainReviewObjectDependency[];
  comments: BrainReviewComment[];
  latestValidationReport: BrainReviewValidationReport | null;
  events: BrainReviewEvent[];
}

const EMPTY_REVIEW_V2_STATE: BrainReviewV2State = { objects: [], dependencies: [], comments: [], latestValidationReport: null, events: [] };

/** كل بيانات Phase 5 (عناصر المراجعة + الروابط + التعليقات + آخر تقرير تحقّق + سجل النشاط) لوثيقة واحدة — جلب مجمّع لصفحة المشروع. */
export async function getBrainReviewV2State(documentId: string | null): Promise<BrainReviewV2State> {
  if (!documentId) return EMPTY_REVIEW_V2_STATE;
  const auth = await requireRole(["owner", "admin", "member"]);
  if (!auth.ok) return EMPTY_REVIEW_V2_STATE;

  const supabase = createServiceClient();
  const [objects, dependencies, comments, { data: latestValidationReport }, { data: eventsRaw }] = await Promise.all([
    getReviewObjects(supabase, documentId),
    getReviewObjectDependencies(supabase, documentId),
    getReviewComments(supabase, documentId),
    supabase
      .from("brain_review_validation_reports")
      .select("*")
      .eq("document_id", documentId)
      .order("generated_at", { ascending: false })
      .limit(1)
      .maybeSingle(),
    supabase.from("brain_review_events").select("*").eq("document_id", documentId).order("created_at", { ascending: false }).limit(50),
  ]);

  return {
    objects,
    dependencies,
    comments,
    latestValidationReport: (latestValidationReport as BrainReviewValidationReport | null) ?? null,
    events: (eventsRaw as BrainReviewEvent[] | null) ?? [],
  };
}

/** Request Changes — فقط admin (نفس مستوى approve/reject). */
export async function requestBrainChangesAction(input: {
  documentId: string;
  projectId: string;
  reason: string;
}): Promise<Result> {
  const auth = await requireAdmin();
  if (!auth.ok) return authErr(auth.message);
  const r = await requestBrainChanges({
    documentId: input.documentId,
    reason: input.reason,
    actorId: auth.userId ?? null,
  });
  if (!r.ok) return { ok: false, message: r.message };
  revalidatePath(`/dashboard/projects/${input.projectId}`);
  return { ok: true };
}
