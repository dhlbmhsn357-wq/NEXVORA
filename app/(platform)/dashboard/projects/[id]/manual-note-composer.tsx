"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { NotebookPen } from "lucide-react";
import Card from "@/components/ui/Card";
import Select from "@/components/ui/Select";
import Button from "@/components/ui/Button";
import { submitManualNote } from "./brain-v2-actions";
import { MANUAL_NOTE_TYPES, MANUAL_NOTE_TYPE_LABELS, type ManualNoteType } from "@/lib/brain-v2/manual-notes";

/**
 * ملاحظة يدوية مكتوبة من PM في Overview — كل ملاحظة ليها Type بيحدّد
 * قسم Brain المستهدف تلقائيًا (راجع lib/brain-v2/manual-notes.ts).
 * الملاحظة مش بتتكتب مباشرة في Brain — بتتحوّل لـ Pending Change
 * (ثقة 100%، لكن لسه محتاجة اعتماد صريح، نفس أي مصدر تاني) عشان يفضل
 * فيه أثر واضح لكل تغيير ومصدره — راجع Conflict Center بالأسفل.
 */
export default function ManualNoteComposer({ projectId }: { projectId: string }) {
  const router = useRouter();
  const [noteType, setNoteType] = useState<ManualNoteType>("decision");
  const [text, setText] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [message, setMessage] = useState("");

  async function submit() {
    if (!text.trim()) return;
    setSubmitting(true);
    setMessage("");
    const result = await submitManualNote(projectId, noteType, text);
    setSubmitting(false);
    if (!result.ok) {
      setMessage(result.message);
      return;
    }
    setText("");
    setMessage(`تمت إضافة الملاحظة كتغيير معلّق بانتظار الاعتماد — شوف "المعرفة المعلّقة" بالأسفل.`);
    router.refresh();
  }

  return (
    <Card padding="md">
      <p className="mb-2 flex items-center gap-2 text-sm font-semibold text-[var(--v-text)]">
        <NotebookPen size={16} className="text-[var(--v-primary)]" /> ملاحظة يدوية جديدة
      </p>
      <div className="flex flex-col gap-2 sm:flex-row">
        <div className="sm:w-40">
          <Select value={noteType} onChange={(e) => setNoteType(e.target.value as ManualNoteType)}>
            {MANUAL_NOTE_TYPES.map((t) => (
              <option key={t} value={t}>
                {MANUAL_NOTE_TYPE_LABELS[t]}
              </option>
            ))}
          </Select>
        </div>
        <textarea
          value={text}
          onChange={(e) => setText(e.target.value)}
          placeholder="اكتب الملاحظة هنا..."
          rows={2}
          className="flex-1 rounded-[var(--v-radius-md)] border border-[var(--v-border)] bg-[var(--v-bg)] px-3 py-2 text-sm text-[var(--v-text)] outline-none transition-colors focus:border-[var(--v-primary)] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--v-primary)]"
        />
        <Button variant="primary" onClick={submit} loading={submitting} disabled={!text.trim()}>
          إضافة
        </Button>
      </div>
      {message && <p className="mt-2 text-xs text-[var(--v-text-muted)]">{message}</p>}
    </Card>
  );
}
