import { generateSection, isNonEmptyString, type SectionGenerationResult } from "../generator-runner";
import type { MeetingPrepContext } from "../context";
import type { FollowUpChecklistContent, FollowUpItem } from "../types";

function isOwner(v: unknown): v is "pm" | "client" | "team" {
  return v === "pm" || v === "client" || v === "team";
}
function isItem(v: unknown): v is FollowUpItem {
  if (typeof v !== "object" || v === null) return false;
  const o = v as Record<string, unknown>;
  return isNonEmptyString(o.action) && isOwner(o.owner);
}

export async function generateFollowUpChecklist(
  ctx: MeetingPrepContext,
  actorId?: string | null
): Promise<SectionGenerationResult<FollowUpChecklistContent>> {
  return generateSection<FollowUpChecklistContent>({
    sectionKey: "follow_up_checklist",
    ctx,
    schemaInstructions: `اكتب "قائمة المتابعة بعد الاجتماع" — الخطوات اللي لازم تحصل فورًا بعد ما الاجتماع يخلص، ومين المسؤول عن كل خطوة.

الـ Schema:
{
  "items": [
    { "action": "الخطوة المطلوبة", "owner": "pm" | "client" | "team" }
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
