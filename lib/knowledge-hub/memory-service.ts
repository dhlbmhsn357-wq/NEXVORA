import type { SupabaseClient } from "@supabase/supabase-js";
import { createServiceClient } from "@/lib/supabase/service";
import { AIService } from "@/lib/ai/service";
import { hashInput } from "@/lib/ai-platform/cache/keys";
import {
  assembleContextText,
  compressToBudget,
  rankMemories,
  type MemoryCandidate,
} from "./retrieval/ranking";

/**
 * الذاكرة الدلالية لمركز المعرفة — **تغذية الفهرس واسترجاعه**.
 *
 * ## المكان في المنظومة
 *
 * بعد ما `processing-service` بيستخرج الكائنات المهيكلة، ده **بيفهرسها
 * دلاليًا**: كل كائن بياخد متجهًا في `knowledge_memory`، فيبقى قابلًا
 * للاسترجاع بالمعنى لا بالكلمة. والاسترجاع بيغذّي أي مولّد (PRD، عرض،
 * برومبت) بالسياق الأصدق للسؤال.
 *
 * البحث الدلالي القديم (`knowledge_graph`) بيشتغل على عُقد Brain
 * المعتمَدة. ده **موازٍ**: بيشتغل على كائنات مركز المعرفة الخام قبل ما
 * توصل الـ Brain — فبيدّي سياقًا أوسع وأبكر.
 */

/** أقصى عدد كائنات بيتعمل لها embedding في استدعاء واحد. */
const MAX_EMBEDS_PER_CALL = 40;

/** حدود الاسترجاع الدلالي. */
const RETRIEVE_THRESHOLD = 0.35;
const RETRIEVE_COUNT = 30;

/** ميزانية السياق الافتراضية بالأحرف. */
const DEFAULT_CONTEXT_CHARS = 6000;

type MemoryObjectType =
  | "entity"
  | "business_rule"
  | "workflow"
  | "requirement"
  | "decision"
  | "risk"
  | "item";

interface IndexableObject {
  objectType: MemoryObjectType;
  objectId: string;
  title: string;
  content: string;
  domain: string | null;
}

export interface MemorySyncOutcome {
  status: "idle" | "synced";
  embedded: number;
  skipped: number;
  remaining: number;
}

// ============================================================
// المزامنة — تغذية الفهرس
// ============================================================

/**
 * يفهرس دفعة من الكائنات غير المفهرسة (أو المتغيّرة).
 *
 * بيقارن `content_hash`: الكائن اللي نصّه ما اتغيّرش بيُتخطّى بلا نداء
 * embedding — ده اللي بيخلّي إعادة التشغيل رخيصة. بيرجّع `remaining`
 * عشان المستدعي (عامل/واجهة) يعرف يكمّل ولا لأ.
 */
export async function syncMemoryBatch(projectId: string): Promise<MemorySyncOutcome> {
  const supabase = createServiceClient();

  const objects = await gatherIndexable(supabase, projectId);
  if (objects.length === 0) return { status: "idle", embedded: 0, skipped: 0, remaining: 0 };

  // الهاش الموجود لكل كائن — لتخطّي غير المتغيّر.
  const { data: existingRows } = await supabase
    .from("knowledge_memory")
    .select("object_type, object_id, content_hash")
    .eq("project_id", projectId);

  const existingHash = new Map<string, string>();
  for (const r of (existingRows ?? []) as Array<{ object_type: string; object_id: string; content_hash: string }>) {
    existingHash.set(`${r.object_type}::${r.object_id}`, r.content_hash);
  }

  const stale = objects.filter((o) => {
    const hash = hashInput(o.content);
    return existingHash.get(`${o.objectType}::${o.objectId}`) !== hash;
  });

  const skipped = objects.length - stale.length;
  const batch = stale.slice(0, MAX_EMBEDS_PER_CALL);
  let embedded = 0;

  for (const obj of batch) {
    const text = obj.title ? `${obj.title}\n${obj.content}` : obj.content;
    const embeddingResult = await AIService.embed(text, { projectId });
    if (!embeddingResult.success || !embeddingResult.embedding) {
      // فشل embedding لكائن واحد مايوقفش الباقي — نكمّل، والباقي يتحاول
      // في الدفعة الجاية (لسه بلا صف، فبيفضل "متغيّر").
      console.error(
        `[KnowledgeHub] فشل embedding للكائن ${obj.objectType}:${obj.objectId}: ${embeddingResult.error?.message}`
      );
      continue;
    }

    const { error } = await supabase.from("knowledge_memory").upsert(
      {
        project_id: projectId,
        object_type: obj.objectType,
        object_id: obj.objectId,
        title: obj.title,
        content: obj.content,
        embedding: embeddingResult.embedding,
        domain: obj.domain,
        content_hash: hashInput(obj.content),
      },
      { onConflict: "object_type,object_id" }
    );
    if (!error) embedded += 1;
  }

  return {
    status: "synced",
    embedded,
    skipped,
    remaining: Math.max(0, stale.length - batch.length),
  };
}

/**
 * يجمع كل الكائنات القابلة للفهرسة من جداول المعالجة.
 *
 * كل نوع بيتحوّل لنصّ موحّد: قاعدة العمل = «الشرط ⇐ النتيجة»، المخاطرة =
 * «الوصف (احتمال/شدّة)». التوحيد ده بيخلّي البحث الواحد يقارن تفاحات
 * بتفاحات عبر الأنواع.
 */
async function gatherIndexable(
  supabase: SupabaseClient,
  projectId: string
): Promise<IndexableObject[]> {
  const out: IndexableObject[] = [];

  const [entities, rules, requirements, decisions, risks] = await Promise.all([
    safe(supabase.from("knowledge_entities").select("id, name, description, entity_type").eq("project_id", projectId).eq("status", "active").limit(2000)),
    safe(supabase.from("knowledge_business_rules").select("id, name, condition, action, scope").eq("project_id", projectId).eq("status", "active").limit(2000)),
    safe(supabase.from("knowledge_requirements").select("id, statement, rationale, module").eq("project_id", projectId).eq("status", "active").limit(2000)),
    safe(supabase.from("knowledge_decisions").select("id, decision, rationale, impact").eq("project_id", projectId).eq("status", "active").limit(2000)),
    safe(supabase.from("knowledge_risks").select("id, description, mitigation, risk_type, likelihood, severity, affected_area").eq("project_id", projectId).eq("status", "active").limit(2000)),
  ]);

  for (const e of entities as Array<Record<string, string>>) {
    out.push({
      objectType: "entity",
      objectId: e.id,
      title: e.name,
      content: e.description || e.name,
      domain: e.entity_type ?? null,
    });
  }
  for (const r of rules as Array<Record<string, string>>) {
    out.push({
      objectType: "business_rule",
      objectId: r.id,
      title: r.name,
      content: `${r.condition} ⇐ ${r.action}`,
      domain: r.scope ?? null,
    });
  }
  for (const q of requirements as Array<Record<string, string>>) {
    out.push({
      objectType: "requirement",
      objectId: q.id,
      title: "",
      content: q.rationale ? `${q.statement} — ${q.rationale}` : q.statement,
      domain: q.module ?? null,
    });
  }
  for (const d of decisions as Array<Record<string, string>>) {
    out.push({
      objectType: "decision",
      objectId: d.id,
      title: "",
      content: [d.decision, d.rationale, d.impact].filter(Boolean).join(" — "),
      domain: null,
    });
  }
  for (const k of risks as Array<Record<string, string>>) {
    out.push({
      objectType: "risk",
      objectId: k.id,
      title: "",
      content: `${k.description}${k.mitigation ? ` — التخفيف: ${k.mitigation}` : ""} (${k.likelihood}/${k.severity})`,
      domain: k.affected_area ?? k.risk_type ?? null,
    });
  }

  return out;
}

// ============================================================
// الاسترجاع
// ============================================================

export interface RetrievalResult {
  ok: boolean;
  message?: string;
  contextText: string;
  used: number;
  truncated: boolean;
  hits: Array<{ objectType: string; objectId: string; title: string; similarity: number; score: number }>;
}

/**
 * يسترجع سياقًا مرتَّبًا مضغوطًا لسؤال.
 *
 * دلاليًا أولًا (RPC)، ثم ترتيب مركّب (تشابه + ثقة + حداثة) نقي، ثم ضغط
 * لميزانية. الناتج نصّ جاهز للحقن في أي برومبت + قائمة المصادر للإفصاح.
 *
 * `nowMs` يُمرَّر للطبقة النقية — الخدمة بتقرأ الوقت مرة واحدة هنا عند
 * الحدود.
 */
export async function retrieveContext(
  projectId: string,
  query: string,
  options: { maxChars?: number; objectType?: MemoryObjectType; nowMs?: number } = {}
): Promise<RetrievalResult> {
  const empty: RetrievalResult = { ok: true, contextText: "", used: 0, truncated: false, hits: [] };
  const trimmed = query.trim();
  if (!trimmed) return empty;

  const embeddingResult = await AIService.embed(trimmed, { projectId });
  if (!embeddingResult.success || !embeddingResult.embedding) {
    return { ...empty, ok: false, message: embeddingResult.error?.message ?? "فشل توليد Embedding للاستعلام." };
  }

  const supabase = createServiceClient();
  const { data, error } = await supabase.rpc("match_knowledge_memory", {
    p_project_id: projectId,
    query_embedding: embeddingResult.embedding,
    match_threshold: RETRIEVE_THRESHOLD,
    match_count: RETRIEVE_COUNT,
    p_object_type: options.objectType ?? null,
  });
  if (error) return { ...empty, ok: false, message: error.message };

  const candidates: MemoryCandidate[] = (
    (data ?? []) as Array<{ object_type: string; object_id: string; title: string; content: string; similarity: number }>
  ).map((r) => ({
    objectType: r.object_type,
    objectId: r.object_id,
    title: r.title,
    content: r.content,
    similarity: r.similarity,
  }));

  const nowMs = options.nowMs ?? Date.now();
  const ranked = rankMemories(candidates, nowMs);
  const compressed = compressToBudget(ranked, options.maxChars ?? DEFAULT_CONTEXT_CHARS);

  return {
    ok: true,
    contextText: assembleContextText(compressed.included),
    used: compressed.usedChars,
    truncated: compressed.truncated,
    hits: compressed.included.map((h) => ({
      objectType: h.objectType,
      objectId: h.objectId,
      title: h.title,
      similarity: h.similarity,
      score: h.score,
    })),
  };
}

// ============================================================
// أدوات
// ============================================================

async function safe(
  query: PromiseLike<{ data: unknown; error: unknown }>
): Promise<unknown[]> {
  const { data, error } = await query;
  if (error) return [];
  return (data ?? []) as unknown[];
}
