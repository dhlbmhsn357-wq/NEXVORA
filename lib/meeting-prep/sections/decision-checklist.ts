import { generateSection, isNonEmptyString, type SectionGenerationResult } from "../generator-runner";
import type { MeetingPrepContext } from "../context";
import type { DecisionChecklistContent, DecisionItem } from "../types";

function isItem(v: unknown): v is DecisionItem {
  if (typeof v !== "object" || v === null) return false;
  const o = v as Record<string, unknown>;
  return isNonEmptyString(o.decision) && isNonEmptyString(o.why_critical);
}

export async function generateDecisionChecklist(
  ctx: MeetingPrepContext,
  actorId?: string | null
): Promise<SectionGenerationResult<DecisionChecklistContent>> {
  return generateSection<DecisionChecklistContent>({
    sectionKey: "decision_checklist",
    ctx,
    schemaInstructions: `اكتب "قائمة القرارات المطلوبة" — القرارات اللي لازم ما يتأجلش اتخاذها لحد ما الاجتماع يخلص، عشان المشروع يقدر يتقدّم.

الـ Schema:
{
  "items": [
    { "decision": "القرار المطلوب اتخاذه", "why_critical": "ليه لازم يتحسم في الاجتماع ده تحديدًا" }
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
