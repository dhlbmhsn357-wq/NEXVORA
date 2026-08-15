/**
 * حسابات ملخص Prospecting — Pure functions، بدون I/O.
 */

/**
 * معدل التحويل = عدد المحوَّل إلى Leads ÷ عدد الجهات المؤكد تواصلها.
 * يتعامل مع القسمة على صفر: يرجّع null (لا يوجد معدل قابل للحساب بعد)
 * بدل NaN/Infinity.
 */
export function computeConversionRate(convertedCount: number, confirmedContactedCount: number): number | null {
  if (confirmedContactedCount <= 0) return null;
  if (convertedCount < 0) return null;
  return convertedCount / confirmedContactedCount;
}
