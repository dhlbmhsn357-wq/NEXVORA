"use client";

import { useEffect, useState, type ReactNode } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";

export interface SubTabSection {
  /** مفتاح URL section — الافتراضي (بدون section param) يبقى key = "". */
  key: string;
  label: string;
  content: ReactNode;
}

/**
 * شريط تبويبات داخلية (subtabs) داخل تبويب واحد من الـ WorkflowNav.
 * بيقرأ ?section=<key> من الـ URL؛ لو مش موجود يستخدم أول قسم.
 * التبديل بيحدّث الـ URL بلا scroll (زي WorkflowNav).
 *
 * الاستخدام (Consolidation UX 2026):
 * - traceability: الأدلة والربط | أثر التغيير
 * - handoff: الحزمة | الوثيقة التقنية | الشركاء
 * - commercial: دورة الحياة | العقود والدفعات | العروض والباقات | طلبات التغيير
 * - deliveryMilestones: المراحل | لوحة المهام | مسؤولو المراحل
 */
export default function SubTabs({ sections, ariaLabel }: { sections: SubTabSection[]; ariaLabel?: string }) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const raw = searchParams.get("section") ?? "";
  const initial = sections.some((s) => s.key === raw) ? raw : sections[0]?.key ?? "";
  const [active, setActive] = useState<string>(initial);

  useEffect(() => {
    const wanted = sections.some((s) => s.key === raw) ? raw : sections[0]?.key ?? "";
    if (wanted !== active) {
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setActive(wanted);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [raw]);

  function select(key: string) {
    setActive(key);
    const params = new URLSearchParams(searchParams.toString());
    if (key) params.set("section", key);
    else params.delete("section");
    router.replace(`${pathname}?${params.toString()}`, { scroll: false });
  }

  return (
    <div>
      <div
        role="tablist"
        aria-label={ariaLabel ?? "أقسام"}
        className="mb-4 flex flex-wrap gap-1 rounded-[var(--v-radius-md)] border border-[var(--v-border)] bg-[var(--v-surface)] p-1"
      >
        {sections.map((s) => (
          <button
            key={s.key || "__default__"}
            type="button"
            role="tab"
            aria-selected={active === s.key}
            onClick={() => select(s.key)}
            className={`rounded-[var(--v-radius-sm)] px-3 py-1.5 text-sm font-medium transition focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--v-primary)] ${
              active === s.key
                ? "bg-[var(--v-primary-tint)] text-[var(--v-primary)]"
                : "text-[var(--v-text-muted)] hover:bg-[var(--v-bg)] hover:text-[var(--v-text)]"
            }`}
          >
            {s.label}
          </button>
        ))}
      </div>
      {sections.map((s) => (
        <div key={s.key || "__default__"} role="tabpanel" hidden={active !== s.key}>
          {s.content}
        </div>
      ))}
    </div>
  );
}
