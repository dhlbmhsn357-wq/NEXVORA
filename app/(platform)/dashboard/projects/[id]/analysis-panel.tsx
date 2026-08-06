"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { Check } from "lucide-react";
import { analyzeProjectAction } from "./analyze-project-action";
import Button from "@/components/ui/Button";
import Card from "@/components/ui/Card";
import AiBadge from "@/components/ui/AiBadge";
import RegenerateConfirmDialog from "@/components/ui/RegenerateConfirmDialog";
import type { ProjectAnalysis } from "@/lib/types/database";

type PanelStatus = "idle" | "loading" | "success" | "error";

export default function AnalysisPanel({
  projectId,
  initialAnalysis,
}: {
  projectId: string;
  initialAnalysis: ProjectAnalysis | null;
}) {
  const router = useRouter();
  const [analysis, setAnalysis] = useState<ProjectAnalysis | null>(initialAnalysis);
  const [status, setStatus] = useState<PanelStatus>("idle");
  const [errorMessage, setErrorMessage] = useState("");
  const [showConfirm, setShowConfirm] = useState(false);
  const [toast, setToast] = useState<{ type: "success" | "error"; message: string } | null>(
    null
  );
  const [copied, setCopied] = useState(false);
  const toastTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    return () => {
      if (toastTimer.current) clearTimeout(toastTimer.current);
    };
  }, []);

  function showToast(type: "success" | "error", message: string) {
    setToast({ type, message });
    if (toastTimer.current) clearTimeout(toastTimer.current);
    toastTimer.current = setTimeout(() => setToast(null), 4000);
  }

  function handleAnalyzeClick() {
    if (status === "loading") return;
    if (analysis) {
      setShowConfirm(true);
      return;
    }
    runAnalysis();
  }

  async function runAnalysis() {
    setShowConfirm(false);
    setStatus("loading");
    setErrorMessage("");

    const result = await analyzeProjectAction(projectId);

    if (result.status === "success") {
      setAnalysis(result.data);
      setStatus("success");
      showToast("success", "تم تحليل المشروع بنجاح.");
      router.refresh();
    } else if (result.status === "insufficient_data") {
      setStatus("error");
      setErrorMessage(result.message);
      showToast("error", result.message);
    } else {
      setStatus("error");
      setErrorMessage(result.message);
      showToast("error", result.message);
    }
  }

  async function handleCopyQuestions() {
    if (!analysis) return;
    const text = analysis.meeting_questions.map((q, i) => `${i + 1}. ${q}`).join("\n");
    await navigator.clipboard.writeText(text);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }

  return (
    <Card padding="md">
      <div className="flex items-center justify-between">
        <div>
          <div className="flex items-center gap-2">
            <p className="text-sm font-semibold text-[var(--v-text)]">تحليل المشروع</p>
            <AiBadge />
          </div>
          <p className="mt-1 text-xs text-[var(--v-text-muted)]">
            تحليل تلقائي لبيانات نموذج الاكتشاف وProject Brain للاستعداد لاجتماع العميل.
          </p>
        </div>
        <Button variant="primary" onClick={handleAnalyzeClick} loading={status === "loading"}>
          Analyze Project
        </Button>
      </div>

      {toast && (
        <div
          role="status"
          aria-live="polite"
          className={`mt-4 rounded-[var(--v-radius-md)] border p-3 text-sm ${
            toast.type === "success"
              ? "border-[var(--v-green)]/30 bg-[var(--v-green)]/10 text-[var(--v-green)]"
              : "border-[var(--v-red)]/30 bg-[var(--v-red)]/10 text-[var(--v-red)]"
          }`}
        >
          {toast.message}
        </div>
      )}

      {status === "loading" && (
        <div className="mt-4 space-y-2" aria-hidden="true">
          <div className="h-4 w-3/4 animate-pulse rounded bg-[var(--v-surface)]" />
          <div className="h-4 w-full animate-pulse rounded bg-[var(--v-surface)]" />
          <div className="h-4 w-5/6 animate-pulse rounded bg-[var(--v-surface)]" />
        </div>
      )}

      {status !== "loading" && !analysis && (
        <div className="mt-4 rounded-[var(--v-radius-md)] border border-dashed border-[var(--v-border)] p-6 text-center">
          <p className="text-sm text-[var(--v-text-muted)]">
            {status === "error" && errorMessage
              ? errorMessage
              : "لسه مفيش تحليل لهذا المشروع. اضغط \"Analyze Project\" للبدء."}
          </p>
        </div>
      )}

      {status !== "loading" && analysis && (
        <div className="mt-4 space-y-3">
          <div className="rounded-[var(--v-radius-md)] border border-[var(--v-border)] bg-[var(--v-primary-tint)] p-3">
            <p className="text-xs font-semibold text-[var(--v-primary)]">المشكلة الجذرية</p>
            <p className="mt-1 text-sm text-[var(--v-text)]">{analysis.root_problem}</p>
          </div>

          <AnalysisListCard title="الفئات المستهدفة" items={analysis.target_users} tone="neutral" />
          <AnalysisListCard title="الفرص" items={analysis.opportunities} tone="green" />
          <AnalysisListCard title="المخاطر" items={analysis.risks} tone="red" />

          <div className="rounded-[var(--v-radius-md)] border border-[var(--v-border)] bg-[var(--v-surface)] p-3">
            <div className="flex items-center justify-between">
              <p className="text-xs font-semibold text-[var(--v-amber)]">أسئلة الاجتماع</p>
              <Button variant="outline" size="sm" onClick={handleCopyQuestions} aria-label="نسخ كل أسئلة الاجتماع">
                {copied ? (
                  <>
                    <Check size={13} /> تم النسخ
                  </>
                ) : (
                  "Copy Questions"
                )}
              </Button>
            </div>
            <ol className="mt-2 list-decimal space-y-1 pr-4 text-sm text-[var(--v-text)]">
              {analysis.meeting_questions.map((q, i) => (
                <li key={i}>{q}</li>
              ))}
            </ol>
          </div>
        </div>
      )}

      {showConfirm && (
        <RegenerateConfirmDialog
          title="استبدال التحليل الحالي؟"
          message="يوجد تحليل سابق لهذا المشروع. تشغيل تحليل جديد هيستبدله بالكامل ولن يمكن التراجع."
          confirmLabel="نعم، استبدل"
          onCancel={() => setShowConfirm(false)}
          onConfirm={runAnalysis}
        />
      )}
    </Card>
  );
}

function AnalysisListCard({
  title,
  items,
  tone,
}: {
  title: string;
  items: string[];
  tone: "neutral" | "green" | "red";
}) {
  const toneClass =
    tone === "green"
      ? "text-[var(--v-green)]"
      : tone === "red"
        ? "text-[var(--v-red)]"
        : "text-[var(--v-text-secondary)]";

  return (
    <div className="rounded-[var(--v-radius-md)] border border-[var(--v-border)] bg-[var(--v-surface)] p-3">
      <p className={`text-xs font-semibold ${toneClass}`}>{title}</p>
      {items.length > 0 ? (
        <ul className="mt-2 list-disc space-y-1 pr-4 text-sm text-[var(--v-text)]">
          {items.map((item, i) => (
            <li key={i}>{item}</li>
          ))}
        </ul>
      ) : (
        <p className="mt-2 text-xs text-[var(--v-text-muted)]">لا يوجد.</p>
      )}
    </div>
  );
}
