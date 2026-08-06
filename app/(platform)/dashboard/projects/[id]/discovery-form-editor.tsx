"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { saveDiscoveryForm } from "./save-discovery-form-action";
import { reopenDiscoveryForm } from "./reopen-discovery-form-action";
import { getQuestionsForProjectType } from "@/lib/discovery-form/questions";
import { useUnsavedChangesGuard } from "@/lib/hooks/useUnsavedChangesGuard";
import type { ProjectType, DiscoveryForm } from "@/lib/types/database";

export default function DiscoveryFormEditor({
  projectId,
  projectType,
  existingForm,
}: {
  projectId: string;
  projectType: ProjectType;
  existingForm: Pick<DiscoveryForm, "id" | "answers" | "status"> | null;
}) {
  const router = useRouter();
  const questions = getQuestionsForProjectType(projectType);
  const [answers, setAnswers] = useState<Record<string, unknown>>(
    existingForm?.answers ?? {}
  );
  const [saving, setSaving] = useState(false);
  const [reopening, setReopening] = useState(false);
  const [reopenError, setReopenError] = useState("");
  const [dirty, setDirty] = useState(false);

  const isLocked = existingForm?.status === "submitted";

  useUnsavedChangesGuard(dirty && !isLocked);

  function updateAnswer(key: string, value: unknown) {
    if (isLocked) return;
    setAnswers((prev) => ({ ...prev, [key]: value }));
    setDirty(true);
  }

  async function handleSave() {
    setSaving(true);
    await saveDiscoveryForm(projectId, existingForm?.id ?? null, answers);
    setSaving(false);
    setDirty(false);
    router.refresh();
  }

  async function handleReopen() {
    if (!existingForm?.id) return;
    if (!window.confirm("إعادة فتح النموذج هتسمح بتعديل الإجابات — العميل ممكن يكون سلّمها فعليًا. متأكد؟")) {
      return;
    }
    setReopening(true);
    setReopenError("");
    const result = await reopenDiscoveryForm(existingForm.id, projectId);
    setReopening(false);
    if (!result.ok) {
      setReopenError(result.message ?? "فشلت العملية.");
      return;
    }
    router.refresh();
  }

  return (
    <div className="rounded-[var(--v-radius-lg)] border border-[var(--v-border)] bg-[var(--v-bg)] p-4">
      <div className="mb-4 flex items-start justify-between gap-2">
        <p className="text-sm font-semibold text-[var(--v-text)]">
          نموذج الاكتشاف ({questions.length} سؤال)
        </p>
        {isLocked && (
          <span className="shrink-0 rounded-full bg-[var(--v-green)]/10 px-2 py-1 text-[10px] font-medium text-[var(--v-green)]">
            مُسلَّم ومقفول
          </span>
        )}
      </div>
      {isLocked && (
        <div className="mb-4 rounded-[var(--v-radius-md)] border border-[var(--v-border)] bg-[var(--v-surface)] p-3">
          <p className="text-xs text-[var(--v-text-muted)]">
            النموذج ده اتسلّم بالفعل ومقفول للتعديل — عشان أي تغيير بعد التسليم يبقى قرار واعي، مش
            تعديل عرضي.
          </p>
          <button
            type="button"
            onClick={handleReopen}
            disabled={reopening}
            className="mt-2 rounded-[var(--v-radius-md)] border border-[var(--v-border)] px-3 py-1.5 text-xs font-medium text-[var(--v-text)] hover:border-[var(--v-primary)] disabled:opacity-50"
          >
            {reopening ? "جاري…" : "إعادة فتح للتعديل"}
          </button>
          {reopenError && <p className="mt-1 text-xs text-[var(--v-red)]">{reopenError}</p>}
        </div>
      )}

      <div className="max-h-[600px] space-y-4 overflow-y-auto pl-1">
        {questions.map((q) => (
          <div key={q.key}>
            <label className="mb-1 block text-xs text-[var(--v-text-muted)]">
              {q.label}
              {q.required && <span className="text-[var(--v-red)]"> *</span>}
            </label>

            {q.type === "textarea" && (
              <textarea
                value={(answers[q.key] as string) ?? ""}
                onChange={(e) => updateAnswer(q.key, e.target.value)}
                rows={2}
                disabled={isLocked}
                className="w-full rounded-[var(--v-radius-sm)] border border-[var(--v-border)] bg-[var(--v-bg)] px-3 py-2 text-sm text-[var(--v-text)] outline-none transition-colors focus:border-[var(--v-primary)] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--v-primary)] disabled:opacity-60"
              />
            )}

            {q.type === "text" && (
              <input
                value={(answers[q.key] as string) ?? ""}
                onChange={(e) => updateAnswer(q.key, e.target.value)}
                disabled={isLocked}
                className="w-full rounded-[var(--v-radius-sm)] border border-[var(--v-border)] bg-[var(--v-bg)] px-3 py-2 text-sm text-[var(--v-text)] outline-none transition-colors focus:border-[var(--v-primary)] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--v-primary)] disabled:opacity-60"
              />
            )}

            {q.type === "number" && (
              <input
                type="number"
                value={(answers[q.key] as number) ?? ""}
                onChange={(e) => updateAnswer(q.key, Number(e.target.value))}
                disabled={isLocked}
                className="w-full rounded-[var(--v-radius-sm)] border border-[var(--v-border)] bg-[var(--v-bg)] px-3 py-2 text-sm text-[var(--v-text)] outline-none transition-colors focus:border-[var(--v-primary)] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--v-primary)] disabled:opacity-60"
              />
            )}

            {q.type === "boolean" && (
              <div className="flex gap-2">
                <button
                  type="button"
                  onClick={() => updateAnswer(q.key, true)}
                  disabled={isLocked}
                  className={`rounded-[var(--v-radius-md)] border px-3 py-1.5 text-xs disabled:opacity-60 ${
                    answers[q.key] === true
                      ? "border-[var(--v-green)] bg-[var(--v-green)]/10 text-[var(--v-green)]"
                      : "border-[var(--v-border)] text-[var(--v-text-muted)]"
                  }`}
                >
                  نعم
                </button>
                <button
                  type="button"
                  onClick={() => updateAnswer(q.key, false)}
                  disabled={isLocked}
                  className={`rounded-[var(--v-radius-md)] border px-3 py-1.5 text-xs disabled:opacity-60 ${
                    answers[q.key] === false
                      ? "border-[var(--v-red)] bg-[var(--v-red)]/10 text-[var(--v-red)]"
                      : "border-[var(--v-border)] text-[var(--v-text-muted)]"
                  }`}
                >
                  لا
                </button>
              </div>
            )}

            {q.type === "select" && q.options && (
              <select
                value={(answers[q.key] as string) ?? ""}
                onChange={(e) => updateAnswer(q.key, e.target.value)}
                disabled={isLocked}
                className="w-full rounded-[var(--v-radius-sm)] border border-[var(--v-border)] bg-[var(--v-bg)] px-3 py-2 text-sm text-[var(--v-text)] outline-none transition-colors focus:border-[var(--v-primary)] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--v-primary)] disabled:opacity-60"
              >
                <option value="">اختر…</option>
                {q.options.map((opt) => (
                  <option key={opt} value={opt}>
                    {opt}
                  </option>
                ))}
              </select>
            )}
          </div>
        ))}
      </div>

      {!isLocked && (
        <button
          type="button"
          onClick={handleSave}
          disabled={saving}
          className="mt-4 w-full rounded-[var(--v-radius-md)] bg-[var(--v-primary)] px-4 py-2 text-sm font-bold text-white transition hover:bg-[var(--v-primary-hover)] disabled:opacity-50"
        >
          {saving ? "جاري الحفظ…" : "حفظ الإجابات"}
        </button>
      )}
    </div>
  );
}
