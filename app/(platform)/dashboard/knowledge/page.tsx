import Link from "next/link";
import { getKnowledgeDashboard } from "./actions";
import { getKnowledgeExplorer } from "./explorer-actions";
import KnowledgeClient from "./knowledge-client";
import KnowledgeExplorer from "./knowledge-explorer";

// تقرأ حالة حيّة — ممنوع الـ prerender وقت البناء.
export const dynamic = "force-dynamic";

/**
 * لوحة مركز المعرفة.
 *
 * المعرفة معزولة بالمشروع من ترحيل ٠٠٧١، فاللوحة بتعرض مشروعًا واحدًا
 * في المرة — تجميعها عبر المشاريع كان هيكسر العزل نفسه.
 */
export default async function KnowledgePage({
  searchParams,
}: {
  searchParams: Promise<{ project?: string }>;
}) {
  const params = await searchParams;
  const result = await getKnowledgeDashboard(params.project);
  // المستكشف للمشروع المختار — بالتوازي بلا حجب اللوحة.
  const explorer = result.ok && result.data?.selectedProjectId
    ? await getKnowledgeExplorer(result.data.selectedProjectId)
    : null;

  if (!result.ok || !result.data) {
    return (
      <div className="mx-auto max-w-md rounded-[var(--v-radius-lg)] border border-[var(--v-border)] bg-[var(--v-surface)] p-6 text-center">
        <h1 className="text-[1.0625rem] font-bold text-[var(--v-text)]">مركز المعرفة</h1>
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
        <h1 className="font-display text-display text-[var(--v-text)]">مركز المعرفة</h1>
        <p className="mt-1 text-sm text-[var(--v-text-secondary)]">
          صحة المعرفة وجودتها ونموّها — كل رقم مقاس من محتوى حقيقي.
        </p>
      </div>

      <KnowledgeClient data={result.data} />

      {explorer?.ok && explorer.data && (
        <div className="mt-8">
          <h2 className="mb-3 font-display text-[1.125rem] font-bold text-[var(--v-text)]">
            مستكشف المعرفة
          </h2>
          <KnowledgeExplorer data={explorer.data} />
        </div>
      )}
    </div>
  );
}
