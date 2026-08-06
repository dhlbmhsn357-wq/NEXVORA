"use client";

import { AnimatePresence, motion } from "framer-motion";
import { useEffect, type ReactNode } from "react";

/**
 * Bottom Sheet — نسخة موبايل من أي لوحة Filters جانبية، بتدخل من
 * تحت بدل النص. على الشاشات الأكبر من 640px الاستخدام العادي (Modal
 * أو Filters ثابتة) هو الأنسب، فده مخصص للموبايل بس.
 */
export default function BottomSheet({
  open,
  onClose,
  children,
  title,
}: {
  open: boolean;
  onClose: () => void;
  children: ReactNode;
  title?: string;
}) {
  useEffect(() => {
    if (!open) return;
    function handleKey(e: KeyboardEvent) {
      if (e.key === "Escape") onClose();
    }
    window.addEventListener("keydown", handleKey);
    return () => window.removeEventListener("keydown", handleKey);
  }, [open, onClose]);

  return (
    <AnimatePresence>
      {open && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.15 }}
          className="fixed inset-0 z-40 bg-black/40 sm:hidden"
          onClick={onClose}
        >
          <motion.div
            role="dialog"
            aria-modal="true"
            initial={{ y: "100%" }}
            animate={{ y: 0 }}
            exit={{ y: "100%" }}
            transition={{ duration: 0.22, ease: "easeOut" }}
            onClick={(e) => e.stopPropagation()}
            className="absolute inset-x-0 bottom-0 max-h-[80vh] overflow-y-auto rounded-t-[var(--v-radius-2xl)] bg-[var(--v-bg)] p-5 shadow-[var(--v-shadow-lg)]"
          >
            <div className="mx-auto mb-3 h-1 w-10 rounded-full bg-[var(--v-border-strong)]" />
            {title && <p className="mb-3 text-sm font-semibold text-[var(--v-text)]">{title}</p>}
            {children}
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
