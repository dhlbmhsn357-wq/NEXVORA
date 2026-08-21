"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { convertLeadToProject, type ProjectMode } from "./convert-lead-action";
import {
  listSectorStandardsAction,
  createClientVariantAction,
} from "@/app/(platform)/dashboard/projects/[id]/sector-standard-actions";
import type { SectorStandardSummary, ProjectWorkflowMode } from "@/lib/sector-standards/types";
import type { ProjectType } from "@/lib/types/database";

const projectModeLabels: Record<ProjectMode, string> = {
  unclassified: "غير مصنَّف",
  test: "تجريبي (Test)",
  real: "حقيقي (Real)",
};

const projectTypeLabels: Record<ProjectType, string> = {
  website: "موقع إلكتروني",
  mobile_app: "تطبيق موبايل",
  saas: "SaaS",
  dashboard: "Dashboard",
  other: "أخرى",
};

const workflowModeLabels: Record<ProjectWorkflowMode, string> = {
  full_discovery: "Full Discovery (البدء من الصفر)",
  standard_based: "Standard-Based (مبني على Sector Standard)",
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
  const [mode, setMode] = useState<ProjectMode>("real");
  // 0126 — Standard Product Package (المرحلة د): فرع إضافي بحت — الافتراضي
  // 'full_discovery' يحافظ على نفس السلوك تمامًا زي قبل هذه المرحلة.
  const [workflowMode, setWorkflowMode] = useState<ProjectWorkflowMode>("full_discovery");
  const [sectorStandards, setSectorStandards] = useState<SectorStandardSummary[]>([]);
  const [standardsLoading, setStandardsLoading] = useState(false);
  const [selectedStandardId, setSelectedStandardId] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  function handleWorkflowModeChange(next: ProjectWorkflowMode) {
    setWorkflowMode(next);
    if (next !== "standard_based" || sectorStandards.length > 0 || standardsLoading) return;
    setStandardsLoading(true);
    listSectorStandardsAction()
      .then((res) => {
        if (res.ok) setSectorStandards(res.data ?? []);
        else setError(res.message);
      })
      .finally(() => setStandardsLoading(false));
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (saving) return; // حماية إضافية ضد الـ double submit من الكيبورد

    if (workflowMode === "standard_based" && !selectedStandardId) {
      setError("اختر Sector Standard للاستنساخ منه.");
      return;
    }

    setSaving(true);
    setError("");

    // المسار الحالي — لا يوجد أي تغيير سلوكي هنا مهما كانت قيمة workflowMode:
    // المشروع بيتنشئ دايمًا عن طريق نفس الـ server action الموجود فعليًا
    // (convertLeadToProject)، يربط الـ lead، وينشئ مساحة العمل.
    const result = await convertLeadToProject(leadId, clientId, name, projectType, mode);

    if (!result.ok) {
      setSaving(false);
      setError(result.message);
      return;
    }

    if (workflowMode === "full_discovery") {
      router.push(`/dashboard/projects/${result.projectId}`);
      return;
    }

    // فرع 'standard_based' — إضافي بحت: بعد إنشاء المشروع الأساسي (فوق)،
    // نستنسخ فورًا Client Variant من الـ Sector Standard المختار، ونحوّل
    // المستخدم لمشروع الـ Client Variant الفعلي (اللي فيه بيانات المنتج
    // المستنسخة) — مش المشروع الفارغ الأول.
    const cloneResult = await createClientVariantAction(selectedStandardId, clientId, name);
    setSaving(false);
    if (!cloneResult.ok) {
      setError(`تم إنشاء المشروع، لكن فشل استنساخ الـ Standard: ${cloneResult.message}`);
      return;
    }
    router.push(`/dashboard/projects/${cloneResult.data!.clientProjectId}`);
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

            <div>
              <label className="mb-1 block text-xs text-[var(--v-text-muted)]">نوع المشروع (Mode)</label>
              <select
                value={mode}
                onChange={(e) => setMode(e.target.value as ProjectMode)}
                className="w-full rounded-[var(--v-radius-md)] border border-[var(--v-border)] bg-[var(--v-bg)] px-3 py-2 text-sm text-[var(--v-text)] outline-none focus:border-[var(--v-primary)]"
              >
                {(Object.keys(projectModeLabels) as ProjectMode[]).map((m) => (
                  <option key={m} value={m}>{projectModeLabels[m]}</option>
                ))}
              </select>
              <p className="mt-1 text-[10px] text-[var(--v-text-muted)]">
                {mode === "test"
                  ? "مشروع تجريبي — الأدلة ستُعامل كمحاكاة (simulated) بالافتراض."
                  : mode === "real"
                    ? "مشروع حقيقي — يتطلّب أدلة موثّقة قبل بناء الـ prototype."
                    : "يمكن تحديث النوع لاحقًا من إعدادات المشروع (Owner/Admin فقط)."}
              </p>
            </div>

            {/* 0126 — Standard Product Package: قسم إضافي بحت، الافتراضي
                Full Discovery يحافظ على نفس السلوك القديم بالضبط. */}
            <div>
              <label className="mb-1 block text-xs text-[var(--v-text-muted)]">مسار العمل (Workflow Mode)</label>
              <select
                value={workflowMode}
                onChange={(e) => handleWorkflowModeChange(e.target.value as ProjectWorkflowMode)}
                className="w-full rounded-[var(--v-radius-md)] border border-[var(--v-border)] bg-[var(--v-bg)] px-3 py-2 text-sm text-[var(--v-text)] outline-none focus:border-[var(--v-primary)]"
              >
                {(Object.keys(workflowModeLabels) as ProjectWorkflowMode[]).map((w) => (
                  <option key={w} value={w}>{workflowModeLabels[w]}</option>
                ))}
              </select>
            </div>

            {workflowMode === "standard_based" && (
              <div>
                <label className="mb-1 block text-xs text-[var(--v-text-muted)]">Sector Standard</label>
                <select
                  required
                  value={selectedStandardId}
                  onChange={(e) => setSelectedStandardId(e.target.value)}
                  className="w-full rounded-[var(--v-radius-md)] border border-[var(--v-border)] bg-[var(--v-bg)] px-3 py-2 text-sm text-[var(--v-text)] outline-none focus:border-[var(--v-primary)]"
                >
                  <option value="">
                    {standardsLoading ? "جارٍ التحميل..." : "— اختر Sector Standard —"}
                  </option>
                  {sectorStandards.map((s) => (
                    <option key={s.projectId} value={s.projectId}>
                      {s.sectorName ?? s.name} v{s.standardVersion ?? "?"}
                    </option>
                  ))}
                </select>
                {!standardsLoading && sectorStandards.length === 0 && (
                  <p className="mt-1 text-[10px] text-[var(--v-red)]">
                    لا يوجد أي Sector Standard مُعلَّم بعد — علّم مشروعًا كـ Standard أولًا من تبويب «إعدادات القطاع».
                  </p>
                )}
              </div>
            )}

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
