"use client";

import { usePathname } from "next/navigation";
import { AnimatePresence, motion } from "framer-motion";
import type { ReactNode } from "react";

/**
 * انتقال ناعم بين صفحات الداشبورد — Fade + Slide خفيف جدًا (8px)، مفتاحه
 * الـ pathname نفسه عشان AnimatePresence يعتبر كل صفحة عنصر مختلف.
 */
export default function PageTransition({ children }: { children: ReactNode }) {
  const pathname = usePathname();

  return (
    <AnimatePresence mode="wait">
      <motion.div
        key={pathname}
        initial={{ opacity: 0, y: 6 }}
        animate={{ opacity: 1, y: 0 }}
        exit={{ opacity: 0, y: -6 }}
        transition={{ duration: 0.16, ease: "easeOut" }}
      >
        {children}
      </motion.div>
    </AnimatePresence>
  );
}
