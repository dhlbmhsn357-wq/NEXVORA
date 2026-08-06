/**
 * قاطع الدائرة لمزوّدي الذكاء الاصطناعي — وحدة نقية.
 *
 * الحالة نفسها تُحفَظ في `ai_provider_health` **مشتركة بين كل نسخ
 * العامل**. لو كانت محلية لكل نسخة، لاكتشف كل عامل التعطّل بمفرده
 * وأهدر محاولاته الخاصة قبل أن يعرف — فيتحوّل عطل المزوّد إلى موجة
 * فشل بعدد العمال.
 */

export type BreakerState = "closed" | "open" | "half_open";

/** أخطاء عابرة متتالية قبل الفتح. */
export const FAILURE_THRESHOLD = 5;
/** مدة البقاء مفتوحًا قبل السماح بطلب اختباري. */
export const OPEN_DURATION_MS = 60_000;

export interface BreakerSnapshot {
  state: BreakerState;
  consecutiveErrors: number;
  openedAt: Date | null;
  nextProbeAt: Date | null;
}

export const INITIAL_BREAKER: BreakerSnapshot = {
  state: "closed",
  consecutiveErrors: 0,
  openedAt: null,
  nextProbeAt: null,
};

export type BreakerDecision =
  | { allow: true; probe: boolean }
  | { allow: false; retryAfterMs: number; reason: string };

/**
 * هل يُسمح بالنداء الآن؟
 *
 * `probe: true` معناها هذا طلب اختباري وحيد في حالة نصف مفتوح — لو نجح
 * تُغلق الدائرة، ولو فشل تُفتح من جديد.
 */
export function canCall(snapshot: BreakerSnapshot, now: Date = new Date()): BreakerDecision {
  if (snapshot.state === "closed") return { allow: true, probe: false };

  if (snapshot.state === "half_open") return { allow: true, probe: true };

  // مفتوح: نسمح فقط بعد انقضاء المهلة
  const nextProbe = snapshot.nextProbeAt?.getTime() ?? 0;
  if (now.getTime() >= nextProbe) return { allow: true, probe: true };

  return {
    allow: false,
    retryAfterMs: nextProbe - now.getTime(),
    reason: `المزوّد متوقّف مؤقتًا — إعادة المحاولة بعد ${Math.ceil((nextProbe - now.getTime()) / 1000)} ثانية.`,
  };
}

export function onSuccess(): BreakerSnapshot {
  return { ...INITIAL_BREAKER };
}

/**
 * تسجيل فشل.
 *
 * **الأخطاء الدائمة لا تفتح الدائرة.** مدخل غير صالح من مهمة واحدة ليس
 * دليلًا على تعطّل المزوّد، وفتح الدائرة بسببه يمنع كل المهام السليمة
 * من العمل — عقوبة جماعية على خطأ فردي.
 */
export function onFailure(
  snapshot: BreakerSnapshot,
  options: { transient: boolean; now?: Date } = { transient: true }
): BreakerSnapshot {
  const now = options.now ?? new Date();

  if (!options.transient) return snapshot;

  const consecutiveErrors = snapshot.consecutiveErrors + 1;

  if (consecutiveErrors >= FAILURE_THRESHOLD || snapshot.state === "half_open") {
    return {
      state: "open",
      consecutiveErrors,
      openedAt: now,
      nextProbeAt: new Date(now.getTime() + OPEN_DURATION_MS),
    };
  }

  return { ...snapshot, state: "closed", consecutiveErrors };
}

/** الانتقال لنصف مفتوح عند انقضاء المهلة — يستدعيه من يقرأ الحالة. */
export function refresh(snapshot: BreakerSnapshot, now: Date = new Date()): BreakerSnapshot {
  if (snapshot.state !== "open") return snapshot;
  if (!snapshot.nextProbeAt || now.getTime() < snapshot.nextProbeAt.getTime()) return snapshot;
  return { ...snapshot, state: "half_open" };
}

/**
 * سلوك المهمة حين تكون الدائرة مفتوحة.
 *
 * **إعادة الجدولة لا الفشل.** توقّف المزوّد عشر دقائق يجب ألا يُترجَم
 * إلى مئة مهمة فاشلة يراجعها المشغّل يدويًا — المهام تنتظر وتُنفَّذ
 * وحدها عند التعافي.
 */
export function jobActionWhenOpen(retryAfterMs: number): {
  action: "reschedule";
  delayMs: number;
} {
  // هامش بسيط فوق موعد الاختبار: الوصول قبله بلحظة يعني رفضًا آخر.
  return { action: "reschedule", delayMs: retryAfterMs + 1_000 };
}
