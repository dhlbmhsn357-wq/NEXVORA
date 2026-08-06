"use server";

import { revalidatePath } from "next/cache";
import { after } from "next/server";
import { createClient } from "@/lib/supabase/server";
import {
  createBatch,
  listBatches,
  listGaps,
  listItems,
  listSources,
  processNextSource,
  registerSource,
  retryAllFailedSources,
  retrySource,
  type KnowledgeBatch,
  type KnowledgeGap,
  type KnowledgeItem,
  type KnowledgeSource,
  type RegisterSourceInput,
  type RegisterSourceResult,
} from "@/lib/knowledge-hub/service";
import { routeIngest } from "@/lib/knowledge-hub/ingest-router";
import {
  enrichNextCategory,
  listConflicts,
  listRelations,
  type KnowledgeConflict,
  type KnowledgeRelation,
} from "@/lib/knowledge-hub/enrichment-service";
import { runSynthesis, type SynthesisSummary } from "@/lib/knowledge-hub/synthesis-service";
import {
  applyProposalsToBrain,
  rejectProposal,
} from "@/lib/knowledge-hub/brain-apply-service";

async function getActorId(): Promise<string | null> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  return user?.id ?? null;
}

export interface KnowledgeHubState {
  batches: KnowledgeBatch[];
  sources: KnowledgeSource[];
  items: KnowledgeItem[];
  gaps: KnowledgeGap[];
  relations: KnowledgeRelation[];
  conflicts: KnowledgeConflict[];
}

/** الحالة الكاملة للمرحلة — للعرض الأولي وللـ Polling. */
export async function getKnowledgeHubState(projectId: string): Promise<KnowledgeHubState> {
  const supabase = await createClient();
  const [batches, sources, items, gaps, relations, conflicts] = await Promise.all([
    listBatches(supabase, projectId),
    listSources(supabase, projectId),
    listItems(supabase, projectId),
    listGaps(supabase, projectId),
    listRelations(supabase, projectId),
    listConflicts(supabase, projectId),
  ]);
  return { batches, sources, items, gaps, relations, conflicts };
}

export async function createKnowledgeBatch(
  projectId: string,
  title: string
): Promise<{ ok: true; batchId: string; version: number } | { ok: false; message: string }> {
  const actorId = await getActorId();
  const batch = await createBatch(projectId, title, actorId);
  if (!batch) {
    return {
      ok: false,
      message: "جداول Knowledge Hub غير متاحة بعد — طبّق هجرة 0071 في محرر SQL بـ Supabase.",
    };
  }
  revalidatePath(`/dashboard/projects/${projectId}`);
  return { ok: true, batchId: batch.id, version: batch.version };
}

export async function registerKnowledgeSource(
  input: Omit<RegisterSourceInput, "actorId">
): Promise<RegisterSourceResult> {
  const actorId = await getActorId();
  const result = await registerSource({ ...input, actorId });
  revalidatePath(`/dashboard/projects/${input.projectId}`);
  return result;
}

export type KnowledgeProcessResult =
  | { status: "idle" }
  | { status: "processed"; done: boolean; itemsAdded: number }
  | { status: "failed"; message: string };

/**
 * يدفع المعالجة خطوة واحدة للأمام: مصدر واحد (أو دفعة مقاطع منه).
 *
 * الواجهة هي اللي بتستدعي ده بالتكرار — نفس نمط خط برومتات النموذج
 * الأولي. الغرض إن كل استدعاء يفضل جوّه حد وقت التنفيذ الآمن على
 * Vercel حتى لو المشروع فيه مئات الملفات.
 */
export async function advanceKnowledgeProcessing(
  projectId: string
): Promise<KnowledgeProcessResult> {
  const actorId = await getActorId();

  const outcome = await processNextSource(projectId, actorId);
  revalidatePath(`/dashboard/projects/${projectId}`);

  if (outcome.status === "idle") return { status: "idle" };
  if (outcome.status === "failed") return { status: "failed", message: outcome.message };
  return { status: "processed", done: outcome.done, itemsAdded: outcome.itemsAdded };
}

/**
 * يشغّل المعالجة في الخلفية بعد الرفع مباشرةً، عشان المستخدم ما يضطرش
 * يستنى على الصفحة. الواجهة برضه بتتابع وتدفع الباقي بالـ Polling.
 */
export async function startKnowledgeProcessing(projectId: string): Promise<void> {
  const actorId = await getActorId();

  // الطابور أولًا: عامل بلا حد زمني أنسب من دالة Vercel لملف قد يستغرق
  // دقائق. لو مفيش عامل حيّ، الموجّه بيرجّع `inline` والمعالجة بتشتغل
  // هنا زي ما كانت — الرجوع ده هو المسار اللي شغّال النهارده، لا تراجع.
  after(async () => {
    try {
      const route = await routeIngest({
        projectId,
        // النوع الحقيقي بيتحدّد من المصدر جوّه العامل. `document` هنا
        // اختيار المجموعة الأعمّ للتوجيه المبدئي.
        sourceType: "pdf",
        actorId,
      });

      if (route.path === "queue") return;

      console.warn(`[KnowledgeHub] معالجة مباشرة — ${route.reason}`);
      await processNextSource(projectId, actorId);
    } catch (err) {
      console.error("[KnowledgeHub background] failed:", err);
    }
  });

  revalidatePath(`/dashboard/projects/${projectId}`);
}

/** تحديث حالة فجوة معرفية — قرار بشري صريح من الواجهة. */
export async function setKnowledgeGapStatus(
  projectId: string,
  gapId: string,
  status: "open" | "answered" | "converted_to_question" | "ignored",
  note: string
): Promise<{ ok: boolean; message?: string }> {
  const supabase = await createClient();
  const { error } = await supabase
    .from("knowledge_gaps")
    .update({ status, resolution_note: note || null })
    .eq("id", gapId);
  if (error) return { ok: false, message: error.message };
  revalidatePath(`/dashboard/projects/${projectId}`);
  return { ok: true };
}

export type KnowledgeEnrichResult =
  | { status: "idle" }
  | {
      status: "enriched";
      category: string;
      mergedCount: number;
      relationsAdded: number;
      conflictsAdded: number;
      remainingCategories: number;
    }
  | { status: "failed"; message: string };

/**
 * يدفع الإثراء خطوة واحدة: تصنيف واحد (دمج التكرار + العلاقات +
 * التعارضات + المصطلحات). الواجهة بتستدعيه بالتكرار لحد ما يرجّع `idle`.
 */
export async function advanceKnowledgeEnrichment(
  projectId: string
): Promise<KnowledgeEnrichResult> {
  const actorId = await getActorId();
  const outcome = await enrichNextCategory(projectId, actorId);
  revalidatePath(`/dashboard/projects/${projectId}`);

  if (outcome.status === "idle") return { status: "idle" };
  if (outcome.status === "failed") {
    return { status: "failed", message: outcome.message ?? "فشل الإثراء." };
  }
  return {
    status: "enriched",
    category: outcome.category ?? "",
    mergedCount: outcome.mergedCount ?? 0,
    relationsAdded: outcome.relationsAdded ?? 0,
    conflictsAdded: outcome.conflictsAdded ?? 0,
    remainingCategories: outcome.remainingCategories ?? 0,
  };
}

/** حسم تعارض — قرار بشري صريح، الذكاء الاصطناعي بيرصد بس مابيحسمش. */
export async function resolveKnowledgeConflict(
  projectId: string,
  conflictId: string,
  status: "resolved_left" | "resolved_right" | "resolved_other" | "ignored",
  note: string
): Promise<{ ok: boolean; message?: string }> {
  const supabase = await createClient();
  const { error } = await supabase
    .from("knowledge_conflicts")
    .update({ status, resolution_note: note || null })
    .eq("id", conflictId);
  if (error) return { ok: false, message: error.message };
  revalidatePath(`/dashboard/projects/${projectId}`);
  return { ok: true };
}

export type KnowledgeSynthesisResult =
  | { status: "not_ready"; message: string }
  | { status: "done"; summary: SynthesisSummary }
  | { status: "failed"; message: string };

/**
 * التوليف والتحقق المتقاطع.
 *
 * استدعاء واحد للمشروع كله (مش تصنيفًا تصنيفًا زي الإثراء): المقارنة
 * بالـ Brain وقرارات الاجتماعات لازم تشوف المعرفة مجتمعة، وتقسيمها
 * كان هيخلّي كل جزء يقترح حاجات متكرّرة مش شايف بعضه.
 */
export async function runKnowledgeSynthesis(
  projectId: string
): Promise<KnowledgeSynthesisResult> {
  const actorId = await getActorId();
  const outcome = await runSynthesis(projectId, actorId);
  revalidatePath(`/dashboard/projects/${projectId}`);

  if (outcome.status === "not_ready") return { status: "not_ready", message: outcome.message };
  if (outcome.status === "failed") return { status: "failed", message: outcome.message };
  return { status: "done", summary: outcome.summary };
}

export type ApplyProposalsResult = {
  status: "no_draft" | "nothing_to_apply" | "applied" | "failed";
  message: string;
  addedItems: number;
};

/**
 * اعتماد مقترحات مركز المعرفة وإدخالها الـ Brain إضافيًا.
 *
 * `proposalIds` بـ `null` معناه "اعتمد كل المعلّق". الاعتماد بيسجّل زيادة
 * مستقلة، فبيقدر يتولّد له قسم PRD خاص وبرومت خاص من غير إعادة بناء.
 */
export async function applyKnowledgeProposals(
  projectId: string,
  proposalIds: string[] | null
): Promise<ApplyProposalsResult> {
  const actorId = await getActorId();
  const outcome = await applyProposalsToBrain(projectId, proposalIds, actorId);
  revalidatePath(`/dashboard/projects/${projectId}`);

  return {
    status: outcome.status,
    message: outcome.message ?? "تم الاعتماد.",
    addedItems: outcome.addedItems ?? 0,
  };
}

/** رفض مقترح — قرار بشري، المقترح مايدخلش الـ Brain ومايظهرش تاني. */
export async function rejectKnowledgeProposal(
  projectId: string,
  proposalId: string
): Promise<{ ok: boolean; message?: string }> {
  const result = await rejectProposal(proposalId);
  revalidatePath(`/dashboard/projects/${projectId}`);
  return result;
}

/**
 * إعادة محاولة مصدر فشل تحليله.
 *
 * لازمة لأن بصمة المحتوى بتمنع رفع نفس الملف تاني — فإعادة الرفع مش
 * بتصلّح المصدر الفاشل، وإعادة المحاولة هي المسار الوحيد.
 */
export async function retryKnowledgeSource(
  projectId: string,
  sourceId: string
): Promise<{ retried: number; message: string }> {
  const result = await retrySource(projectId, sourceId);
  if (result.retried > 0) await startKnowledgeProcessing(projectId);
  revalidatePath(`/dashboard/projects/${projectId}`);
  return result;
}

/** إعادة محاولة كل المصادر الفاشلة دفعة واحدة. */
export async function retryAllKnowledgeFailures(
  projectId: string
): Promise<{ retried: number; message: string }> {
  const result = await retryAllFailedSources(projectId);
  if (result.retried > 0) await startKnowledgeProcessing(projectId);
  revalidatePath(`/dashboard/projects/${projectId}`);
  return result;
}
