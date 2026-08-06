"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { convertLeadToProject } from "./convert-lead-action";
import type { ProjectType } from "@/lib/types/database";

const projectTypeLabels: Record<ProjectType, string> = {
  website: "موقع إلكتروني",
  mobile_app: "تطبيق موبايل",
  saas: "SaaS",
  dashboard: "Dashboard",
  other: "أخرى",
};

export default function ConvertLeadButton({
  leadId,
  clientId,
  defaultName,
}: {
  leadId: string;
  clientId: string | null;
  defaultName: string;
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [name, setName] = useState(defaultName);
  const [projectType, setProjectType] = useState<ProjectType>("other");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (saving) return; // حماية إضافية ضد الـ double submit من الكيبورد

    setSaving(true);
    setError("");

    const result = await convertLeadToProject(leadId, clientId, name, projectType);

    if (!result.ok) {
      setSaving(false);
      setError(result.message);
      return;
    }

    router.push(`/dashboard/projects/${result.projectId}`);
  }

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="rounded-[var(--v-radius-md)] border border-[var(--v-primary)] px-3 py-1.5 text-xs font-medium text-[var(--v-primary)] transition hover:bg-[var(--v-primary-tint)]"
      >
        تحويل لمشروع
      </button>

      {open && (
        <div
          role="dialog"
          aria-modal="true"
          className="fixed inset-0 z-20 flex items-center justify-center bg-black/40 px-6"
        >
          <form
            onSubmit={handleSubmit}
            className="w-full max-w-sm space-y-3 rounded-[var(--v-radius-lg)] border border-[var(--v-border)] bg-[var(--v-bg)] p-5"
          >
            <p className="text-sm font-semibold text-[var(--v-text)]">تحويل إلى مشروع</p>

            <div>
              <label className="mb-1 block text-xs text-[var(--v-text-muted)]">اسم المشروع</label>
              <input
                required
                value={name}
                onChange={(e) => setName(e.target.value)}
                className="w-full rounded-[var(--v-radius-md)] border border-[var(--v-border)] bg-[var(--v-bg)] px-3 py-2 text-sm text-[var(--v-text)] outline-none focus:border-[var(--v-primary)]"
              />
            </div>

            <div>
              <label className="mb-1 block text-xs text-[var(--v-text-muted)]">نوع المشروع</label>
              <select
                value={projectType}
                onChange={(e) => setProjectType(e.target.value as ProjectType)}
                className="w-full rounded-[var(--v-radius-md)] border border-[var(--v-border)] bg-[var(--v-bg)] px-3 py-2 text-sm text-[var(--v-text)] outline-none focus:border-[var(--v-primary)]"
              >
                {(Object.keys(projectTypeLabels) as ProjectType[]).map((t) => (
                  <option key={t} value={t}>
                    {projectTypeLabels[t]}
                  </option>
                ))}
              </select>
            </div>

            {error && <p className="text-xs text-[var(--v-red)]">{error}</p>}

            <div className="flex justify-end gap-2 pt-1">
              <button
                type="button"
                onClick={() => setOpen(false)}
                disabled={saving}
                className="rounded-[var(--v-radius-md)] border border-[var(--v-border)] px-3 py-1.5 text-xs font-medium text-[var(--v-text)] hover:bg-[var(--v-surface)] disabled:opacity-50"
              >
                إلغاء
              </button>
              <button
                type="submit"
                disabled={saving}
                className="rounded-[var(--v-radius-md)] bg-[var(--v-primary)] px-3 py-1.5 text-xs font-bold text-white hover:bg-[var(--v-primary-hover)] disabled:opacity-50"
              >
                {saving ? "جاري الإنشاء…" : "إنشاء المشروع"}
              </button>
            </div>
          </form>
        </div>
      )}
    </>
  );
}
