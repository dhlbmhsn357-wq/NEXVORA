import Link from "next/link";
import { getDashboard } from "./actions";
import DataQualityClient from "./data-quality-client";

export const dynamic = "force-dynamic";

/**
 * منصّة ذكاء جودة البيانات والتنظيف — المرحلة ٣.
 *
 * لا يجوز ترحيل بيانات سيّئة. تحوّل البيانات السيّئة إلى بيانات موثوقة:
 * تحليل، تكرار، ناقص/غير صالح، سلامة مرجعية، تصحيحات مقترَحة — بلا تعديل
 * للأصل ولا تطبيق تلقائي. Director/Admin يعتمدون، Supervisor يراجع،
 * Executor لا وصول.
 */
export default async function DataQualityPage() {
  const dash = await getDashboard(null);

  if (!dash.ok || !dash.data) {
    return (
      <div className="mx-auto max-w-md rounded-[var(--v-radius-lg)] border border-[var(--v-border)] bg-[var(--v-surface)] p-6 text-center">
        <h1 className="text-[1.0625rem] font-bold text-[var(--v-text)]">جودة البيانات</h1>
        <p className="mt-2 text-sm text-[var(--v-text-secondary)]">{dash.message ?? "تعذّر العرض."}</p>
        <Link href="/dashboard" className="mt-4 inline-block text-sm font-medium text-[var(--v-primary)] underline">الرجوع للوحة التحكّم</Link>
      </div>
    );
  }

  return (
    <div>
      <div className="mb-5">
        <h1 className="font-display text-display text-[var(--v-text)]">ذكاء جودة البيانات والتنظيف</h1>
        <p className="mt-1 text-sm text-[var(--v-text-secondary)]">
          حوّل البيانات السيّئة إلى بيانات موثوقة قبل الترحيل — تكرار، قيم ناقصة/غير صالحة، سلامة مرجعية، وتصحيحات مقترَحة. لا تعديل للأصل، ولا تطبيق تلقائي.
        </p>
      </div>
      <DataQualityClient dashboard={dash.data} />
    </div>
  );
}
