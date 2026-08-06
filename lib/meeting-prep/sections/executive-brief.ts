import { generateSection, isNonEmptyString, type SectionGenerationResult } from "../generator-runner";
import type { MeetingPrepContext } from "../context";
import type { ExecutiveBriefContent } from "../types";

export async function generateExecutiveBrief(
  ctx: MeetingPrepContext,
  actorId?: string | null
): Promise<SectionGenerationResult<ExecutiveBriefContent>> {
  return generateSection<ExecutiveBriefContent>({
    sectionKey: "executive_brief",
    ctx,
    schemaInstructions: `اكتب "الملخص التنفيذي" — نص واحد مختصر يقدر مدير المشروع يقرأه في أقل من دقيقتين قبل الاجتماع مباشرة، يلخّص من هو العميل، إيه اللي عايزه، وأهم نقطة لازم يركّز عليها في الاجتماع.

الـ Schema:
{
  "summary": "نص الملخص (فقرة واحدة إلى ثلاث فقرات قصيرة)",
  "confidence": { "score": 0-100, "reason": نص أو null }
}`,
    validateContent: (obj) => {
      const summary = obj.summary;
      if (!isNonEmptyString(summary)) return { ok: false, reason: "summary مفقود أو فارغ." };
      return { ok: true, data: summary };
    },
    actorId,
  });
}
