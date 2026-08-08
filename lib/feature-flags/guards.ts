/**
 * Feature Flag Guards
 * ===================
 *
 * أدوات مركزية لحماية server actions المرتبطة بتبويبات NEXVORA الخاصة
 * (Extended Technical Delivery). أي server action مرتبط بتبويبة execution
 * لازم يستدعي `requireExtendedTechnical()` في بداية تنفيذه — لو الفلاغ
 * `extended_technical_delivery` معطّل، يرمي خطأ فورًا ومن ثمّ ما تتم أي
 * قراءة/كتابة على قاعدة البيانات. ده يجعل الحماية server-side حقيقية،
 * ما تعتمدش على إخفاء التبويب من الـ UI بس.
 */
import { createClient } from "@/lib/supabase/server";
import { isFeatureEnabled } from "./index";

/** رسالة موحّدة (لا تكشف تفاصيل إضافية للمهاجم). */
export const EXTENDED_DISABLED_MESSAGE =
  "Extended Technical Delivery غير مفعّل — الوصول مرفوض";

/**
 * يتأكد إن flag `extended_technical_delivery` مفعّل للمستخدم الحالي.
 * يرمي خطأ لو غير مصادَق عليه أو الفلاغ معطّل.
 *
 * الاستخدام في server action:
 * ```ts
 * export async function myExecutionAction() {
 *   await requireExtendedTechnical();
 *   // ...
 * }
 * ```
 */
export async function requireExtendedTechnical(): Promise<void> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    throw new Error("غير مصادَق عليه");
  }
  const enabled = await isFeatureEnabled("extended_technical_delivery", user.id);
  if (!enabled) {
    throw new Error(EXTENDED_DISABLED_MESSAGE);
  }
}
