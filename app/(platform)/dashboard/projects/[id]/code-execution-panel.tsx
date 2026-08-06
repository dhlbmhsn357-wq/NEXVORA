"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { Cpu, PlayCircle, CheckCircle2, XCircle, Loader2, DollarSign, ShieldCheck } from "lucide-react";
import Card from "@/components/ui/Card";
import Button from "@/components/ui/Button";
import Badge, { type BadgeTone } from "@/components/ui/Badge";
import EmptyState from "@/components/ui/EmptyState";
import { toast } from "@/components/ui/Toaster";
import { startCodeExecutionAction, startExecutionRunAction, pollNextExecutionTaskAction } from "./code-execution-actions";
import type { CodeExecutionState } from "./code-execution-actions";
import type { ExecutionTaskStatus, QaFixLoopStage } from "@/lib/types/database";

const TASK_STATUS_TONE: Record<ExecutionTaskStatus, BadgeTone> = {
  pending: "neutral",
  running: "info",
  completed: "success",
  failed: "danger",
};
const TASK_STATUS_LABEL: Record<ExecutionTaskStatus, string> = {
  pending: "بانتظار الدور",
  running: "جارٍ التنفيذ…",
  completed: "تم",
  failed: "فشل",
};
const QA_STAGE_LABEL: Record<QaFixLoopStage, string> = {
  engineering_qa: "Engineering QA",
  accessibility_qa: "Accessibility QA",
};

export default function CodeExecutionPanel({ projectId, initialState }: { projectId: string; initialState: CodeExecutionState }) {
  const router = useRouter();
  const [repoUrl, setRepoUrl] = useState("");
  const [repoBranch, setRepoBranch] = useState("main");
  const [starting, setStarting] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);
  const lastRefreshAtRef = useRef(0);

  const { currentPlan, tasks, qaFixLoops, accessibilityScans, releaseCandidate } = initialState;

  const isActive = currentPlan && ["planning", "ready", "executing"].includes(currentPlan.status);
  const isQaRunning = qaFixLoops.some((l) => l.status === "running") || accessibilityScans.some((s) => s.status === "running");

  useEffect(() => {
    if (!isActive && !isQaRunning) return;
    const id = setInterval(() => {
      if (document.visibilityState === "hidden") return;
      if (rootRef.current && rootRef.current.offsetParent === null) return;
      const now = Date.now();
      if (now - lastRefreshAtRef.current < 4000) return;
      lastRefreshAtRef.current = now;
      router.refresh();
    }, 8000);
    return () => clearInterval(id);
  }, [isActive, isQaRunning, router]);

  // Auto-chain: مهمة تنفيذ شغّالة → استدعِ الخطوة الجاية تلقائيًا.
  useEffect(() => {
    if (!currentPlan || currentPlan.status !== "executing") return;
    const hasRunning = tasks.some((t) => t.status === "running");
    if (hasRunning) return;
    const hasPending = tasks.some((t) => t.status === "pending");
    if (!hasPending) return;
    pollNextExecutionTaskAction(projectId, currentPlan.id).then(() => router.refresh());
  }, [currentPlan, tasks, projectId, router]);

  async function handleStart() {
    if (!repoUrl.trim()) {
      toast.error("لازم رابط Repository.");
      return;
    }
    setStarting(true);
    const result = await startCodeExecutionAction(projectId, repoUrl.trim(), repoBranch.trim());
    setStarting(false);
    if (result.status === "error") toast.error(result.message);
    else if (result.status === "missing_prompt") toast.error(result.message);
    else if (result.status === "already_running") toast.error("فيه خطة تنفيذ شغّالة بالفعل لهذا المشروع.");
    else toast.success("بدأ التخطيط — Gemini بيقسّم Prototype Prompt لمهام صغيرة.");
    router.refresh();
  }

  async function handleStartExecution() {
    if (!currentPlan) return;
    const result = await startExecutionRunAction(projectId, currentPlan.id);
    if (!result.ok) toast.error(result.message ?? "فشل بدء التنفيذ.");
    else toast.success("بدأ التنفيذ — Claude هيشتغل مهمة-مهمة.");
    router.refresh();
  }

  const totalCost = tasks.reduce((sum, t) => sum + (t.cost_usd ?? 0), 0);
  const totalTokens = tasks.reduce((sum, t) => sum + (t.input_tokens ?? 0) + (t.output_tokens ?? 0), 0);

  return (
    <div ref={rootRef} className="space-y-6">
      <Card padding="md">
        <p className="mb-2 flex items-center gap-2 text-sm font-semibold text-[var(--v-text)]">
          <Cpu size={16} className="text-[var(--v-primary)]" /> AI Code Execution Engine
        </p>
        <p className="mb-3 text-[11px] text-[var(--v-text-muted)]">
          Gemini يقسّم Prototype Prompt المعتمد لمهام صغيرة، وClaude ينفّذها مهمة-مهمة على الـ Repository الحقيقي عبر
          GitHub — كل مهمة Commit مباشر على الـ Branch المحدد. بعد التنفيذ، يشغّل Engineering QA وAccessibility QA
          تلقائيًا ويطبّق إصلاحات لحد ما ينجح أو يوصل لأقصى عدد محاولات.
        </p>

        {(!currentPlan || ["completed", "failed"].includes(currentPlan.status)) && (
          <div className="flex flex-col gap-2 sm:flex-row">
            <input
              value={repoUrl}
              onChange={(e) => setRepoUrl(e.target.value)}
              placeholder="https://github.com/owner/repo"
              dir="ltr"
              className="flex-1 rounded-[var(--v-radius-md)] border border-[var(--v-border)] bg-[var(--v-bg)] px-3 py-2 text-sm text-[var(--v-text)] outline-none focus:border-[var(--v-primary)]"
            />
            <input
              value={repoBranch}
              onChange={(e) => setRepoBranch(e.target.value)}
              placeholder="main"
              dir="ltr"
              className="w-full rounded-[var(--v-radius-md)] border border-[var(--v-border)] bg-[var(--v-bg)] px-3 py-2 text-sm text-[var(--v-text)] outline-none focus:border-[var(--v-primary)] sm:w-32"
            />
            <Button variant="primary" size="sm" onClick={handleStart} loading={starting}>
              <PlayCircle size={14} /> Execute Prototype
            </Button>
          </div>
        )}

        {currentPlan?.status === "ready" && (
          <div className="mt-3">
            <Button variant="success" size="sm" onClick={handleStartExecution}>
              <PlayCircle size={14} /> ابدأ تنفيذ {currentPlan.total_tasks} مهمة
            </Button>
          </div>
        )}

        {currentPlan?.last_error && <p className="mt-2 text-xs text-[var(--v-red)]">{currentPlan.last_error}</p>}
      </Card>

      {!currentPlan && <EmptyState title="لا يوجد تنفيذ بعد" description="اضغط Execute Prototype لبدء تنفيذ Prototype Prompt المعتمد تلقائيًا." />}

      {currentPlan && (
        <Card padding="md">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <p className="text-sm font-semibold text-[var(--v-text)]">
              حالة الخطة: <Badge tone={planStatusTone(currentPlan.status)}>{currentPlan.status}</Badge>
            </p>
            <div className="flex items-center gap-3 text-[11px] text-[var(--v-text-muted)]">
              <span className="flex items-center gap-1">
                <DollarSign size={12} /> ${totalCost.toFixed(3)}
              </span>
              <span>{totalTokens.toLocaleString()} token</span>
              <span>
                {currentPlan.completed_tasks}/{currentPlan.total_tasks} مهمة
              </span>
            </div>
          </div>

          {tasks.length > 0 && (
            <div className="mt-3 space-y-1.5">
              {tasks.map((t) => (
                <div key={t.id} className="flex items-center justify-between gap-2 rounded-[var(--v-radius-sm)] border border-[var(--v-border)] px-3 py-2">
                  <div className="flex items-center gap-2">
                    {t.status === "running" && <Loader2 size={13} className="animate-spin text-[var(--v-info)]" />}
                    {t.status === "completed" && <CheckCircle2 size={13} className="text-[var(--v-green)]" />}
                    {t.status === "failed" && <XCircle size={13} className="text-[var(--v-red)]" />}
                    <span className="text-xs text-[var(--v-text)]">
                      {t.task_order}. {t.title}
                    </span>
                  </div>
                  <Badge tone={TASK_STATUS_TONE[t.status]}>{TASK_STATUS_LABEL[t.status]}</Badge>
                </div>
              ))}
            </div>
          )}
        </Card>
      )}

      {qaFixLoops.length > 0 && (
        <Card padding="md">
          <p className="mb-3 flex items-center gap-2 text-sm font-semibold text-[var(--v-text)]">
            <ShieldCheck size={16} className="text-[var(--v-green)]" /> دورات التحقق التلقائي (QA Fix Loops)
          </p>
          <div className="space-y-1.5">
            {qaFixLoops.map((l) => (
              <div key={l.id} className="flex items-center justify-between gap-2 rounded-[var(--v-radius-sm)] border border-[var(--v-border)] px-3 py-2 text-xs">
                <span className="text-[var(--v-text)]">
                  {QA_STAGE_LABEL[l.qa_stage]} — محاولة {l.attempt_number}
                </span>
                <Badge tone={qaLoopTone(l.status)}>{l.status}</Badge>
              </div>
            ))}
          </div>
        </Card>
      )}

      {releaseCandidate && (
        <Card padding="md">
          <div className="flex items-center justify-between gap-2">
            <p className="text-sm font-semibold text-[var(--v-text)]">Release Candidate</p>
            <Badge tone={releaseCandidate.status === "ready" ? "success" : releaseCandidate.status === "blocked" ? "danger" : "info"}>
              {releaseCandidate.status === "ready" ? "جاهز للإصدار" : releaseCandidate.status === "blocked" ? "محظور — يحتاج تدخّل يدوي" : "قيد التحقق"}
            </Badge>
          </div>
          <div className="mt-2 flex gap-4 text-xs text-[var(--v-text-muted)]">
            <span>Engineering QA: {releaseCandidate.engineering_qa_passed ? "✅" : "⏳"}</span>
            <span>Accessibility QA: {releaseCandidate.accessibility_qa_passed ? "✅" : "⏳"}</span>
          </div>
        </Card>
      )}
    </div>
  );
}

function planStatusTone(status: string): BadgeTone {
  if (status === "completed") return "success";
  if (status === "failed") return "danger";
  if (status === "ready") return "info";
  return "neutral";
}

function qaLoopTone(status: string): BadgeTone {
  if (status === "fixed") return "success";
  if (status === "failed" || status === "max_attempts_reached") return "danger";
  return "info";
}
