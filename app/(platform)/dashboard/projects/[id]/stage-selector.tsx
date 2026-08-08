"use client";

import { useState, useTransition } from "react";
import { Check, ChevronDown, Loader2 } from "lucide-react";
import Dropdown from "@/components/ui/Dropdown";
import { toast } from "@/components/ui/Toaster";
import { knownStages, stageLabels } from "@/lib/projects/stage-labels";
import { updateProjectStageAction } from "./stage-actions";

/**
 * StageSelector — chip قابل للضغط في هيدر المشروع بيعرض المرحلة
 * الحالية وبيفتح Dropdown فيه كل المراحل الـ 10. الاختيار بيستدعي
 * updateProjectStageAction (بيتحقق من الصلاحية على الخادم).
 * viewer/member/guest بيشوفوا نص عادي بدل الـ selector (fallback
 * محسوم في page.tsx).
 */
export default function StageSelector({
  currentStage,
  projectId,
}: {
  currentStage: string;
  projectId: string;
}) {
  const [stage, setStage] = useState(currentStage);
  const [pending, startTransition] = useTransition();

  function onPick(next: string, close: () => void) {
    if (next === stage || pending) {
      close();
      return;
    }
    const previous = stage;
    setStage(next); // Optimistic
    close();
    const loadingId = toast.loading("جاري تحديث المرحلة…");
    startTransition(async () => {
      const res = await updateProjectStageAction(projectId, next);
      toast.dismiss(loadingId);
      if (res.ok) {
        toast.success(`تم تحديث المرحلة إلى «${stageLabels[next] ?? next}»`);
      } else {
        setStage(previous);
        toast.error(res.message || "فشل تحديث المرحلة.");
      }
    });
  }

  return (
    <Dropdown
      align="start"
      trigger={({ open, toggle }) => (
        <button
          type="button"
          onClick={toggle}
          aria-haspopup="menu"
          aria-expanded={open}
          disabled={pending}
          className="inline-flex items-center gap-1.5 rounded-full border border-[var(--v-border)] bg-[var(--v-surface)] px-2 py-0.5 font-mono-plex text-xs font-semibold text-[var(--v-text)] transition hover:border-[var(--v-primary)] hover:text-[var(--v-primary)] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--v-primary)] disabled:opacity-60"
        >
          {pending ? <Loader2 size={12} className="animate-spin" aria-hidden="true" /> : null}
          <span>{stageLabels[stage] ?? stage}</span>
          <ChevronDown size={12} aria-hidden="true" />
        </button>
      )}
    >
      {(close) => (
        <ul role="menu" className="max-h-80 overflow-y-auto">
          {knownStages.map((s) => {
            const active = s === stage;
            return (
              <li key={s} role="none">
                <button
                  type="button"
                  role="menuitemradio"
                  aria-checked={active}
                  onClick={() => onPick(s, close)}
                  className={`flex w-full items-center justify-between gap-2 rounded-[var(--v-radius-sm)] px-2.5 py-1.5 text-right text-sm transition ${
                    active
                      ? "bg-[var(--v-primary-tint)] text-[var(--v-primary)]"
                      : "text-[var(--v-text)] hover:bg-[var(--v-surface)]"
                  }`}
                >
                  <span>{stageLabels[s] ?? s}</span>
                  {active && <Check size={14} aria-hidden="true" />}
                </button>
              </li>
            );
          })}
        </ul>
      )}
    </Dropdown>
  );
}
