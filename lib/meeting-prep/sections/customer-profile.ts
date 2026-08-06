import { generateSection, isNonEmptyString, type SectionGenerationResult } from "../generator-runner";
import type { MeetingPrepContext } from "../context";
import type { CustomerProfileContent } from "../types";

export async function generateCustomerProfile(
  ctx: MeetingPrepContext,
  actorId?: string | null
): Promise<SectionGenerationResult<CustomerProfileContent>> {
  return generateSection<CustomerProfileContent>({
    sectionKey: "customer_profile",
    ctx,
    schemaInstructions: `اكتب "من هو العميل؟" — ملف تعريفي عملي عن العميل يساعد الـ PM يدخل الاجتماع وهو فاهم مين قدامه.

الـ Schema:
{
  "who": "مين العميل (شخص/شركة/دوره)",
  "company_nature": "طبيعة عمل الشركة",
  "company_size": "حجم الشركة (تقديري لو مش مذكور صراحة، مع توضيح إنه تقدير)",
  "what_they_want_to_achieve": "إيه اللي العميل عايز يحققه من المشروع",
  "confidence": { "score": 0-100, "reason": نص أو null }
}`,
    validateContent: (obj) => {
      const who = obj.who;
      const nature = obj.company_nature;
      const size = obj.company_size;
      const goal = obj.what_they_want_to_achieve;
      if (![who, nature, size, goal].every(isNonEmptyString)) {
        return { ok: false, reason: "أحد الحقول المطلوبة مفقود." };
      }
      return {
        ok: true,
        data: {
          who: who as string,
          company_nature: nature as string,
          company_size: size as string,
          what_they_want_to_achieve: goal as string,
        },
      };
    },
    actorId,
  });
}
