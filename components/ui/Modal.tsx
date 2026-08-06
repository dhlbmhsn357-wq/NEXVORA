"use client";

import { AnimatePresence, motion } from "framer-motion";
import type { ReactNode } from "react";
import { useEffect, useRef } from "react";

const FOCUSABLE_SELECTOR =
  'a[href], button:not([disabled]), textarea:not([disabled]), input:not([disabled]), select:not([disabled]), [tabindex]:not([tabindex="-1"])';

/**
 * Modal عام بحركة دخول/خروج ناعمة (Fade + Scale خفيف). بيدعم إغلاق
 * بـ Escape. على الموبايل (max-width: 640px) بيتحول Full Screen
 * تلقائيًا بدل نافذة صغيرة في النص.
 */
export default function Modal({
  open,
  onClose,
  children,
  maxWidth = "max-w-md",
}: {
  open: boolean;
  onClose: () => void;
  children: ReactNode;
  maxWidth?: string;
}) {
  const panelRef = useRef<HTMLDivElement>(null);
  const previouslyFocused = useRef<HTMLElement | null>(null);

  useEffect(() => {
    if (!open) return;
    function handleKey(e: KeyboardEvent) {
      if (e.key === "Escape") {
        onClose();
        return;
      }
      if (e.key !== "Tab" || !panelRef.current) return;
      const focusables = Array.from(panelRef.current.querySelectorAll<HTMLElement>(FOCUSABLE_SELECTOR));
      if (focusables.length === 0) return;
      const first = focusables[0];
      const last = focusables[focusables.length - 1];
      if (e.shiftKey && document.activeElement === first) {
        e.preventDefault();
        last.focus();
      } else if (!e.shiftKey && document.activeElement === last) {
        e.preventDefault();
        first.focus();
      }
    }
    window.addEventListener("keydown", handleKey);
    return () => window.removeEventListener("keydown", handleKey);
  }, [open, onClose]);

  useEffect(() => {
    if (!open) return;
    previouslyFocused.current = document.activeElement as HTMLElement | null;
    const first = panelRef.current?.querySelector<HTMLElement>(FOCUSABLE_SELECTOR);
    first?.focus();
    return () => {
      previouslyFocused.current?.focus();
    };
  }, [open]);

  return (
    <AnimatePresence>
      {open && (
        <motion.div
          role="dialog"
          aria-modal="true"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.15 }}
          className="fixed inset-0 z-30 flex items-center justify-center bg-black/40 p-0 sm:p-6"
          onClick={onClose}
        >
          <motion.div
            ref={panelRef}
            initial={{ opacity: 0, scale: 0.97, y: 8 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.97, y: 8 }}
            transition={{ duration: 0.18, ease: "easeOut" }}
            onClick={(e) => e.stopPropagation()}
            className={`h-full w-full overflow-y-auto rounded-none border-0 bg-[var(--v-bg)] p-6 shadow-[var(--v-shadow-lg)] sm:h-auto sm:max-h-[85vh] sm:w-full sm:rounded-[var(--v-radius-2xl)] sm:border sm:border-[var(--v-border)] ${maxWidth}`}
          >
            {children}
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
