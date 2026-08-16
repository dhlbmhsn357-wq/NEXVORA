/**
 * NEXVORA Product Definition — State Machine Chain Helpers (0122 Part 2/2)
 * ==========================================================================
 * دوال خالصة (Pure Functions) — بدون أي وصول لقاعدة بيانات ولا React —
 * تُستخدم في واجهتين: (1) لوحة "تعريف المنتج" (إدارة آلات الحالة محليًا
 * قبل الحفظ)، (2) عرض PRD المُهيكل — لضمان نفس أسلوب عرض سلسلة الأسهم في
 * المكانين.
 *
 * اتجاه السهم: "→" (يسار-لأصل) تم اختياره ليطابق نفس الاتفاقية المستخدمة
 * بالفعل في `prd-panel.tsx` (StateMachinesList، من الجزء الأول 0122) حيث
 * تُعرض السلسلة بـ `dir="ltr"` و`states.join(" → ")` — نفس الاتجاه هنا
 * للاتساق البصري بين تبويب "تعريف المنتج" وتبويب "PRD".
 */

export function stateChainString(states: readonly string[]): string {
  const clean = states.map((s) => s.trim()).filter(Boolean);
  if (clean.length === 0) return "";
  return clean.join(" → ");
}

/**
 * خيارات عنصر `<Select>` لحقل "من حالة"/"إلى حالة" في صفّ انتقال معيّن —
 * تتضمّن دائمًا كل الحالات الحالية بالإضافة للقيمة المحفوظة حاليًا في هذا
 * الحقل حتى لو لم تعد ضمن قائمة الحالات (بعد حذف/إعادة تسمية حالة) — عشان
 * الـ Select ميفضلش من غير القيمة المختارة فعليًا (تظهر كخيار إضافي بدل ما
 * تُمسَح بصمت أو يتعطّل الـ Select). القيمة الفاضية مش بتتضاف كخيار إضافي.
 */
export function transitionEndpointOptions(states: readonly string[], currentValue: string): string[] {
  const clean = states.map((s) => s.trim()).filter(Boolean);
  const trimmedCurrent = currentValue.trim();
  if (trimmedCurrent && !clean.includes(trimmedCurrent)) {
    return [...clean, trimmedCurrent];
  }
  return clean;
}

/** true لو "من"/"إلى" الانتقال بترجع لحالة لم تعد موجودة في قائمة الحالات الحالية (بعد حذف/إعادة تسمية). */
export function transitionReferencesStaleState(
  transition: { from: string; to: string },
  states: readonly string[]
): boolean {
  const clean = states.map((s) => s.trim());
  return !clean.includes(transition.from.trim()) || !clean.includes(transition.to.trim());
}
