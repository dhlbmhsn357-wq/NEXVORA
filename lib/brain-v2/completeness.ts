import { BRAIN_SECTIONS, type BrainContent, type BrainSectionKey } from "./types";

/**
 * هل القسم "مكتمل" (فيه محتوى فعلي، مش فاضي)؟
 * القاعدة: قسم النص لازم يبقى فيه string غير فارغ. أقسام list لازم .length > 0
 * ما عدا business_rules و constraints — دي مش مطلوبة إجباريًا.
 */
function isSectionFilled(key: BrainSectionKey, content: unknown): boolean {
  switch (key) {
    case "executive_summary":
      return typeof content === "string" && content.trim().length > 0;
    case "business_model": {
      const c = content as { overview?: string; how_it_works?: string; value_delivery?: string; users_description?: string };
      return !!(c?.overview?.trim() || c?.how_it_works?.trim() || c?.value_delivery?.trim() || c?.users_description?.trim());
    }
    case "non_functional_requirements": {
      const c = content as Record<string, unknown[]>;
      return Object.values(c).some((v) => Array.isArray(v) && v.length > 0);
    }
    case "project_scope": {
      const c = content as { in_scope?: unknown[]; out_of_scope?: unknown[] };
      return (c?.in_scope?.length ?? 0) > 0 || (c?.out_of_scope?.length ?? 0) > 0;
    }
    default:
      return Array.isArray(content) && content.length > 0;
  }
}

/**
 * الأقسام الاختيارية (لا تنقص من الاكتمال لو فاضية). تُملأ يدويًا لاحقًا.
 */
const OPTIONAL_SECTIONS: BrainSectionKey[] = ["business_rules", "missing_information"];

/**
 * درجة اكتمال Brain (0..100).
 * صيغة بسيطة قابلة للفهم:
 *   لكل قسم إلزامي: يجمع (isFilled ? confidence/100 : 0)
 *   المتوسط × 100 = النتيجة
 * الأقسام الاختيارية تُعامَل كنقطة كاملة لو فاضية (ما تخصمش).
 */
export function computeBrainCompleteness(content: BrainContent): number {
  let sum = 0;
  let count = 0;
  for (const key of BRAIN_SECTIONS) {
    const section = content[key];
    const isOptional = OPTIONAL_SECTIONS.includes(key);
    const filled = isSectionFilled(key, section.content);
    if (isOptional && !filled) continue; // لا يُحسب
    const conf = Math.max(0, Math.min(100, section.meta.confidence));
    sum += filled ? conf / 100 : 0;
    count += 1;
  }
  if (count === 0) return 0;
  return Math.round((sum / count) * 100);
}

/**
 * قائمة الأقسام الفارغة (لعرضها في UI مع دعوة PM للتعديل).
 */
export function listEmptySections(content: BrainContent): BrainSectionKey[] {
  const out: BrainSectionKey[] = [];
  for (const key of BRAIN_SECTIONS) {
    if (!isSectionFilled(key, content[key].content)) out.push(key);
  }
  return out;
}
