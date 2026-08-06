import Link from "next/link";
import { getMemoryDashboard, getPendingCandidates, getLibrary } from "./actions";
import OrgMemoryClient from "./org-memory-client";

export const dynamic = "force-dynamic";

/**
 * الذاكرة المؤسسية — الطبقة الثالثة من المعرفة.
 *
 * الوصول للمشرف فأعلى؛ الاعتماد للمدير وحده (مفروض في الإجراءات).
 * المنفّذ لا يرى هذه الصفحة (RBAC على مستوى المسار + الإجراء).
 */
export default async function OrgMemoryPage() {
  const [dash, pending, library] = await Promise.all([
    getMemoryDashboard(),
    getPendingCandidates(),
    getLibrary(),
  ]);

  if (!dash.ok || !dash.data) {
    return (
      <div className="mx-auto max-w-md rounded-[var(--v-radius-lg)] border border-[var(--v-border)] bg-[var(--v-surface)] p-6 text-center">
        <h1 className="text-[1.0625rem] font-bold text-[var(--v-text)]">الذاكرة المؤسسية</h1>
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
        <h1 className="font-display text-display text-[var(--v-text)]">الذاكرة المؤسسية</h1>
        <p className="mt-1 text-sm text-[var(--v-text-secondary)]">
          خبرة متراكمة من المشاريع المعتمَدة — كل مشروع يعلّم المنصة.
        </p>
      </div>

      <OrgMemoryClient
        dashboard={dash.data}
        candidates={pending.candidates ?? []}
        experiences={library.experiences ?? []}
      />
    </div>
  );
}
