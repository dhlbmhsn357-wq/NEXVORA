import { keyOfItem } from "./diff";

export interface ResolvedChange {
  changeType: "add" | "modify";
  oldValue: unknown | null;
  conflict: boolean;
  itemLabel: string;
  /** true لو نفس المحتوى بالظبط موجود أصلًا — مش تغيير حقيقي، يُتجاهل قبل ما يبقى Pending Change. */
  isDuplicate: boolean;
}

/**
 * منطق حتمي خالص (بدون AI) لمقارنة عنصر معرفة جديد بمحتوى القسم
 * الحالي في آخر نسخة معتمدة من Brain — نفس آلية المطابقة المستخدمة في
 * diff.ts (keyOfItem) عشان نتجنّب منطقين مختلفين لنفس الفكرة.
 *
 * - مفيش عنصر بنفس المفتاح → إضافة جديدة، مفيش تعارض.
 * - فيه عنصر بنفس المفتاح ومحتواه مطابق حرفيًا → تكرار حقيقي، يُتجاهل.
 * - فيه عنصر بنفس المفتاح لكن محتواه مختلف → تعديل، وده "تعارض" لازم
 *   PM يشوف القديم والجديد ويقرر.
 */
export function resolveChangeAgainstSection(existingItems: unknown[], newValue: unknown): ResolvedChange {
  const newKey = keyOfItem(newValue);
  const label = newKey ?? "(بدون عنوان)";

  if (!newKey) {
    return { changeType: "add", oldValue: null, conflict: false, itemLabel: label, isDuplicate: false };
  }

  const existing = existingItems.find((it) => keyOfItem(it) === newKey) ?? null;
  if (!existing) {
    return { changeType: "add", oldValue: null, conflict: false, itemLabel: label, isDuplicate: false };
  }

  const identical = JSON.stringify(existing) === JSON.stringify(newValue);
  if (identical) {
    return { changeType: "modify", oldValue: existing, conflict: false, itemLabel: label, isDuplicate: true };
  }

  return { changeType: "modify", oldValue: existing, conflict: true, itemLabel: label, isDuplicate: false };
}
