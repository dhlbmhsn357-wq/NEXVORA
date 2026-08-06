import { generateSection, toCleanStringArray, type SectionGenerationResult } from "../generator-runner";
import type { MeetingPrepContext } from "../context";
import type { MeetingObjectivesContent } from "../types";

export async function generateMeetingObjectives(
  ctx: MeetingPrepContext,
  actorId?: string | null
): Promise<SectionGenerationResult<MeetingObjectivesContent>> {
  return generateSection<MeetingObjectivesContent>({
    sectionKey: "meeting_objectives",
    ctx,
    schemaInstructions: `اكتب "أهداف الاجتماع" — أهداف واضحة ومحددة لاجتماع الاكتشاف الأول مع هذا العميل تحديدًا (مش أهداف عامة).

الـ Schema:
{
  "objectives": ["هدف 1", "هدف 2", "..."],
  "confidence": { "score": 0-100, "reason": نص أو null }
}`,
    validateContent: (obj) => {
      const objectives = toCleanStringArray(obj.objectives);
      if (objectives.length === 0) return { ok: false, reason: "objectives فارغة." };
      return { ok: true, data: { objectives } };
    },
    actorId,
  });
}
