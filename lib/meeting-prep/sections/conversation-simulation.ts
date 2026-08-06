import { generateSection, isNonEmptyString, type SectionGenerationResult } from "../generator-runner";
import type { MeetingPrepContext } from "../context";
import type { ConversationBranch, ConversationSimulationContent, ConversationTurn } from "../types";

function isTurn(v: unknown): v is ConversationTurn {
  if (typeof v !== "object" || v === null) return false;
  const o = v as Record<string, unknown>;
  return (o.speaker === "pm" || o.speaker === "client") && isNonEmptyString(o.line);
}
function isBranch(v: unknown): v is ConversationBranch {
  if (typeof v !== "object" || v === null) return false;
  const o = v as Record<string, unknown>;
  return isNonEmptyString(o.trigger) && isNonEmptyString(o.guidance);
}

export async function generateConversationSimulation(
  ctx: MeetingPrepContext,
  actorId?: string | null
): Promise<SectionGenerationResult<ConversationSimulationContent>> {
  return generateSection<ConversationSimulationContent>({
    sectionKey: "conversation_simulation",
    ctx,
    schemaInstructions: `اكتب "محاكاة الحوار" — أهم قسم في التجهيز. اعمل جزئين:

1) "dialogue": مثال حوار واقعي بين الـ PM والعميل (8-14 سطر بالتبادل)، مبني فعليًا على بيانات هذا المشروع (اسم الشركة، طبيعة عملها، احتياجاتها).
2) "branches": إرشادات تفريعية عملية — لكل حالة محتملة، اكتب trigger (مثلاً "لو العميل قال إن الميزانية محدودة" أو "لو اعترض على مدة التنفيذ" أو "لو طلب Feature إضافية غير متفق عليها" أو "لو رفض فكرة معينة") و guidance (بالظبط إيه اللي الـ PM يقوله أو يعمله). غطِّ على الأقل 6 حالات متنوعة (اعتراض، طلب إضافي، رفض ميزة، سؤال عن السعر، سؤال عن المدة، تردد في القرار).

الـ Schema:
{
  "dialogue": [ { "speaker": "pm" | "client", "line": "نص الجملة" } ],
  "branches": [ { "trigger": "الموقف", "guidance": "الإرشاد" } ],
  "confidence": { "score": 0-100, "reason": نص أو null }
}`,
    validateContent: (obj) => {
      const dialogue = obj.dialogue;
      const branches = obj.branches;
      if (!Array.isArray(dialogue) || dialogue.length === 0 || !dialogue.every(isTurn)) {
        return { ok: false, reason: "dialogue غير صالح." };
      }
      if (!Array.isArray(branches) || branches.length === 0 || !branches.every(isBranch)) {
        return { ok: false, reason: "branches غير صالحة." };
      }
      return { ok: true, data: { dialogue, branches } };
    },
    actorId,
  });
}
