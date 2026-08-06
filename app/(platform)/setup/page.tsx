import { redirect } from "next/navigation";
import Link from "next/link";
import { checkSetupGate } from "./actions";
import SetupForm from "./setup-form";

// بتستعلم قاعدة البيانات (فحص وجود مسؤول نظام) — ممنوع الـ prerender وقت الـ build.
export const dynamic = "force-dynamic";

/**
 * صفحة الإعداد الأولي — بتظهر **فقط** لما نتأكد إن مفيش أي مسؤول نظام.
 *
 * التلات حالات مفصولة عن قصد:
 * - `needed` → نموذج الإنشاء.
 * - `already_configured` → تحويل لتسجيل الدخول (منع إعادة الاستخدام).
 * - `unknown` → **لا نموذج ولا تحويل صامت**. بنعرض سبب العطل: إخفاؤه
 *   بيخلّي المستخدم يفتكر إن بياناته اتمسحت، وعرض النموذج بيفتح باب
 *   إنشاء مسؤول نظام في منصة مأهولة.
 */
export default async function SetupPage() {
  const gate = await checkSetupGate();

  if (gate.status === "already_configured") redirect("/login");

  if (gate.status === "unknown") {
    return (
      <main className="flex min-h-screen items-center justify-center bg-[var(--v-bg)] p-[var(--v-space-5)]">
        <div className="w-full max-w-md rounded-[var(--v-radius-lg)] border border-[var(--v-red)]/30 bg-[var(--v-surface)] p-[var(--v-space-6)] text-center">
          <h1 className="text-[1.0625rem] font-bold text-[var(--v-text)]">
            تعذّر التحقق من حالة المنصة
          </h1>
          <p className="mt-[var(--v-space-3)] text-[0.875rem] leading-relaxed text-[var(--v-text-secondary)]">
            مش هنعرض إنشاء مسؤول نظام قبل ما نتأكد إن المنصة فاضية فعلًا.
            بياناتك زي ما هي — المشكلة في الاتصال بقاعدة البيانات أو في
            إعدادات البيئة.
          </p>
          <p className="mt-[var(--v-space-3)] rounded-[var(--v-radius-md)] bg-[var(--v-surface-2)] px-[var(--v-space-3)] py-[var(--v-space-2)] text-start font-mono text-[0.8125rem] text-[var(--v-text-secondary)]">
            {gate.reason}
          </p>
          <Link
            href="/login"
            className="mt-[var(--v-space-4)] inline-block text-[0.875rem] font-medium text-[var(--v-primary)] underline"
          >
            الذهاب لتسجيل الدخول
          </Link>
        </div>
      </main>
    );
  }

  return <SetupForm />;
}
