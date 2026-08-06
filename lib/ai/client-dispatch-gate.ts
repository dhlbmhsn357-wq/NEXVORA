/**
 * Global (module-level) client-side dispatch pacer — مشترك بين كل لوحات
 * التدقيق/التحقق في نفس تبويب المتصفح. الغرض: تسلسل إطلاق مهام الـ AI في
 * الخلفية (المحاور/المراحل) بحيث حتى لو أكتر من لوحة (Static / Security /
 * Database / Architecture / Code Quality / PRD Compliance / Performance /
 * Functional) كانت "جاري التنفيذ" في نفس الوقت، مايطلقوش نداءات Gemini
 * متوازية تستهلك حصة الـ per-minute المشتركة دفعة واحدة.
 *
 * كل لوحة قبل ما تطلق محور جديد بتنادي canDispatchNow()؛ لو رجّعت false
 * (فيه إطلاق طائر حاليًا، أو لسه مامرّش الحد الأدنى من الوقت من آخر إطلاق)
 * بتأجّل — والـ Polling (كل 4 ثواني) بيعيد التقييم لحد ما الوقت يعدّي.
 *
 * ⚠️ ده تخفيف لضغط الحصة مش بديل عن تفعيل Paid Tier Billing على مشروع
 * Google بتاع المفتاح — الحصة المجانية per-project مش per-key.
 *
 * State على مستوى الـ module (Singleton في الـ browser tab) عن قصد: كل
 * نُسخ اللوحات بتشارك نفس المتغيّرين، فالبوابة عالمية فعلًا.
 */

/** الحد الأدنى بين أي إطلاقين عبر كل اللوحات (عالمي، مش لكل لوحة). */
export const GLOBAL_MIN_DISPATCH_INTERVAL_MS = 15_000;

let inFlight = false;
let lastDispatchAt = 0;

/**
 * هل مسموح إطلاق مهمة AI جديدة دلوقتي؟ false لو فيه إطلاق طائر لسه
 * مااتقفلش، أو لو لسه مامرّش GLOBAL_MIN_DISPATCH_INTERVAL_MS من آخر إطلاق.
 * (nowMs قابل للحقن للاختبار.)
 */
export function canDispatchNow(nowMs: number = Date.now()): boolean {
  if (inFlight) return false;
  return nowMs - lastDispatchAt >= GLOBAL_MIN_DISPATCH_INTERVAL_MS;
}

/** سجّل بداية إطلاق: يقفل البوابة (inFlight) ويحدّث وقت آخر إطلاق. */
export function beginDispatch(nowMs: number = Date.now()): void {
  inFlight = true;
  lastDispatchAt = nowMs;
}

/** سجّل نهاية الإطلاق (بعد رجوع الـ server action) — يفتح البوابة للتالي. */
export function endDispatch(): void {
  inFlight = false;
}

/** إعادة الحالة لأصلها — للاختبارات فقط. */
export function __resetDispatchGateForTests(): void {
  inFlight = false;
  lastDispatchAt = 0;
}
