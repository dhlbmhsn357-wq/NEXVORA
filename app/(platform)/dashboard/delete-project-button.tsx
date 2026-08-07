"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { deleteProject } from "./archive-actions";

/**
 * زر حذف المشروع نهائيًا — Owner فقط. Double-confirmation:
 *   1) ضغط الزر يفتح النافذة.
 *   2) لازم يكتب اسم المشروع بالظبط عشان زر الحذف يشتغل.
 *
 * الحذف Cascade على كل بيانات المشروع (Brain, PRD, Meetings،
 * Contracts, Payments، إلخ) — لا رجوع. الأرشفة موصى بها كبديل
 * في أغلب الحالات؛ الحذف مخصوص للمشاريع التجريبية أو الخطأ.
 */
export default function DeleteProjectButton({
  projectId,
  projectName,
}: {
  projectId: string;
  projectName: string;
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [typed, setTyped] = useState("");

  const canDelete = typed.trim() === projectName.trim();

  async function handleConfirm() {
    if (busy || !canDelete) return;
    setBusy(true);
    setError("");
    const result = await deleteProject(projectId, "/dashboard/projects");
    // redirect داخل الأكشن ما بيرجّعش هنا لو نجح — لو وصلنا هنا يبقى فيه خطأ.
    setBusy(false);
    if (!result.ok) {
      setError(result.message ?? "فشل الحذف.");
      return;
    }
    setOpen(false);
    router.push("/dashboard/projects");
    router.refresh();
  }

  return (
    <>
      <button
        type="button"
        onClick={() => { setOpen(true); setTyped(""); setError(""); }}
        className="rounded-[var(--v-radius-md)] border border-[var(--v-red)]/40 px-2 py-1 text-[11px] font-medium text-[var(--v-red)] hover:bg-[var(--v-red)]/10 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--v-red)]"
      >
        حذف نهائي
      </button>

      {open && (
        <div role="dialog" aria-modal="true" className="fixed inset-0 z-40 flex items-center justify-center bg-black/50 px-6">
          <div className="w-full max-w-md rounded-[var(--v-radius-lg)] border border-[var(--v-red)]/50 bg-[var(--v-bg)] p-5 shadow-[var(--v-shadow-lg)]">
            <p className="text-base font-bold text-[var(--v-red)]">⚠️ حذف نهائي بلا رجوع</p>
            <p className="mt-2 text-sm text-[var(--v-text)]">
              هيتم مسح <b>{projectName}</b> نهائيًا ومعاه <b>كل</b> بياناته:
              Brain, PRD, Meetings, Contracts, Payments, Support، والاجتماعات
              والوثائق المرتبطة.
            </p>
            <p className="mt-2 rounded-[var(--v-radius-md)] bg-[var(--v-red)]/10 p-2 text-xs text-[var(--v-red)]">
              الأرشفة كافية في أغلب الحالات — بتخبّي المشروع بس بتحتفظ بكل حاجة.
              الحذف مخصوص للمشاريع التجريبية أو المُنشَأة بالخطأ.
            </p>

            <label className="mt-4 block text-xs text-[var(--v-text-secondary)]">
              اكتب اسم المشروع بالظبط للتأكيد:{" "}
              <code className="font-mono text-[var(--v-text)]">{projectName}</code>
            </label>
            <input
              type="text"
              value={typed}
              onChange={(e) => setTyped(e.target.value)}
              placeholder={projectName}
              autoFocus
              className="mt-1 h-10 w-full rounded-[var(--v-radius-md)] border border-[var(--v-border)] bg-[var(--v-surface)] px-3 text-sm text-[var(--v-text)] outline-none focus-visible:border-[var(--v-red)] focus-visible:ring-2 focus-visible:ring-[var(--v-red)]/30"
            />

            {error && <p className="mt-2 text-xs text-[var(--v-red)]">{error}</p>}

            <div className="mt-4 flex justify-end gap-2">
              <button
                type="button"
                onClick={() => setOpen(false)}
                disabled={busy}
                className="rounded-[var(--v-radius-md)] border border-[var(--v-border)] px-3 py-1.5 text-xs font-medium text-[var(--v-text)] hover:bg-[var(--v-surface)] disabled:opacity-50"
              >
                إلغاء
              </button>
              <button
                type="button"
                onClick={handleConfirm}
                disabled={busy || !canDelete}
                className="rounded-[var(--v-radius-md)] bg-[var(--v-red)] px-3 py-1.5 text-xs font-bold text-white hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-40"
              >
                {busy ? "جاري الحذف…" : "احذف نهائيًا"}
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
