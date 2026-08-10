"use client";

/**
 * NEXVORA Project Mode Badge + Change Modal
 * =========================================
 * يظهر شارة "نوع المشروع" (تجريبي / حقيقي / غير مصنَّف) في هيدر المشروع.
 * لأصحاب الصلاحية (owner/admin) الشارة قابلة للنقر وتفتح Modal لتغيير النوع
 * مع سبب إجباري — يستدعي updateProjectModeAction الموجود مسبقًا (لا منطق جديد).
 */
import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import Badge from "@/components/ui/Badge";
import Button from "@/components/ui/Button";
import Modal from "@/components/ui/Modal";
import Textarea from "@/components/ui/Textarea";
import { toast } from "@/components/ui/Toaster";
import { updateProjectModeAction, type ProjectMode } from "@/lib/projects/mode-action";

const MODE_LABELS: Record<ProjectMode, string> = {
  unclassified: "غير مصنَّف",
  test: "تجريبي",
  real: "حقيقي",
};
const MODE_TONE: Record<ProjectMode, "neutral" | "warning" | "success"> = {
  unclassified: "neutral",
  test: "warning",
  real: "success",
};

export default function ProjectModeBadge({
  projectId,
  currentMode,
  canChange,
}: {
  projectId: string;
  currentMode: ProjectMode;
  canChange: boolean;
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [newMode, setNewMode] = useState<ProjectMode>(currentMode);
  const [reason, setReason] = useState("");
  const [pending, startTransition] = useTransition();

  const badge = (
    <Badge tone={MODE_TONE[currentMode]}>نوع: {MODE_LABELS[currentMode]}</Badge>
  );

  if (!canChange) return badge;

  function submit() {
    if (!reason.trim()) {
      toast.error("السبب مطلوب.");
      return;
    }
    if (newMode === currentMode) {
      toast.error("لم يتغيّر النوع.");
      return;
    }
    startTransition(async () => {
      const res = await updateProjectModeAction(projectId, newMode, reason.trim());
      if (res.ok) {
        toast.success("تم تحديث نوع المشروع.");
        setOpen(false);
        setReason("");
        router.refresh();
      } else {
        toast.error(res.message);
      }
    });
  }

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="inline-flex cursor-pointer items-center transition hover:opacity-80"
        title="تغيير نوع المشروع"
      >
        {badge}
      </button>

      <Modal open={open} onClose={() => setOpen(false)} maxWidth="max-w-md">
        <div className="space-y-4 p-6" dir="rtl">
          <div>
            <h2 className="text-lg font-semibold text-[var(--v-text)]">تغيير نوع المشروع</h2>
            <p className="mt-1 text-xs text-[var(--v-text-muted)]">
              النوع الحالي: <b>{MODE_LABELS[currentMode]}</b>. اختيار &laquo;تجريبي&raquo; يجعل الأدلة الجديدة تُعامَل كمحاكاة افتراضيًا.
            </p>
          </div>

          <div>
            <label className="mb-1 block text-xs text-[var(--v-text-secondary)]">النوع الجديد</label>
            <select
              value={newMode}
              onChange={(e) => setNewMode(e.target.value as ProjectMode)}
              className="h-10 w-full rounded-[var(--v-radius-md)] border border-[var(--v-border)] bg-[var(--v-bg)] px-3 text-sm text-[var(--v-text)] outline-none focus:border-[var(--v-primary)]"
            >
              <option value="unclassified">غير مصنَّف</option>
              <option value="test">تجريبي (Test)</option>
              <option value="real">حقيقي (Real)</option>
            </select>
          </div>

          <div>
            <label className="mb-1 block text-xs text-[var(--v-text-secondary)]">السبب (إجباري)</label>
            <Textarea
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              rows={3}
              placeholder="مثلًا: هذا المشروع كان تجريبيًا للتدريب، الآن أصبح مشروعًا حقيقيًا لعميل X."
            />
          </div>

          <div className="flex justify-end gap-2 pt-1">
            <Button variant="ghost" onClick={() => setOpen(false)} disabled={pending}>إلغاء</Button>
            <Button variant="primary" onClick={submit} loading={pending}>حفظ التغيير</Button>
          </div>
        </div>
      </Modal>
    </>
  );
}
