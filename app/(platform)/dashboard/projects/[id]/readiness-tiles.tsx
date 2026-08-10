"use client";

/**
 * NEXVORA Readiness Tiles
 * =======================
 * يعرض الستة مقاييس (Discovery/Validation/Definition/Prototype/Approval/Handoff)
 * كبطاقات صغيرة، وكل بطاقة قابلة للنقر لتكشف breakdown العناصر (items[])
 * — كل عنصر بحالته ووزنه — من نتيجة `computeAllReadiness`.
 * لا يحتوي أي منطق حساب — بس عرض تفاعلي.
 */
import { useState } from "react";
import type { ComputedReadiness } from "@/lib/project-readiness";

export interface ReadinessTilesProps {
  metrics: ComputedReadiness[];
  displayNameByKey: Record<string, string>;
}

const STATUS_LABELS: Record<string, string> = {
  completed: "مكتمل",
  skipped: "تم تخطّيه",
  in_progress: "قيد العمل",
  blocked: "معطَّل",
  not_started: "لم يبدأ",
};

const STATUS_ICON: Record<string, string> = {
  completed: "✓",
  skipped: "↷",
  in_progress: "•",
  blocked: "!",
  not_started: "✗",
};

const STATUS_COLOR: Record<string, string> = {
  completed: "text-[var(--v-green)]",
  skipped: "text-[var(--v-text-secondary)]",
  in_progress: "text-[var(--v-primary)]",
  blocked: "text-[var(--v-red)]",
  not_started: "text-[var(--v-red)]",
};

export default function ReadinessTiles({ metrics, displayNameByKey }: ReadinessTilesProps) {
  const [openKey, setOpenKey] = useState<string | null>(null);

  return (
    <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-6">
      {metrics.map((m) => {
        const isOpen = openKey === m.metric;
        return (
          <div
            key={m.metric}
            className="relative rounded-[var(--v-radius-md)] border border-[var(--v-border)] bg-[var(--v-surface)] p-3"
          >
            <button
              type="button"
              onClick={() => setOpenKey(isOpen ? null : m.metric)}
              className="block w-full text-right transition hover:opacity-80"
              aria-expanded={isOpen}
              title="لماذا هذه النسبة؟"
            >
              <p className="text-[11px] leading-tight text-[var(--v-text-muted)]">
                {displayNameByKey[m.metric] ?? m.metric}
              </p>
              <p className="mt-1 font-mono-plex text-lg font-semibold text-[var(--v-text)]">
                {m.percentage}%
              </p>
              <p className="mt-0.5 text-[10px] text-[var(--v-primary)]">
                {isOpen ? "إخفاء التفاصيل" : "لماذا هذه النسبة؟"}
              </p>
            </button>

            {isOpen && (
              <div
                className="absolute inset-x-0 top-full z-30 mt-1 max-h-80 overflow-auto rounded-[var(--v-radius-md)] border border-[var(--v-border)] bg-[var(--v-bg)] p-3 text-right shadow-lg"
                dir="rtl"
              >
                <p className="mb-2 border-b border-[var(--v-border)] pb-1 text-[11px] font-semibold text-[var(--v-text)]">
                  عناصر الجاهزية ({m.items.length})
                </p>
                {m.items.length === 0 ? (
                  <p className="text-[11px] text-[var(--v-text-muted)]">لا عناصر checklist لهذه المرحلة.</p>
                ) : (
                  <ul className="space-y-1.5">
                    {m.items.map((it) => (
                      <li
                        key={it.itemKey}
                        className="flex items-start justify-between gap-2 text-[11px]"
                      >
                        <span className="flex min-w-0 items-start gap-1.5">
                          <span className={`shrink-0 font-mono ${STATUS_COLOR[it.status] ?? ""}`} title={STATUS_LABELS[it.status] ?? it.status}>
                            {STATUS_ICON[it.status] ?? "•"}
                          </span>
                          <span className="text-[var(--v-text-secondary)]">
                            {it.label}
                            {it.isMandatory ? "" : " (اختياري)"}
                          </span>
                        </span>
                        <span className="shrink-0 rounded-full bg-[var(--v-surface)] px-1.5 text-[10px] text-[var(--v-text-muted)]">
                          وزن {it.weight}
                        </span>
                      </li>
                    ))}
                  </ul>
                )}
                <p className="mt-2 text-[10px] text-[var(--v-text-muted)]">
                  إلزامي = 80% من الوزن الكلي · اختياري = 20%.
                </p>
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}
