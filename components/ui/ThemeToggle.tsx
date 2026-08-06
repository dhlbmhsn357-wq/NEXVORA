"use client";

import { useEffect, useState } from "react";
import { Sun, Moon } from "lucide-react";
import Tooltip from "./Tooltip";

type Theme = "light" | "dark";

function getStoredTheme(): Theme | null {
  if (typeof window === "undefined") return null;
  const stored = window.localStorage.getItem("pm-os-theme");
  return stored === "light" || stored === "dark" ? stored : null;
}

/**
 * زر تبديل الوضع الليلي — بيحفظ التفضيل في localStorage ويحدّث
 * data-theme على <html> فورًا. الـ Script الجالس في <head> (لايوت
 * الجذر) بيطبّق التفضيل المحفوظ قبل أول Paint عشان يمنع أي وميض
 * (Flash) بين الوضعين وقت تحميل الصفحة.
 */
export default function ThemeToggle() {
  const [theme, setTheme] = useState<Theme | null>(null);

  useEffect(() => {
    // قراءة لمرة واحدة عند الـ mount من localStorage/matchMedia (مش قيمة تتغير تفاعليًا).
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setTheme(getStoredTheme() ?? (window.matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light"));
  }, []);

  function toggle() {
    const next: Theme = theme === "dark" ? "light" : "dark";
    setTheme(next);
    document.documentElement.setAttribute("data-theme", next);
    window.localStorage.setItem("pm-os-theme", next);
  }

  return (
    <Tooltip label={theme === "dark" ? "التبديل للوضع الفاتح" : "التبديل للوضع الغامق"}>
      <button
        type="button"
        onClick={toggle}
        aria-label={theme === "dark" ? "التبديل للوضع الفاتح" : "التبديل للوضع الغامق"}
        className="flex h-9 w-9 items-center justify-center rounded-[var(--v-radius-md)] border border-[var(--v-border)] text-[var(--v-text-secondary)] transition hover:border-[var(--v-primary)] hover:text-[var(--v-primary)] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--v-primary)]"
      >
        {theme === "dark" ? <Sun size={16} /> : <Moon size={16} />}
      </button>
    </Tooltip>
  );
}
