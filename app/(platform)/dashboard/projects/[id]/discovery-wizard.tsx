"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { Check, ChevronLeft, ChevronRight, Lock } from "lucide-react";
import { toast } from "@/components/ui/Toaster";
import DiscoveryQuestionField from "./discovery-question-field";
import { autosaveDiscoveryForm, submitDiscoveryForm } from "./save-discovery-form-action";
import { reopenDiscoveryForm } from "./reopen-discovery-form-action";
import { useUnsavedChangesGuard } from "@/lib/hooks/useUnsavedChangesGuard";
import type {
  DiscoveryFormTemplate,
  DiscoveryQuestion,
  DiscoveryForm,
} from "@/lib/types/database";

interface WizardStep {
  category: string;
  questions: DiscoveryQuestion[];
}

function buildSteps(questions: DiscoveryQuestion[]): WizardStep[] {
  const order: string[] = [];
  const map = new Map<string, DiscoveryQuestion[]>();
  for (const q of questions) {
    const cat = q.category?.trim() || "أسئلة عامة";
    if (!map.has(cat)) {
      map.set(cat, []);
      order.push(cat);
    }
    map.get(cat)!.push(q);
  }
  return order.map((category) => ({ category, questions: map.get(category)! }));
}

function isEmpty(value: unknown): boolean {
  if (value === undefined || value === null || value === "") return true;
  if (Array.isArray(value)) return value.length === 0;
  return false;
}

export default function DiscoveryWizard({
  projectId,
  template,
  questions,
  existingForm,
  isAdmin,
}: {
  projectId: string;
  template: DiscoveryFormTemplate;
  questions: DiscoveryQuestion[];
  existingForm: Pick<DiscoveryForm, "id" | "answers" | "status"> | null;
  isAdmin: boolean;
}) {
  const router = useRouter();
  const steps = useMemo(() => buildSteps(questions), [questions]);

  const [answers, setAnswers] = useState<Record<string, unknown>>(
    existingForm?.answers ?? {}
  );
  const [stepIndex, setStepIndex] = useState(0);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [submitting, setSubmitting] = useState(false);
  const [reopening, setReopening] = useState(false);
  const [dirty, setDirty] = useState(false);
  const [savedAt, setSavedAt] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  const isLocked = existingForm?.status === "submitted";

  useUnsavedChangesGuard(dirty && !isLocked);

  const autosaveTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  // حفظ تلقائي مؤجّل بعد آخر تعديل — الـ closure بيلتقط آخر إجابات
  useEffect(() => {
    if (!dirty || isLocked) return;
    if (autosaveTimer.current) clearTimeout(autosaveTimer.current);
    autosaveTimer.current = setTimeout(async () => {
      setSaving(true);
      const result = await autosaveDiscoveryForm(projectId, template.id, answers);
      setSaving(false);
      if (result.ok) {
        setDirty(false);
        setSavedAt(new Date().toLocaleTimeString("ar-EG", { hour: "2-digit", minute: "2-digit" }));
      }
    }, 1500);
    return () => {
      if (autosaveTimer.current) clearTimeout(autosaveTimer.current);
    };
  }, [answers, dirty, isLocked, projectId, template.id]);

  function updateAnswer(id: string, value: unknown) {
    if (isLocked) return;
    setAnswers((prev) => ({ ...prev, [id]: value }));
    setDirty(true);
    if (errors[id]) setErrors((prev) => ({ ...prev, [id]: "" }));
  }

  function validateStep(step: WizardStep): Record<string, string> {
    const stepErrors: Record<string, string> = {};
    for (const q of step.questions) {
      const value = answers[q.id];
      if (q.required && isEmpty(value)) {
        stepErrors[q.id] = "هذا السؤال مطلوب.";
        continue;
      }
      const maxLength = q.validation?.maxLength;
      if (maxLength && typeof value === "string" && value.length > maxLength) {
        stepErrors[q.id] = `الحد الأقصى ${maxLength} حرف.`;
      }
    }
    return stepErrors;
  }

  function goNext() {
    const stepErrors = validateStep(steps[stepIndex]);
    if (Object.keys(stepErrors).length > 0) {
      setErrors(stepErrors);
      toast.error("فيه أسئلة مطلوبة لسه فاضية في الخطوة دي.");
      return;
    }
    setErrors({});
    if (stepIndex < steps.length - 1) setStepIndex((i) => i + 1);
  }

  function goPrev() {
    setErrors({});
    if (stepIndex > 0) setStepIndex((i) => i - 1);
  }

  async function handleSubmit() {
    // تحقق من كل الخطوات
    const allErrors: Record<string, string> = {};
    let firstInvalidStep = -1;
    steps.forEach((step, idx) => {
      const e = validateStep(step);
      if (Object.keys(e).length > 0 && firstInvalidStep === -1) firstInvalidStep = idx;
      Object.assign(allErrors, e);
    });
    if (Object.keys(allErrors).length > 0) {
      setErrors(allErrors);
      if (firstInvalidStep !== -1) setStepIndex(firstInvalidStep);
      toast.error("فيه أسئلة مطلوبة لسه فاضية — راجعها قبل التسليم.");
      return;
    }

    setSubmitting(true);
    if (autosaveTimer.current) clearTimeout(autosaveTimer.current);
    const result = await submitDiscoveryForm(projectId, template.id, answers);
    setSubmitting(false);
    if (!result.ok) {
      toast.error(result.message ?? "فشل التسليم.");
      return;
    }
    setDirty(false);
    toast.success("تم تسليم نموذج الاكتشاف");
    router.refresh();
  }

  async function handleReopen() {
    if (!existingForm?.id) return;
    if (!window.confirm("إعادة فتح النموذج هتسمح بتعديل الإجابات — متأكد؟")) return;
    setReopening(true);
    const result = await reopenDiscoveryForm(existingForm.id, projectId);
    setReopening(false);
    if (!result.ok) {
      toast.error(result.message ?? "فشلت العملية.");
      return;
    }
    router.refresh();
  }

  // عدّاد التقدّم: كام سؤال متجاوب عليه من الإجمالي
  const answeredCount = questions.filter((q) => !isEmpty(answers[q.id])).length;
  const progressPct = questions.length > 0 ? Math.round((answeredCount / questions.length) * 100) : 0;

  const current = steps[stepIndex];
  const isLastStep = stepIndex === steps.length - 1;

  return (
    <div className="rounded-[var(--v-radius-lg)] border border-[var(--v-border)] bg-[var(--v-bg)] p-4">
      {/* رأس */}
      <div className="mb-3 flex items-start justify-between gap-2">
        <div>
          <p className="text-sm font-semibold text-[var(--v-text)]">نموذج الاكتشاف</p>
          <p className="text-xs text-[var(--v-text-muted)]">
            {template.name} · {questions.length} سؤال
          </p>
        </div>
        {isLocked ? (
          <span className="inline-flex shrink-0 items-center gap-1 rounded-full bg-[var(--v-green)]/10 px-2 py-1 text-[10px] font-medium text-[var(--v-green)]">
            <Lock size={11} /> مُسلَّم
          </span>
        ) : (
          <span className="shrink-0 font-mono-plex text-[10px] text-[var(--v-text-subtle)]">
            {saving ? "جاري الحفظ…" : savedAt ? `حُفظ ${savedAt}` : "حفظ تلقائي"}
          </span>
        )}
      </div>

      {/* شريط التقدّم */}
      <div className="mb-4">
        <div className="mb-1 flex items-center justify-between text-[10px] text-[var(--v-text-subtle)]">
          <span>
            خطوة {stepIndex + 1} من {steps.length} · {current?.category}
          </span>
          <span className="font-mono-plex">{progressPct}%</span>
        </div>
        <div className="h-1.5 w-full overflow-hidden rounded-full bg-[var(--v-surface-2)]">
          <div
            className="h-full rounded-full bg-[var(--v-primary)] transition-all duration-300"
            style={{ width: `${progressPct}%` }}
          />
        </div>
      </div>

      {isLocked && (
        <div className="mb-4 rounded-[var(--v-radius-md)] border border-[var(--v-border)] bg-[var(--v-surface)] p-3">
          <p className="text-xs text-[var(--v-text-muted)]">
            النموذج اتسلّم بالفعل ومقفول للتعديل.
          </p>
          {isAdmin && (
            <button
              type="button"
              onClick={handleReopen}
              disabled={reopening}
              className="mt-2 rounded-[var(--v-radius-md)] border border-[var(--v-border)] px-3 py-1.5 text-xs font-medium text-[var(--v-text)] hover:border-[var(--v-primary)] disabled:opacity-50"
            >
              {reopening ? "جاري…" : "إعادة فتح للتعديل"}
            </button>
          )}
        </div>
      )}

      {/* أسئلة الخطوة الحالية */}
      <div className="min-h-[280px] space-y-5">
        {current?.questions.map((q) => (
          <DiscoveryQuestionField
            key={q.id}
            projectId={projectId}
            question={q}
            value={answers[q.id]}
            onChange={(v) => updateAnswer(q.id, v)}
            disabled={isLocked}
            error={errors[q.id]}
          />
        ))}
      </div>

      {/* تنقّل */}
      <div className="mt-5 flex items-center justify-between gap-2 border-t border-[var(--v-border)] pt-4">
        <button
          type="button"
          onClick={goPrev}
          disabled={stepIndex === 0}
          className="inline-flex items-center gap-1 rounded-[var(--v-radius-md)] border border-[var(--v-border)] px-3 py-1.5 text-xs font-medium text-[var(--v-text)] hover:bg-[var(--v-surface)] disabled:opacity-40"
        >
          <ChevronRight size={14} /> السابق
        </button>

        {!isLastStep ? (
          <button
            type="button"
            onClick={goNext}
            className="inline-flex items-center gap-1 rounded-[var(--v-radius-md)] bg-[var(--v-primary)] px-4 py-1.5 text-xs font-bold text-white hover:bg-[var(--v-primary-hover)]"
          >
            التالي <ChevronLeft size={14} />
          </button>
        ) : (
          !isLocked && (
            <button
              type="button"
              onClick={handleSubmit}
              disabled={submitting}
              className="inline-flex items-center gap-1 rounded-[var(--v-radius-md)] bg-[var(--v-green)] px-4 py-1.5 text-xs font-bold text-white hover:opacity-90 disabled:opacity-50"
            >
              <Check size={14} /> {submitting ? "جاري التسليم…" : "تسليم النموذج"}
            </button>
          )
        )}
      </div>
    </div>
  );
}
