import Link from "next/link";
import { getDashboard } from "./actions";
import ProductionMigrationClient from "./production-migration-client";

export const dynamic = "force-dynamic";

/**
 * مركز الترحيل الحقيقي (Enterprise Production Migration Engine) — المرحلة ٦.
 * تنفيذ الترحيل الحقيقي بأمان: نسخة احتياطية إلزامية، فحوص ما قبل التنفيذ،
 * دفعات مرتّبة بالتبعية، استئناف، معالجة أخطاء محلية، تراجع، ومراقبة حيّة.
 * **لا يبدأ إلا بمحاكاة معتمَدة غير محظورة (المرحلة ٥).**
 */
export default async function ProductionMigrationPage() {
  const dash = await getDashboard(null);

  if (!dash.ok || !dash.data) {
    return (
      <div className="mx-auto max-w-md rounded-[var(--v-radius-lg)] border border-[var(--v-border)] bg-[var(--v-surface)] p-6 text-center">
        <h1 className="text-[1.0625rem] font-bold text-[var(--v-text)]">مركز الترحيل الحقيقي</h1>
        <p className="mt-2 text-sm text-[var(--v-text-secondary)]">{dash.message ?? "تعذّر العرض."}</p>
        <Link href="/dashboard" className="mt-4 inline-block text-sm font-medium text-[var(--v-primary)] underline">الرجوع للوحة التحكّم</Link>
      </div>
    );
  }

  return (
    <div>
      <div className="mb-5">
        <h1 className="font-display text-display text-[var(--v-text)]">مركز الترحيل الحقيقي</h1>
        <p className="mt-1 text-sm text-[var(--v-text-secondary)]">
          تنفيذ الترحيل الحقيقي بأمان ١٠٠٪: نسخة احتياطية إلزامية، فحوص ما قبل التنفيذ، دفعات مرتّبة بالتبعية، استئناف من آخر نقطة، معالجة أخطاء محلية، وتراجع في أي لحظة. <strong>لا يبدأ إلا بمحاكاة معتمَدة غير محظورة.</strong>
        </p>
      </div>
      <ProductionMigrationClient dashboard={dash.data} />
    </div>
  );
}
