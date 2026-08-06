import type { SupabaseClient } from "@supabase/supabase-js";
import { createServiceClient } from "@/lib/supabase/service";
import type { BrainSectionKey } from "@/lib/brain-v2/types";

/**
 * سجل الزيادات — كل معلومة جديدة توصل بعد ما المشروع خلّص دورته الأولى
 * (اجتماع + فورم + تحليل + PRD + برومتات + Engineering QA) بتتسجّل هنا
 * كـ "زيادة" مستقلة بدل ما تسبّب إعادة بناء كل المراحل.
 *
 * الجدول ده أُضيف في هجرة 0070، والهجرات في المشروع ده بتتطبّق يدويًا.
 * فكل الكتابة هنا **best-effort**: لو الجدول لسه ما اتعملش، بنسجّل تحذير
 * ونكمّل — الدمج في الـ Brain نفسه لازم ينجح سواء السجل موجود أو لأ.
 */

export type IncrementSourceType =
  | "discovery_session"
  | "meeting"
  | "decision"
  | "file"
  | "recommendation"
  | "manual";

export type IncrementStatus = "open" | "prd_drafted" | "prompted" | "qa_done" | "closed";

export interface ProjectIncrement {
  id: string;
  project_id: string;
  sequence_number: number;
  title: string;
  source_type: IncrementSourceType;
  source_ref_id: string | null;
  summary: string;
  delta: Partial<Record<BrainSectionKey, unknown[]>>;
  added_count: number;
  brain_document_id: string | null;
  brain_version: number | null;
  status: IncrementStatus;
  created_by: string | null;
  created_at: string;
  updated_at: string;
}

export interface RecordIncrementInput {
  projectId: string;
  title: string;
  sourceType: IncrementSourceType;
  sourceRefId?: string | null;
  summary: string;
  delta: Partial<Record<BrainSectionKey, unknown[]>>;
  addedCount: number;
  brainDocumentId?: string | null;
  brainVersion?: number | null;
  actorId?: string | null;
}

/** رمز الخطأ اللي Postgres بيرجّعه لما الجدول مش موجود. */
const UNDEFINED_TABLE = "42P01";

function isMissingTable(error: { code?: string } | null): boolean {
  return error?.code === UNDEFINED_TABLE;
}

async function nextSequenceNumber(
  supabase: SupabaseClient,
  projectId: string
): Promise<number | null> {
  const { data, error } = await supabase
    .from("project_increments")
    .select("sequence_number")
    .eq("project_id", projectId)
    .order("sequence_number", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (error) {
    if (isMissingTable(error)) return null;
    return 1;
  }
  return ((data?.sequence_number as number | undefined) ?? 0) + 1;
}

/**
 * يسجّل زيادة جديدة. بيرجّع `null` لو مافيش حاجة اتضافت فعلًا (عشان
 * ماننشئش زيادات فاضية كل مرة التحليل يعاد تشغيله) أو لو السجل لسه
 * مش متاح في قاعدة البيانات.
 */
export async function recordIncrement(
  input: RecordIncrementInput
): Promise<ProjectIncrement | null> {
  if (input.addedCount <= 0) return null;

  const supabase = createServiceClient();
  const sequence = await nextSequenceNumber(supabase, input.projectId);
  if (sequence === null) {
    console.warn(
      `[Increments] جدول project_increments غير موجود — طبّق هجرة 0070. تم تخطي تسجيل الزيادة للمشروع ${input.projectId}.`
    );
    return null;
  }

  const { data, error } = await supabase
    .from("project_increments")
    .insert({
      project_id: input.projectId,
      sequence_number: sequence,
      title: input.title,
      source_type: input.sourceType,
      source_ref_id: input.sourceRefId ?? null,
      summary: input.summary,
      delta: input.delta,
      added_count: input.addedCount,
      brain_document_id: input.brainDocumentId ?? null,
      brain_version: input.brainVersion ?? null,
      created_by: input.actorId ?? null,
    })
    .select("*")
    .single();

  if (error || !data) {
    console.error(
      `[Increments] تعذّر تسجيل الزيادة للمشروع ${input.projectId}: ${error?.message ?? "سبب غير معروف"}`
    );
    return null;
  }
  return data as ProjectIncrement;
}

/** كل زيادات المشروع، الأحدث أولًا. بيرجّع مصفوفة فاضية لو السجل مش متاح. */
export async function listIncrements(
  supabase: SupabaseClient,
  projectId: string
): Promise<ProjectIncrement[]> {
  const { data, error } = await supabase
    .from("project_increments")
    .select("*")
    .eq("project_id", projectId)
    .order("sequence_number", { ascending: false });
  if (error) {
    if (!isMissingTable(error)) {
      console.error(`[Increments] تعذّر قراءة الزيادات للمشروع ${projectId}: ${error.message}`);
    }
    return [];
  }
  return (data ?? []) as ProjectIncrement[];
}

/** الزيادات اللي لسه ما اتحوّلتش لقسم PRD — دي اللي محتاجة شغل. */
export async function listOpenIncrements(
  supabase: SupabaseClient,
  projectId: string
): Promise<ProjectIncrement[]> {
  const all = await listIncrements(supabase, projectId);
  return all.filter((inc) => inc.status === "open");
}

export async function setIncrementStatus(
  incrementId: string,
  status: IncrementStatus
): Promise<boolean> {
  const supabase = createServiceClient();
  const { error } = await supabase
    .from("project_increments")
    .update({ status })
    .eq("id", incrementId);
  if (error) {
    console.error(`[Increments] تعذّر تحديث حالة الزيادة ${incrementId}: ${error.message}`);
    return false;
  }
  return true;
}
