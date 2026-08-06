import type { SupabaseClient } from "@supabase/supabase-js";
import { createServiceClient } from "@/lib/supabase/service";
import { recordBulkCreation, type BulkCreatedItem } from "./repository";
import { describeScan, scanFile } from "./security";
import { truncateForLog } from "@/lib/observability/safe-log";
import { AITaskType } from "@/lib/ai/types";
import { executeAIWithRateLimitWait } from "@/lib/ai/execute-with-rate-limit-wait";
import { buildKnowledgeClassificationPrompt } from "@/lib/ai/prompts/knowledge-classification";
import { validateKnowledgeClassification } from "@/lib/ai/validation/knowledge-classification";
import { chunkText, describeLocator } from "./chunking";
import { extractFromStorage, extractFromPastedText } from "./extraction";
import { classifyFile, unsupportedReason, isReprocessableSource } from "./file-types";

/**
 * محرّك Knowledge Hub.
 *
 * الدورة لكل مصدر: استخراج → تقطيع → تصنيف مقطعًا مقطعًا → كتابة عناصر
 * المعرفة والفجوات.
 *
 * ثلاث قرارات تشغيلية مهمة:
 *
 * 1. **مصدر واحد في كل استدعاء.** المعالجة بتتقدّم بمصدر واحد لكل مرة
 *    بدل جلسة خلفية واحدة تعالج ٥٠ ملف. ده اللي بيخلّي رفع مئات الملفات
 *    ممكن على Vercel، لأن كل استدعاء بيفضل جوّه حد وقت التنفيذ الآمن،
 *    والواجهة هي اللي بتشغّل التالي بالـ Polling — نفس نمط خط البرومتات.
 *
 * 2. **التقدّم بيتحفظ بعد كل مقطع.** لو الاستدعاء اتقطع في نص مستند من
 *    ٤٠ مقطع، اللي اتعالج بيفضل محفوظًا والاستئناف بيكمّل من بعده. ده
 *    معنى "Resume بعد الانقطاع" عمليًا.
 *
 * 3. **التكرار بيتكشف بالتجزئة قبل أي استدعاء للنموذج.** رفع نفس الملف
 *    تاني مابيكلّفش ولا استدعاء واحد.
 */

const UNDEFINED_TABLE = "42P01";

function isMissingTable(error: { code?: string } | null): boolean {
  return error?.code === UNDEFINED_TABLE;
}

/** أي مصدر قاعد في حالة معالجة أطول من كده يُعتبر Job مات. */
const STALE_LOCK_MS = 8 * 60_000;

/** أقصى عدد مقاطع بيتعالج في استدعاء واحد قبل ما نسيب الدور للاستدعاء اللي بعده. */
const MAX_CHUNKS_PER_CALL = 6;

/**
 * أقصى عدد مقاطع تُحلَّل بالذكاء الاصطناعي لكل مصدر. الملفات الضخمة (زي
 * Excel بمئات الصفوف) بتتقطّع لعشرات/مئات المقاطع، وكل مقطع نداء AI منفصل
 * — على الحصة المجانية ده بيزحف لساعات. الحدّ ده بيخلّي أي ملف يخلص في
 * دقائق: أول N مقطع تتحلّل، والباقي **يُحفظ كمرجع** (نصّه مخزّن، بس بلا
 * تصنيف AI). قابل للتعديل بسهولة لو اتفعّل مفتاح مدفوع.
 */
const MAX_CHUNKS_PER_SOURCE = 40;

export type KnowledgeSourceStatus =
  | "pending"
  | "extracting"
  | "classifying"
  | "enriching"
  | "ready"
  | "failed"
  | "skipped_duplicate";

export interface KnowledgeSource {
  id: string;
  project_id: string;
  batch_id: string | null;
  kind: "file" | "url" | "pasted_text";
  title: string;
  file_name: string | null;
  mime_type: string | null;
  file_size_bytes: number | null;
  storage_path: string | null;
  source_url: string | null;
  content_hash: string | null;
  declared_domain: string | null;
  status: KnowledgeSourceStatus;
  last_error: string | null;
  extracted_chars: number;
  chunk_count: number;
  item_count: number;
  metadata: Record<string, unknown>;
  created_at: string;
  updated_at: string;
}

export interface KnowledgeBatch {
  id: string;
  project_id: string;
  version: number;
  title: string;
  note: string;
  status: "open" | "processing" | "ready" | "failed" | "partial";
  source_count: number;
  ready_count: number;
  failed_count: number;
  item_count: number;
  created_at: string;
}

export interface KnowledgeItem {
  id: string;
  project_id: string;
  source_id: string;
  category: string;
  title: string;
  content: string;
  confidence: number;
  evidence: { quote: string; locator: string }[];
  tags: string[];
  status: string;
  created_at: string;
}

export interface KnowledgeGap {
  id: string;
  project_id: string;
  description: string;
  why_it_matters: string;
  needed_from: string;
  priority: string;
  status: string;
  created_at: string;
}

// ============================================================
// قراءة
// ============================================================

async function safeSelect<T>(
  promise: PromiseLike<{ data: unknown; error: { code?: string; message?: string } | null }>,
  label: string
): Promise<T[]> {
  const { data, error } = await promise;
  if (error) {
    if (!isMissingTable(error)) {
      console.error(`[KnowledgeHub] تعذّر قراءة ${label}: ${error.message}`);
    }
    return [];
  }
  return (data ?? []) as T[];
}

export async function listBatches(
  supabase: SupabaseClient,
  projectId: string
): Promise<KnowledgeBatch[]> {
  return safeSelect<KnowledgeBatch>(
    supabase
      .from("knowledge_batches")
      .select("*")
      .eq("project_id", projectId)
      .order("version", { ascending: false }),
    "الدفعات"
  );
}

export async function listSources(
  supabase: SupabaseClient,
  projectId: string
): Promise<KnowledgeSource[]> {
  return safeSelect<KnowledgeSource>(
    supabase
      .from("knowledge_sources")
      .select("*")
      .eq("project_id", projectId)
      .order("created_at", { ascending: false }),
    "المصادر"
  );
}

export async function listItems(
  supabase: SupabaseClient,
  projectId: string,
  limit = 500
): Promise<KnowledgeItem[]> {
  return safeSelect<KnowledgeItem>(
    supabase
      .from("knowledge_items")
      .select("*")
      .eq("project_id", projectId)
      .eq("status", "active")
      .order("created_at", { ascending: false })
      .limit(limit),
    "عناصر المعرفة"
  );
}

export async function listGaps(
  supabase: SupabaseClient,
  projectId: string
): Promise<KnowledgeGap[]> {
  return safeSelect<KnowledgeGap>(
    supabase
      .from("knowledge_gaps")
      .select("*")
      .eq("project_id", projectId)
      .neq("status", "ignored")
      .order("created_at", { ascending: false }),
    "الفجوات"
  );
}

/**
 * المصدر اللي المفروض يتعالج بعد كده: أول واحد `pending`، أو واحد عالق
 * في حالة معالجة من زمان (استدعاء مات). بيرجّع `null` لما مفيش شغل.
 */
export function pickNextSource(sources: KnowledgeSource[], nowMs: number): KnowledgeSource | null {
  const inFlight = sources.filter(
    (s) => s.status === "extracting" || s.status === "classifying" || s.status === "enriching"
  );

  const stale = inFlight.find(
    (s) => nowMs - new Date(s.updated_at).getTime() > STALE_LOCK_MS
  );
  if (stale) return stale;

  // فيه واحد شغّال دلوقتي فعلًا — استنى بدل ما تشغّل اتنين على نفس المشروع.
  if (inFlight.length > 0) return null;

  const pending = sources
    .filter((s) => s.status === "pending")
    .sort((a, b) => a.created_at.localeCompare(b.created_at));
  return pending[0] ?? null;
}

// ============================================================
// المعالجة
// ============================================================

async function fail(
  supabase: SupabaseClient,
  sourceId: string,
  message: string
): Promise<void> {
  await supabase
    .from("knowledge_sources")
    .update({ status: "failed", last_error: message })
    .eq("id", sourceId);
}

export type ProcessOutcome =
  | { status: "idle" }
  | { status: "processed"; sourceId: string; itemsAdded: number; done: boolean }
  | { status: "failed"; sourceId: string; message: string };

/**
 * يعالج مصدرًا واحدًا (أو يكمّل مصدرًا نصّه اتعالج قبل كده).
 * الاستدعاء بيرجّع `done: false` لو فاضل مقاطع — الواجهة بتستدعي تاني.
 */
export async function processNextSource(
  projectId: string,
  actorId?: string | null
): Promise<ProcessOutcome> {
  const supabase = createServiceClient();

  const sources = await listSources(supabase, projectId);
  const source = pickNextSource(sources, Date.now());
  if (!source) return { status: "idle" };

  await supabase
    .from("knowledge_sources")
    .update({ status: "extracting", last_error: null })
    .eq("id", source.id);

  try {
    // --- 1) المقاطع: موجودة بالفعل؟ (استئناف) وإلا استخرج وقطّع ---
    const existingChunks = await safeSelect<{ id: string; chunk_index: number; content: string; locator: Record<string, unknown> }>(
      supabase
        .from("knowledge_chunks")
        .select("id, chunk_index, content, locator")
        .eq("source_id", source.id)
        .order("chunk_index", { ascending: true }),
      "المقاطع"
    );

    let mediaPayload: { mimeType: string; data: string } | undefined;
    let chunks = existingChunks;

    if (chunks.length === 0) {
      const outcome = await extractSourceContent(supabase, source);
      if (!outcome.ok) {
        if (outcome.skippable) {
          await supabase
            .from("knowledge_sources")
            .update({ status: "skipped_duplicate", last_error: outcome.reason })
            .eq("id", source.id);
          await refreshBatchCounters(supabase, source.batch_id);
          return { status: "processed", sourceId: source.id, itemsAdded: 0, done: true };
        }
        await fail(supabase, source.id, outcome.reason);
        await refreshBatchCounters(supabase, source.batch_id);
        return { status: "failed", sourceId: source.id, message: outcome.reason };
      }

      mediaPayload = outcome.result.media;

      if (mediaPayload) {
        // الملف بيتقرأ بالنموذج مباشرةً — مقطع منطقي واحد بلا نص محلي.
        chunks = [{ id: "", chunk_index: 0, content: "", locator: {} }];
        await supabase
          .from("knowledge_sources")
          .update({ extracted_chars: 0, chunk_count: 1 })
          .eq("id", source.id);
      } else {
        const allChunks = chunkText(outcome.result.text);
        if (allChunks.length === 0) {
          await supabase
            .from("knowledge_sources")
            .update({
              status: "ready",
              extracted_chars: 0,
              chunk_count: 0,
              item_count: 0,
              last_error: "لم يُعثر على نص قابل للقراءة داخل الملف.",
            })
            .eq("id", source.id);
          await refreshBatchCounters(supabase, source.batch_id);
          return { status: "processed", sourceId: source.id, itemsAdded: 0, done: true };
        }

        // حدّ التحليل: أول MAX_CHUNKS_PER_SOURCE مقطع تتحلّل بالـ AI؛ الباقي
        // يُخزَّن نصّه كمرجع بلا تصنيف — يمنع الملفات الضخمة من الزحف ساعات
        // على الحصة المجانية. النصّ كامل محفوظ، والتحليل قابل للتوسيع لاحقًا.
        const analysisCapped = allChunks.length > MAX_CHUNKS_PER_SOURCE;
        const built = analysisCapped ? allChunks.slice(0, MAX_CHUNKS_PER_SOURCE) : allChunks;

        const { error: insertErr } = await supabase.from("knowledge_chunks").insert(
          built.map((c) => ({
            project_id: projectId,
            source_id: source.id,
            chunk_index: c.index,
            content: c.content,
            char_count: c.char_count,
            locator: c.locator,
          }))
        );
        if (insertErr) {
          await fail(supabase, source.id, `تعذّر حفظ المقاطع: ${insertErr.message}`);
          return { status: "failed", sourceId: source.id, message: insertErr.message };
        }

        await supabase
          .from("knowledge_sources")
          .update({
            extracted_chars: outcome.result.text.length,
            chunk_count: built.length,
            last_error: analysisCapped
              ? `ملف كبير: حُلِّلت أول ${MAX_CHUNKS_PER_SOURCE} مقطعًا بالذكاء الاصطناعي (من ${allChunks.length})؛ باقي النص محفوظ كمرجع.`
              : null,
            metadata: {
              ...source.metadata,
              truncated: outcome.result.truncated,
              analysis_capped: analysisCapped,
              total_chunks: allChunks.length,
              analyzed_chunks: built.length,
            },
          })
          .eq("id", source.id);

        chunks = built.map((c) => ({
          id: "",
          chunk_index: c.index,
          content: c.content,
          locator: c.locator as unknown as Record<string, unknown>,
        }));
      }
    } else if (chunks.length === 1 && chunks[0].content.length === 0) {
      // استئناف مصدر وسائطي: لازم نحمّل الملف تاني عشان نبعته للنموذج.
      const outcome = await extractSourceContent(supabase, source);
      if (outcome.ok) mediaPayload = outcome.result.media;
    }

    // --- 2) التصنيف: المقاطع اللي لسه ما اتصنّفتش ---
    const done = await classifiedChunkIndexes(supabase, source.id);
    const remaining = chunks.filter((c) => !done.has(c.chunk_index));

    if (remaining.length === 0) {
      await finalizeSource(supabase, source);
      return { status: "processed", sourceId: source.id, itemsAdded: 0, done: true };
    }

    await supabase.from("knowledge_sources").update({ status: "classifying" }).eq("id", source.id);

    const projectName = await getProjectName(supabase, projectId);
    const slice = remaining.slice(0, MAX_CHUNKS_PER_CALL);
    let added = 0;

    for (const chunk of slice) {
      const isMedia = Boolean(mediaPayload);
      const prompt = buildKnowledgeClassificationPrompt({
        projectName,
        declaredDomain: source.declared_domain,
        sourceTitle: source.title || source.file_name || "مصدر بلا عنوان",
        locatorLabel: describeLocator(
          (chunk.locator as { heading_path?: string[] }).heading_path
            ? (chunk.locator as never)
            : { heading_path: [] }
        ),
        chunkIndex: chunk.chunk_index,
        chunkCount: chunks.length,
        chunkText: chunk.content,
        isMediaSource: isMedia,
      });

      const response = await executeAIWithRateLimitWait(AITaskType.KNOWLEDGE_CLASSIFICATION, prompt, {
        actorId: actorId ?? undefined,
        projectId,
        media: mediaPayload,
      });

      if (!response.success) {
        const message = response.error?.message ?? "فشل تصنيف المقطع.";
        await fail(supabase, source.id, message);
        await refreshBatchCounters(supabase, source.batch_id);
        return { status: "failed", sourceId: source.id, message };
      }

      const validation = validateKnowledgeClassification(
        response.output,
        isMedia ? null : chunk.content
      );
      if (!validation.ok) {
        console.error(
          `[KnowledgeHub] تعذّر فهم تصنيف المقطع ${chunk.chunk_index} للمصدر ${source.id}: ${truncateForLog(validation.reason)}`
        );
        // مقطع واحد فشل تحليله مايوقّفش المستند كله — بنعلّمه كمعالَج
        // ونكمّل. الوقوف هنا كان هيخسّرنا مستند كامل بسبب رد واحد تالف.
        await markChunkProcessed(supabase, projectId, source.id, chunk.chunk_index);
        continue;
      }

      if (validation.data.droppedForMissingQuote > 0) {
        console.warn(
          `[KnowledgeHub] أُسقط ${validation.data.droppedForMissingQuote} عنصر بلا اقتباس موجود في المصدر ${source.id}.`
        );
      }

      const locatorLabel = describeLocator(
        (chunk.locator as { heading_path?: string[] }).heading_path
          ? (chunk.locator as never)
          : { heading_path: [] }
      );

      if (validation.data.items.length > 0) {
        const { data: inserted, error } = await supabase.from("knowledge_items").insert(
          validation.data.items.map((item) => ({
            project_id: projectId,
            source_id: source.id,
            batch_id: source.batch_id,
            category: item.category,
            title: item.title,
            content: item.content,
            confidence: item.confidence,
            evidence: [{ quote: item.quote, locator: locatorLabel }],
            tags: item.tags,
          }))
        ).select("id, title, content, category, tags, confidence, content_hash, metadata");
        if (!error) {
          added += validation.data.items.length;
          // تسجيل الإصدارات والخط الزمني للدفعة — رحلتان لا مئة.
          await recordBulkCreation({
            projectId,
            sourceId: source.id,
            items: (inserted ?? []) as BulkCreatedItem[],
            actorId,
            actorKind: "worker",
            reason: "استخراج من مصدر",
          });
        }
      }

      if (validation.data.gaps.length > 0) {
        await supabase.from("knowledge_gaps").insert(
          validation.data.gaps.map((gap) => ({
            project_id: projectId,
            batch_id: source.batch_id,
            description: gap.description,
            why_it_matters: gap.why_it_matters,
            needed_from: gap.needed_from,
            priority: gap.priority,
          }))
        );
      }

      await markChunkProcessed(supabase, projectId, source.id, chunk.chunk_index);
    }

    const stillRemaining = remaining.length - slice.length;
    if (stillRemaining <= 0) {
      await finalizeSource(supabase, source);
      return { status: "processed", sourceId: source.id, itemsAdded: added, done: true };
    }

    // لسه فيه مقاطع — نرجّع الحالة لـ pending عشان الاستدعاء اللي بعده
    // يلتقطه من غير ما ينتظر انتهاء مهلة القفل العالق.
    await supabase.from("knowledge_sources").update({ status: "pending" }).eq("id", source.id);
    return { status: "processed", sourceId: source.id, itemsAdded: added, done: false };
  } catch (err) {
    const message = err instanceof Error ? err.message : "خطأ غير متوقع أثناء المعالجة.";
    console.error(`[KnowledgeHub] فشل غير متوقع للمصدر ${source.id}:`, err);
    await fail(supabase, source.id, message);
    return { status: "failed", sourceId: source.id, message };
  }
}

async function extractSourceContent(supabase: SupabaseClient, source: KnowledgeSource) {
  if (source.kind === "pasted_text") {
    const text = (source.metadata?.pasted_text as string | undefined) ?? "";
    return { ok: true as const, result: extractFromPastedText(text) };
  }
  if (source.kind === "url") {
    return {
      ok: false as const,
      reason: "استيراد المحتوى من الروابط غير مفعّل بعد — انسخ المحتوى والصقه كنص، أو ارفعه كملف.",
      skippable: true,
    };
  }
  if (!source.storage_path) {
    return { ok: false as const, reason: "مسار الملف مفقود.", skippable: false };
  }
  return extractFromStorage(
    supabase,
    source.storage_path,
    source.file_name ?? source.title,
    source.mime_type
  );
}

/** المقاطع اللي اتصنّفت بالفعل — بنستنتجها من عناصر المعرفة والعلامات. */
async function classifiedChunkIndexes(
  supabase: SupabaseClient,
  sourceId: string
): Promise<Set<number>> {
  const rows = await safeSelect<{ chunk_index: number }>(
    supabase
      .from("knowledge_chunks")
      .select("chunk_index")
      .eq("source_id", sourceId)
      .not("locator->>processed_at", "is", null),
    "المقاطع المعالَجة"
  );
  return new Set(rows.map((r) => r.chunk_index));
}

/**
 * يعلّم المقطع كمعالَج. العلامة بتتحط جوّه `locator` بدل عمود جديد عشان
 * نفضل على نفس الهجرة — والمقاطع اللي بتتقرأ بالنموذج مالهاش صف أصلًا،
 * فبنكتب لها صفًا خفيفًا يمسك التقدّم.
 */
async function markChunkProcessed(
  supabase: SupabaseClient,
  projectId: string,
  sourceId: string,
  chunkIndex: number
): Promise<void> {
  const { data } = await supabase
    .from("knowledge_chunks")
    .select("id, locator")
    .eq("source_id", sourceId)
    .eq("chunk_index", chunkIndex)
    .maybeSingle();

  const stamped = { ...((data?.locator as Record<string, unknown>) ?? {}), processed_at: new Date().toISOString() };

  if (data?.id) {
    await supabase.from("knowledge_chunks").update({ locator: stamped }).eq("id", data.id);
    return;
  }

  await supabase.from("knowledge_chunks").insert({
    project_id: projectId,
    source_id: sourceId,
    chunk_index: chunkIndex,
    content: "",
    char_count: 0,
    locator: stamped,
  });
}

async function finalizeSource(supabase: SupabaseClient, source: KnowledgeSource): Promise<void> {
  const { count } = await supabase
    .from("knowledge_items")
    .select("id", { count: "exact", head: true })
    .eq("source_id", source.id);

  await supabase
    .from("knowledge_sources")
    .update({ status: "ready", item_count: count ?? 0, last_error: null })
    .eq("id", source.id);

  await refreshBatchCounters(supabase, source.batch_id);
}

/** يحدّث عدّادات الدفعة — مصدر الحقيقة الوحيد لتقدّمها في الواجهة. */
export async function refreshBatchCounters(
  supabase: SupabaseClient,
  batchId: string | null
): Promise<void> {
  if (!batchId) return;

  const sources = await safeSelect<{ status: string; item_count: number }>(
    supabase.from("knowledge_sources").select("status, item_count").eq("batch_id", batchId),
    "مصادر الدفعة"
  );
  if (sources.length === 0) return;

  const ready = sources.filter((s) => s.status === "ready" || s.status === "skipped_duplicate").length;
  const failed = sources.filter((s) => s.status === "failed").length;
  const items = sources.reduce((sum, s) => sum + (s.item_count ?? 0), 0);
  const settled = ready + failed;

  let status: KnowledgeBatch["status"] = "processing";
  if (settled === sources.length) status = failed === 0 ? "ready" : failed === sources.length ? "failed" : "partial";

  await supabase
    .from("knowledge_batches")
    .update({
      status,
      source_count: sources.length,
      ready_count: ready,
      failed_count: failed,
      item_count: items,
    })
    .eq("id", batchId);
}

async function getProjectName(supabase: SupabaseClient, projectId: string): Promise<string> {
  const { data } = await supabase.from("projects").select("name").eq("id", projectId).maybeSingle();
  return (data?.name as string | undefined) ?? "المشروع";
}

// ============================================================
// إنشاء دفعة ومصادر
// ============================================================

export async function createBatch(
  projectId: string,
  title: string,
  actorId: string | null
): Promise<{ id: string; version: number } | null> {
  const supabase = createServiceClient();

  const { data: last, error: readErr } = await supabase
    .from("knowledge_batches")
    .select("version")
    .eq("project_id", projectId)
    .order("version", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (readErr && isMissingTable(readErr)) {
    console.warn("[KnowledgeHub] جداول Knowledge Hub غير موجودة — طبّق هجرة 0071.");
    return null;
  }

  const version = ((last?.version as number | undefined) ?? 0) + 1;

  const { data, error } = await supabase
    .from("knowledge_batches")
    .insert({
      project_id: projectId,
      version,
      title: title || `دفعة معرفة ${version}`,
      created_by: actorId,
      status: "open",
    })
    .select("id, version")
    .single();

  if (error || !data) {
    console.error(`[KnowledgeHub] تعذّر إنشاء دفعة: ${error?.message ?? "سبب غير معروف"}`);
    return null;
  }
  return { id: data.id as string, version: data.version as number };
}

export interface RegisterSourceInput {
  projectId: string;
  batchId: string;
  kind: "file" | "url" | "pasted_text";
  title: string;
  fileName?: string | null;
  mimeType?: string | null;
  fileSizeBytes?: number | null;
  storagePath?: string | null;
  sourceUrl?: string | null;
  contentHash?: string | null;
  declaredDomain?: string | null;
  pastedText?: string | null;
  actorId?: string | null;
}

export type RegisterSourceResult =
  | { status: "registered"; sourceId: string }
  | { status: "duplicate"; message: string }
  | { status: "unsupported"; sourceId: string; message: string }
  | { status: "error"; message: string };

/**
 * يسجّل مصدرًا جديدًا. الأنواع غير القابلة للاستخراج بتتسجّل برضه —
 * بتفضل محفوظة كمرجع بحالة واضحة، وده أصدق من رفضها وكأنها مش موجودة.
 */
export async function registerSource(input: RegisterSourceInput): Promise<RegisterSourceResult> {
  const supabase = createServiceClient();

  const info = classifyFile(input.fileName ?? input.title, input.mimeType);

  // ---------- الفحص الأمني ----------
  //
  // **قبل التسجيل لا بعده**: ملف مرفوض مايجوزش يدخل الجدول أصلًا،
  // وإلا بقى صفًّا معلّقًا يحتاج تنظيفًا.
  //
  // الفحص هنا بالاسم والحجم بس — البصمة محتاجة قراءة الملف من المخزن،
  // وده شغل العامل وقت الاستخراج. الحاجزان مكمّلان: ده بيمسك
  // الامتدادات الخطرة فورًا، وده بيمسك التمويه لما المحتوى يتقرا.
  let securityBlock: string | null = null;
  if (input.kind === "file" && input.fileName) {
    const scan = scanFile({
      fileName: input.fileName,
      sizeBytes: input.fileSizeBytes ?? 1,
      head: new Uint8Array(0),
      declaredMime: input.mimeType,
    });
    if (!scan.allowed) securityBlock = describeScan(scan);
  }

  if (securityBlock) {
    return { status: "unsupported", sourceId: "", message: securityBlock };
  }

  const notSupported = input.kind === "file" ? unsupportedReason(info) : null;

  const { data, error } = await supabase
    .from("knowledge_sources")
    .insert({
      project_id: input.projectId,
      batch_id: input.batchId,
      kind: input.kind,
      title: input.title,
      file_name: input.fileName ?? null,
      mime_type: input.mimeType ?? null,
      file_size_bytes: input.fileSizeBytes ?? null,
      storage_path: input.storagePath ?? null,
      source_url: input.sourceUrl ?? null,
      content_hash: input.contentHash ?? null,
      declared_domain: input.declaredDomain ?? null,
      status: notSupported ? "skipped_duplicate" : "pending",
      last_error: notSupported,
      metadata: input.pastedText ? { pasted_text: input.pastedText } : {},
      created_by: input.actorId ?? null,
    })
    .select("id")
    .single();

  if (error) {
    // 23505 = خرق قيد فريد → نفس التجزئة موجودة، يعني نفس الملف بالظبط.
    if (error.code === "23505") {
      return {
        status: "duplicate",
        message: `"${input.title}" مرفوع بالفعل في هذا المشروع — تم تخطّيه بدون إعادة تحليل.`,
      };
    }
    return { status: "error", message: error.message };
  }
  if (!data) return { status: "error", message: "تعذّر تسجيل المصدر." };

  await refreshBatchCounters(supabase, input.batchId);

  if (notSupported) {
    return { status: "unsupported", sourceId: data.id as string, message: notSupported };
  }
  return { status: "registered", sourceId: data.id as string };
}

// ============================================================
// إعادة المحاولة
// ============================================================

export interface RetryOutcome {
  retried: number;
  message: string;
}

/**
 * إعادة محاولة تحليل مصدر فشل.
 *
 * ليه دي مش رفاهية: بصمة المحتوى (`content_hash`) بتمنع رفع نفس الملف
 * تاني، فالمستخدم مش قادر يصلّح مصدر فاشل بإعادة رفعه — إعادة المحاولة
 * هي المسار الوحيد.
 *
 * المقاطع القديمة بتتمسح قبل إعادة الجدولة: المصدر ممكن يكون فشل بعد ما
 * استخرج نص ناقص أو مقاطع نصّها اتعلّم كمعالَج، وإعادة التشغيل فوقها كانت
 * هتكمّل من نص تالف بدل ما تبدأ نظيفة.
 *
 * الملفات المحفوظة كمرجع (`skipped_duplicate`) مش داخلة هنا عن قصد —
 * دي مش أعطال، دي أنواع قرّرنا صراحةً إننا مانحلّلهاش.
 */
export async function retrySource(projectId: string, sourceId: string): Promise<RetryOutcome> {
  const supabase = createServiceClient();

  const { data: source, error: readErr } = await supabase
    .from("knowledge_sources")
    .select("id, status, title, kind, file_name, mime_type, extracted_chars")
    .eq("id", sourceId)
    .eq("project_id", projectId)
    .maybeSingle();

  if (readErr || !source) {
    return { retried: 0, message: "المصدر غير موجود." };
  }
  const s = source as { status: string; title: string; kind: string; file_name: string | null; mime_type: string | null; extracted_chars: number };
  if (!isReprocessableSource(s.status, s.kind, s.file_name, s.mime_type, s.extracted_chars)) {
    return { retried: 0, message: "لا يمكن إعادة معالجة هذا المصدر (نوعه غير مدعوم للاستخراج)." };
  }

  await resetSourceForRetry(supabase, sourceId);
  return { retried: 1, message: `أُعيدت جدولة "${s.title}" للتحليل.` };
}

/**
 * إعادة معالجة كل المصادر القابلة في المشروع دفعة واحدة: الفاشلة +
 * التي خرجت بلا نص + المتخطّاة التي صار نوعها مدعومًا (زي xlsx بعد إضافة
 * مستخرِجه). يستعمل نفس محدِّد `isReprocessableSource`.
 */
export async function retryAllFailedSources(projectId: string): Promise<RetryOutcome> {
  const supabase = createServiceClient();

  const { data, error } = await supabase
    .from("knowledge_sources")
    .select("id, status, kind, file_name, mime_type, extracted_chars")
    .eq("project_id", projectId);

  if (error) return { retried: 0, message: error.message };

  const rows = (data ?? []) as Array<{ id: string; status: string; kind: string; file_name: string | null; mime_type: string | null; extracted_chars: number }>;
  const ids = rows
    .filter((r) => isReprocessableSource(r.status, r.kind, r.file_name, r.mime_type, r.extracted_chars))
    .map((r) => r.id);
  if (ids.length === 0) return { retried: 0, message: "لا توجد مصادر قابلة لإعادة المعالجة." };

  for (const id of ids) await resetSourceForRetry(supabase, id);
  return { retried: ids.length, message: `أُعيدت جدولة ${ids.length} مصدر للتحليل.` };
}

/** يرجّع المصدر لحالته الأولى: مقاطع نظيفة وعدّادات مصفّرة. */
async function resetSourceForRetry(supabase: SupabaseClient, sourceId: string): Promise<void> {
  await supabase.from("knowledge_chunks").delete().eq("source_id", sourceId);

  await supabase
    .from("knowledge_sources")
    .update({
      status: "pending",
      last_error: null,
      extracted_chars: 0,
      chunk_count: 0,
      item_count: 0,
    })
    .eq("id", sourceId);
}
