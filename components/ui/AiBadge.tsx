"use client";

import { motion } from "framer-motion";

/**
 * علامة هوية الذكاء الاصطناعي — تظليل تدرّجي هادئ (أخضر مزرق→ذهبي) +
 * نقطة نابضة، صفر أيقونة أو إيموجي. توضع جنب أي عنوان محتوى مولّد
 * (PRD, Prototype Prompt, العرض التقديمي, Handoff, تحليل المشروع,
 * فرز الدعم) للتمييز عن المحتوى المُدخل يدويًا — بدون ما تبقى طفولية.
 */
export default function AiBadge({ label = "مولّد بالذكاء الاصطناعي" }: { label?: string }) {
  return (
    <span className="inline-flex items-center gap-1.5 rounded-full border border-[var(--v-border)] bg-gradient-to-l from-[var(--v-green)]/10 to-[var(--v-amber)]/10 px-2.5 py-1 text-[11px] font-bold text-[var(--v-primary)]">
      <motion.span
        className="h-1.5 w-1.5 rounded-full bg-[var(--v-green)]"
        animate={{ opacity: [1, 0.35, 1] }}
        transition={{ duration: 2, repeat: Infinity, ease: "easeInOut" }}
        aria-hidden="true"
      />
      {label}
    </span>
  );
}
