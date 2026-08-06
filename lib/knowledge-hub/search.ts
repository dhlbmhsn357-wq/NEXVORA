import { isUsable, type KnowledgeObject } from "./model";

/**
 * طبقة البحث — **وحدة نقية**.
 *
 * ## لماذا لا نبحث بأسماء الملفات
 *
 * المواصفة منعت ده صراحةً، والسبب واضح لأي حد جرّب: اسم الملف
 * `تقرير-نهائي-v3-معدل.pdf` مابيقولش أي حاجة عن محتواه. البحث لازم
 * يمشي على المعنى: العنوان، المحتوى، الوسوم، التصنيف، البيانات
 * الوصفية.
 *
 * ## لماذا الترتيب مرجَّح لا مجرد «يحتوي»
 *
 * تطابق في العنوان أقوى بكتير من تطابق في وسط نصّ طويل. بدون ترجيح،
 * مستند بيذكر الكلمة عرضًا بيطلع فوق المستند اللي موضوعه الكلمة دي.
 *
 * البحث الدلالي (بالأشعة) مؤجَّل بقرار: البنية موجودة من ٠٠٥١، لكن
 * البحث النصّي المرجَّح بيغطّي الاستخدام الحقيقي بتكلفة صفر — والدلالي
 * بيتحطّ لما يبان إن النصّي مش كفاية.
 */

export interface SearchQuery {
  text?: string;
  categories?: string[];
  tags?: string[];
  sourceTypes?: string[];
  /** أقل ثقة مقبولة — لتصفية المعرفة غير المؤكَّدة. */
  minConfidence?: number;
  /** يشمل غير الصالح للاستخدام (المرفوض والمؤرشف) — للتدقيق. */
  includeUnusable?: boolean;
  limit?: number;
}

export interface SearchHit {
  object: KnowledgeObject;
  score: number;
  /** أين تطابق — يُعرض للمستخدم عشان يفهم ليه النتيجة دي ظهرت. */
  matchedIn: MatchField[];
}

export type MatchField = "title" | "content" | "tags" | "category" | "summary" | "metadata";

/**
 * أوزان التطابق.
 *
 * الوسم أعلى من المحتوى: الوسم قرار مقصود من إنسان أو تصنيف واثق من
 * النظام، والورود في المحتوى ممكن يكون مصادفة.
 */
const FIELD_WEIGHT: Record<MatchField, number> = {
  title: 10,
  tags: 6,
  summary: 5,
  category: 4,
  content: 2,
  metadata: 1,
};

export function search(objects: KnowledgeObject[], query: SearchQuery): SearchHit[] {
  const pool = query.includeUnusable ? objects : objects.filter((o) => isUsable(o.status));
  const terms = tokenize(query.text ?? "");

  const hits: SearchHit[] = [];

  for (const object of pool) {
    if (!passesFilters(object, query)) continue;

    // بحث بلا نصّ = تصفية فقط. الترتيب ساعتها بالأهمية لا بالتطابق.
    if (terms.length === 0) {
      hits.push({ object, score: object.importance, matchedIn: [] });
      continue;
    }

    const { score, matchedIn } = scoreObject(object, terms);
    if (score > 0) hits.push({ object, score, matchedIn });
  }

  hits.sort((a, b) => {
    if (b.score !== a.score) return b.score - a.score;
    // التعادل يُحسم بالأهمية ثم الحداثة — لا بترتيب عشوائي.
    if (b.object.importance !== a.object.importance) {
      return b.object.importance - a.object.importance;
    }
    return b.object.updatedAt.getTime() - a.object.updatedAt.getTime();
  });

  return typeof query.limit === "number" ? hits.slice(0, query.limit) : hits;
}

function passesFilters(object: KnowledgeObject, query: SearchQuery): boolean {
  if (query.categories?.length && !query.categories.includes(object.category)) return false;
  if (query.sourceTypes?.length && !query.sourceTypes.includes(object.sourceType)) return false;
  if (typeof query.minConfidence === "number" && object.confidence < query.minConfidence) {
    return false;
  }
  if (query.tags?.length) {
    const objectTags = new Set(object.tags.map(normalize));
    // كل الوسوم المطلوبة لازم تكون موجودة: الفلتر تضييق لا توسيع.
    if (!query.tags.every((t) => objectTags.has(normalize(t)))) return false;
  }
  return true;
}

function scoreObject(
  object: KnowledgeObject,
  terms: string[]
): { score: number; matchedIn: MatchField[] } {
  const fields: Array<[MatchField, string]> = [
    ["title", object.title],
    ["summary", object.summary ?? ""],
    ["tags", object.tags.join(" ")],
    ["category", object.category],
    ["content", object.content],
    ["metadata", JSON.stringify(object.metadata ?? {})],
  ];

  let score = 0;
  const matchedIn: MatchField[] = [];

  for (const [field, rawValue] of fields) {
    const value = normalize(rawValue);
    if (!value) continue;

    let fieldHits = 0;
    for (const term of terms) {
      if (value.includes(term)) fieldHits += 1;
    }

    if (fieldHits > 0) {
      matchedIn.push(field);
      score += fieldHits * FIELD_WEIGHT[field];
    }
  }

  // تطابق كل الكلمات في نفس الحقل إشارة قوية على أن النتيجة مقصودة.
  if (matchedIn.length > 0 && terms.length > 1) {
    const titleValue = normalize(object.title);
    if (terms.every((t) => titleValue.includes(t))) score += 15;
  }

  return { score, matchedIn };
}

/**
 * التطبيع العربي.
 *
 * بدونه، البحث عن «إدارة» مش هيلاقي «ادارة»، والبحث عن «عملية» مش
 * هيلاقي «عمليه». دي مش حالات نادرة — دي الكتابة العربية العادية.
 */
export function normalize(text: string): string {
  return text
    .toLowerCase()
    .replace(/[ً-ْ]/g, "") // التشكيل
    .replace(/[أإآ]/g, "ا") // أ إ آ ← ا
    .replace(/ة/g, "ه") // ة ← ه
    .replace(/ى/g, "ي") // ى ← ي
    .replace(/\s+/g, " ")
    .trim();
}

function tokenize(text: string): string[] {
  return normalize(text)
    .split(/[\s,،.؛;:!؟?()[\]{}"'/\\|-]+/)
    .map((t) => t.trim())
    .filter((t) => t.length >= 2);
}

export const MATCH_FIELD_LABELS: Record<MatchField, string> = {
  title: "العنوان",
  content: "المحتوى",
  tags: "الوسوم",
  category: "التصنيف",
  summary: "الملخّص",
  metadata: "البيانات الوصفية",
};
