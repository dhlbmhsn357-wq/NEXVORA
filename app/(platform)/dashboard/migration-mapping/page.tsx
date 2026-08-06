import Link from "next/link";
import { getDashboard } from "./actions";
import MigrationMappingClient from "./migration-mapping-client";

export const dynamic = "force-dynamic";

/**
 * محرّك الـMapping الذكي والتحويل الدلالي — المرحلة ٢.
 *
 * فهم كيف يتحوّل النظام القديم إلى النموذج القياسي الجديد — بالمعنى لا
 * بأسماء الجداول. المرجع الرسمي لمراحل الترحيل التالية. لا ترحيل بيانات.
 * Director/Admin يحرّرون، Supervisor يراجع، Executor لا وصول.
 */
export default async function MigrationMappingPage() {
  const dash = await getDashboard(null);

  if (!dash.ok || !dash.data) {
    return (
      <div className="mx-auto max-w-md rounded-[var(--v-radius-lg)] border border-[var(--v-border)] bg-[var(--v-surface)] p-6 text-center">
        <h1 className="text-[1.0625rem] font-bold text-[var(--v-text)]">Mapping الترحيل</h1>
        <p className="mt-2 text-sm text-[var(--v-text-secondary)]">{dash.message ?? "تعذّر العرض."}</p>
        <Link href="/dashboard" className="mt-4 inline-block text-sm font-medium text-[var(--v-primary)] underline">الرجوع للوحة التحكّم</Link>
      </div>
    );
  }

  return (
    <div>
      <div className="mb-5">
        <h1 className="font-display text-display text-[var(--v-text)]">Mapping الترحيل والتحويل الدلالي</h1>
        <p className="mt-1 text-sm text-[var(--v-text-secondary)]">
          افهم كيف تنتقل البيانات من النظام القديم إلى النموذج القياسي الجديد — كيانات، حقول، علاقات، قواعد تحويل — بالمعنى لا بالاسم. لا ترحيل بيانات.
        </p>
      </div>
      <MigrationMappingClient dashboard={dash.data} />
    </div>
  );
}
