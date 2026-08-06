import Link from "next/link";
import Logo from "./components/logo";

export default function Home() {
  return (
    <div className="flex min-h-screen flex-col items-center justify-center bg-[var(--v-bg-soft)] px-6 text-center">
      <Logo size={56} subtitle="Smart Business Solutions" />
      <h1 className="font-display mt-8 text-4xl text-[var(--v-text)]">
        PM Operating System
      </h1>
      <p className="mt-3 max-w-md text-sm text-[var(--v-text-secondary)]">
        العقل المركزي لإدارة دورة حياة مشاريع VELORA — من أول رسالة عميل حتى الإطلاق.
      </p>
      <Link
        href="/login"
        className="mt-8 rounded-[var(--v-radius-lg)] bg-[var(--v-primary)] px-6 py-3 text-sm font-bold text-white transition hover:bg-[var(--v-primary-hover)]"
      >
        تسجيل الدخول
      </Link>
    </div>
  );
}
