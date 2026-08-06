import Link from "next/link";
import { getLibraryDashboard, getPackages } from "./actions";
import DomainLibraryClient from "./domain-library-client";

// تقرأ حالة حيّة.
export const dynamic = "force-dynamic";

/**
 * مكتبة معرفة المجال — الخبرة القياسية التراكمية (الجزء الموسّع).
 *
 * الوصول للمشرف فأعلى (القراءة)؛ التأليف للمدير وحده، مفروض في
 * الإجراءات.
 */
export default async function DomainLibraryPage() {
  const [dash, pkgs] = await Promise.all([getLibraryDashboard(), getPackages()]);

  if (!dash.ok || !dash.data) {
    return (
      <div className="mx-auto max-w-md rounded-[var(--v-radius-lg)] border border-[var(--v-border)] bg-[var(--v-surface)] p-6 text-center">
        <h1 className="text-[1.0625rem] font-bold text-[var(--v-text)]">مكتبة معرفة المجال</h1>
        <p className="mt-2 text-sm text-[var(--v-text-secondary)]">{dash.message ?? "تعذّر عرض المكتبة."}</p>
        <Link href="/dashboard" className="mt-4 inline-block text-sm font-medium text-[var(--v-primary)] underline">
          الرجوع للوحة التحكّم
        </Link>
      </div>
    );
  }

  return (
    <div>
      <div className="mb-5">
        <h1 className="font-display text-display text-[var(--v-text)]">مكتبة معرفة المجال</h1>
        <p className="mt-1 text-sm text-[var(--v-text-secondary)]">
          الخبرة القياسية لكل نوع نظام — مرجع دائم للذكاء عبر كل المشاريع.
        </p>
      </div>

      <DomainLibraryClient dashboard={dash.data} packages={pkgs.packages ?? []} />
    </div>
  );
}
