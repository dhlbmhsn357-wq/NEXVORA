"use client";

import { useEffect, useRef, useState, type ReactNode } from "react";
import { AnimatePresence, motion } from "framer-motion";

/**
 * قائمة منسدلة عامة (Action Menu) — trigger + محتوى، بتتقفل تلقائيًا
 * بالنقر برّه أو بـ Escape. كانت مكررة يدويًا كـ useState+useRef+
 * useEffect في UserMenu — أي قائمة مشابهة جديدة (Kebab menu، إلخ)
 * المفروض تستخدم دي بدل ما تعيد نفس الكود.
 */
export default function Dropdown({
  trigger,
  children,
  align = "start",
}: {
  trigger: (props: { open: boolean; toggle: () => void }) => ReactNode;
  children: (close: () => void) => ReactNode;
  align?: "start" | "end";
}) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    function handleClickOutside(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    }
    function handleKey(e: KeyboardEvent) {
      if (e.key === "Escape") setOpen(false);
    }
    document.addEventListener("mousedown", handleClickOutside);
    window.addEventListener("keydown", handleKey);
    return () => {
      document.removeEventListener("mousedown", handleClickOutside);
      window.removeEventListener("keydown", handleKey);
    };
  }, [open]);

  return (
    <div ref={ref} className="relative">
      {trigger({ open, toggle: () => setOpen((v) => !v) })}
      <AnimatePresence>
        {open && (
          <motion.div
            initial={{ opacity: 0, y: -4, scale: 0.98 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: -4, scale: 0.98 }}
            transition={{ duration: 0.12 }}
            role="menu"
            className={`absolute top-full z-30 mt-2 w-48 max-w-[calc(100vw-2rem)] rounded-[var(--v-radius-lg)] border border-[var(--v-border)] bg-[var(--v-bg)] p-1 shadow-[var(--v-shadow-lg)] ${
              align === "end" ? "end-0" : "start-0"
            }`}
          >
            {children(() => setOpen(false))}
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
