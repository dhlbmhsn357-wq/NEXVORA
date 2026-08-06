import Link from "next/link";
import { getDashboard } from "./actions";
import MigrationSourcesClient from "./migration-sources-client";

export const dynamic = "force-dynamic";

/**
 * منصّة اكتشاف الترحيل وذكاء المصادر — المرحلة ١.
 *
 * Understand Before Migrate: تفهم النظام القديم بالكامل قبل أي ترحيل.
 * الوصول للمشرف فأعلى؛ الإنشاء/التحليل للمدير والمشرف الإداري (مفروض في
 * الإجراءات + التنقّل). المنفّذ لا يرى هذه المرحلة.
 */
export default async function MigrationSourcesPage() {
  const dash = await getDashboard(null);

  if (!dash.ok || !dash.data) {
    return (
      <div className="mx-auto max-w-md rounded-[var(--v-radius-lg)] border border-[var(--v-border)] bg-[var(--v-surface)] p-6 text-center">
        <h1 className="text-[1.0625rem] font-bold text-[var(--v-text)]">اكتشاف الترحيل</h1>
        <p className="mt-2 text-sm text-[var(--v-text-secondary)]">{dash.message ?? "تعذّر العرض."}</p>
        <Link href="/dashboard" className="mt-4 inline-block text-sm font-medium text-[var(--v-primary)] underline">
          الرجوع للوحة التحكّم
        </Link>
      </div>
    );
  }

  return (
    <div>
      <div className="mb-5">
        <h1 className="font-display text-display text-[var(--v-text)]">اكتشاف الترحيل وذكاء المصادر</h1>
        <p className="mt-1 text-sm text-[var(--v-text-secondary)]">
          افهم أي نظام قديم بالكامل قبل الترحيل — بنية، كيانات، علاقات، جودة، مخاطر، وجاهزية. لا ترحيل بيانات في هذه المرحلة.
        </p>
      </div>

      <MigrationSourcesClient dashboard={dash.data} />
    </div>
  );
}
