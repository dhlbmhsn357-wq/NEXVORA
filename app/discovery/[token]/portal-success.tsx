"use client";

import { CheckCircle2, ClipboardCheck } from "lucide-react";

/**
 * شاشة النجاح بعد التسليم — لا ترجع للفورم أبدًا.
 *  - alreadySubmitted=false: عرض فوري بعد ضغط "إرسال" (نفس الجلسة).
 *  - alreadySubmitted=true: العميل فتح نفس الرابط تاني بعد التسليم —
 *    نفس البنية لكن نبرة "already submitted" بدل "شكرًا، بدأنا نراجع".
 */
export default function PortalSuccess({
  projectName,
  referenceCode,
  alreadySubmitted = false,
}: {
  projectName: string;
  referenceCode: string;
  alreadySubmitted?: boolean;
}) {
  function handleClose() {
    // بوابة عامة بلا أي Deep Link لداخل النظام — أقصى حاجة نقدر نعملها
    // هي محاولة قفل التبويب (بينجح لو الصفحة اتفتحت من سكربت/رابط خارجي
    // مباشر). لو المتصفح رفض (شائع للتبويبات المفتوحة يدويًا)، بنسيب
    // للمستخدم يقفلها بنفسه — من غير أي تنقّل لمكان تاني.
    window.close();
  }

  return (
    <div className="mx-auto flex min-h-screen w-full max-w-xl flex-col items-center justify-center px-5 py-12 text-center">
      <div className="animate-[fadeIn_0.5s_ease] flex h-20 w-20 items-center justify-center rounded-full bg-[var(--v-green)]/12">
        <CheckCircle2 size={48} className="text-[var(--v-green)]" strokeWidth={2.2} />
      </div>

      <h1 className="mt-6 font-display text-3xl font-extrabold text-[var(--v-text)]">
        {alreadySubmitted ? "تم إرسال هذا النموذج من قبل" : "تم استلام المعلومات بنجاح"}
      </h1>

      <p className="mt-4 text-lg leading-relaxed text-[var(--v-text-secondary)]">
        {alreadySubmitted ? (
          <>
            شكراً لك! نموذج مشروع «{projectName}» اتسلّم بالفعل، وفريق{" "}
            <span className="font-semibold text-[var(--v-text)]">VELORA</span> بيراجعه حالياً.
            هنتواصل معك قريباً.
          </>
        ) : (
          <>
            شكراً لك! بدأ فريق <span className="font-semibold text-[var(--v-text)]">VELORA</span> الآن
            مراجعة مشروعك «{projectName}»، وسنتواصل معك قريباً.
          </>
        )}
      </p>

      <div className="mt-6 flex items-center gap-2 rounded-[var(--v-radius-lg)] border border-[var(--v-border)] bg-[var(--v-surface)] px-4 py-2.5">
        <ClipboardCheck size={16} className="text-[var(--v-text-muted)]" />
        <span className="text-sm text-[var(--v-text-muted)]">الرقم المرجعي:</span>
        <span dir="ltr" className="font-mono-plex text-sm font-bold text-[var(--v-text)]">
          {referenceCode}
        </span>
      </div>

      <button
        type="button"
        onClick={handleClose}
        className="mt-8 rounded-[var(--v-radius-lg)] bg-[var(--v-primary)] px-8 py-3 text-sm font-bold text-white shadow-[var(--v-shadow-sm)] transition hover:bg-[var(--v-primary-hover)]"
      >
        إغلاق
      </button>

      <p className="mt-8 font-display text-lg font-extrabold tracking-tight text-[var(--v-text-subtle)]">
        VELORA
      </p>
    </div>
  );
}
