"use client";

import { Printer } from "lucide-react";

/**
 * زرار "طباعة / حفظ كـ PDF" — كان مكرر حرفيًا في 3 ملفات منفصلة
 * (prd-print, developer-handoff-print, prototype-review-print).
 * ألوان ثابتة (#3D5CFF) قصدًا بدل CSS Variables — صفحات الطباعة نفسها
 * بتستخدم ألوان ثابتة عشان تطلع نفس الشكل بالظبط بغض النظر عن دارك مود
 * المتصفح وقت الطباعة.
 */
export default function PrintButton() {
  return (
    <button
      type="button"
      onClick={() => window.print()}
      className="flex items-center gap-2 rounded-lg bg-[#3D5CFF] px-4 py-2 text-sm font-bold text-white transition hover:bg-[#4A6CFB]"
    >
      <Printer size={16} />
      طباعة / حفظ كـ PDF
    </button>
  );
}
