import Link from "next/link";
import { getDashboard } from "./actions";
import SimulationClient from "./simulation-client";

export const dynamic = "force-dynamic";

/**
 * مركز محاكاة الترحيل (Enterprise Migration Simulation, Digital Twin & AI
 * Validation) — المرحلة ٥. يبني نسخة رقمية للنظام الجديد، يعيد تنفيذ كل
 * خطوات الترحيل افتراضيًا، يقارن بالمصدر، ويُصدر Migration Approval Score.
 * **Never Touch Production Before Simulation.**
 */
export default async function MigrationSimulationPage() {
  const dash = await getDashboard(null);

  if (!dash.ok || !dash.data) {
    return (
      <div className="mx-auto max-w-md rounded-[var(--v-radius-lg)] border border-[var(--v-border)] bg-[var(--v-surface)] p-6 text-center">
        <h1 className="text-[1.0625rem] font-bold text-[var(--v-text)]">مركز محاكاة الترحيل</h1>
        <p className="mt-2 text-sm text-[var(--v-text-secondary)]">{dash.message ?? "تعذّر العرض."}</p>
        <Link href="/dashboard" className="mt-4 inline-block text-sm font-medium text-[var(--v-primary)] underline">الرجوع للوحة التحكّم</Link>
      </div>
    );
  }

  return (
    <div>
      <div className="mb-5">
        <h1 className="font-display text-display text-[var(--v-text)]">مركز محاكاة الترحيل</h1>
        <p className="mt-1 text-sm text-[var(--v-text-secondary)]">
          مختبر كامل يحاكي الترحيل الحقيقي قبل الضغط على زر التنفيذ. نسخة رقمية (Digital Twin) تعيد تنفيذ كل الخطوات، تقارن بالمصدر، وتُصدر درجة اعتماد تمنع الكوارث. <strong>لا تنفيذ على بيانات إنتاج.</strong>
        </p>
      </div>
      <SimulationClient dashboard={dash.data} />
    </div>
  );
}
