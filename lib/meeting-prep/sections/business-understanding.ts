import { generateSection, isNonEmptyString, toCleanStringArray, type SectionGenerationResult } from "../generator-runner";
import type { MeetingPrepContext } from "../context";
import type { BusinessUnderstandingContent } from "../types";

export async function generateBusinessUnderstanding(
  ctx: MeetingPrepContext,
  actorId?: string | null
): Promise<SectionGenerationResult<BusinessUnderstandingContent>> {
  return generateSection<BusinessUnderstandingContent>({
    sectionKey: "business_understanding",
    ctx,
    schemaInstructions: `اكتب "فهم البيزنس" — إزاي شغل العميل بيمشي فعليًا حاليًا، ونقاط الألم الحالية.

الـ Schema:
{
  "how_it_works": "إزاي البيزنس شغال بشكل عام",
  "current_workflow": "الـ Workflow الحالي (خطوات العمل الحالية، يدوي أو بأدوات إيه)",
  "pain_points": ["نقطة ألم 1", "نقطة ألم 2"],
  "confidence": { "score": 0-100, "reason": نص أو null }
}`,
    validateContent: (obj) => {
      const how = obj.how_it_works;
      const workflow = obj.current_workflow;
      if (!isNonEmptyString(how) || !isNonEmptyString(workflow)) {
        return { ok: false, reason: "how_it_works أو current_workflow مفقود." };
      }
      return {
        ok: true,
        data: {
          how_it_works: how,
          current_workflow: workflow,
          pain_points: toCleanStringArray(obj.pain_points),
        },
      };
    },
    actorId,
  });
}
