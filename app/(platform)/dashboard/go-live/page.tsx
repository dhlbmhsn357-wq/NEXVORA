import Link from "next/link";
import { getDashboard } from "./actions";
import GoLiveClient from "./go-live-client";

export const dynamic = "force-dynamic";

/**
 * مركز التحقّق بعد الترحيل وقبول الأعمال وشهادة الإطلاق (Go Live Validation
 * Center) — المرحلة ٧. التحقّق التقني والتجاري + اعتماد الأقسام والفروع +
 * UAT + شهادة إطلاق رسمية لا تُصدَر إلا بعد نجاح كل الجهات.
 * **Migration is NOT Finished Until Business Confirms Success.**
 */
export default async function GoLivePage() {
  const dash = await getDashboard(null);

  if (!dash.ok || !dash.data) {
    return (
      <div className="mx-auto max-w-md rounded-[var(--v-radius-lg)] border border-[var(--v-border)] bg-[var(--v-surface)] p-6 text-center">
        <h1 className="text-[1.0625rem] font-bold text-[var(--v-text)]">مركز الإطلاق</h1>
        <p className="mt-2 text-sm text-[var(--v-text-secondary)]">{dash.message ?? "تعذّر العرض."}</p>
        <Link href="/dashboard" className="mt-4 inline-block text-sm font-medium text-[var(--v-primary)] underline">الرجوع للوحة التحكّم</Link>
      </div>
    );
  }

  return (
    <div>
      <div className="mb-5">
        <h1 className="font-display text-display text-[var(--v-text)]">مركز التحقّق والإطلاق</h1>
        <p className="mt-1 text-sm text-[var(--v-text-secondary)]">
          خط الدفاع الأخير: تحقّق تقني وتجاري بعد الترحيل، اعتماد كل قسم وكل فرع بشكل مستقل، مركز UAT، وشهادة إطلاق رسمية. <strong>الترحيل لا ينتهي حتى يؤكّد العمل نجاحه.</strong>
        </p>
      </div>
      <GoLiveClient dashboard={dash.data} />
    </div>
  );
}
