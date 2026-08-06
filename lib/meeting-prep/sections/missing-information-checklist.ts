import { generateSection, isNonEmptyString, type SectionGenerationResult } from "../generator-runner";
import type { MeetingPrepContext } from "../context";
import type { MissingInfoChecklistContent, MissingInfoItem } from "../types";

function isPriority(v: unknown): v is "high" | "medium" | "low" {
  return v === "high" || v === "medium" || v === "low";
}
function isItem(v: unknown): v is MissingInfoItem {
  if (typeof v !== "object" || v === null) return false;
  const o = v as Record<string, unknown>;
  return isNonEmptyString(o.info) && isNonEmptyString(o.why_needed) && isPriority(o.priority);
}

export async function generateMissingInformationChecklist(
  ctx: MeetingPrepContext,
  actorId?: string | null
): Promise<SectionGenerationResult<MissingInfoChecklistContent>> {
  return generateSection<MissingInfoChecklistContent>({
    sectionKey: "missing_information_checklist",
    ctx,
    schemaInstructions: `اكتب "قائمة المعلومات الناقصة" — كل معلومة مهمة ناقصة حاليًا ومحتاج الـ PM يجيبها في الاجتماع، مع سبب أهميتها.

الـ Schema:
{
  "items": [
    { "info": "المعلومة الناقصة", "why_needed": "ليه محتاجينها", "priority": "high" | "medium" | "low" }
  ],
  "confidence": { "score": 0-100, "reason": نص أو null }
}`,
    validateContent: (obj) => {
      const items = obj.items;
      if (!Array.isArray(items) || items.length === 0 || !items.every(isItem)) {
        return { ok: false, reason: "items غير صالحة." };
      }
      return { ok: true, data: { items } };
    },
    actorId,
  });
}
