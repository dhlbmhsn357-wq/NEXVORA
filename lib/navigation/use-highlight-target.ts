"use client";

import { useEffect, useRef } from "react";
import { useSearchParams } from "next/navigation";

const HIGHLIGHT_DURATION_MS = 2500;

/**
 * بنية Highlight + Auto Scroll موحّدة — عنصر واحد بيقرأ ?highlight= من
 * الرابط، ولو الـ id بتاعه متطابق، بيعمل Scroll إليه تلقائيًا ويضيف
 * كلاس نبضة مؤقتة (v-highlight-pulse، معرّف في globals.css) تختفي بعد
 * ثانيتين ونص. أي Module جديد محتاج Highlight يستخدم الـ Hook ده بس —
 * صفر منطق تنقّل مكرر.
 *
 * الاستخدام: const ref = useHighlightTarget(record.id); <div ref={ref}>...
 */
export function useHighlightTarget<T extends HTMLElement = HTMLDivElement>(recordId: string | null | undefined) {
  const ref = useRef<T>(null);
  const searchParams = useSearchParams();
  const highlightId = searchParams.get("highlight");

  useEffect(() => {
    if (!recordId || !highlightId || highlightId !== recordId || !ref.current) return;
    const el = ref.current;
    el.scrollIntoView({ behavior: "smooth", block: "center" });
    el.classList.add("v-highlight-pulse");
    const timeout = setTimeout(() => el.classList.remove("v-highlight-pulse"), HIGHLIGHT_DURATION_MS);
    return () => clearTimeout(timeout);
  }, [recordId, highlightId]);

  return ref;
}
