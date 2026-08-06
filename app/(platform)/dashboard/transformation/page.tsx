import Link from "next/link";
import { getDashboard } from "./actions";
import TransformationClient from "./transformation-client";

export const dynamic = "force-dynamic";

/**
 * محرّك التحويل الذكي وقواعد الترحيل — المرحلة ٤.
 *
 * كل ترحيل هو تحويل. يبني محرّك التحويل (قواعد + Pipeline + قواعد عمل)
 * من مخرَجات المرحلتين ٢ و٣ — قابل للمعاينة والمراجعة. **لا تنفيذ على
 * Production.** Director/Admin يبنون ويعتمدون، Supervisor يراجع، Executor
 * لا وصول.
 */
export default async function TransformationPage() {
  const dash = await getDashboard(null);

  if (!dash.ok || !dash.data) {
    return (
      <div className="mx-auto max-w-md rounded-[var(--v-radius-lg)] border border-[var(--v-border)] bg-[var(--v-surface)] p-6 text-center">
        <h1 className="text-[1.0625rem] font-bold text-[var(--v-text)]">محرّك التحويل</h1>
        <p className="mt-2 text-sm text-[var(--v-text-secondary)]">{dash.message ?? "تعذّر العرض."}</p>
        <Link href="/dashboard" className="mt-4 inline-block text-sm font-medium text-[var(--v-primary)] underline">الرجوع للوحة التحكّم</Link>
      </div>
    );
  }

  return (
    <div>
      <div className="mb-5">
        <h1 className="font-display text-display text-[var(--v-text)]">محرّك التحويل الذكي</h1>
        <p className="mt-1 text-sm text-[var(--v-text-secondary)]">
          كل ترحيل هو تحويل. ابنِ محرّك قواعد التحويل من الـMapping والتنظيف — قواعد، Pipeline مرئي، قواعد عمل، ومعاينة قديم→جديد. لا تنفيذ على بيانات إنتاج.
        </p>
      </div>
      <TransformationClient dashboard={dash.data} />
    </div>
  );
}
