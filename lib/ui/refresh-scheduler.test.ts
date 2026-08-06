import { describe, it, expect } from "vitest";
import {
  decideRefresh,
  backoffDelayMs,
  BASE_INTERVAL_MS,
  MAX_INTERVAL_MS,
  MAX_POLL_DURATION_MS,
} from "./refresh-scheduler";

const base = {
  activeCount: 1,
  documentHidden: false,
  tickCount: 0,
  youngestSubscriberAgeMs: 1_000,
};

describe("backoffDelayMs", () => {
  it("يبتدي بالفاصل القصير عشان المهام السريعة تبان فورًا", () => {
    expect(backoffDelayMs(0)).toBe(BASE_INTERVAL_MS);
  });

  it("بيضاعف الفاصل مع كل دورة", () => {
    expect(backoffDelayMs(1)).toBe(8_000);
    expect(backoffDelayMs(2)).toBe(16_000);
  });

  it("مابيعديش السقف مهما طالت المهمة", () => {
    expect(backoffDelayMs(3)).toBe(MAX_INTERVAL_MS);
    expect(backoffDelayMs(50)).toBe(MAX_INTERVAL_MS);
  });

  it("مابينهارش عند أرقام كبيرة تخلّي الأُس لانهاية", () => {
    // 2 ** 5000 = Infinity — من غير الحارس ده كان الفاصل هيبقى NaN/Infinity
    // وsetTimeout هيترجم ده لصفر، يعني حلقة لا نهائية بأقصى سرعة.
    expect(backoffDelayMs(5000)).toBe(MAX_INTERVAL_MS);
  });

  it("بيتعامل مع العدّاد السالب زي الصفر", () => {
    expect(backoffDelayMs(-3)).toBe(BASE_INTERVAL_MS);
  });
});

describe("decideRefresh — إيقاف البولينج", () => {
  it("مفيش مشتركين = وقف", () => {
    expect(decideRefresh({ ...base, activeCount: 0 }).action).toBe("stop");
  });

  it("عدد مشتركين سالب (حالة تلف) = وقف مش تحديث", () => {
    expect(decideRefresh({ ...base, activeCount: -1 }).action).toBe("stop");
  });

  it("مهمة عدّت الحد الأقصى = وقف", () => {
    // ده الخلل اللي كان بيستنزف قاعدة البيانات: مهمة اتعلّقت في "جاري
    // التنفيذ" كانت بتخلّي التبويب يضرب الخادم للأبد.
    const decision = decideRefresh({
      ...base,
      youngestSubscriberAgeMs: MAX_POLL_DURATION_MS + 1,
    });
    expect(decision.action).toBe("stop");
  });

  it("مهمة على حافة الحد بالظبط لسه شغّالة", () => {
    const decision = decideRefresh({
      ...base,
      youngestSubscriberAgeMs: MAX_POLL_DURATION_MS,
    });
    expect(decision.action).toBe("refresh");
  });

  it("مهمة جديدة وسط مهام قديمة متعلّقة بتفضل شغّالة", () => {
    // الحكم على **أحدث** مشترك مش أقدمه: مهمة اتبدت دلوقتي لازم تتابع حتى
    // لو فيه مهمة تانية قديمة معلّقة في نفس الصفحة.
    const decision = decideRefresh({
      ...base,
      activeCount: 2,
      youngestSubscriberAgeMs: 2_000,
    });
    expect(decision.action).toBe("refresh");
  });
});

describe("decideRefresh — التبويب المخفي", () => {
  it("مابيضربش الخادم والتبويب مخفي", () => {
    const decision = decideRefresh({ ...base, documentHidden: true });
    expect(decision.action).toBe("skip");
  });

  it("بيفضل مجدول وهو مخفي عشان يرجع فورًا", () => {
    // `skip` مش `stop`: أول ما المستخدم يرجع للتبويب يلاقي التحديث شغّال
    // من غير ما يعمل حاجة.
    const decision = decideRefresh({ ...base, documentHidden: true });
    expect(decision.action).not.toBe("stop");
    if (decision.action !== "stop") expect(decision.delayMs).toBeGreaterThan(0);
  });

  it("الإيقاف بيغلب الإخفاء", () => {
    const decision = decideRefresh({ ...base, activeCount: 0, documentHidden: true });
    expect(decision.action).toBe("stop");
  });
});

describe("decideRefresh — الفاصل الزمني", () => {
  it("بيرجّع فاصل التراجع التدريجي الصح", () => {
    const decision = decideRefresh({ ...base, tickCount: 2 });
    if (decision.action !== "stop") expect(decision.delayMs).toBe(16_000);
  });

  it("التبويب المخفي بياخد نفس فاصل التراجع", () => {
    const visible = decideRefresh({ ...base, tickCount: 1 });
    const hidden = decideRefresh({ ...base, tickCount: 1, documentHidden: true });
    if (visible.action !== "stop" && hidden.action !== "stop") {
      expect(hidden.delayMs).toBe(visible.delayMs);
    }
  });

  it("كل قرار مستمر بيرجّع فاصل موجب", () => {
    for (let tick = 0; tick < 12; tick++) {
      const decision = decideRefresh({ ...base, tickCount: tick });
      if (decision.action !== "stop") {
        expect(decision.delayMs).toBeGreaterThanOrEqual(BASE_INTERVAL_MS);
        expect(decision.delayMs).toBeLessThanOrEqual(MAX_INTERVAL_MS);
      }
    }
  });
});

describe("decideRefresh — الحمل المُجمَّع", () => {
  it("عشر لوحات منتظرة = تحديث واحد مش عشرة", () => {
    // القرار واحد لكل دورة مهما كان عدد المشتركين — ده جوهر الإصلاح:
    // كل تحديث بيعيد تصيير الصفحة كاملة، فعشر نداءات متزامنة بتجيب نفس
    // البيانات عشر مرات.
    const decision = decideRefresh({ ...base, activeCount: 10 });
    expect(decision.action).toBe("refresh");
    if (decision.action === "refresh") expect(decision.delayMs).toBe(BASE_INTERVAL_MS);
  });
});
