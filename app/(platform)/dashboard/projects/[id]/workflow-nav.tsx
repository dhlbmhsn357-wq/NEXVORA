"use client";

import { useEffect, useMemo, useRef, useState, type ReactNode, type PointerEvent as ReactPointerEvent } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { ChevronLeft, ChevronRight, AlertCircle, MoreHorizontal } from "lucide-react";
import { useScrollEdges } from "@/lib/hooks/useScrollEdges";
import type { StageState, WorkflowStageKey, WorkflowStatus } from "@/lib/workflow/types";
import type { StalenessResult } from "@/lib/workflow/dependency-graph";
import type { TabCategory } from "./nexvora-tab-order";

/**
 * key بنوع string مش WorkflowStageKey عمدًا — بيسمح بتثبيت تبويب زي
 * "Activity" في آخر الشريط برّه نطاق الـ 22 مرحلة الرسمية (سجل نشاط
 * عابر لكل المراحل، مش مرحلة في حد ذاتها) من غير ما نضطر نوسّع نوع
 * WorkflowStageKey بمفتاح مالوش تعريف Stage حقيقي في الـ Registry.
 *
 * `category` اختياري — لو مش موجود بيتعامل معاه كـ "essential" (توافق
 * كامل مع أي استدعاء قديم). لما بتتحدد فعليًا (من page.tsx بعد
 * orderTabsByNexvora) بنستخدمها لإخفاء التبويبات المتقدّمة خلف toggle.
 */
export interface WorkflowNavItem {
  key: string;
  label: string;
  content: ReactNode;
  category?: TabCategory;
  /**
   * 0126 — Standard Product Package: شارة نصّية صغيرة اختيارية بجانب اسم
   * التبويب (مثال: "موروث + 3 تغييرات"). اختيارية تمامًا — `undefined` لأي
   * تبويب قديم يعني صفر تغيير بصري (نفس السلوك قبل 0126 بالضبط).
   */
  badgeText?: string;
}

const STATUS_DOT_CLASS: Record<WorkflowStatus, string> = {
  not_started: "bg-[var(--v-text-muted)]",
  in_progress: "bg-[var(--v-info)]",
  waiting_ai: "bg-[var(--v-info)] animate-pulse",
  waiting_review: "bg-[var(--v-warning)]",
  needs_regeneration: "bg-[var(--v-warning)]",
  approved: "bg-[var(--v-success)]",
  rejected: "bg-[var(--v-danger)]",
  completed: "bg-[var(--v-success)]",
  archived: "bg-[var(--v-text-muted)]",
};

const STORAGE_KEY_PREFIX = "nexvora:tabs:showAdvanced:";

/**
 * تنقّل الـ Workflow الجديد — بديل project-tabs.tsx (Array حرفي) +
 * LifecycleStepper (خطوات منفصلة بمنطق done منفصل) بنظام واحد موحّد.
 * مبني فوق نفس useScrollEdges المستخدم في Tabs.tsx (سحب أفقي + تلميح
 * حواف)، بإضافة: عجلة الماوس، السحب باللمس/الماوس (Drag)، التنقّل
 * بلوحة المفاتيح، توسيط المرحلة النشطة تلقائيًا، والالتصاق (Sticky)،
 * وشارات حالة/تحديث لكل مرحلة من الـ Workflow Engine (registry +
 * adapters). لا يوجد أي زر "سهم" للكشف عن مراحل مخفية — السحب
 * الطبيعي (لمس/عجلة/فأرة/لوحة مفاتيح) كافي بمفرده لكشف كل المراحل؛
 * تلميحات التدرّج اللوني في الحواف تبقى إشارة بصرية سلبية فقط.
 *
 * Essential/Advanced: التبويبات المُصنَّفة "advanced" مخفية افتراضيًا
 * خلف زر «⋯ إظهار المتقدمة (N)». الاختيار محفوظ في localStorage لكل
 * مشروع (projectId prop). لو ?tab=<advanced-key> في الـ URL بيظهر
 * تلقائيًا (deep-link يفوق الـ toggle).
 */
export default function WorkflowNav({
  items,
  stageStates,
  staleness,
  projectId,
}: {
  items: WorkflowNavItem[];
  stageStates: Partial<Record<WorkflowStageKey, StageState>>;
  staleness: Record<WorkflowStageKey, StalenessResult>;
  projectId?: string;
}) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const tabParam = searchParams.get("tab");
  const initialActive = items.some((i) => i.key === tabParam) ? (tabParam as string) : items[0]?.key;
  const [active, setActive] = useState(initialActive);
  const [showAdvanced, setShowAdvanced] = useState(false);
  const { containerRef, startRef, endRef, hiddenStart, hiddenEnd } = useScrollEdges<HTMLDivElement, HTMLDivElement>();
  const buttonRefs = useRef<Partial<Record<string, HTMLButtonElement | null>>>({});
  const dragState = useRef<{ dragging: boolean; startX: number; startScrollLeft: number; moved: boolean } | null>(null);

  const storageKey = projectId ? `${STORAGE_KEY_PREFIX}${projectId}` : null;

  // قراءة تفضيل «إظهار المتقدمة» من localStorage عند التحميل الأول.
  useEffect(() => {
    if (!storageKey || typeof window === "undefined") return;
    try {
      const raw = window.localStorage.getItem(storageKey);
      // eslint-disable-next-line react-hooks/set-state-in-effect
      if (raw === "1") setShowAdvanced(true);
    } catch {
      // localStorage ممكن يبقى مقفول (privacy mode / SSR quirk) — نتجاهل.
    }
  }, [storageKey]);

  const advancedCount = useMemo(
    () => items.filter((i) => i.category === "advanced").length,
    [items],
  );
  const activeIsAdvanced = useMemo(
    () => items.find((i) => i.key === active)?.category === "advanced",
    [items, active],
  );

  // التبويبات الظاهرة فعليًا في الشريط:
  // - الأساسية دائمًا
  // - المتقدمة لو (showAdvanced) أو (النشط دلوقتي متقدّم — deep-link)
  const visibleItems = useMemo(() => {
    const revealAdvanced = showAdvanced || activeIsAdvanced;
    return items.filter((i) => i.category !== "advanced" || revealAdvanced);
  }, [items, showAdvanced, activeIsAdvanced]);

  function persistShowAdvanced(next: boolean) {
    setShowAdvanced(next);
    if (!storageKey || typeof window === "undefined") return;
    try {
      window.localStorage.setItem(storageKey, next ? "1" : "0");
    } catch {
      // نتجاهل — التفضيل مش حرج.
    }
  }

  useEffect(() => {
    if (tabParam && items.some((i) => i.key === tabParam) && tabParam !== active) {
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setActive(tabParam);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tabParam]);

  // توسيط المرحلة النشطة تلقائيًا جوّه شريط التنقّل عند تغييرها.
  useEffect(() => {
    buttonRefs.current[active]?.scrollIntoView({ behavior: "smooth", inline: "center", block: "nearest" });
  }, [active]);

  function select(key: string) {
    setActive(key);
    const params = new URLSearchParams(searchParams.toString());
    params.set("tab", key);
    params.delete("highlight");
    router.replace(`${pathname}?${params.toString()}`, { scroll: false });
  }

  // عجلة الماوس الرأسية بتتحوّل لسكرول أفقي — من غير كده معظم الفئران
  // (بلا Shift) هتحاول تسكرول الصفحة كلها رأسيًا ومش هتحرّك الشريط.
  function handleWheel(e: React.WheelEvent<HTMLDivElement>) {
    const container = containerRef.current;
    if (!container) return;
    if (Math.abs(e.deltaY) <= Math.abs(e.deltaX)) return;
    container.scrollLeft += e.deltaY;
    e.preventDefault();
  }

  function handlePointerDown(e: ReactPointerEvent<HTMLDivElement>) {
    if (e.button !== 0) return;
    const container = containerRef.current;
    if (!container) return;
    dragState.current = { dragging: true, startX: e.clientX, startScrollLeft: container.scrollLeft, moved: false };
  }

  function handlePointerMove(e: ReactPointerEvent<HTMLDivElement>) {
    const state = dragState.current;
    const container = containerRef.current;
    if (!state?.dragging || !container) return;
    const delta = e.clientX - state.startX;
    if (Math.abs(delta) > 3) state.moved = true;
    container.scrollLeft = state.startScrollLeft - delta;
  }

  function endDrag() {
    if (dragState.current) dragState.current.dragging = false;
  }

  // نمنع onClick من التنقّل لو المستخدم كان بيسحب فعليًا (moved=true)،
  // عشان السحب مايتفسّرش غلط كضغطة على تبويب تحته.
  function handleTabClick(key: string) {
    if (dragState.current?.moved) {
      dragState.current.moved = false;
      return;
    }
    select(key);
  }

  function handleKeyDown(e: React.KeyboardEvent<HTMLDivElement>) {
    const currentIndex = visibleItems.findIndex((i) => i.key === active);
    let nextIndex: number | null = null;
    if (e.key === "ArrowRight") nextIndex = Math.min(visibleItems.length - 1, currentIndex + 1);
    else if (e.key === "ArrowLeft") nextIndex = Math.max(0, currentIndex - 1);
    else if (e.key === "Home") nextIndex = 0;
    else if (e.key === "End") nextIndex = visibleItems.length - 1;
    if (nextIndex === null || nextIndex < 0) return;
    e.preventDefault();
    const nextKey = visibleItems[nextIndex].key;
    select(nextKey);
    buttonRefs.current[nextKey]?.focus();
  }

  return (
    <div>
      <div className="sticky top-0 z-20 -mx-1 bg-[var(--v-bg)]/95 px-1 pb-1 pt-1 backdrop-blur">
        <div className="relative">
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
            aria-label="مراحل دورة حياة المشروع"
            tabIndex={0}
            onWheel={handleWheel}
            onPointerDown={handlePointerDown}
            onPointerMove={handlePointerMove}
            onPointerUp={endDrag}
            onPointerLeave={endDrag}
            onKeyDown={handleKeyDown}
            className="scrollbar-hide flex cursor-grab gap-1 overflow-x-auto border-b border-[var(--v-border)] active:cursor-grabbing"
          >
            <div ref={startRef} className="w-px shrink-0 self-stretch" aria-hidden="true" />
            {visibleItems.map((item) => {
              const key = item.key as WorkflowStageKey;
              const state = stageStates[key];
              const isStale = staleness[key]?.stale;
              return (
                <button
                  key={item.key}
                  ref={(el) => {
                    buttonRefs.current[item.key] = el;
                  }}
                  type="button"
                  role="tab"
                  aria-selected={active === item.key}
                  onClick={() => handleTabClick(item.key)}
                  title={isStale ? (staleness[key]?.reason ?? undefined) : undefined}
                  className={`flex shrink-0 items-center gap-1.5 rounded-t-[var(--v-radius-sm)] px-3.5 py-2 text-sm font-medium whitespace-nowrap transition focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--v-primary)] ${
                    active === item.key
                      ? "border-b-2 border-[var(--v-primary)] bg-[var(--v-primary-tint)] text-[var(--v-primary)]"
                      : "text-[var(--v-text-muted)] hover:bg-[var(--v-surface)] hover:text-[var(--v-text)]"
                  }`}
                >
                  {state && <span className={`h-1.5 w-1.5 shrink-0 rounded-full ${STATUS_DOT_CLASS[state.status]}`} aria-hidden="true" />}
                  {item.label}
                  {item.badgeText && (
                    <span className="rounded-[var(--v-radius-full)] bg-[var(--v-primary-tint)] px-1.5 py-0.5 text-[10px] font-medium text-[var(--v-primary)]">
                      {item.badgeText}
                    </span>
                  )}
                  {isStale && <AlertCircle size={12} className="shrink-0 text-[var(--v-warning)]" aria-label="يحتاج إعادة توليد" />}
                </button>
              );
            })}
            {advancedCount > 0 && (
              <button
                type="button"
                onClick={() => persistShowAdvanced(!showAdvanced)}
                aria-pressed={showAdvanced}
                className="ms-auto flex shrink-0 items-center gap-1.5 rounded-t-[var(--v-radius-sm)] px-3 py-2 text-sm font-medium whitespace-nowrap text-[var(--v-text-muted)] transition hover:bg-[var(--v-surface)] hover:text-[var(--v-text)] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--v-primary)]"
                title={showAdvanced ? "إخفاء التبويبات المتقدّمة" : "إظهار التبويبات المتقدّمة"}
              >
                <MoreHorizontal size={14} aria-hidden="true" />
                <span>{showAdvanced ? `إخفاء المتقدمة (${advancedCount})` : `إظهار المتقدمة (${advancedCount})`}</span>
              </button>
            )}
            <div ref={endRef} className="w-px shrink-0 self-stretch" aria-hidden="true" />
          </div>
        </div>
      </div>

      {items.map((item) => (
        <div key={item.key} role="tabpanel" hidden={active !== item.key} className="pt-4">
          {item.content}
        </div>
      ))}
    </div>
  );
}
