"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import type { BrainEntryType, ProjectBrainEntry } from "@/lib/types/database";

const entryTypeLabels: Record<BrainEntryType, string> = {
  note: "ملاحظة",
  decision: "قرار",
  link: "رابط",
  risk: "مخاطرة",
  question: "سؤال مفتوح",
  request: "طلب",
  deadline: "موعد نهائي",
};

const entryTypeColors: Record<BrainEntryType, string> = {
  note: "text-[var(--v-primary)] bg-[var(--v-primary)]/10",
  decision: "text-[var(--v-green)] bg-[var(--v-green)]/10",
  link: "text-[var(--v-text-muted)] bg-[var(--v-surface)]",
  risk: "text-[var(--v-red)] bg-[var(--v-red)]/10",
  question: "text-[var(--v-amber)] bg-[var(--v-amber)]/10",
  request: "text-[var(--v-primary)] bg-[var(--v-primary)]/10",
  deadline: "text-[var(--v-red)] bg-[var(--v-red)]/10",
};

export default function ProjectBrain({
  projectId,
  entries,
}: {
  projectId: string;
  entries: Pick<ProjectBrainEntry, "id" | "entry_type" | "content" | "created_at">[];
}) {
  const router = useRouter();
  const [content, setContent] = useState("");
  const [entryType, setEntryType] = useState<BrainEntryType>("note");
  const [saving, setSaving] = useState(false);

  async function handleAdd() {
    if (!content.trim()) return;
    setSaving(true);

    const supabase = createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();

    await supabase.from("project_brain_entries").insert({
      project_id: projectId,
      entry_type: entryType,
      content: content.trim(),
      created_by: user?.id ?? null,
    });

    setContent("");
    setSaving(false);
    router.refresh();
  }

  return (
    <div className="rounded-[var(--v-radius-lg)] border border-[var(--v-border)] bg-[var(--v-bg)] p-4">
      <p className="mb-1 text-sm font-semibold text-[var(--v-text)]">Project Brain</p>
      <p className="mb-4 text-xs text-[var(--v-text-muted)]">
        المصدر الوحيد للحقيقة — كل معلومة تُدخل هنا مرة واحدة.
      </p>

      <div className="mb-4 space-y-2">
        <div className="flex gap-2">
          {(Object.keys(entryTypeLabels) as BrainEntryType[]).map((t) => (
            <button
              key={t}
              type="button"
              onClick={() => setEntryType(t)}
              className={`rounded-[var(--v-radius-md)] border px-2 py-1 text-xs ${
                entryType === t
                  ? "border-[var(--v-primary)] text-[var(--v-primary)]"
                  : "border-[var(--v-border)] text-[var(--v-text-muted)]"
              }`}
            >
              {entryTypeLabels[t]}
            </button>
          ))}
        </div>
        <textarea
          value={content}
          onChange={(e) => setContent(e.target.value)}
          rows={2}
          placeholder="اكتب ملاحظة، قرار، مخاطرة، أو سؤال مفتوح…"
          className="w-full rounded-[var(--v-radius-md)] border border-[var(--v-border)] bg-[var(--v-bg)] px-3 py-2 text-sm text-[var(--v-text)] outline-none focus:border-[var(--v-primary)]"
        />
        <button
          onClick={handleAdd}
          disabled={saving || !content.trim()}
          className="rounded-[var(--v-radius-md)] bg-[var(--v-primary)] px-4 py-2 text-sm font-bold text-white transition hover:bg-[var(--v-primary-hover)] disabled:opacity-50"
        >
          {saving ? "جاري الإضافة…" : "إضافة"}
        </button>
      </div>

      <div className="max-h-[400px] space-y-2 overflow-y-auto">
        {entries.length === 0 && (
          <p className="text-xs text-[var(--v-text-muted)]">لا توجد مدخلات بعد.</p>
        )}
        {entries.map((entry) => (
          <div
            key={entry.id}
            className="rounded-[var(--v-radius-md)] border border-[var(--v-border)] bg-[var(--v-surface)] p-3"
          >
            <div className="flex items-center justify-between">
              <span
                className={`rounded px-1.5 py-0.5 text-[10px] ${entryTypeColors[entry.entry_type]}`}
              >
                {entryTypeLabels[entry.entry_type]}
              </span>
              <span className="text-[10px] text-[var(--v-text-muted)]">
                {new Date(entry.created_at).toLocaleDateString("ar-EG")}
              </span>
            </div>
            <p className="mt-2 text-sm text-[var(--v-text)]">{entry.content}</p>
          </div>
        ))}
      </div>
    </div>
  );
}
