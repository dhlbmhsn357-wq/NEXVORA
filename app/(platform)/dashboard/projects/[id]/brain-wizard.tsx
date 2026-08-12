"use client";

import { useEffect, useState, type ReactNode } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { Check, ChevronLeft, ChevronRight, Lock } from "lucide-react";
import Button from "@/components/ui/Button";
import { toast } from "@/components/ui/Toaster";

export interface BrainWizardStep {
  /** مفتاح URL section — بيتحفظ في ?tab=projectBrain&section=<key>. */
  key: string;
  label: string;
  content: ReactNode;
  /** true لو الخطوة دي بتمنع "التالي" لحد ما blockedCount = 0. */
  gated?: boolean;
  blockedCount?: number;
  /** رسالة توضيحية تظهر لما الخطوة محجوبة (بتتضمّن العدد عادةً). */
  blockedMessage?: string;
}

/**
 * ويزارد خطي (5 خطوات) لتبويب Project Brain — بديل SubTabs القديم اللي
 * كان بيسمح بالقفز الحر بين 3 تبويبات بلا أي ترتيب أو إحساس بالتقدّم.
 * ده مكوّن مستقل عن SubTabs عمدًا: منطق البوابة (gating) + نقاط التقدّم +
 * رسائل الحجب مش موجودين في SubTabs، وإضافتهم هناك كانت هتحوّله لمكوّن
 * تاني تمامًا يخدم استخدام واحد بس (هذا التبويب) — فالفصل أوضح.
 *
 * نفس قاعدة الـ URL المتّبعة في SubTabs: ?section=<key>، بـ useRouter/
 * useSearchParams + router.replace({ scroll: false }) عشان يفضل شغال مع
 * الرجوع/تحديث الصفحة.
 */
export default function BrainWizard({ steps }: { steps: BrainWizardStep[] }) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const raw = searchParams.get("section") ?? "";

  function indexFromKey(key: string): number {
    const i = steps.findIndex((s) => s.key === key);
    return i === -1 ? 0 : i;
  }

  const [activeIndex, setActiveIndex] = useState<number>(() => indexFromKey(raw));

  useEffect(() => {
    const wanted = indexFromKey(raw);
    if (wanted !== activeIndex) {
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setActiveIndex(wanted);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [raw]);

  function isStepBlocked(index: number): boolean {
    const s = steps[index];
    return !!s?.gated && (s.blockedCount ?? 0) > 0;
  }

  /** أول خطوة محجوبة قبل index المطلوب — لو فيه واحدة، الانتقال ممنوع. */
  function firstBlockingStepBefore(targetIndex: number): number | null {
    for (let i = 0; i < targetIndex; i++) {
      if (isStepBlocked(i)) return i;
    }
    return null;
  }

  function goTo(index: number) {
    if (index < 0 || index >= steps.length || index === activeIndex) return;
    // الرجوع للخلف مسموح دايمًا؛ التقدّم للأمام لازم كل الخطوات المحجوبة قبله تكون اتحسمت.
    if (index > activeIndex) {
      const blocker = firstBlockingStepBefore(index);
      if (blocker !== null) {
        toast.error(`لازم تحسم الخطوة ${blocker + 1} الأول — ${steps[blocker].label}.`);
        return;
      }
    }
    setActiveIndex(index);
    const params = new URLSearchParams(searchParams.toString());
    params.set("section", steps[index].key);
    router.replace(`${pathname}?${params.toString()}`, { scroll: false });
  }

  const current = steps[activeIndex];
  const currentBlocked = isStepBlocked(activeIndex);
  const isLastStep = activeIndex === steps.length - 1;

  return (
    <div className="space-y-5">
      {/* شريط التقدّم */}
      <div className="rounded-[var(--v-radius-lg)] border border-[var(--v-border)] bg-[var(--v-surface)] p-3">
        <div className="flex items-center gap-1">
          {steps.map((s, i) => {
            const isCurrent = i === activeIndex;
            const isDone = i < activeIndex && !isStepBlocked(i);
            return (
              <button
                key={s.key}
                type="button"
                onClick={() => goTo(i)}
                aria-current={isCurrent ? "step" : undefined}
                title={s.label}
                className={`flex flex-1 items-center gap-1.5 rounded-[var(--v-radius-md)] px-1.5 py-1.5 text-right transition ${
                  isCurrent ? "bg-[var(--v-primary)]/10" : "hover:bg-[var(--v-bg)]"
                }`}
              >
                <span
                  className={`flex h-5 w-5 shrink-0 items-center justify-center rounded-full text-[10px] font-bold ${
                    isCurrent
                      ? "bg-[var(--v-primary)] text-white"
                      : isDone
                        ? "bg-[var(--v-green)] text-white"
                        : "bg-[var(--v-surface-muted)] text-[var(--v-text-muted)]"
                  }`}
                >
                  {isDone ? <Check size={12} /> : i + 1}
                </span>
                <span
                  className={`hidden truncate text-[11px] font-medium sm:inline ${
                    isCurrent ? "text-[var(--v-primary)]" : "text-[var(--v-text-muted)]"
                  }`}
                >
                  {s.label}
                </span>
              </button>
            );
          })}
        </div>
        <p className="mt-2 text-center text-xs font-medium text-[var(--v-text-muted)]">
          الخطوة {activeIndex + 1} من {steps.length} — {current.label}
        </p>
      </div>

      {/* محتوى الخطوة الحالية */}
      <div>{current.content}</div>

      {/* التنقّل */}
      <div className="flex flex-wrap items-center justify-between gap-2 border-t border-[var(--v-border)] pt-3">
        <Button variant="outline" size="sm" onClick={() => goTo(activeIndex - 1)} disabled={activeIndex === 0}>
          <ChevronRight size={14} /> السابق
        </Button>

        {!isLastStep && (
          <div className="flex flex-col items-end gap-1">
            {currentBlocked && current.blockedMessage && (
              <p className="flex items-center gap-1 text-[11px] font-medium text-[var(--v-amber)]">
                <Lock size={11} /> {current.blockedMessage}
              </p>
            )}
            <Button variant="primary" size="sm" onClick={() => goTo(activeIndex + 1)} disabled={currentBlocked}>
              التالي <ChevronLeft size={14} />
            </Button>
          </div>
        )}
      </div>
    </div>
  );
}
