"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { decideRefresh, backoffDelayMs } from "./refresh-scheduler";

/**
 * منسّق واحد على مستوى الصفحة كلها لتحديث البيانات في الخلفية.
 *
 * الحالة هنا على مستوى الوحدة (مش داخل مكوّن) عن قصد: ده بالظبط اللي
 * بيخلّي 12 لوحة تتشارك مؤقّتًا واحدًا. لو كانت الحالة جوّه كل مكوّن،
 * هيبقى عندنا 12 مؤقّت بيضربوا نفس نقطة النهاية في نفس اللحظة — وde كان
 * الوضع اللي استنزف قاعدة البيانات.
 */

interface Subscriber {
  startedAt: number;
  /** هل اللوحة دي ظاهرة فعلًا للمستخدم دلوقتي؟ */
  isDisplayed: () => boolean;
}

const subscribers = new Map<number, Subscriber>();
let nextSubscriberId = 1;
let timer: ReturnType<typeof setTimeout> | null = null;
let tickCount = 0;
let latestRefresh: (() => void) | null = null;

function stop() {
  if (timer !== null) clearTimeout(timer);
  timer = null;
  tickCount = 0;
}

function snapshot() {
  const now = Date.now();
  // بنعدّ اللوحات الظاهرة بس: Tabs بيسيب كل التبويبات موجودة في الـ DOM
  // ومخفية بـ hidden فقط، فمن غير الفحص ده لوحة في تبويب مقفول تفضل
  // بتطلب تحديث للصفحة كلها.
  let activeCount = 0;
  let youngest: number | null = null;
  for (const sub of subscribers.values()) {
    if (!sub.isDisplayed()) continue;
    activeCount += 1;
    const age = now - sub.startedAt;
    if (youngest === null || age < youngest) youngest = age;
  }
  return {
    activeCount,
    documentHidden: typeof document !== "undefined" && document.visibilityState === "hidden",
    tickCount,
    youngestSubscriberAgeMs: youngest,
  };
}

function schedule(delayMs: number) {
  if (timer !== null) clearTimeout(timer);
  timer = setTimeout(tick, delayMs);
}

function tick() {
  timer = null;
  const decision = decideRefresh(snapshot());

  if (decision.action === "stop") {
    stop();
    return;
  }
  if (decision.action === "refresh") latestRefresh?.();

  tickCount += 1;
  schedule(decision.delayMs);
}

function ensureRunning() {
  if (timer !== null) return;
  // مشترك جديد معناه شغل جديد ابتدى — بنرجّع التراجع التدريجي لأوله عشان
  // النتيجة تبان بسرعة بدل ما تستنى فاصل الـ 30 ثانية بتاع مهمة قديمة.
  tickCount = 0;
  schedule(backoffDelayMs(0));
}

/**
 * بيحدّث بيانات الصفحة دوريًا طول ما `active` بـ `true`.
 *
 * @param active   في شغل خلفي مستنّي نتيجته؟
 * @param containerRef مرجع اختياري لعنصر اللوحة — لو مبعوت، بنتخطّى
 *   التحديث لما اللوحة تكون في تبويب مش ظاهر.
 */
export function useBackgroundRefresh(
  active: boolean,
  containerRef?: { current: HTMLElement | null }
) {
  const router = useRouter();

  // بنحدّث المرجع في تأثير جانبي مش أثناء التصيير — الكتابة في المراجع
  // أثناء التصيير سلوك غير محدَّد في React المتزامن.
  useEffect(() => {
    latestRefresh = () => router.refresh();
  }, [router]);

  useEffect(() => {
    if (!active) return;

    const id = nextSubscriberId++;
    subscribers.set(id, {
      startedAt: Date.now(),
      // `containerRef` كائن ثابت الهوية من `useRef` في المكوّن المستدعي،
      // فالإغلاق ده بيفضل صالح طول عمر الاشتراك.
      isDisplayed: () => {
        const el = containerRef?.current;
        // مفيش مرجع = اللوحة مش بتقول حاجة عن ظهورها، فبنعتبرها ظاهرة.
        if (!el) return true;
        return el.offsetParent !== null;
      },
    });
    ensureRunning();

    // رجوع المستخدم للتبويب: بنرجّع الفاصل لأوله عشان يشوف آخر حالة فورًا
    // بدل ما يستنى بقية فاصل طويل اتراكم وهو غايب.
    const onVisibility = () => {
      if (document.visibilityState === "visible" && subscribers.size > 0) {
        tickCount = 0;
        schedule(backoffDelayMs(0));
      }
    };
    document.addEventListener("visibilitychange", onVisibility);

    return () => {
      document.removeEventListener("visibilitychange", onVisibility);
      subscribers.delete(id);
      if (subscribers.size === 0) stop();
    };
  }, [active, containerRef]);
}
