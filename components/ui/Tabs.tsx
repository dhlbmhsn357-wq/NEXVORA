"use client";

import { useEffect, useState, type ReactNode } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { useScrollEdges } from "@/lib/hooks/useScrollEdges";

export interface TabItem {
  key: string;
  label: string;
  content: ReactNode;
}

/**
 * تبويبات عامة موحّدة — بديل للنمط اللي كان مكرر بين project-tabs.tsx
 * وأي صفحة تانية محتاجة تبويبات. أول عنصر في القائمة هو الافتراضي.
 *
 * التبويب النشط دلوقتي مربوط بـ ?tab= في الـ URL (Deep Linking — راجع
 * lib/navigation/targets.ts) — بيقرأه وقت التحميل الأول، وبيحدّثه (بدون
 * إعادة تحميل الصفحة) لما المستخدم يبدّل تبويب يدويًا، عشان الرابط
 * يفضل قابل للمشاركة/الرجوع إليه. لو مفيش ?tab= في الـ URL، السلوك
 * القديم بالظبط (أول عنصر افتراضيًا) — توافق كامل مع أي استخدام حالي.
 */
export default function Tabs({ items }: { items: TabItem[] }) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const tabParam = searchParams.get("tab");
  const initialActive = items.some((i) => i.key === tabParam) ? (tabParam as string) : items[0]?.key;
  const [active, setActive] = useState(initialActive);
  const { containerRef, startRef, endRef, hiddenStart, hiddenEnd } = useScrollEdges<HTMLDivElement, HTMLDivElement>();

  // لو ?tab= اتغيّر من برّه (رابط إشعار جديد وصل والمستخدم أصلًا فاتح
  // نفس الصفحة) نتبعه بدل ما نفضل واقفين على التبويب القديم.
  useEffect(() => {
    if (tabParam && items.some((i) => i.key === tabParam) && tabParam !== active) {
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setActive(tabParam);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tabParam]);

  function handleSelect(key: string) {
    setActive(key);
    const params = new URLSearchParams(searchParams.toString());
    params.set("tab", key);
    params.delete("highlight");
    router.replace(`${pathname}?${params.toString()}`, { scroll: false });
  }

  return (
    <div>
      {/* Scroll-strip بدل Wrap: مع 13 تبويب على مشروع، الـ Wrap كان بيكدّس
          4-5 صفوف على الموبايل ويدفع المحتوى لتحت — نفس نمط
          lifecycle-stepper فوقه بالظبط، عشان استراتيجية موحّدة لكل
          "شريط عناصر كتير" في الصفحة. */}
      <div className="relative mb-6">
        {/* تلميح بصري إن فيه تبويبات تانية مخفية — نفس الحل المُطبَّق في
            LifecycleStepper، عشان السحب الأفقي (overflow-x-auto) يبقى
            مكتشَف مش بالصدفة بس. */}
        {hiddenStart && (
          <div className="pointer-events-none absolute inset-y-0 start-0 z-10 flex w-8 items-center justify-start bg-gradient-to-r from-[var(--v-bg)] to-transparent rtl:bg-gradient-to-l">
            <ChevronLeft size={14} className="text-[var(--v-text-muted)] rtl:hidden" />
            <ChevronRight size={14} className="hidden text-[var(--v-text-muted)] rtl:block" />
          </div>
        )}
        {hiddenEnd && (
          <div className="pointer-events-none absolute inset-y-0 end-0 z-10 flex w-8 items-center justify-end bg-gradient-to-l from-[var(--v-bg)] to-transparent rtl:bg-gradient-to-r">
            <ChevronRight size={14} className="text-[var(--v-text-muted)] rtl:hidden" />
            <ChevronLeft size={14} className="hidden text-[var(--v-text-muted)] rtl:block" />
          </div>
        )}
        <div
          ref={containerRef}
          role="tablist"
          className="scrollbar-hide flex gap-1 overflow-x-auto border-b border-[var(--v-border)]"
        >
          <div ref={startRef} className="w-px shrink-0 self-stretch" aria-hidden="true" />
          {items.map((item) => (
            <button
              key={item.key}
              type="button"
              role="tab"
              aria-selected={active === item.key}
              onClick={() => handleSelect(item.key)}
              className={`shrink-0 rounded-t-[var(--v-radius-sm)] px-4 py-2 text-sm font-medium whitespace-nowrap transition focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--v-primary)] ${
                active === item.key
                  ? "border-b-2 border-[var(--v-primary)] bg-[var(--v-primary-tint)] text-[var(--v-primary)]"
                  : "text-[var(--v-text-muted)] hover:bg-[var(--v-surface)] hover:text-[var(--v-text)]"
              }`}
            >
              {item.label}
            </button>
          ))}
          <div ref={endRef} className="w-px shrink-0 self-stretch" aria-hidden="true" />
        </div>
      </div>

      {items.map((item) => (
        <div key={item.key} role="tabpanel" hidden={active !== item.key}>
          {item.content}
        </div>
      ))}
    </div>
  );
}
