"use client";

import Modal from "./Modal";
import Button from "./Button";

/**
 * Confirm Dialog مشترك لعملية "توليد كامل جديد" — نفس النمط المتطابق
 * حرفيًا اللي كان مكرر في 4 لوحات (PRD, Prototype Prompt, Presentation,
 * Developer Handoff). سلوك مطابق تمامًا للأصل، مبني الآن على Modal
 * المشتركة بدل markup منفصل.
 */
export default function RegenerateConfirmDialog({
  title,
  message,
  outdatedWarning,
  confirmLabel = "إنشاء نسخة جديدة",
  onCancel,
  onConfirm,
}: {
  title: string;
  message: string;
  outdatedWarning?: string | null;
  confirmLabel?: string;
  onCancel: () => void;
  onConfirm: () => void;
}) {
  return (
    <Modal open onClose={onCancel} maxWidth="max-w-md">
      <p className="text-sm font-semibold text-[var(--v-text)]">{title}</p>
      <p className="mt-2 text-xs text-[var(--v-text-secondary)]">{message}</p>
      {outdatedWarning && <p className="mt-2 text-xs font-medium text-[var(--v-amber)]">{outdatedWarning}</p>}
      <div className="mt-4 flex justify-end gap-2">
        <Button variant="outline" size="sm" onClick={onCancel}>
          إلغاء
        </Button>
        <Button variant="primary" size="sm" onClick={onConfirm}>
          {confirmLabel}
        </Button>
      </div>
    </Modal>
  );
}
