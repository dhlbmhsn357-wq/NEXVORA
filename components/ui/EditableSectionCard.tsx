"use client";

import { useState } from "react";
import { useUnsavedChangesGuard } from "@/lib/hooks/useUnsavedChangesGuard";

export interface SaveResult {
  ok: boolean;
  /** لو موجودة، بتتعرض للمستخدم وتفضل في وضع التعديل. لو undefined
   * والحفظ فشل (ok:false)، الفشل بيتجاهل بصمت — بيحاكي بالظبط سلوك
   * اللوحات اللي كانت أصلاً بتتجاهل خطأ الـ JSON من غير رسالة. */
  error?: string;
}

/**
 * الهيكل المشترك لكارت تعديل قسم واحد — نفس البنية المتكررة في PRD،
 * Prototype Prompt، Client Presentation، وDeveloper Handoff. كل لوحة
 * بتحقن نصوصها وسلوك الحفظ/التحقق بتاعها بالظبط زي ما كانت، فمفيش أي
 * تغيير سلوكي أو نصي مرئي — بس الهيكل حواليهم بقى مكان واحد.
 */
export default function EditableSectionCard({
  headerLabel,
  align = "right",
  disabled,
  viewContent,
  getInitialDraft,
  onSave,
  onChanged,
  editLabel = "تعديل",
  cancelLabel = "إلغاء",
  saveLabel = "حفظ",
  savingLabel = "جاري الحفظ…",
  regenerate,
  hint,
  textareaRows = 5,
  textareaDir,
}: {
  headerLabel: React.ReactNode;
  align?: "right" | "left";
  disabled: boolean;
  viewContent: React.ReactNode;
  getInitialDraft: () => string;
  onSave: (draft: string) => Promise<SaveResult>;
  onChanged: () => void;
  editLabel?: string;
  cancelLabel?: string;
  saveLabel?: string;
  savingLabel?: string;
  regenerate?: { label: string; regeneratingLabel: string; onRegenerate: () => Promise<void> };
  hint?: React.ReactNode;
  textareaRows?: number;
  textareaDir?: "ltr";
}) {
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [regenerating, setRegenerating] = useState(false);

  useUnsavedChangesGuard(editing);

  function startEdit() {
    setDraft(getInitialDraft());
    setError("");
    setEditing(true);
    setOpen(true);
  }

  async function handleSave() {
    setSaving(true);
    setError("");
    const result = await onSave(draft);
    setSaving(false);
    if (!result.ok) {
      if (result.error) setError(result.error);
      return;
    }
    setEditing(false);
    onChanged();
  }

  async function handleRegenerate() {
    if (!regenerate) return;
    setRegenerating(true);
    await regenerate.onRegenerate();
    setRegenerating(false);
    onChanged();
  }

  const alignClass = align === "left" ? "text-left" : "text-right";
  const textareaClassName =
    textareaDir === "ltr"
      ? "w-full rounded-[var(--v-radius-sm)] border border-[var(--v-border)] bg-[var(--v-bg)] px-3 py-2 text-left text-xs text-[var(--v-text)] outline-none focus:border-[var(--v-primary)] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--v-primary)]"
      : "w-full rounded-[var(--v-radius-sm)] border border-[var(--v-border)] bg-[var(--v-bg)] px-3 py-2 text-sm text-[var(--v-text)] outline-none focus:border-[var(--v-primary)] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--v-primary)]";

  return (
    <div className="rounded-[var(--v-radius-md)] border border-[var(--v-border)] bg-[var(--v-bg)]">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        className={`flex w-full items-center justify-between p-3 ${alignClass} focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--v-primary)]`}
      >
        {headerLabel}
        <span className="text-xs text-[var(--v-text-muted)]">{open ? "▲" : "▼"}</span>
      </button>

      {open && (
        <div className="border-t border-[var(--v-border)] p-3">
          {!editing && (
            <>
              {viewContent}
              <div className="mt-3 flex gap-2">
                <button
                  type="button"
                  onClick={startEdit}
                  disabled={disabled}
                  className="rounded-[var(--v-radius-sm)] border border-[var(--v-border)] px-2 py-1 text-[11px] font-medium text-[var(--v-text)] hover:border-[var(--v-primary)] disabled:opacity-50 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--v-primary)]"
                >
                  {editLabel}
                </button>
                {regenerate && (
                  <button
                    type="button"
                    onClick={handleRegenerate}
                    disabled={disabled || regenerating}
                    className="rounded-[var(--v-radius-sm)] border border-[var(--v-border)] px-2 py-1 text-[11px] font-medium text-[var(--v-text)] hover:border-[var(--v-primary)] disabled:opacity-50 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--v-primary)]"
                  >
                    {regenerating ? regenerate.regeneratingLabel : regenerate.label}
                  </button>
                )}
              </div>
            </>
          )}

          {editing && (
            <div className="space-y-2">
              <textarea
                value={draft}
                onChange={(e) => setDraft(e.target.value)}
                rows={textareaRows}
                dir={textareaDir}
                className={textareaClassName}
              />
              {hint}
              {error && <p className="text-xs text-[var(--v-red)]">{error}</p>}
              <div className="flex gap-2">
                <button
                  type="button"
                  onClick={handleSave}
                  disabled={saving}
                  className="rounded-[var(--v-radius-sm)] bg-[var(--v-primary)] px-3 py-1.5 text-xs font-bold text-white hover:bg-[var(--v-primary-hover)] disabled:opacity-50 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--v-primary)]"
                >
                  {saving ? savingLabel : saveLabel}
                </button>
                <button
                  type="button"
                  onClick={() => setEditing(false)}
                  disabled={saving}
                  className="rounded-[var(--v-radius-sm)] border border-[var(--v-border)] px-3 py-1.5 text-xs font-medium text-[var(--v-text)] hover:bg-[var(--v-surface)] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--v-primary)]"
                >
                  {cancelLabel}
                </button>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
