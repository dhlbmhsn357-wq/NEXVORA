import type { SupabaseClient } from "@supabase/supabase-js";
import type { InformationClassification, Confidentiality } from "@/lib/market-research/types";
import type { UserRole } from "@/lib/types/database";
import { AIService } from "@/lib/ai/service";
import { rankByCurrentTruth, type RawRetrievedEntry, type RetrievedEntry } from "./current-truth-ranking";
import type { SourceDomain } from "./types";
import { DOMAIN_OBJECT_TYPE } from "./types";

/**
 * طبقة الاسترجاع لمساعد المشروع (Phase B) — البحث الدلالي المُصفّى حسب
 * المشروع + الصلاحيات + "الحقيقة الحالية".
 *
 * ## خطوات retrieveProjectKnowledge
 *   ١) embedding واحد فقط للسؤال (`AIService.embed`) — صفر نداءات
 *      embedding إضافية؛ الفهرسة (embedding للمحتوى نفسه) شغل Phase A
 *      وقت المزامنة، مش وقت الاستعلام.
 *   ٢) `p_exclude_confidential = (requesterRole === 'member')` — بوابة
 *      صلاحيات صلبة على مستوى SQL (migration 0118).
 *   ٣) استدعاء `match_project_assistant_knowledge`.
 *   ٤) **دفاع في العمق (defense-in-depth):** حتى لو الـ RPC فلترت صح،
 *      بنفلتر تاني هنا في التطبيق — سطرين إضافيين رخيصين مقابل عدم
 *      الاعتماد على نقطة إنفاذ واحدة لبيانات سرّية. نفس المنطق لـ
 *      is_current (المفروض الـ RPC فلترته بالفعل، لكن الفحص هنا أمان
 *      إضافي صفري التكلفة).
 *   ٥) ترتيب "الحقيقة الحالية" (`rankByCurrentTruth`، دالة نقية منفصلة).
 *   ٦) قصّ لعدد نهائي معقول لسياق Phase C + قصّ نص كل صف لحد أقصى.
 */

export interface RetrievalRequest {
  projectId: string;
  question: string;
  requesterRole: UserRole;
  /** فلتر اختياري لنطاق دومينات (لـ "اسأل في السياق" المستقبلي) — يُترجَم لـ object_type عبر DOMAIN_OBJECT_TYPE. */
  domainFilter?: SourceDomain[];
  /** عدد المرشّحين الخام من RPC قبل ترتيب/قصّ الحقيقة الحالية. افتراضي 18. */
  matchCount?: number;
  /** أدنى تشابه مقبول (cosine). افتراضي 0.5 — راجع DEFAULT_MATCH_THRESHOLD تحت. */
  matchThreshold?: number;
}

/**
 * الحد الأقصى لعدد النتائج النهائية اللي بتوصل لسياق Phase C (بعد ترتيب
 * الحقيقة الحالية) — قرار تحكّم تكلفة صريح: 8 مصادر كفاية لتغطية سؤال
 * واحد مركّز مع استشهادات واضحة، من غير ما نضخّم الـ prompt بعشرات
 * المقاطع. لو Phase C احتاجت أكتر لسيناريو معيّن، تقدر تمرّر matchCount
 * أعلى وتقصّ هي بنفسها بدل ما نغيّر الافتراضي هنا.
 */
const MAX_FINAL_ENTRIES = 8;

/** حجم افتراضي للمرشّحين الخام من RPC — أكبر من MAX_FINAL_ENTRIES بهامش كافٍ عشان ترتيب الحقيقة الحالية يقدر يفضّل طبقة أعلى حتى لو تشابهها الخام أقل قليلًا. */
const DEFAULT_MATCH_COUNT = 18;

/**
 * كان 0.7 (نفس عتبة match_knowledge_memory القديمة، مبنية على
 * text-embedding-004). بعد التحويل لـ gemini-embedding-001 مع
 * outputDimensionality=768 (0121_fix_deprecated_embedding_model)، توزيع
 * درجات التشابه اختلف — أسئلة بديهية عن بيانات موجودة فعليًا كانت بترجع
 * "لا توجد معلومات كافية" رغم وجود فهرسة صحيحة، لأن التشابه الخام كان
 * بيقع تحت 0.7 مع الموديل الجديد. 0.5 أكثر تسامحًا؛ الدقة النهائية
 * محفوظة برضه عن طريق ترتيب "الحقيقة الحالية" + قصّ MAX_FINAL_ENTRIES،
 * مش الاعتماد على عتبة تشابه خام واحدة كبوابة وحيدة.
 */
const DEFAULT_MATCH_THRESHOLD = 0.5;

/**
 * أقصى عدد حروف لمحتوى الصف الواحد وهو داخل سياق Phase C. قرار صريح:
 * القصّ بيحصل هنا (Phase B) لا في Phase C — عشان طبقة الاسترجاع تضمن
 * حجم سياق متوقّع بغضّ النظر مين المستدعي، وميزانية الـ prompt الكلية
 * تفضل: 8 صفوف × ~1200 حرف ≈ 9,600 حرف بحد أقصى لكل استرجاع، غير
 * البرومبت الثابت.
 */
export const MAX_ENTRY_CONTENT_CHARS = 1200;

export interface RetrievalError {
  code: "EMBEDDING_FAILED" | "RPC_FAILED";
  message: string;
}

export type RetrievalResult =
  | { ok: true; entries: RetrievedEntry[] }
  | { ok: false; error: RetrievalError };

interface MatchProjectAssistantKnowledgeRow {
  id: string;
  object_type: string;
  object_id: string;
  title: string | null;
  source_title: string | null;
  content: string;
  domain: string | null;
  classification: InformationClassification | null;
  confidentiality: Confidentiality | null;
  status: string | null;
  version: number | null;
  is_current: boolean;
  is_superseded: boolean;
  superseded_by: string | null;
  metadata: Record<string, unknown> | null;
  similarity: number;
}

function truncateContent(content: string): string {
  if (content.length <= MAX_ENTRY_CONTENT_CHARS) return content;
  return `${content.slice(0, MAX_ENTRY_CONTENT_CHARS)}…`;
}

function toRawEntry(row: MatchProjectAssistantKnowledgeRow): RawRetrievedEntry {
  return {
    id: row.id,
    objectType: row.object_type,
    objectId: row.object_id,
    title: row.title ?? "",
    sourceTitle: row.source_title || row.title || "",
    content: truncateContent(row.content),
    domain: row.domain,
    classification: row.classification,
    // نفس قاعدة Phase A: صفوف مالهاش سرّية متتبَّعة بتُعامَل كـ 'internal' (أبدًا public بصمت).
    confidentiality: row.confidentiality ?? "internal",
    status: row.status,
    version: row.version,
    isCurrent: row.is_current,
    isSuperseded: row.is_superseded,
    supersededBy: row.superseded_by,
    metadata: row.metadata ?? {},
    similarity: row.similarity,
  };
}

/**
 * يسترجع معرفة المشروع ذات الصلة بسؤال، مُصفّاة حسب المشروع والصلاحيات
 * ومُرتَّبة حسب "الحقيقة الحالية". بترجّع مصفوفة فاضية بهدوء لو مفيش
 * نتائج فوق العتبة — أبدًا لا ترمي استثناء لهذه الحالة الطبيعية.
 */
export async function retrieveProjectKnowledge(
  supabase: SupabaseClient,
  request: RetrievalRequest
): Promise<RetrievalResult> {
  const matchCount = request.matchCount ?? DEFAULT_MATCH_COUNT;
  const matchThreshold = request.matchThreshold ?? DEFAULT_MATCH_THRESHOLD;

  const embeddingResult = await AIService.embed(request.question, { projectId: request.projectId });
  if (!embeddingResult.success || !embeddingResult.embedding) {
    return {
      ok: false,
      error: {
        code: "EMBEDDING_FAILED",
        message: embeddingResult.error?.message ?? "فشل توليد embedding للسؤال.",
      },
    };
  }

  // البوابة الخادمية الصلبة: member أبدًا ما يشوفش confidentiality='confidential'.
  // منطق ثابت غير مشروط بأي شيء غير الدور — لا Prompt، لا فلتر اختياري.
  const excludeConfidential = request.requesterRole === "member";

  const objectTypes = request.domainFilter?.length
    ? Array.from(new Set(request.domainFilter.map((d) => DOMAIN_OBJECT_TYPE[d])))
    : null;

  const { data, error } = await supabase.rpc("match_project_assistant_knowledge", {
    p_project_id: request.projectId,
    query_embedding: embeddingResult.embedding,
    match_threshold: matchThreshold,
    match_count: matchCount,
    p_exclude_confidential: excludeConfidential,
    p_object_types: objectTypes,
  });

  if (error) {
    return { ok: false, error: { code: "RPC_FAILED", message: error.message } };
  }

  const rows = (data ?? []) as MatchProjectAssistantKnowledgeRow[];

  const rawEntries = rows
    // دفاع في العمق (defense-in-depth) #1: is_current — المفروض الـ RPC فلترته بالفعل.
    .filter((row) => row.is_current === true)
    // دفاع في العمق #2: السرّية — الحارس الحقيقي الوحيد ضد بيانات سرّية
    // بتوصل لمستخدم member، حتى لو حصل خطأ/تراجع مستقبلي في الـ RPC نفسها.
    .filter((row) => !excludeConfidential || row.confidentiality !== "confidential")
    .map(toRawEntry);

  const ranked = rankByCurrentTruth(rawEntries).slice(0, MAX_FINAL_ENTRIES);

  return { ok: true, entries: ranked };
}

// ============================================================
// fetchSupersededPredecessors (Phase C) — يقفل الفجوة اللي رصدتها Phase B:
// match_project_assistant_knowledge بترجّع is_current=true بس، فالصفوف
// المُستبدَلة (اللي هي بالظبط اللي محتاجينها عشان نشرح تعارض/تحديث)
// أبدًا ما بترجعش من الاسترجاع العادي. هنا استعلام تكميلي رخيص ومستهدف —
// مش re-query للبحث الدلالي ولا N+1: نداء واحد بـ
// `where superseded_by = any(ids)` لكل معرّفات النتائج الحالية مرة واحدة.
// ============================================================

interface PredecessorRow {
  id: string;
  object_type: string;
  object_id: string;
  title: string | null;
  source_title: string | null;
  content: string;
  domain: string | null;
  classification: InformationClassification | null;
  confidentiality: Confidentiality | null;
  status: string | null;
  version: number | null;
  is_current: boolean;
  is_superseded: boolean;
  superseded_by: string | null;
  metadata: Record<string, unknown> | null;
}

/**
 * يجيب أي صف "قديم" (is_superseded=true) بيشاور عبر `superseded_by` لصف
 * من `entries` الممرَّرة — عشان طبقة تركيب الإجابة (Phase C) تقدر تشوف
 * القديم والحالي مع بعض وتشرح التعارض/التحديث ("كانت المعلومة X، اتعدّلت
 * لـ Y"). استعلام مستهدف واحد بس، مش إعادة تشغيل للبحث الدلالي.
 *
 * `excludeConfidential`: نفس بوابة الصلاحيات المستخدمة في
 * retrieveProjectKnowledge — لازم تتمرّر بنفس القيمة (requesterRole ===
 * 'member') وإلا ممكن صف تاريخي سرّي يوصل لسياق الـ Prompt لمستخدم مش
 * مصرَّح له، حتى لو النتيجة الحالية المقابلة له مش سرّية.
 *
 * يرجّع Map: مفتاحها id الصف "الحالي" (target)، وقيمتها كل الصفوف
 * القديمة اللي بتستبدله (نادرًا أكتر من صف واحد، لكن ممكن نظريًا).
 */
export async function fetchSupersededPredecessors(
  supabase: SupabaseClient,
  entries: RetrievedEntry[],
  excludeConfidential = false
): Promise<Map<string, RetrievedEntry[]>> {
  const targetIds = Array.from(new Set(entries.map((e) => e.id)));
  if (targetIds.length === 0) return new Map();

  const { data, error } = await supabase
    .from("knowledge_memory")
    .select(
      "id, object_type, object_id, title, source_title, content, domain, classification, confidentiality, status, version, is_current, is_superseded, superseded_by, metadata"
    )
    .in("superseded_by", targetIds);

  if (error || !data) return new Map();

  const rows = data as PredecessorRow[];

  const rawPredecessors = rows
    // دفاع في العمق: لازم يكون فعلًا صف مُستبدَل بيشاور لصف موجود عندنا.
    .filter((row) => row.is_superseded === true && row.superseded_by)
    .filter((row) => !excludeConfidential || row.confidentiality !== "confidential")
    .map((row) => ({
      id: row.id,
      objectType: row.object_type,
      objectId: row.object_id,
      title: row.title ?? "",
      sourceTitle: row.source_title || row.title || "",
      content: truncateContent(row.content),
      domain: row.domain,
      classification: row.classification,
      confidentiality: row.confidentiality ?? "internal",
      status: row.status,
      version: row.version,
      isCurrent: row.is_current,
      isSuperseded: row.is_superseded,
      supersededBy: row.superseded_by,
      metadata: row.metadata ?? {},
      // مفيش تشابه دلالي حقيقي هنا — الصف مش جاي من بحث متجهي، جاي من
      // مطابقة عمود صريحة. 0 قيمة محايدة (أدنى قيمة ممكنة) بدل قيمة
      // مصطنعة ممكن تتفهم غلط كأنها تشابه فعلي.
      similarity: 0,
    })) satisfies RawRetrievedEntry[];

  const ranked = rankByCurrentTruth(rawPredecessors);

  const byTarget = new Map<string, RetrievedEntry[]>();
  for (const entry of ranked) {
    if (!entry.supersededBy) continue;
    const list = byTarget.get(entry.supersededBy) ?? [];
    list.push(entry);
    byTarget.set(entry.supersededBy, list);
  }
  return byTarget;
}
