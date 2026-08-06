import { extractJsonObject } from "@/lib/discovery-analysis/validation";
import { validateExtract, type ProcessingExtract, type ValidationResult } from "@/lib/knowledge-hub/processing/validator";
import { normalizeEntityKey } from "@/lib/knowledge-hub/processing/taxonomy";

/**
 * يفكّ رد النموذج ويحوّله لكائنات ذكاء أعمال مُتحقَّقة.
 *
 * طبقتان:
 * 1. **الفكّ** — `extractJsonObject` بيتسامح مع Markdown fences ونصّ زائد
 *    حوالين الـ JSON (نفس أداة باقي المنظومة).
 * 2. **التحقق** — `validateExtract` النقي بيصلّح ويسقط الكائنات المعيبة.
 *
 * فوقهم **حارس الاقتباس**: أي كائن اقتباسه مش موجود حرفيًا في النص
 * المصدر بيتشال. ده نفس الحارس المطبّق في تصنيف المعرفة وتحليل الاكتشاف
 * — من غيره ممكن كائن مؤلَّف يدخل جدولًا مهيكلًا ومعاه "دليل" مزيّف.
 */

export type KnowledgeProcessingResult =
  | { ok: true; data: ProcessingExtract; dropped: ValidationResult["dropped"]; droppedForMissingQuote: number }
  | { ok: false; reason: string };

/** تطبيع للمقارنة: تطويل، تشكيل، اقتباسات، مسافات، حالة الأحرف. */
function normalize(text: string): string {
  return text
    .replace(/[ـ]/g, "")
    .replace(/[ً-ْٰ]/g, "")
    .replace(/[""''«»]/g, '"')
    .replace(/\s+/g, " ")
    .trim()
    .toLowerCase();
}

export function parseKnowledgeProcessing(
  raw: string | null,
  /** النص المصدر للتحقق من الاقتباسات. مرِّر null لتخطّي الحارس. */
  sourceText: string | null
): KnowledgeProcessingResult {
  if (!raw || raw.trim().length === 0) {
    return { ok: false, reason: "الرد من نموذج الذكاء الاصطناعي فارغ." };
  }

  const parsed = extractJsonObject(raw);
  if (parsed === null || typeof parsed !== "object" || Array.isArray(parsed)) {
    return { ok: false, reason: "الرد ليس كائن JSON صالحًا." };
  }

  const { data, dropped } = validateExtract(parsed);

  // حارس الاقتباس على الكائنات اللي بتحمل quote.
  const haystack = sourceText === null ? null : normalize(sourceText);
  let droppedForMissingQuote = 0;

  if (haystack !== null) {
    const grounded = <T extends { quote: string }>(arr: T[]): T[] =>
      arr.filter((o) => {
        if (o.quote && haystack.includes(normalize(o.quote))) return true;
        droppedForMissingQuote += 1;
        return false;
      });

    data.entities = grounded(data.entities);
    data.rules = grounded(data.rules);
    data.requirements = grounded(data.requirements);
    data.decisions = grounded(data.decisions);
    data.risks = grounded(data.risks);

    // العلاقة اللي طرفها اتشال لغياب اقتباسه لازم تتشال معاه — وإلا
    // بقت تشير لكيان مش موجود.
    const liveEntities = new Set(data.entities.map((e) => e.normalizedKey));
    data.relations = data.relations.filter(
      (r) => liveEntities.has(normalizeEntityKey(r.fromName)) && liveEntities.has(normalizeEntityKey(r.toName))
    );
  }

  return { ok: true, data, dropped, droppedForMissingQuote };
}
