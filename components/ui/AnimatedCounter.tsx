"use client";

import { useEffect, useState } from "react";

/**
 * عداد رقمي يتحرك من 0 للقيمة الحقيقية النهائية عند أول ظهور — مفيد
 * للإحصائيات (KPIs). القيمة نفسها حقيقية دايمًا، الحركة بصرية بس.
 * لو القيمة اتغيّرت (تحديث بيانات)، بيعيد العدّ من قيمته الحالية للقيمة
 * الجديدة بدل ما يرجع لصفر.
 */
export default function AnimatedCounter({
  value,
  durationMs = 700,
  className,
}: {
  value: number;
  durationMs?: number;
  className?: string;
}) {
  const [display, setDisplay] = useState(0);

  useEffect(() => {
    if (typeof window !== "undefined" && window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
      // eslint-disable-next-line react-hooks/set-state-in-effect -- قراءة تفضيل حركة النظام، مش قيمة تُشتق وقت الـ render
      setDisplay(value);
      return;
    }

    const from = display;
    const start = performance.now();
    let frame: number;

    function tick(now: number) {
      const progress = Math.min(1, (now - start) / durationMs);
      const eased = 1 - Math.pow(1 - progress, 3);
      setDisplay(Math.round(from + eased * (value - from)));
      if (progress < 1) frame = requestAnimationFrame(tick);
    }

    frame = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(frame);
    // eslint-disable-next-line react-hooks/exhaustive-deps -- تعمّد استبعاد display: نبدأ من قيمته وقت التغيير بس، مش نعيد الأنيميشن كل فريم
  }, [value, durationMs]);

  return <span className={className}>{display}</span>;
}
