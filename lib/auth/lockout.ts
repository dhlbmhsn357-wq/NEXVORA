/**
 * منطق قفل الحساب وrate-limiting لمحاولات الدخول — وحدة نقية بدون I/O.
 * القرارات هنا، والقراءة/الكتابة في login server action.
 */

/** نافذة حساب المحاولات الفاشلة. */
export const LOGIN_WINDOW_MS = 15 * 60 * 1000;

/** أقصى محاولات فاشلة داخل النافذة قبل قفل الحساب. */
export const MAX_FAILED_ATTEMPTS = 5;

/** أقصى محاولات (ناجحة أو فاشلة) من نفس الإيميل داخل النافذة — throttle عام ضد الإغراق. */
export const MAX_ATTEMPTS_PER_WINDOW = 20;

export interface LockoutDecision {
  /** هل نرفض المحاولة قبل حتى فحص كلمة المرور؟ */
  blocked: boolean;
  /** هل الفشل الحالي (لو حصل) يقفل الحساب؟ */
  shouldLockAfterFailure: boolean;
  message?: string;
}

/**
 * قرار ما قبل المحاولة: attemptsInWindow = كل محاولات الإيميل خلال
 * النافذة، failedInWindow = الفاشلة منها فقط.
 */
export function evaluateLoginAttempt(attemptsInWindow: number, failedInWindow: number): LockoutDecision {
  if (attemptsInWindow >= MAX_ATTEMPTS_PER_WINDOW) {
    return {
      blocked: true,
      shouldLockAfterFailure: false,
      message: "محاولات كتير جدًا خلال فترة قصيرة. استنى شوية وحاول تاني.",
    };
  }
  if (failedInWindow >= MAX_FAILED_ATTEMPTS) {
    return {
      blocked: true,
      shouldLockAfterFailure: false,
      message: "الحساب اتقفل بسبب محاولات فاشلة متكررة. تواصل مع مسؤول النظام.",
    };
  }
  return {
    blocked: false,
    // الفشل الجاي هو رقم failedInWindow+1 — لو هيوصّل للحد، اقفل.
    shouldLockAfterFailure: failedInWindow + 1 >= MAX_FAILED_ATTEMPTS,
  };
}
