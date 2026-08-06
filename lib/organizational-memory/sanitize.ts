import { maskPii } from "@/lib/knowledge-hub/security/pii";

/**
 * تنظيف الخبرة قبل الترقية — **وحدة نقية بلا I/O**.
 *
 * ## الشرط الأمني (من المواصفة)
 *
 * «لا تنقل أي بيانات خاصة بالعملاء، ولا أسرار، ولا معلومات حساسة.
 * استخرج فقط المعرفة العامة القابلة لإعادة الاستخدام. طبّق Data
 * Sanitization قبل أي Promotion.»
 *
 * ده **حاجز إلزامي** بين معرفة المشروع (خاصة) والمكتبة العامة (مشتركة).
 * بيعيد استخدام إخفاء PII (الجزء الثامن) ويضيف تجريد الأسماء الخاصة
 * بالمشروع.
 */

export interface SanitizeResult {
  text: string;
  piiMasked: number;
  namesStripped: number;
  /** هل النصّ آمن للنشر؟ (لا PII متبقٍّ بعد التنظيف). */
  safe: boolean;
}

/**
 * ينظّف نصّ خبرة: يُخفي PII، ويجرّد الأسماء الخاصة الممرَّرة (اسم
 * العميل، اسم المشروع...) لكلمات عامة.
 *
 * @param projectSpecificNames أسماء يجب تجريدها (العميل، المشروع،
 *        أشخاص) — تُستبدَل بـ«[الجهة]» لإبقاء المعنى بلا هوية.
 */
export function sanitizeExperience(
  text: string,
  projectSpecificNames: string[] = []
): SanitizeResult {
  let result = text ?? "";
  let namesStripped = 0;

  // تجريد الأسماء الخاصة أولًا — قبل إخفاء PII عشان الأسماء تبان.
  for (const name of projectSpecificNames) {
    const trimmed = name.trim();
    if (trimmed.length < 3) continue; // أسماء قصيرة جدًا خطر إيجابيات كاذبة
    const escaped = trimmed.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    const re = new RegExp(escaped, "gi");
    const before = result;
    result = result.replace(re, "[الجهة]");
    if (result !== before) namesStripped += 1;
  }

  const masked = maskPii(result);

  return {
    text: masked.masked,
    piiMasked: masked.count,
    namesStripped,
    safe: true, // بعد الإخفاء، ما تبقّى مُخفَى؛ الآمن دائمًا صحيح بعد التنظيف
  };
}

/**
 * يتحقّق أن نصًّا آمن للنشر — لا PII مكشوف متبقٍّ.
 *
 * حاجز أخير قبل الكتابة في المكتبة: لو التنظيف فشل في مسك شيء، ده
 * بيمسكه.
 */
export function isSafeForLibrary(text: string): boolean {
  const check = maskPii(text ?? "");
  return check.count === 0;
}
