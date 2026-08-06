"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { archiveItem } from "./archive-actions";
import type { ArchivableTable } from "@/lib/archive/archive-service";

/**
 * زر أرشفة عام — بيسأل تأكيد قبل التنفيذ، وبيتحقق من صلاحية RBAC
 * على الخادم (owner/admin فقط). المستخدم العادي (member) هيشوف
 * الزر لكن هيلاقي رسالة رفض واضحة لو ضغط.
 */
export default function ArchiveButton({
  table,
  id,
  revalidateHref,
  label = "أرشفة",
  confirmMessage = "متأكد؟ العنصر ده هيختفي من القائمة لكن هيفضل محفوظ في القاعدة.",
}: {
  table: ArchivableTable;
  id: string;
  revalidateHref?: string;
  label?: string;
  confirmMessage?: string;
}) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [confirming, setConfirming] = useState(false);

  async function handleConfirm() {
    if (busy) return;
    setBusy(true);
    setError("");
    const result = await archiveItem(table, id, revalidateHref);
    setBusy(false);
    if (!result.ok) {
      setError(result.message ?? "فشلت الأرشفة.");
      return;
    }
    setConfirming(false);
    router.refresh();
  }

  return (
    <>
      <button
        type="button"
        onClick={() => setConfirming(true)}
        className="rounded-[var(--v-radius-md)] border border-[var(--v-border)] px-2 py-1 text-[11px] font-medium text-[var(--v-text-muted)] hover:border-[var(--v-red)] hover:text-[var(--v-red)] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--v-primary)]"
      >
        {label}
      </button>

      {confirming && (
        <div
          role="dialog"
          aria-modal="true"
          className="fixed inset-0 z-30 flex items-center justify-center bg-black/40 px-6"
        >
          <div className="w-full max-w-sm rounded-[var(--v-radius-lg)] border border-[var(--v-border)] bg-[var(--v-bg)] p-5">
            <p className="text-sm font-semibold text-[var(--v-text)]">تأكيد الأرشفة</p>
            <p className="mt-2 text-xs text-[var(--v-text-secondary)]">{confirmMessage}</p>
            {error && <p className="mt-2 text-xs text-[var(--v-red)]">{error}</p>}
            <div className="mt-4 flex justify-end gap-2">
              <button
                type="button"
                onClick={() => setConfirming(false)}
                disabled={busy}
                className="rounded-[var(--v-radius-md)] border border-[var(--v-border)] px-3 py-1.5 text-xs font-medium text-[var(--v-text)] hover:bg-[var(--v-surface)] disabled:opacity-50"
              >
                إلغاء
              </button>
              <button
                type="button"
                onClick={handleConfirm}
                disabled={busy}
                className="rounded-[var(--v-radius-md)] bg-[var(--v-red)] px-3 py-1.5 text-xs font-bold text-white hover:opacity-90 disabled:opacity-50"
              >
                {busy ? "جاري…" : "أرشفة"}
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
