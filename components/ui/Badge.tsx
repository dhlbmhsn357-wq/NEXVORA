import type { ReactNode } from "react";

export type BadgeTone = "neutral" | "primary" | "success" | "warning" | "danger" | "info";
type Tone = BadgeTone;

const toneClasses: Record<Tone, string> = {
  neutral: "bg-[var(--v-surface)] text-[var(--v-text-muted)]",
  primary: "bg-[var(--v-primary-tint)] text-[var(--v-primary)]",
  success: "bg-[var(--v-green)]/10 text-[var(--v-green)]",
  warning: "bg-[var(--v-amber)]/10 text-[var(--v-amber)]",
  danger: "bg-[var(--v-red)]/10 text-[var(--v-red)]",
  info: "bg-[var(--v-info)]/10 text-[var(--v-info)]",
};

/**
 * شارة الحالة الموحّدة — بديل لكل الـ <span className="rounded-full..."/>
 * المكرر عبر لوحات المشروع كلها.
 */
export default function Badge({ tone = "neutral", children }: { tone?: Tone; children: ReactNode }) {
  return (
    <span
      className={`inline-flex items-center gap-1 rounded-[var(--v-radius-full)] px-2.5 py-1 text-[11px] font-medium tabular-nums ${toneClasses[tone]}`}
    >
      {children}
    </span>
  );
}
