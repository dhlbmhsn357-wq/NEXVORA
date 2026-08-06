"use client";

import { useState, type ReactNode } from "react";
import { AnimatePresence, motion } from "framer-motion";

/**
 * Tooltip بسيط — بيظهر على Hover أو Focus (Keyboard accessible)، مفيد
 * خصوصًا للأزرار اللي أيقونة بس بدون نص مرئي.
 */
export default function Tooltip({
  label,
  children,
  side = "bottom",
}: {
  label: string;
  children: ReactNode;
  side?: "top" | "bottom";
}) {
  const [open, setOpen] = useState(false);

  return (
    <span
      className="relative inline-flex"
      onMouseEnter={() => setOpen(true)}
      onMouseLeave={() => setOpen(false)}
      onFocus={() => setOpen(true)}
      onBlur={() => setOpen(false)}
    >
      {children}
      <AnimatePresence>
        {open && (
          <motion.span
            role="tooltip"
            initial={{ opacity: 0, y: side === "bottom" ? -4 : 4 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: side === "bottom" ? -4 : 4 }}
            transition={{ duration: 0.12 }}
            className={`pointer-events-none absolute start-1/2 z-50 -translate-x-1/2 whitespace-nowrap rounded-[var(--v-radius-sm)] bg-[var(--v-dark)] px-2 py-1 text-[11px] font-medium text-white shadow-[var(--v-shadow-md)] ${
              side === "bottom" ? "top-full mt-2" : "bottom-full mb-2"
            }`}
          >
            {label}
          </motion.span>
        )}
      </AnimatePresence>
    </span>
  );
}
