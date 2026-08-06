import type { SupabaseClient } from "@supabase/supabase-js";
import { createServiceClient } from "@/lib/supabase/service";
import { buildMeetingPrepContext, hasEnoughContextForMeetingPrep } from "./context";
import { SECTION_GENERATORS } from "./sections";
import {
  MEETING_PREP_SECTIONS,
  type MeetingPrepSectionKey,
  type MeetingPreparationRow,
  type MeetingPrepSections,
  type SectionMeta,
} from "./types";

type SectionsBlob = Partial<Record<MeetingPrepSectionKey, { meta: SectionMeta; content: unknown }>>;

/**
 * حد التوازي لتوليد الأقسام الـ13. تشغيلهم كلهم دفعة واحدة (Promise.all
 * غير محدود) كان بيطلق 13 طلب AI في نفس اللحظة — لما كل طلب بيواجه 429
 * بيدور على كل مفاتيح Gemini المتاحة فورًا وبلا انتظار، فـ13 طلب متزامن
 * بيستهلكوا حصة الدقيقة (RPM) بتاعة كل المفاتيح في ثوانٍ معدودة حتى لو
 * عدد المفاتيح كبير. تقليل التوازي لدفعات صغيرة بيوزّع الضغط ويقلل فرصة
 * إن قسم متأخر (زي "حماية النطاق") يلاقي كل المفاتيح لسه في نافذة التبريد.
 */
const GENERATION_CONCURRENCY = 4;

async function runWithConcurrencyLimit<T, R>(
  items: readonly T[],
  limit: number,
  task: (item: T) => Promise<R>
): Promise<R[]> {
  const results: R[] = new Array(items.length);
  let nextIndex = 0;

  async function worker() {
    while (true) {
      const i = nextIndex++;
      if (i >= items.length) return;
      results[i] = await task(items[i]);
    }
  }

  await Promise.all(Array.from({ length: Math.min(limit, items.length) }, worker));
  return results;
}

function failedMeta(message: string, previousContent: unknown = null): { meta: SectionMeta; content: unknown } {
  return {
    meta: {
      status: "failed",
      confidence: 0,
      confidence_reason: null,
      last_updated: new Date().toISOString(),
      error_message: message,
    },
    content: previousContent,
  };
}

function computeOverallConfidence(sections: SectionsBlob): number {
  const values = MEETING_PREP_SECTIONS.map((k) => sections[k]).filter(
    (s): s is { meta: SectionMeta; content: unknown } => !!s && s.meta.status !== "failed"
  );
  if (values.length === 0) return 0;
  const sum = values.reduce((acc, s) => acc + s.meta.confidence, 0);
  return Math.round(sum / values.length);
}

/**
 * أول توليد كامل (أو إعادة توليد كامل) لكل الأقسام الـ13 — كل قسم بمولّده
 * المستقل، تُنفَّذ متوازيةً وليس عبر Prompt واحد ضخم. فشل قسم واحد لا يمنع
 * باقي الأقسام من النجاح.
 */
export async function runMeetingPreparationJob(
  projectId: string,
  options: { actorId?: string | null; basedOnAnalysisId?: string | null } = {}
): Promise<{ ok: boolean; message?: string }> {
  const supabase = createServiceClient();
  const ctx = await buildMeetingPrepContext(supabase, projectId);
  if (!ctx || !hasEnoughContextForMeetingPrep(ctx)) {
    return { ok: false, message: "لا توجد بيانات اكتشاف كافية لتجهيز الاجتماع بعد." };
  }

  const { data: existing } = await supabase
    .from("meeting_preparations")
    .select("id, version, based_on_brain_document_id")
    .eq("project_id", projectId)
    .maybeSingle();

  let prepId: string;
  if (existing) {
    prepId = existing.id;
    await supabase
      .from("meeting_preparations")
      .update({
        status: "generating",
        based_on_analysis_id: options.basedOnAnalysisId ?? null,
      })
      .eq("id", prepId);
  } else {
    const { data: created, error } = await supabase
      .from("meeting_preparations")
      .insert({
        project_id: projectId,
        status: "generating",
        based_on_analysis_id: options.basedOnAnalysisId ?? null,
        created_by: options.actorId ?? null,
      })
      .select("id")
      .single();
    if (error || !created) {
      return { ok: false, message: error?.message ?? "تعذّر إنشاء تجهيز اجتماع جديد." };
    }
    prepId = created.id;
  }

  const results = await runWithConcurrencyLimit(
    MEETING_PREP_SECTIONS,
    GENERATION_CONCURRENCY,
    async (key) => {
      const result = await SECTION_GENERATORS[key](ctx, options.actorId ?? null);
      return { key, result };
    }
  );

  const sections: SectionsBlob = {};
  let successCount = 0;
  for (const { key, result } of results) {
    if (result.ok) {
      sections[key] = { meta: result.meta, content: result.content };
      successCount++;
    } else {
      sections[key] = failedMeta(result.message);
    }
  }

  const overallConfidence = computeOverallConfidence(sections);
  const status = successCount > 0 ? "ready" : "failed";

  await supabase
    .from("meeting_preparations")
    .update({ sections, overall_confidence: overallConfidence, status })
    .eq("id", prepId);

  if (successCount === 0) {
    return { ok: false, message: "فشل توليد كل أقسام تجهيز الاجتماع." };
  }
  if (successCount < MEETING_PREP_SECTIONS.length) {
    return {
      ok: true,
      message: `تم التوليد مع فشل ${MEETING_PREP_SECTIONS.length - successCount} من الأقسام — يمكن إعادة توليدها منفردة.`,
    };
  }
  return { ok: true };
}

/** إعادة توليد قسم واحد فقط — بدون المساس بباقي الأقسام. */
export async function regenerateMeetingPrepSection(
  projectId: string,
  sectionKey: MeetingPrepSectionKey,
  actorId: string | null
): Promise<{ ok: boolean; message?: string }> {
  const supabase = createServiceClient();
  const { data: row } = await supabase
    .from("meeting_preparations")
    .select("id, sections")
    .eq("project_id", projectId)
    .maybeSingle();
  if (!row) return { ok: false, message: "لا يوجد تجهيز اجتماع لهذا المشروع بعد." };

  const ctx = await buildMeetingPrepContext(supabase, projectId);
  if (!ctx) return { ok: false, message: "تعذّر تحميل بيانات المشروع." };

  const result = await SECTION_GENERATORS[sectionKey](ctx, actorId);
  const sections = { ...((row.sections as SectionsBlob) ?? {}) };
  const previousContent = sections[sectionKey]?.content ?? null;
  sections[sectionKey] = result.ok
    ? { meta: result.meta, content: result.content }
    : failedMeta(result.message, previousContent);

  const overallConfidence = computeOverallConfidence(sections);
  await supabase
    .from("meeting_preparations")
    .update({ sections, overall_confidence: overallConfidence, status: "ready" })
    .eq("id", row.id);

  if (!result.ok) return { ok: false, message: result.message };
  return { ok: true };
}

/** تعديل يدوي لقسم — يحفظ نسخة قبل/بعد ويزوّد رقم الإصدار. */
export async function saveMeetingPrepManualEdit(input: {
  projectId: string;
  sectionKey: MeetingPrepSectionKey;
  newContent: unknown;
  expectedUpdatedAt: string;
  reason: string | null;
  actorId: string | null;
}): Promise<{ ok: true } | { ok: false; message: string; conflict?: boolean }> {
  const supabase = createServiceClient();
  const { data: row } = await supabase
    .from("meeting_preparations")
    .select("id, sections, version, updated_at")
    .eq("project_id", input.projectId)
    .maybeSingle();
  if (!row) return { ok: false, message: "لا يوجد تجهيز اجتماع لهذا المشروع بعد." };

  if (row.updated_at !== input.expectedUpdatedAt) {
    return {
      ok: false,
      message: "تم تعديل هذا التجهيز من مستخدم آخر بعد تحميلك للصفحة — أعد التحميل.",
      conflict: true,
    };
  }

  const sections = { ...((row.sections as SectionsBlob) ?? {}) };
  const before = sections[input.sectionKey]?.content ?? null;

  sections[input.sectionKey] = {
    meta: {
      status: "manual_edit",
      confidence: sections[input.sectionKey]?.meta.confidence ?? 100,
      confidence_reason: sections[input.sectionKey]?.meta.confidence_reason ?? null,
      last_updated: new Date().toISOString(),
    },
    content: input.newContent,
  };

  const overallConfidence = computeOverallConfidence(sections);

  const { error: updateErr } = await supabase
    .from("meeting_preparations")
    .update({ sections, overall_confidence: overallConfidence, version: row.version + 1 })
    .eq("id", row.id);
  if (updateErr) return { ok: false, message: updateErr.message };

  await supabase.from("meeting_preparation_edits").insert({
    meeting_preparation_id: row.id,
    project_id: input.projectId,
    section_key: input.sectionKey,
    before_value: before,
    after_value: input.newContent,
    reason: input.reason,
    edited_by: input.actorId,
  });

  return { ok: true };
}

export async function getMeetingPreparation(
  supabase: SupabaseClient,
  projectId: string
): Promise<MeetingPreparationRow | null> {
  const { data } = await supabase
    .from("meeting_preparations")
    .select("*")
    .eq("project_id", projectId)
    .maybeSingle();
  return (data as MeetingPreparationRow | null) ?? null;
}

export type { MeetingPrepSections };
