"use client";

import { Languages } from "lucide-react";
import { useLocale } from "@/lib/i18n/context";
import { LOCALES, LOCALE_LABELS } from "@/lib/i18n/config";

/**
 * زرّ تبديل اللغة (عربي/إنجليزي) — أيقونة ترجمة صغيرة. بيبدّل بين اللغتين
 * فورًا (كوكي + تبديل الاتجاه RTL/LTR + refresh). مصمّم يقعد جنب جرس
 * الإشعارات في التوب-بار، وكمان بيتحطّ في درج الموبايل.
 */
export default function LanguageSwitcher({ variant = "icon" }: { variant?: "icon" | "full" }) {
  const { locale, setLocale } = useLocale();
  const next = LOCALES.find((l) => l !== locale) ?? "en";

  if (variant === "full") {
    return (
      <button
        type="button"
        onClick={() => setLocale(next)}
        className="flex min-h-[44px] w-full items-center gap-2.5 rounded-[var(--v-radius-md)] px-3 text-sm text-[var(--v-text-secondary)] transition hover:bg-[var(--v-surface)] hover:text-[var(--v-primary)]"
      >
        <Languages size={17} />
        <span className="flex-1 text-start">{LOCALE_LABELS[next]}</span>
        <span className="text-[11px] uppercase text-[var(--v-text-subtle)]">{next}</span>
      </button>
    );
  }

  return (
    <button
      type="button"
      onClick={() => setLocale(next)}
      aria-label={`تبديل اللغة إلى ${LOCALE_LABELS[next]}`}
      title={LOCALE_LABELS[next]}
      className="relative flex h-9 items-center gap-1.5 rounded-[var(--v-radius-md)] border border-[var(--v-border)] px-2.5 text-[var(--v-text-secondary)] transition hover:border-[var(--v-primary)] hover:text-[var(--v-primary)]"
    >
      <Languages size={17} />
      <span className="text-xs font-semibold uppercase">{next}</span>
    </button>
  );
}
