import { generateSection, isNonEmptyString, type SectionGenerationResult } from "../generator-runner";
import type { MeetingPrepContext } from "../context";
import type { SmartQuestionItem, SmartQuestionsContent } from "../types";

function isPriority(v: unknown): v is "high" | "medium" | "low" {
  return v === "high" || v === "medium" || v === "low";
}
function isItem(v: unknown): v is SmartQuestionItem {
  if (typeof v !== "object" || v === null) return false;
  const o = v as Record<string, unknown>;
  return isNonEmptyString(o.question) && isNonEmptyString(o.reason) && isPriority(o.priority);
}

export async function generateSmartQuestions(
  ctx: MeetingPrepContext,
  actorId?: string | null
): Promise<SectionGenerationResult<SmartQuestionsContent>> {
  return generateSection<SmartQuestionsContent>({
    sectionKey: "smart_questions",
    ctx,
    schemaInstructions: `اكتب "أسئلة ذكية" — أهم الأسئلة اللي لسه محتاجة إجابة من العميل، مرتبة بالأولوية، بناءً على الفجوات في بيانات الاكتشاف الحالية.

الـ Schema:
{
  "items": [
    { "question": "نص السؤال", "reason": "ليه السؤال ده مهم", "priority": "high" | "medium" | "low" }
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
