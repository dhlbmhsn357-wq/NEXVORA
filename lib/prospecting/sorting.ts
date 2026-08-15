/**
 * ترتيب افتراضي لقائمة الجهات المستهدفة — Pure function، بدون I/O.
 * ====================================================================
 * الترتيب المطلوب: متابعة متأخرة → متابعة اليوم → مهتم → ردّ →
 * جاهز للتواصل → البقية (بالأحدث إنشاءً أولًا داخل كل فئة).
 */
import type { ProspectStatus } from "./types";

export interface SortableProspect {
  status: ProspectStatus;
  nextFollowUpAt: string | null;
  createdAt: string;
}

/** حدود بداية اليوم/نهايته بتوقيت UTC — كافٍ للترتيب النسبي هنا. */
function startOfDayUtc(iso: string): number {
  const d = new Date(iso);
  return Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate());
}

/** رتبة أقل = أولوية أعلى (تظهر أولًا). */
export function prospectSortRank(p: SortableProspect, nowIso: string): number {
  if (p.nextFollowUpAt) {
    const followUpDay = startOfDayUtc(p.nextFollowUpAt);
    const todayDay = startOfDayUtc(nowIso);
    if (followUpDay < todayDay) return 0; // متابعة متأخرة
    if (followUpDay === todayDay) return 1; // متابعة اليوم
  }
  if (p.status === "interested") return 2;
  if (p.status === "replied") return 3;
  if (p.status === "ready_to_contact") return 4;
  return 5; // البقية
}

/** يقارن جهتين حسب الترتيب الافتراضي — للاستخدام مع Array.prototype.sort. */
export function compareProspectsForDefaultOrder(a: SortableProspect, b: SortableProspect, nowIso: string): number {
  const rankDiff = prospectSortRank(a, nowIso) - prospectSortRank(b, nowIso);
  if (rankDiff !== 0) return rankDiff;
  // داخل نفس الفئة: الأحدث إنشاءً أولًا.
  return new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime();
}
