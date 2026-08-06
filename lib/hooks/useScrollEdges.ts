"use client";

import { useEffect, useRef, useState } from "react";

/**
 * بيكشف هل فيه محتوى مخفي يمين/شمال شريط قابل للسحب أفقيًا — مُستخدم مع
 * شريط أي "قائمة عناصر كتير في صف واحد" (LifecycleStepper, Tabs) عشان
 * نعرض تلميح بصري (Gradient Fade) بدل ما المستخدم يكتشف السحب بالصدفة.
 *
 * بيعتمد على IntersectionObserver مع عنصرين "حرّاس" (Sentinel) في أول
 * وآخر الشريط، مش على قراءة scrollLeft مباشرة — لأن قيمة scrollLeft في
 * RTL (dir="rtl") بتختلف إشارتها/سلوكها بين المتصفحات، فأي حساب يدوي
 * عليها هيبقى هش. الـ Observer مش بيهتم بالاتجاه أصلًا، فآمن مع RTL/LTR
 * بدون أي فرع كود خاص.
 */
export function useScrollEdges<Container extends HTMLElement, Sentinel extends HTMLElement>() {
  const containerRef = useRef<Container>(null);
  const startRef = useRef<Sentinel>(null);
  const endRef = useRef<Sentinel>(null);
  const [hiddenStart, setHiddenStart] = useState(false);
  const [hiddenEnd, setHiddenEnd] = useState(false);

  useEffect(() => {
    const container = containerRef.current;
    const start = startRef.current;
    const end = endRef.current;
    if (!container || !start || !end) return;

    const observer = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          if (entry.target === start) setHiddenStart(!entry.isIntersecting);
          if (entry.target === end) setHiddenEnd(!entry.isIntersecting);
        }
      },
      { root: container, threshold: 0.99 }
    );
    observer.observe(start);
    observer.observe(end);
    return () => observer.disconnect();
  }, []);

  return { containerRef, startRef, endRef, hiddenStart, hiddenEnd };
}
