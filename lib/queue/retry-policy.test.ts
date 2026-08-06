import { describe, it, expect } from "vitest";
import {
  BASE_DELAY_MS,
  MAX_DELAY_MS,
  UNKNOWN_CLASS_MAX_ATTEMPTS,
  backoffDelayMs,
  classifyFailure,
  decideRetry,
  effectiveMaxAttempts,
  nextRetryAt,
  shouldRetry,
} from "./retry-policy";

/** عشوائية ثابتة = صفر انحراف، فالاختبارات حتمية. */
const noJitter = () => 0.5;

describe("تصنيف الفشل — العابر", () => {
  it("يتعرّف على تجاوز حد المعدّل", () => {
    expect(classifyFailure(new Error("429 Too Many Requests"))).toBe("transient");
    expect(classifyFailure(new Error("rate limit exceeded"))).toBe("transient");
    expect(classifyFailure(new Error("quota exhausted"))).toBe("transient");
  });

  it("يتعرّف على أخطاء الشبكة", () => {
    expect(classifyFailure(new Error("ECONNRESET"))).toBe("transient");
    expect(classifyFailure(new Error("socket hang up"))).toBe("transient");
    expect(classifyFailure(new Error("ETIMEDOUT"))).toBe("transient");
  });

  it("يتعرّف على أخطاء الخادم المؤقتة", () => {
    expect(classifyFailure(new Error("503 Service Unavailable"))).toBe("transient");
    expect(classifyFailure(new Error("502 Bad Gateway"))).toBe("transient");
  });
});

describe("تصنيف الفشل — الدائم", () => {
  it("يتعرّف على المدخل غير الصالح", () => {
    expect(classifyFailure(new Error("400 invalid request"))).toBe("permanent");
    expect(classifyFailure(new Error("validation failed for field x"))).toBe("permanent");
  });

  it("يتعرّف على رفض الصلاحية", () => {
    expect(classifyFailure(new Error("403 Forbidden"))).toBe("permanent");
    expect(classifyFailure(new Error("permission denied"))).toBe("permanent");
  });

  it("الدائم يغلب العابر عند اختلاط الكلمات", () => {
    // ده مش افتراضي: رسائل الأخطاء الحقيقية بتخلط الكلمات، و"٤٠٠ فيها
    // كلمة timeout" لازم تتقرا كخطأ دائم مش عابر.
    expect(classifyFailure(new Error("400 invalid timeout parameter"))).toBe("permanent");
  });
});

describe("تصنيف الفشل — المجهول", () => {
  it("الخطأ غير المعروف مجهول لا عابر", () => {
    // الافتراض المتفائل هنا معناه حلقة إعادة محاولة لخطأ برمجي لن يُشفى.
    expect(classifyFailure(new Error("something odd happened"))).toBe("unknown");
  });

  it("الخطأ الفارغ مجهول", () => {
    expect(classifyFailure(null)).toBe("unknown");
    expect(classifyFailure(undefined)).toBe("unknown");
    expect(classifyFailure({})).toBe("unknown");
  });

  it("يقرا الكود والحالة مش الرسالة بس", () => {
    expect(classifyFailure({ message: "", status: 429 })).toBe("transient");
    expect(classifyFailure({ message: "", code: "ETIMEDOUT" })).toBe("transient");
  });
});

describe("الحد الأقصى الفعّال للمحاولات", () => {
  it("الدائم بلا محاولات إطلاقًا", () => {
    expect(effectiveMaxAttempts("permanent", 10)).toBe(0);
  });

  it("المجهول له سقف أقل", () => {
    expect(effectiveMaxAttempts("unknown", 10)).toBe(UNKNOWN_CLASS_MAX_ATTEMPTS);
  });

  it("العابر يأخذ المضبوط كاملًا", () => {
    expect(effectiveMaxAttempts("transient", 5)).toBe(5);
  });

  it("المجهول مايزيدش عن المضبوط لو المضبوط أقل", () => {
    expect(effectiveMaxAttempts("unknown", 1)).toBe(1);
  });
});

describe("قرار إعادة المحاولة", () => {
  it("الدائم لا يُعاد أبدًا مهما كانت المحاولات", () => {
    expect(shouldRetry("permanent", 0, 10)).toBe(false);
  });

  it("العابر يُعاد حتى الحد", () => {
    expect(shouldRetry("transient", 0, 3)).toBe(true);
    expect(shouldRetry("transient", 2, 3)).toBe(true);
    expect(shouldRetry("transient", 3, 3)).toBe(false);
  });

  it("المجهول يتوقّف عند سقفه الأقل", () => {
    expect(shouldRetry("unknown", 1, 10)).toBe(true);
    expect(shouldRetry("unknown", 2, 10)).toBe(false);
  });
});

describe("التراجع الأُسّي", () => {
  it("المحاولة الأولى بالفاصل الأساسي", () => {
    expect(backoffDelayMs(1, noJitter)).toBe(BASE_DELAY_MS);
  });

  it("يتضاعف مع كل محاولة", () => {
    expect(backoffDelayMs(2, noJitter)).toBe(BASE_DELAY_MS * 2);
    expect(backoffDelayMs(3, noJitter)).toBe(BASE_DELAY_MS * 4);
    expect(backoffDelayMs(4, noJitter)).toBe(BASE_DELAY_MS * 8);
  });

  it("مايعديش السقف", () => {
    expect(backoffDelayMs(20, noJitter)).toBe(MAX_DELAY_MS);
    expect(backoffDelayMs(100, noJitter)).toBe(MAX_DELAY_MS);
  });

  it("مابينهارش عند أُسّ ضخم", () => {
    // 2 ** 5000 = لانهاية — من غير الحارس ده الفاصل بيبقى NaN،
    // وsetTimeout بيترجمه لصفر: حلقة إعادة محاولة بأقصى سرعة.
    expect(backoffDelayMs(5000, noJitter)).toBe(MAX_DELAY_MS);
  });

  it("العشوائية بتوزّع التأخير حوالين القيمة", () => {
    // من غير العشوائية، كل المهام اللي فشلت في نفس اللحظة بتعيد
    // المحاولة في نفس اللحظة بالظبط فيتكرّر الانهيار — "قطيع الرعد".
    const low = backoffDelayMs(3, () => 0);
    const mid = backoffDelayMs(3, () => 0.5);
    const high = backoffDelayMs(3, () => 1);

    expect(low).toBeLessThan(mid);
    expect(high).toBeGreaterThan(mid);
    expect(low).toBeGreaterThanOrEqual(mid * 0.8 - 1);
    expect(high).toBeLessThanOrEqual(mid * 1.2 + 1);
  });

  it("مايرجّعش قيمة سالبة مهما كانت العشوائية", () => {
    for (let attempt = 1; attempt <= 10; attempt++) {
      expect(backoffDelayMs(attempt, () => 0)).toBeGreaterThanOrEqual(0);
    }
  });

  it("المحاولة صفر أو السالبة تتعامل كالأولى", () => {
    expect(backoffDelayMs(0, noJitter)).toBe(BASE_DELAY_MS);
    expect(backoffDelayMs(-5, noJitter)).toBe(BASE_DELAY_MS);
  });
});

describe("nextRetryAt", () => {
  it("يضيف التأخير للوقت الحالي", () => {
    const now = new Date("2026-01-01T00:00:00Z");
    const next = nextRetryAt(1, now, noJitter);
    expect(next.getTime() - now.getTime()).toBe(BASE_DELAY_MS);
  });
});

describe("القرار الكامل — decideRetry", () => {
  const now = new Date("2026-01-01T00:00:00Z");

  it("الخطأ العابر مع محاولات متبقّية = إعادة", () => {
    const decision = decideRetry({
      error: new Error("429 rate limit"),
      attemptsMade: 1,
      maxAttempts: 3,
      now,
      random: noJitter,
    });
    expect(decision.action).toBe("retry");
    expect(decision.failureClass).toBe("transient");
    expect(decision.retryAt).not.toBeNull();
  });

  it("الخطأ الدائم = رسائل ميتة فورًا حتى بلا محاولات مستهلَكة", () => {
    const decision = decideRetry({
      error: new Error("403 permission denied"),
      attemptsMade: 0,
      maxAttempts: 5,
      now,
      random: noJitter,
    });
    expect(decision.action).toBe("dead_letter");
    expect(decision.retryAt).toBeNull();
    expect(decision.reason).toContain("دائم");
  });

  it("استنفاد المحاولات = رسائل ميتة", () => {
    const decision = decideRetry({
      error: new Error("ECONNRESET"),
      attemptsMade: 3,
      maxAttempts: 3,
      now,
      random: noJitter,
    });
    expect(decision.action).toBe("dead_letter");
  });

  it("كل قرار إعادة بيحمل سببًا مقروءًا", () => {
    const decision = decideRetry({
      error: new Error("503"),
      attemptsMade: 0,
      maxAttempts: 3,
      now,
      random: noJitter,
    });
    expect(decision.reason.length).toBeGreaterThan(10);
    expect(decision.delayMs).toBeGreaterThan(0);
  });

  it("التأخير بيكبر مع كل محاولة متتالية", () => {
    const first = decideRetry({
      error: new Error("503"),
      attemptsMade: 0,
      maxAttempts: 5,
      now,
      random: noJitter,
    });
    const third = decideRetry({
      error: new Error("503"),
      attemptsMade: 2,
      maxAttempts: 5,
      now,
      random: noJitter,
    });
    expect(third.delayMs).toBeGreaterThan(first.delayMs);
  });
});
