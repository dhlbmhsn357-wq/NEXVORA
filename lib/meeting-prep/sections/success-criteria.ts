import { generateSection, toCleanStringArray, type SectionGenerationResult } from "../generator-runner";
import type { MeetingPrepContext } from "../context";
import type { SuccessCriteriaContent } from "../types";

export async function generateSuccessCriteria(
  ctx: MeetingPrepContext,
  actorId?: string | null
): Promise<SectionGenerationResult<SuccessCriteriaContent>> {
  return generateSection<SuccessCriteriaContent>({
    sectionKey: "success_criteria",
    ctx,
    schemaInstructions: `اكتب "معايير نجاح الاجتماع" — متى يُعتبر اجتماع الاكتشاف هذا ناجحًا؟ (معايير محددة وقابلة للتحقق، مش عامة).

الـ Schema:
{
  "criteria": ["معيار 1", "معيار 2"],
  "confidence": { "score": 0-100, "reason": نص أو null }
}`,
    validateContent: (obj) => {
      const criteria = toCleanStringArray(obj.criteria);
      if (criteria.length === 0) return { ok: false, reason: "criteria فارغة." };
      return { ok: true, data: { criteria } };
    },
    actorId,
  });
}
