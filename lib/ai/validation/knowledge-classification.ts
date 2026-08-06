import { extractJsonObject } from "@/lib/discovery-analysis/validation";

/**
 * مُحقّق نتيجة تصنيف مقطع معرفة.
 *
 * أهم قاعدة هنا هي **حارس الاقتباس**: أي عنصر بيدّعي اقتباسًا حرفيًا مش
 * موجود فعلًا في نص المقطع بيتشال. ده نفس نمط الحماية من الهلوسة المطبّق
 * في تحليل الاكتشاف — من غيره كان ممكن معلومة مؤلَّفة تدخل الـ Brain
 * ومعاها "دليل" مزيّف يخلّيها تبان موثّقة.
 *
 * المقطع اللي بيرجع بلا عناصر **نتيجة صحيحة** مش فشل: صفحات الغلاف
 * والفهارس والترويسات مالهاش معرفة، ورفضها كان هيوقف معالجة مستندات
 * سليمة بالكامل.
 */

export interface KnowledgeItemDraft {
  category: string;
  title: string;
  content: string;
  confidence: number;
  quote: string;
  tags: string[];
}

export interface KnowledgeGapDraft {
  description: string;
  why_it_matters: string;
  needed_from: "client" | "meeting" | "research" | "management" | "engineering";
  priority: "high" | "medium" | "low";
}

export interface KnowledgeClassificationData {
  document_summary: string;
  language: string;
  items: KnowledgeItemDraft[];
  gaps: KnowledgeGapDraft[];
  /** عدد العناصر اللي اتشالت لأن اقتباسها مش موجود في النص. */
  droppedForMissingQuote: number;
}

export type KnowledgeClassificationResult =
  | { ok: true; data: KnowledgeClassificationData }
  | { ok: false; reason: string };

const NEEDED_FROM = ["client", "meeting", "research", "management", "engineering"] as const;
const PRIORITIES = ["high", "medium", "low"] as const;

function str(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

function clampConfidence(value: unknown): number {
  const n = typeof value === "number" ? value : Number(value);
  if (!Number.isFinite(n)) return 50;
  return Math.max(0, Math.min(100, Math.round(n)));
}

/** تطبيع للمقارنة: مسافات، تطويل، تشكيل، حالة الأحرف. */
function normalize(text: string): string {
  return text
    .replace(/[ـ]/g, "")
    .replace(/[ً-ْٰ]/g, "")
    .replace(/[""''«»]/g, '"')
    .replace(/\s+/g, " ")
    .trim()
    .toLowerCase();
}

/** تصنيف صالح: snake_case بحروف لاتينية صغيرة — يمنع تصنيفات فوضوية. */
function normalizeCategory(value: unknown): string {
  const raw = str(value).toLowerCase().replace(/\s+/g, "_").replace(/[^a-z0-9_]/g, "");
  return raw.length > 0 ? raw : "unknown";
}

export function validateKnowledgeClassification(
  raw: string | null,
  /** نص المقطع للتحقق من الاقتباسات. مرِّر null للمصادر اللي بتتقرأ كملف
   *  (PDF/صورة/صوت) لأن مفيش نص مرجعي نقارن بيه. */
  chunkText: string | null
): KnowledgeClassificationResult {
  if (!raw || raw.trim().length === 0) {
    return { ok: false, reason: "الرد من نموذج الذكاء الاصطناعي فارغ." };
  }

  const parsed = extractJsonObject(raw);
  if (parsed === null || typeof parsed !== "object" || Array.isArray(parsed)) {
    return { ok: false, reason: "الرد ليس كائن JSON صالحًا." };
  }
  const obj = parsed as Record<string, unknown>;

  const haystack = chunkText === null ? null : normalize(chunkText);

  const items: KnowledgeItemDraft[] = [];
  let dropped = 0;

  if (Array.isArray(obj.items)) {
    for (const entry of obj.items) {
      if (!entry || typeof entry !== "object") continue;
      const o = entry as Record<string, unknown>;

      const title = str(o.title);
      const content = str(o.content);
      if (title.length === 0 || content.length === 0) continue;

      const quote = str(o.quote);

      // حارس الاقتباس: لو عندنا نص مرجعي، الاقتباس لازم يكون موجود فيه.
      if (haystack !== null) {
        if (quote.length === 0) {
          dropped += 1;
          continue;
        }
        if (!haystack.includes(normalize(quote))) {
          dropped += 1;
          continue;
        }
      }

      items.push({
        category: normalizeCategory(o.category),
        title,
        content,
        confidence: clampConfidence(o.confidence),
        quote,
        tags: Array.isArray(o.tags)
          ? o.tags.map((t) => str(t)).filter((t) => t.length > 0).slice(0, 8)
          : [],
      });
    }
  }

  const gaps: KnowledgeGapDraft[] = [];
  if (Array.isArray(obj.gaps)) {
    for (const entry of obj.gaps) {
      if (!entry || typeof entry !== "object") continue;
      const o = entry as Record<string, unknown>;
      const description = str(o.description);
      if (description.length === 0) continue;

      const neededRaw = str(o.needed_from) as (typeof NEEDED_FROM)[number];
      const priorityRaw = str(o.priority) as (typeof PRIORITIES)[number];

      gaps.push({
        description,
        why_it_matters: str(o.why_it_matters),
        needed_from: NEEDED_FROM.includes(neededRaw) ? neededRaw : "client",
        priority: PRIORITIES.includes(priorityRaw) ? priorityRaw : "medium",
      });
    }
  }

  return {
    ok: true,
    data: {
      document_summary: str(obj.document_summary),
      language: str(obj.language) || "ar",
      items,
      gaps,
      droppedForMissingQuote: dropped,
    },
  };
}
