import { generateSection, toCleanStringArray, type SectionGenerationResult } from "../generator-runner";
import type { MeetingPrepContext } from "../context";
import type { ScopeProtectionContent } from "../types";

export async function generateScopeProtection(
  ctx: MeetingPrepContext,
  actorId?: string | null
): Promise<SectionGenerationResult<ScopeProtectionContent>> {
  return generateSection<ScopeProtectionContent>({
    sectionKey: "scope_protection",
    ctx,
    schemaInstructions: `اكتب "حماية النطاق" — إزاي الـ PM يمنع الـ Scope Creep أثناء الاجتماع، وعبارات جاهزة يستخدمها لإدارة توقعات العميل بلباقة بدون ما يرفض بشكل جامد.

الـ Schema:
{
  "tactics": ["تكتيك 1", "تكتيك 2"],
  "suggested_phrases": ["عبارة مقترحة 1", "عبارة مقترحة 2"],
  "confidence": { "score": 0-100, "reason": نص أو null }
}`,
    validateContent: (obj) => {
      const tactics = toCleanStringArray(obj.tactics);
      const phrases = toCleanStringArray(obj.suggested_phrases);
      if (tactics.length === 0 || phrases.length === 0) {
        return { ok: false, reason: "tactics أو suggested_phrases فارغة." };
      }
      return { ok: true, data: { tactics, suggested_phrases: phrases } };
    },
    actorId,
  });
}
