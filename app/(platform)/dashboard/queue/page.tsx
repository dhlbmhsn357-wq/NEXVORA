import Link from "next/link";
import { getQueueDashboard } from "./actions";
import QueueClient from "./queue-client";

// تقرأ حالة حيّة — ممنوع الـ prerender وقت البناء.
export const dynamic = "force-dynamic";

/**
 * لوحة الطوابير — للمسؤولين فقط.
 *
 * اللوحة تكشف أحمال النظام وأخطاءه **عبر كل المشاريع**، فهي إدارية
 * بطبيعتها لا خاصة بمشروع.
 */
export default async function QueuePage() {
  const result = await getQueueDashboard();

  if (!result.ok || !result.data) {
    return (
      <div className="mx-auto max-w-md rounded-[var(--v-radius-lg)] border border-[var(--v-border)] bg-[var(--v-surface)] p-6 text-center">
        <h1 className="text-[1.0625rem] font-bold text-[var(--v-text)]">لوحة الطوابير</h1>
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
        <h1 className="font-display text-display text-[var(--v-text)]">لوحة الطوابير</h1>
        <p className="mt-1 text-sm text-[var(--v-text-secondary)]">
          حالة المهام والعمال لحظة بلحظة — كل عملية ثقيلة في المنصة بتمرّ من هنا.
        </p>
      </div>

      <QueueClient data={result.data} />
    </div>
  );
}
