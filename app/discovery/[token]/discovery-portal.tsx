"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { ArrowLeft, ArrowRight, Check, ShieldCheck, Clock, Loader2 } from "lucide-react";
import PortalQuestionField from "./portal-question-field";
import PortalSuccess from "./portal-success";
import { computeEstimatedMinutesRange } from "@/lib/discovery-templates/estimated-time";
import { visibleQuestions } from "@/lib/discovery-portal/conditional";
import type { DiscoveryQuestion } from "@/lib/types/database";

function isEmpty(value: unknown): boolean {
  if (value === undefined || value === null || value === "") return true;
  if (Array.isArray(value)) return value.length === 0;
  return false;
}

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const PHONE_RE = /^[+\d][\d\s()-]{6,}$/;

function validateOne(q: DiscoveryQuestion, value: unknown): string | null {
  if (q.required && isEmpty(value)) return "هذا السؤال مطلوب.";
  if (isEmpty(value)) return null;

  const maxLength = q.validation?.maxLength;
  if (maxLength && typeof value === "string" && value.length > maxLength) {
    return `الحد الأقصى ${maxLength} حرف.`;
  }
  if (q.type === "email" && typeof value === "string" && !EMAIL_RE.test(value.trim())) {
    return "صيغة البريد الإلكتروني غير صحيحة.";
  }
  if (q.type === "phone" && typeof value === "string" && !PHONE_RE.test(value.trim())) {
    return "صيغة رقم الهاتف غير صحيحة.";
  }
  if (q.type === "website" && typeof value === "string") {
    const v = value.trim();
    const ok = /^https?:\/\/.+\..+/.test(v) || /^[^\s]+\.[^\s]{2,}/.test(v);
    if (!ok) return "صيغة الرابط غير صحيحة.";
  }
  return null;
}

export default function DiscoveryPortal({
  token,
  projectName,
  referenceCode,
  companyName,
  contactName,
  templateName,
  questions,
  initialAnswers,
}: {
  token: string;
  projectName: string;
  referenceCode: string;
  companyName: string | null;
  contactName: string | null;
  templateName: string | null;
  questions: DiscoveryQuestion[];
  initialAnswers: Record<string, unknown>;
}) {
  const [answers, setAnswers] = useState<Record<string, unknown>>(initialAnswers);
  const [started, setStarted] = useState(false);
  const [stepIndex, setStepIndex] = useState(0);
  const [direction, setDirection] = useState(1);
  const [error, setError] = useState("");
  const [saveState, setSaveState] = useState<"idle" | "saving" | "saved">("idle");
  const [submitting, setSubmitting] = useState(false);
  const [done, setDone] = useState(false);

  const dirtyRef = useRef(false);
  const saveTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  // الأسئلة المرئية فقط حسب الإجابات الحالية (منطق شرطي) — الـ Wizard
  // كله بيشتغل على هذه المجموعة، فالأسئلة المخفية لا تُعرض ولا تُحسب ولا
  // تمنع الإرسال.
  const visible = useMemo(() => visibleQuestions(questions, answers), [questions, answers]);
  const total = visible.length;

  // safeIndex بيضمن إن المؤشر دايمًا داخل نطاق الأسئلة المرئية حتى لو
  // تقلّصت المجموعة (سؤال شرطي اختفى) — من غير أي setState داخل effect.
  const safeIndex = Math.min(stepIndex, Math.max(0, total - 1));
  const current = visible[safeIndex];
  const answeredCount = visible.filter((q) => !isEmpty(answers[q.id])).length;
  const progressPct = total > 0 ? Math.round((answeredCount / total) * 100) : 0;
  const remaining = Math.max(0, total - (safeIndex + 1));

  const { lowMin, highMin } = computeEstimatedMinutesRange(total);

  // حفظ تلقائي مؤجّل بعد كل تعديل
  useEffect(() => {
    if (!dirtyRef.current) return;
    if (saveTimer.current) clearTimeout(saveTimer.current);
    saveTimer.current = setTimeout(async () => {
      setSaveState("saving");
      try {
        const res = await fetch(`/api/discovery/${token}/autosave`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ answers }),
        });
        const data = await res.json();
        setSaveState(data.ok ? "saved" : "idle");
      } catch {
        setSaveState("idle");
      }
    }, 1200);
    return () => {
      if (saveTimer.current) clearTimeout(saveTimer.current);
    };
  }, [answers, token]);

  function updateAnswer(id: string, value: unknown) {
    dirtyRef.current = true;
    setSaveState("idle");
    setAnswers((prev) => ({ ...prev, [id]: value }));
    if (error) setError("");
  }

  function goNext() {
    if (!current) return;
    const err = validateOne(current, answers[current.id]);
    if (err) {
      setError(err);
      return;
    }
    setError("");
    if (safeIndex < total - 1) {
      setDirection(1);
      setStepIndex(safeIndex + 1);
    }
  }

  function goPrev() {
    setError("");
    if (safeIndex > 0) {
      setDirection(-1);
      setStepIndex(safeIndex - 1);
    }
  }

  async function handleSubmit() {
    // تحقق نهائي من الأسئلة المرئية فقط (المخفية شرطيًا لا تُلزم)
    for (let i = 0; i < visible.length; i++) {
      const err = validateOne(visible[i], answers[visible[i].id]);
      if (err) {
        setDirection(1);
        setStepIndex(i);
        setError(err);
        return;
      }
    }
    setSubmitting(true);
    setError("");
    try {
      const res = await fetch(`/api/discovery/${token}/submit`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ answers }),
      });
      const data = await res.json();
      if (!data.ok) {
        setError(data.error ?? "تعذّر الإرسال، حاول مرة أخرى.");
        setSubmitting(false);
        return;
      }
      setDone(true);
    } catch {
      setError("تعذّر الاتصال، حاول مرة أخرى.");
      setSubmitting(false);
    }
  }

  function onKeyDown(e: React.KeyboardEvent) {
    if (e.key === "Enter" && current?.type !== "long_text" && current?.type !== "checkbox" && current?.type !== "multi_select") {
      e.preventDefault();
      if (safeIndex === total - 1) handleSubmit();
      else goNext();
    }
  }

  if (done) {
    return <PortalSuccess projectName={projectName} referenceCode={referenceCode} />;
  }

  const greeting = contactName ? `مرحباً ${contactName}` : "مرحباً بك";
  const isLast = safeIndex === total - 1;

  return (
    <div className="mx-auto flex min-h-screen w-full max-w-2xl flex-col px-5 py-8 sm:py-12">
      {/* ترويسة العلامة */}
      <div className="mb-8 flex items-center justify-between">
        <span className="font-display text-xl font-extrabold tracking-tight text-[var(--v-text)]">
          VELORA
        </span>
        {started && (
          <span className="flex items-center gap-1.5 font-mono-plex text-xs text-[var(--v-text-subtle)]">
            {saveState === "saving" && <Loader2 size={12} className="animate-spin" />}
            {saveState === "saving" ? "جاري الحفظ…" : saveState === "saved" ? "تم الحفظ تلقائيًا" : "حفظ تلقائي"}
          </span>
        )}
      </div>

      {!started ? (
        // ---- شاشة الترحيب ----
        <motion.div
          initial={{ opacity: 0, y: 12 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.4 }}
          className="flex flex-1 flex-col justify-center"
        >
          <p className="text-sm font-medium text-[var(--v-primary)]">
            {companyName ? companyName : projectName}
          </p>
          <h1 className="mt-2 font-display text-3xl font-extrabold text-[var(--v-text)] sm:text-4xl">
            {greeting} 👋
          </h1>
          <p className="mt-4 text-lg leading-relaxed text-[var(--v-text-secondary)]">
            شكراً لاختيارك <span className="font-semibold text-[var(--v-text)]">VELORA</span>. حتى نفهم
            مشروعك «{projectName}» بأفضل صورة ممكنة، قم بالإجابة على الأسئلة التالية — كل إجابة ستساعدنا
            على تحليل مشروعك بدقة.
          </p>

          <div className="mt-6 flex flex-wrap gap-4 text-sm text-[var(--v-text-muted)]">
            <span className="flex items-center gap-2">
              <Clock size={16} className="text-[var(--v-primary)]" />
              يستغرق تقريباً {lowMin} إلى {highMin} دقيقة
            </span>
            <span className="flex items-center gap-2">
              <ShieldCheck size={16} className="text-[var(--v-green)]" />
              بياناتك محفوظة وآمنة
            </span>
          </div>

          <button
            type="button"
            onClick={() => setStarted(true)}
            className="mt-8 inline-flex w-fit items-center gap-2 rounded-[var(--v-radius-lg)] bg-[var(--v-primary)] px-7 py-3.5 text-base font-bold text-white shadow-[var(--v-shadow-md)] transition hover:bg-[var(--v-primary-hover)]"
          >
            لنبدأ <ArrowLeft size={18} />
          </button>

          <p className="mt-6 text-xs text-[var(--v-text-subtle)]">
            {total} سؤال · تقدر تقف وترجع تكمّل في أي وقت من نفس الرابط.
          </p>
        </motion.div>
      ) : (
        // ---- الـ Wizard ----
        <div className="flex flex-1 flex-col" onKeyDown={onKeyDown}>
          {/* شريط التقدّم */}
          <div className="mb-8">
            <div className="mb-2 flex items-center justify-between text-xs text-[var(--v-text-muted)]">
              <span>
                سؤال {safeIndex + 1} من {total}
              </span>
              <span className="font-mono-plex">
                {progressPct}% · باقي {remaining}
              </span>
            </div>
            <div className="h-1.5 w-full overflow-hidden rounded-full bg-[var(--v-surface-2)]">
              <motion.div
                className="h-full rounded-full bg-[var(--v-primary)]"
                animate={{ width: `${total > 0 ? Math.round(((safeIndex + 1) / total) * 100) : 0}%` }}
                transition={{ duration: 0.3 }}
              />
            </div>
          </div>

          {/* السؤال الحالي */}
          <div className="flex flex-1 flex-col justify-center">
            <AnimatePresence mode="wait" custom={direction}>
              <motion.div
                key={current?.id ?? "empty"}
                custom={direction}
                initial={{ opacity: 0, x: direction * 40 }}
                animate={{ opacity: 1, x: 0 }}
                exit={{ opacity: 0, x: direction * -40 }}
                transition={{ duration: 0.28 }}
              >
                {current && (
                  <>
                    {current.category && (
                      <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-[var(--v-text-subtle)]">
                        {current.category}
                      </p>
                    )}
                    <label className="block text-2xl font-bold leading-snug text-[var(--v-text)]">
                      {current.question}
                      {current.required && <span className="text-[var(--v-red)]"> *</span>}
                    </label>
                    {current.description && (
                      <p className="mt-2 text-base text-[var(--v-text-muted)]">{current.description}</p>
                    )}

                    <div className="mt-6">
                      <PortalQuestionField
                        token={token}
                        question={current}
                        value={answers[current.id]}
                        onChange={(v) => updateAnswer(current.id, v)}
                      />
                    </div>

                    {current.help_text && !error && (
                      <p className="mt-2 text-sm text-[var(--v-text-subtle)]">{current.help_text}</p>
                    )}
                  </>
                )}
                {error && <p className="mt-2 text-sm text-[var(--v-red)]">{error}</p>}
              </motion.div>
            </AnimatePresence>
          </div>

          {/* التنقّل */}
          <div className="mt-10 flex items-center justify-between gap-3">
            <button
              type="button"
              onClick={goPrev}
              disabled={safeIndex === 0}
              className="inline-flex items-center gap-1.5 rounded-[var(--v-radius-md)] border border-[var(--v-border-strong)] px-4 py-2.5 text-sm font-medium text-[var(--v-text-secondary)] transition hover:border-[var(--v-primary)] disabled:opacity-40"
            >
              <ArrowRight size={16} /> السابق
            </button>

            {isLast ? (
              <button
                type="button"
                onClick={handleSubmit}
                disabled={submitting}
                className="inline-flex items-center gap-2 rounded-[var(--v-radius-md)] bg-[var(--v-green)] px-7 py-2.5 text-sm font-bold text-white shadow-[var(--v-shadow-sm)] transition hover:opacity-90 disabled:opacity-50"
              >
                {submitting ? <Loader2 size={16} className="animate-spin" /> : <Check size={16} />}
                {submitting ? "جاري الإرسال…" : "إرسال النموذج"}
              </button>
            ) : (
              <button
                type="button"
                onClick={goNext}
                className="inline-flex items-center gap-2 rounded-[var(--v-radius-md)] bg-[var(--v-primary)] px-7 py-2.5 text-sm font-bold text-white shadow-[var(--v-shadow-sm)] transition hover:bg-[var(--v-primary-hover)]"
              >
                التالي <ArrowLeft size={16} />
              </button>
            )}
          </div>

          {/* رسالة الخصوصية */}
          <p className="mt-6 text-center text-xs text-[var(--v-text-subtle)]">
            {templateName ? `${templateName} · ` : ""}
            كل إجاباتك تُحفظ تلقائيًا وتُستخدم فقط لتحليل مشروعك داخل VELORA.
          </p>
        </div>
      )}
    </div>
  );
}
