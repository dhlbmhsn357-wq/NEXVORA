"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Settings2 } from "lucide-react";
import { toast } from "@/components/ui/Toaster";
import DiscoveryWizard from "./discovery-wizard";
import { setProjectDiscoveryTemplate } from "./set-discovery-template-action";
import type {
  DiscoveryFormTemplate,
  DiscoveryQuestion,
  DiscoveryForm,
} from "@/lib/types/database";

/**
 * غلاف قسم الاكتشاف في وضع القالب الديناميكي: محدّد القالب (للأدمن) +
 * الـ Wizard. يفصل بين تغيير القالب (server action + refresh) وتعبئة الفورم.
 */
export default function DiscoverySection({
  projectId,
  templates,
  currentTemplate,
  questions,
  existingForm,
  isAdmin,
}: {
  projectId: string;
  templates: DiscoveryFormTemplate[];
  currentTemplate: DiscoveryFormTemplate;
  questions: DiscoveryQuestion[];
  existingForm: Pick<DiscoveryForm, "id" | "answers" | "status"> | null;
  isAdmin: boolean;
}) {
  const router = useRouter();
  const [changing, setChanging] = useState(false);
  const [showPicker, setShowPicker] = useState(false);
  const isLocked = existingForm?.status === "submitted";

  async function changeTemplate(templateId: string) {
    if (templateId === currentTemplate.id) {
      setShowPicker(false);
      return;
    }
    setChanging(true);
    const result = await setProjectDiscoveryTemplate(projectId, templateId);
    setChanging(false);
    setShowPicker(false);
    if (!result.ok) {
      toast.error(result.message ?? "فشل تغيير القالب.");
      return;
    }
    toast.success("تم تغيير القالب");
    router.refresh();
  }

  return (
    <div className="space-y-2">
      {/* شريط تغيير القالب — للأدمن وقبل التسليم فقط */}
      {isAdmin && !isLocked && (
        <div className="flex items-center justify-end">
          {showPicker ? (
            <select
              autoFocus
              disabled={changing}
              defaultValue={currentTemplate.id}
              onChange={(e) => changeTemplate(e.target.value)}
              onBlur={() => setShowPicker(false)}
              className="rounded-[var(--v-radius-md)] border border-[var(--v-border)] bg-[var(--v-bg)] px-2 py-1 text-xs text-[var(--v-text)] outline-none focus:border-[var(--v-primary)]"
            >
              {templates.map((t) => (
                <option key={t.id} value={t.id}>
                  {t.name}
                </option>
              ))}
            </select>
          ) : (
            <button
              type="button"
              onClick={() => setShowPicker(true)}
              className="inline-flex items-center gap-1 text-[10px] text-[var(--v-text-subtle)] hover:text-[var(--v-primary)]"
            >
              <Settings2 size={12} /> تغيير القالب
            </button>
          )}
        </div>
      )}

      {questions.length === 0 ? (
        <div className="rounded-[var(--v-radius-lg)] border border-dashed border-[var(--v-border-strong)] bg-[var(--v-bg)] p-6 text-center">
          <p className="text-sm text-[var(--v-text-muted)]">
            القالب «{currentTemplate.name}» مفيهوش أسئلة لسه.
          </p>
          {isAdmin && (
            <p className="mt-1 text-xs text-[var(--v-text-subtle)]">
              أضف أسئلة من صفحة إدارة القوالب.
            </p>
          )}
        </div>
      ) : (
        <DiscoveryWizard
          projectId={projectId}
          template={currentTemplate}
          questions={questions}
          existingForm={existingForm}
          isAdmin={isAdmin}
        />
      )}
    </div>
  );
}
