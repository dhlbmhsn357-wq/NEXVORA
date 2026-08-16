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
  /** أدنى تشابه مقبول (cosine). افتراضي 0.7 — نفس عتبة match_knowledge_memory الشائعة في المشروع، تحفظ توازن استدعاء/دقة معقول لأسئلة قصيرة بالعربي والإنجليزي. */
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

const DEFAULT_MATCH_THRESHOLD = 0.7;

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
