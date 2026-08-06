import { generateSection, isNonEmptyString, type SectionGenerationResult } from "../generator-runner";
import type { MeetingPrepContext } from "../context";
import type { AgendaItem, SuggestedAgendaContent } from "../types";

function isAgendaItem(v: unknown): v is AgendaItem {
  if (typeof v !== "object" || v === null) return false;
  const o = v as Record<string, unknown>;
  return (
    isNonEmptyString(o.title) &&
    isNonEmptyString(o.description) &&
    typeof o.duration_minutes === "number" &&
    Number.isFinite(o.duration_minutes) &&
    o.duration_minutes > 0
  );
}

export async function generateSuggestedAgenda(
  ctx: MeetingPrepContext,
  actorId?: string | null
): Promise<SectionGenerationResult<SuggestedAgendaContent>> {
  return generateSection<SuggestedAgendaContent>({
    sectionKey: "suggested_agenda",
    ctx,
    schemaInstructions: `اكتب "الأجندة المقترحة" — تقسيم كامل لاجتماع الاكتشاف بأقسام واضحة (مثال: مقدمة، فهم الـ Workflow الحالي، أسئلة العمل، مناقشة المزايا/Features، الميزانية، الجدول الزمني، الخطوات التالية) مع مدة مقترحة بالدقائق لكل قسم.

الـ Schema:
{
  "items": [
    { "title": "اسم القسم", "duration_minutes": رقم, "description": "وصف مختصر لما يحدث في هذا الجزء" }
  ],
  "confidence": { "score": 0-100, "reason": نص أو null }
}`,
    validateContent: (obj) => {
      const items = obj.items;
      if (!Array.isArray(items) || items.length === 0 || !items.every(isAgendaItem)) {
        return { ok: false, reason: "items غير صالحة." };
      }
      const total = items.reduce((sum, i) => sum + i.duration_minutes, 0);
      return { ok: true, data: { items, total_minutes: total } };
    },
    actorId,
  });
}
