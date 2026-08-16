import type { RetrievedEntry } from "./current-truth-ranking";

/**
 * كشف تعارضات "سلسلة الاستبدال الصريحة" (formal supersede lineage) —
 * دالة نقية بالكامل، Phase B من مساعد المشروع.
 *
 * ## النطاق (عن قصد محدود)
 * ده بيحلّ **الاستبدال الصريح فقط**: صف بيشاور بعمود `supersededBy` لصف
 * تاني موجود في نفس مجموعة النتائج. تعارض *ضمني* بين قرارين مختلفين
 * تمامًا (من غير رابط supersededBy رسمي) خارج نطاق Phase B — ده شغل
 * تركيب الإجابة بالـ LLM في Phase C، اللي بيشوف الصفّين بتوقيتهم
 * وحالتهم ويقدر يستنتج التعارض الضمني ويشرحه.
 *
 * **ملاحظة مهمة عن بيانات Phase A/B الفعلية:** دالة الاسترجاع
 * (`match_project_assistant_knowledge`) بتفلتر `is_current=true` داخل
 * SQL، فالصفوف المُستبدَلة (`is_current=false`) عادةً *لا* بترجع من
 * الاسترجاع العادي. الدالة هنا لسه بتتعامل بشكل صحيح لو استُدعيت بمجموعة
 * أوسع (تشمل صفوف مُستبدَلة) — Phase C أو استعلام مساعد مستقبلي ممكن
 * يمرّر مجموعة زي دي صراحةً (مثلًا: "هات القرار الحالي + تاريخه الكامل").
 */

export interface ConflictGroup {
  /** مفتاح تجميع أفضل-محاولة — id الصف الحالي (رأس السلسلة). */
  topic: string;
  current: RetrievedEntry;
  superseded: RetrievedEntry[];
}

/**
 * يجمّع الصفوف اللي بينها سلسلة استبدال رسمية: لكل صف `superseded`
 * (isSuperseded=true) بيشاور لصف "حالي" موجود في نفس المجموعة عبر
 * `supersededBy`، بيتحط في مجموعة واحدة معاه. الصفوف اللي مالهاش
 * سلسلة (مفيش صف قديم بيشاور لها، ومش هي نفسها مُستبدَلة) مالهاش
 * ConflictGroup — مفيش تعارض يستحق الذكر.
 */
export function detectConflicts(entries: RetrievedEntry[]): ConflictGroup[] {
  const byId = new Map(entries.map((e) => [e.id, e]));

  // كل صف مُستبدَل بيشاور لصف "حالي" — بنجمّعهم حسب هدف الإشارة.
  const supersededByTarget = new Map<string, RetrievedEntry[]>();
  for (const entry of entries) {
    if (!entry.isSuperseded || !entry.supersededBy) continue;
    if (!byId.has(entry.supersededBy)) continue; // الهدف مش موجود في نفس المجموعة — تجاهل بأمان
    const list = supersededByTarget.get(entry.supersededBy) ?? [];
    list.push(entry);
    supersededByTarget.set(entry.supersededBy, list);
  }

  const groups: ConflictGroup[] = [];
  for (const [targetId, olderEntries] of supersededByTarget) {
    const current = byId.get(targetId);
    if (!current) continue;
    groups.push({
      topic: current.id,
      current,
      superseded: olderEntries,
    });
  }

  return groups;
}
