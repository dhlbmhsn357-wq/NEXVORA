/**
 * منطق جدولة التحديث الدوري في الخلفية — الجزء النقي القابل للاختبار.
 *
 * ليه موجود أصلًا: `router.refresh()` بيعيد تصيير صفحة المشروع **كاملة**،
 * وde بيعمل عشرات الاستعلامات على قاعدة البيانات في النداء الواحد. كل لوحة
 * كانت بتشغّل مؤقّتها الخاص كل 4 ثواني، فلو تلات مراحل شغّالة مع بعض بقى
 * عندنا 45 إعادة تصيير في الدقيقة × عشرات الاستعلامات = آلاف الاستعلامات
 * في الدقيقة على قاعدة بيانات بأصغر شريحة حوسبة.
 *
 * تلات قواعد بتحكم القرار هنا:
 * 1. **التجميع**: نداء واحد لكل دورة مهما كان عدد اللوحات المنتظرة —
 *    التحديث بيجيب حالة الصفحة كلها، فتلات نداءات متزامنة بتجيب نفس
 *    البيانات تلات مرات.
 * 2. **التراجع التدريجي**: المهام الخلفية بتاخد دقايق مش ثواني. البداية
 *    سريعة (4 ثواني) عشان المهام القصيرة تبان فورًا، والفاصل بيكبر لحد 30
 *    ثانية للمهام الطويلة.
 * 3. **حد أقصى للمدة**: مهمة اتعلّقت في حالة "جاري التنفيذ" من غير ما تخلص
 *    (انتهت مهلة التنفيذ على المستضيف مثلًا) كانت بتخلّي البولينج شغّال
 *    **للأبد**. ده كان أخطر مصدر للحمل: تبويب متسايب مفتوح بيفضل يضرب
 *    قاعدة البيانات لحد ما ميزانية الإدخال/الإخراج تخلص.
 */

/** أول فاصل — قصير عشان المهام السريعة تبان فورًا. */
export const BASE_INTERVAL_MS = 4_000;

/** أطول فاصل بعد التراجع التدريجي. */
export const MAX_INTERVAL_MS = 30_000;

/**
 * بعد المدة دي بنبطّل البولينج تمامًا. مهمة عدّت 20 دقيقة في حالة "شغّالة"
 * شبه مؤكد إنها اتعلّقت، والاستمرار في السؤال عنها بيستهلك موارد من غير أي
 * فايدة. المستخدم لسه يقدر يحدّث الصفحة بنفسه.
 */
export const MAX_POLL_DURATION_MS = 20 * 60 * 1000;

/** فاصل الدورة الحالية: 4 ← 8 ← 16 ← 30 (سقف). */
export function backoffDelayMs(tickCount: number): number {
  if (tickCount <= 0) return BASE_INTERVAL_MS;
  const grown = BASE_INTERVAL_MS * 2 ** tickCount;
  return Number.isFinite(grown) ? Math.min(grown, MAX_INTERVAL_MS) : MAX_INTERVAL_MS;
}

export interface SchedulerSnapshot {
  /** عدد اللوحات اللي مستنية نتيجة دلوقتي. */
  activeCount: number;
  /** تبويب المتصفح نفسه مخفي؟ */
  documentHidden: boolean;
  /** كام دورة عدّت من غير انقطاع (بيحكم التراجع التدريجي). */
  tickCount: number;
  /** عمر أحدث مشترك — `null` لو مفيش مشتركين. */
  youngestSubscriberAgeMs: number | null;
}

export type RefreshDecision =
  | { action: "stop" }
  | { action: "skip"; delayMs: number }
  | { action: "refresh"; delayMs: number };

/**
 * القرار الوحيد: نحدّث دلوقتي، نستنى من غير تحديث، ولا نبطّل خالص؟
 *
 * `skip` مقصودة ومنفصلة عن `stop`: التبويب لما يكون مخفي مابنضربش الخادم،
 * لكن بنفضل مجدولين عشان أول ما المستخدم يرجع يلاقي البيانات بتتحدّث من
 * غير ما يعمل حاجة.
 */
export function decideRefresh(snapshot: SchedulerSnapshot): RefreshDecision {
  if (snapshot.activeCount <= 0) return { action: "stop" };

  // لو حتى **أحدث** مشترك عدّى الحد الأقصى، يبقى كله متعلّق — مش بس واحد
  // قديم وسط مهام جديدة شغّالة فعلًا.
  if (
    snapshot.youngestSubscriberAgeMs !== null &&
    snapshot.youngestSubscriberAgeMs > MAX_POLL_DURATION_MS
  ) {
    return { action: "stop" };
  }

  const delayMs = backoffDelayMs(snapshot.tickCount);
  return snapshot.documentHidden ? { action: "skip", delayMs } : { action: "refresh", delayMs };
}
