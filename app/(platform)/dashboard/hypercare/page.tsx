import Link from "next/link";
import { getDashboard } from "./actions";
import HypercareClient from "./hypercare-client";

export const dynamic = "force-dynamic";

/**
 * مركز Hypercare والمراقبة الذكية والتحسين المستمر — المرحلة ٨ (الأخيرة).
 * بعد الإطلاق تراقب VELORA المشروع لحظيًّا، تكتشف المشكلات، تتعلّم منها،
 * وتُحسّن كل مشروع مستقبلي. المرحلة الختامية لحزمة EMIS.
 * **Migration Success Does NOT End At Go Live.**
 */
export default async function HypercarePage() {
  const dash = await getDashboard(null);

  if (!dash.ok || !dash.data) {
    return (
      <div className="mx-auto max-w-md rounded-[var(--v-radius-lg)] border border-[var(--v-border)] bg-[var(--v-surface)] p-6 text-center">
        <h1 className="text-[1.0625rem] font-bold text-[var(--v-text)]">مركز Hypercare</h1>
        <p className="mt-2 text-sm text-[var(--v-text-secondary)]">{dash.message ?? "تعذّر العرض."}</p>
        <Link href="/dashboard" className="mt-4 inline-block text-sm font-medium text-[var(--v-primary)] underline">الرجوع للوحة التحكّم</Link>
      </div>
    );
  }

  return (
    <div>
      <div className="mb-5">
        <h1 className="font-display text-display text-[var(--v-text)]">مركز Hypercare</h1>
        <p className="mt-1 text-sm text-[var(--v-text-secondary)]">
          مراقبة ما بعد الإطلاق: صحة لحظية، كشف شذوذ وحوادث بالذكاء الاصطناعي، توصيات تحسين مستمرة، وتعلّم يجعل كل مشروع أذكى من سابقه. <strong>نجاح الترحيل لا ينتهي عند الإطلاق.</strong>
        </p>
      </div>
      <HypercareClient dashboard={dash.data} />
    </div>
  );
}
