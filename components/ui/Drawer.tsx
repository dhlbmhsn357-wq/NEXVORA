"use client";

import { AnimatePresence, motion } from "framer-motion";
import { X } from "lucide-react";
import { useEffect, type ReactNode } from "react";

/**
 * Drawer جانبي (بيدخل من اليمين لأن الموقع RTL) — للتنقل على الموبايل
 * بدل ما روابط التبويب العلوي تتقطع أو تعمل Scroll أفقي.
 */
export default function Drawer({
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
          className="fixed inset-0 z-40 bg-black/40"
          onClick={onClose}
        >
          <motion.div
            role="dialog"
            aria-modal="true"
            initial={{ x: "100%" }}
            animate={{ x: 0 }}
            exit={{ x: "100%" }}
            transition={{ duration: 0.22, ease: "easeOut" }}
            onClick={(e) => e.stopPropagation()}
            className="absolute inset-y-0 right-0 flex w-[82%] max-w-xs flex-col bg-[var(--v-bg)] shadow-[var(--v-shadow-lg)]"
          >
            <div className="flex items-center justify-between border-b border-[var(--v-border)] p-4">
              {title && <p className="text-sm font-semibold text-[var(--v-text)]">{title}</p>}
              <button
                type="button"
                onClick={onClose}
                aria-label="إغلاق"
                className="ms-auto flex h-9 w-9 items-center justify-center rounded-[var(--v-radius-md)] text-[var(--v-text-muted)] hover:bg-[var(--v-surface)]"
              >
                <X size={18} />
              </button>
            </div>
            <div className="flex-1 overflow-y-auto p-2">{children}</div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
