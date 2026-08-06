"use client";

import { useCallback, useEffect, useState } from "react";
import { ChevronLeft, ChevronRight, Maximize2 } from "lucide-react";
import type { MeetingPresentationSlides } from "@/lib/types/database";
import { renderSlideBody, SLIDE_LABELS, SLIDE_ORDER } from "@/app/(platform)/dashboard/projects/[id]/meeting-slide-deck";

/**
 * عارض عرض الاجتماع المستقل (read-only) — شاشة كاملة، تنقّل بالكيبورد
 * والأسهم، مؤشّر شرائح، بعلامة VELORA. بيعيد استخدام نفس مكوّنات عرض
 * الشرائح داخل المنصة (renderSlideBody) عشان الشكل متطابق تمامًا.
 */
export default function MeetingDeckViewer({
  slides,
  title,
}: {
  slides: MeetingPresentationSlides;
  title: string;
}) {
  const order = SLIDE_ORDER.filter((k) => slides[k]);
  const keys = order.length > 0 ? order : SLIDE_ORDER;
  const [index, setIndex] = useState(0);

  const go = useCallback(
    (next: number) => setIndex((i) => Math.max(0, Math.min(keys.length - 1, next ?? i))),
    [keys.length]
  );

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      // RTL: السهم لليسار = التالي، لليمين = السابق
      if (e.key === "ArrowLeft" || e.key === "PageDown" || e.key === " ") { e.preventDefault(); setIndex((i) => Math.min(keys.length - 1, i + 1)); }
      else if (e.key === "ArrowRight" || e.key === "PageUp") { e.preventDefault(); setIndex((i) => Math.max(0, i - 1)); }
      else if (e.key === "Home") setIndex(0);
      else if (e.key === "End") setIndex(keys.length - 1);
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [keys.length]);

  const slideKey = keys[index];

  function toggleFullscreen() {
    if (document.fullscreenElement) document.exitFullscreen();
    else document.documentElement.requestFullscreen?.();
  }

  return (
    <div className="flex min-h-screen flex-col bg-[var(--v-bg)]" dir="rtl">
      {/* شريط علوي */}
      <header className="flex items-center justify-between border-b border-[var(--v-border)] px-5 py-3">
        <div className="flex items-center gap-2.5">
          <span className="font-display text-lg font-semibold tracking-[0.2em] text-[var(--v-text)]">VELORA</span>
          <span className="hidden text-xs text-[var(--v-text-muted)] sm:inline">· {title}</span>
        </div>
        <div className="flex items-center gap-3">
          <span className="font-mono-plex text-xs text-[var(--v-text-muted)]">{index + 1} / {keys.length}</span>
          <button
            type="button"
            onClick={toggleFullscreen}
            className="rounded-[var(--v-radius-md)] border border-[var(--v-border)] p-1.5 text-[var(--v-text-muted)] hover:border-[var(--v-primary)]"
            title="ملء الشاشة"
          >
            <Maximize2 size={15} />
          </button>
        </div>
      </header>

      {/* الشريحة */}
      <main className="flex flex-1 items-center justify-center px-4 py-6">
        <div className="w-full max-w-4xl">
          <div className="rounded-[var(--v-radius-xl)] border border-[var(--v-border)] bg-[var(--v-surface)] p-6 shadow-[var(--v-shadow-lg)] sm:p-9">
            <div className="mb-4 flex items-center justify-between border-b border-[var(--v-border)] pb-3">
              <h2 className="font-display text-xl font-bold text-[var(--v-text)]">{SLIDE_LABELS[slideKey]}</h2>
              <span className="rounded-full bg-[var(--v-primary)]/10 px-2.5 py-0.5 text-[11px] font-medium text-[var(--v-primary)]">
                {index + 1}
              </span>
            </div>
            <div className="min-h-[360px]">{renderSlideBody(slideKey, slides[slideKey])}</div>
          </div>
        </div>
      </main>

      {/* التنقّل */}
      <footer className="flex items-center justify-between gap-3 border-t border-[var(--v-border)] px-5 py-3">
        <button
          type="button"
          onClick={() => go(index - 1)}
          disabled={index === 0}
          className="inline-flex items-center gap-1 rounded-[var(--v-radius-md)] border border-[var(--v-border)] px-3 py-2 text-sm text-[var(--v-text)] hover:border-[var(--v-primary)] disabled:opacity-40"
        >
          <ChevronRight size={16} /> السابقة
        </button>

        <div className="flex flex-1 items-center justify-center gap-1.5 overflow-x-auto">
          {keys.map((k, i) => (
            <button
              key={k}
              type="button"
              onClick={() => go(i)}
              title={SLIDE_LABELS[k]}
              className={`h-2 rounded-full transition-all ${i === index ? "w-6 bg-[var(--v-primary)]" : "w-2 bg-[var(--v-border)] hover:bg-[var(--v-text-muted)]"}`}
            />
          ))}
        </div>

        <button
          type="button"
          onClick={() => go(index + 1)}
          disabled={index === keys.length - 1}
          className="inline-flex items-center gap-1 rounded-[var(--v-radius-md)] border border-[var(--v-border)] px-3 py-2 text-sm text-[var(--v-text)] hover:border-[var(--v-primary)] disabled:opacity-40"
        >
          التالية <ChevronLeft size={16} />
        </button>
      </footer>
    </div>
  );
}
