import Link from "next/link";
import { getMigrationDashboard } from "./actions";
import MigrationClient from "./migration-client";

// تقرأ حالة حيّة — ممنوع الـ prerender وقت البناء.
export const dynamic = "force-dynamic";

/**
 * لوحة الترحيل — للمسؤولين فقط.
 *
 * مكان القرار الوحيد في نقل الخدمات للطابور: تشوف الفرق المقاس بين
 * المسارين، وتفتح أو تطفئ كل خدمة على حدة، وترجع الكل دفعة واحدة.
 */
export default async function MigrationPage() {
  const result = await getMigrationDashboard();

  if (!result.ok || !result.data) {
    return (
      <div className="mx-auto max-w-md rounded-[var(--v-radius-lg)] border border-[var(--v-border)] bg-[var(--v-surface)] p-6 text-center">
        <h1 className="text-[1.0625rem] font-bold text-[var(--v-text)]">لوحة الترحيل</h1>
        <p className="mt-2 text-sm text-[var(--v-text-secondary)]">
          {result.message ?? "تعذّر عرض اللوحة."}
        </p>
        <Link
          href="/dashboard"
          className="mt-4 inline-block text-sm font-medium text-[var(--v-primary)] underline"
        >
          الرجوع للوحة التحكّم
        </Link>
      </div>
    );
  }

  return (
    <div>
      <div className="mb-5">
        <h1 className="font-display text-display text-[var(--v-text)]">لوحة الترحيل</h1>
        <p className="mt-1 text-sm text-[var(--v-text-secondary)]">
          نقل الخدمات الثقيلة للطابور — خدمة خدمة، بقياس حقيقي ورجوع فوري.
        </p>
      </div>

      <MigrationClient data={result.data} />
    </div>
  );
}
