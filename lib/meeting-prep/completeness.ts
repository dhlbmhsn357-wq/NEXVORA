import type { MeetingPrepParticipant, MeetingRequiredItem } from "@/lib/types/database";
import type { MeetingPreparationRow } from "./types";

export interface PrepCompletenessResult {
  complete: boolean;
  missingReasons: string[];
}

/**
 * "مفروض النظام يحذّر الـ PM لو التجهيز ناقص. مفيش اجتماع يبدأ من غير
 * التحقق من التجهيز." — دالة Pure بتتحقق من الحد الأدنى الإلزامي قبل
 * السماح بـ Start Meeting: عنوان، مشارك واحد على الأقل، وكل العناصر
 * المطلوبة (لو وُجدت) اتوفّرت أو اتحدّد إنها مش لازمة.
 */
export function checkPreparationCompleteness(
  prep: MeetingPreparationRow | null,
  participants: MeetingPrepParticipant[],
  requiredItems: MeetingRequiredItem[]
): PrepCompletenessResult {
  const missingReasons: string[] = [];

  if (!prep) {
    return { complete: false, missingReasons: ["لا يوجد تجهيز اجتماع لهذا المشروع بعد."] };
  }
  if (!prep.title || prep.title.trim().length === 0) {
    missingReasons.push("عنوان الاجتماع غير محدّد.");
  }
  if (participants.length === 0) {
    missingReasons.push("لا يوجد أي مشارك مسجّل.");
  }
  const requiredParticipants = participants.filter((p) => p.is_required);
  if (participants.length > 0 && requiredParticipants.length === 0) {
    missingReasons.push("لا يوجد أي مشارك محدّد كإلزامي الحضور.");
  }

  const missingRequiredItems = requiredItems.filter((item) => !item.is_provided);
  if (missingRequiredItems.length > 0) {
    missingReasons.push(`${missingRequiredItems.length} عنصر مطلوب لسه ما اتوفّرش (${missingRequiredItems.map((i) => i.title).join("، ")}).`);
  }

  return { complete: missingReasons.length === 0, missingReasons };
}
