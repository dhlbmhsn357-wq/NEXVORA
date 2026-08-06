"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { Check, Copy, RefreshCw } from "lucide-react";
import {
  generatePrototypePromptPipelinePlan,
  generatePrototypePromptPipelineStage,
} from "./prototype-prompt-pipeline-actions";
import { listAvailableTools } from "@/lib/prototype-prompt/templates/registry";
import { findNextStageToTrigger } from "@/lib/prototype-prompt/pipeline-next-stage";
import Badge, { type BadgeTone } from "@/components/ui/Badge";
import AiBadge from "@/components/ui/AiBadge";
import Button from "@/components/ui/Button";
import RegenerateConfirmDialog from "@/components/ui/RegenerateConfirmDialog";
import type { PrototypePromptPlan, PrototypePromptStage } from "@/lib/types/database";
import { useBackgroundRefresh } from "@/lib/ui/use-background-refresh";

const SIZE_LABELS: Record<string, string> = {
  small: "مشروع صغير",
  medium: "مشروع متوسط",
  enterprise: "مشروع Enterprise",
};

const STAGE_STATUS_LABELS: Record<string, string> = {
  pending: "في الانتظار",
  generating: "جاري التوليد…",
  ready: "جاهز",
  failed: "فشل",
};

/**
 * بيانات الخطة والـ Stages بتوصل جاهزة من page.tsx (Server Component) —
 * نفس نمط باقي اللوحات في المشروع (PresentationPanel، PRDPanel، ...)،
 * مش عبر Self-Fetch جوّه useEffect. الـ Polling هنا بيستخدم
 * router.refresh() (بيعيد تشغيل الـ Server Component ويجيب Props جديدة)
 * بدل إدارة State محلي منفصل عن مصدر الحقيقة.
 */
export default function PrototypePromptPipelinePanel({
  projectId,
  plan,
  stages,
}: {
  projectId: string;
  plan: PrototypePromptPlan | null;
  stages: PrototypePromptStage[];
}) {
  const router = useRouter();
  const tools = listAvailableTools();
  const [targetTool, setTargetTool] = useState(plan?.target_tool ?? "general");
  const [message, setMessage] = useState("");
  const [showConfirm, setShowConfirm] = useState(false);
  const [copiedIndex, setCopiedIndex] = useState<number | null>(null);
  const triggeringRef = useRef(false);

  const isBusy = plan?.status === "generating";
  const hasPlan = !!(plan && plan.stage_count > 0);

  // تحديث دوري مُجمَّع: منسّق واحد لكل الصفحة بدل مؤقّت لكل لوحة، بيقف
  // لما التبويب يكون مخفي وبيبطّل خالص لو المهمة اتعلّقت.
  useBackgroundRefresh(isBusy);

  // Auto-chain: أول ما Stage يخلص، شغّل اللي بعده تلقائيًا عبر طلب
  // Server Action (مش setState محلي) — بنحجز flag بـ Ref (مش State) عشان
  // مانطلقش نفس الطلب مرتين قبل ما router.refresh() يجيب الحالة الجديدة.
  useEffect(() => {
    if (!plan || plan.status !== "generating" || stages.length === 0) return;
    if (triggeringRef.current) return;

    const next = findNextStageToTrigger(stages);
    if (!next) return;
    triggeringRef.current = true;
    generatePrototypePromptPipelineStage(projectId, next.stage_index).finally(() => {
      triggeringRef.current = false;
      router.refresh();
    });
  }, [plan, stages, projectId, router]);

  async function runGenerate() {
    setShowConfirm(false);
    setMessage("");
    const result = await generatePrototypePromptPipelinePlan(projectId, targetTool);
    if (result.status === "already_generating") {
      setMessage("فيه تخطيط أو توليد شغال بالفعل، استنى يخلص.");
    } else if (result.status === "missing_data") {
      setMessage(result.message);
    }
    router.refresh();
  }

  function handleGenerateClick() {
    if (hasPlan) setShowConfirm(true);
    else runGenerate();
  }

  async function handleRetryStage(stageIndex: number) {
    await generatePrototypePromptPipelineStage(projectId, stageIndex);
    router.refresh();
  }

  async function handleCopyStage(stage: PrototypePromptStage) {
    if (!stage.content) return;
    await navigator.clipboard.writeText(stage.content);
    setCopiedIndex(stage.stage_index);
    setTimeout(() => setCopiedIndex(null), 2000);
  }

  if (!hasPlan) {
    return (
      <div className="rounded-[var(--v-radius-md)] border border-dashed border-[var(--v-border)] p-6 text-center">
        <p className="mb-2 text-xs font-medium text-[var(--v-text-secondary)]">
          Pipeline V2 بيحلل المشروع بالكامل (Brain + PRD + الملاحظات والقرارات) ويقسّمه لسلسلة Prompts متتابعة، كل
          واحد كامل ومستقل بنفسه، بدل Prompt ضخم واحد.
        </p>
        <p className="text-sm text-[var(--v-text-muted)]">محتاج PRD جاهز أولاً (تبويب PRD).</p>
        <div className="mx-auto mt-4 max-w-xs">
          <select
            value={targetTool}
            onChange={(e) => setTargetTool(e.target.value)}
            className="mb-3 w-full rounded-[var(--v-radius-md)] border border-[var(--v-border)] bg-[var(--v-bg)] px-3 py-2 text-sm text-[var(--v-text)]"
          >
            {tools.map((t) => (
              <option key={t.value} value={t.value}>
                {t.label}
              </option>
            ))}
          </select>
          <Button variant="primary" className="w-full" onClick={handleGenerateClick} loading={isBusy}>
            {isBusy ? "جاري التخطيط…" : "Generate Execution Plan"}
          </Button>
        </div>
        {message && <p className="mt-3 text-xs text-[var(--v-amber)]">{message}</p>}
        {plan?.status === "failed" && plan.last_error && (
          <p className="mt-3 text-xs text-[var(--v-red)]">{plan.last_error}</p>
        )}
        {isBusy && (
          <p className="mt-4 text-xs text-[var(--v-text-muted)]" aria-live="polite">
            التخطيط شغّال في الخلفية — تقدر تسيب الصفحة وترجع، مش هيضيع.
          </p>
        )}
      </div>
    );
  }

  const readyCount = stages.filter((s) => s.status === "ready").length;

  return (
    <div>
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <div className="flex flex-wrap items-center gap-2 text-xs text-[var(--v-text-muted)]">
          <AiBadge />
          <Badge>نسخة {plan!.version}</Badge>
          {plan!.project_size && <Badge>{SIZE_LABELS[plan!.project_size] ?? plan!.project_size}</Badge>}
          <Badge>{tools.find((t) => t.value === plan!.target_tool)?.label ?? plan!.target_tool}</Badge>
          <span>
            {readyCount} / {plan!.stage_count} Stage جاهز
          </span>
          {isBusy && (
            <Badge tone="warning">
              <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-current" />
              جاري التوليد…
            </Badge>
          )}
          {plan!.status === "ready" && <Badge tone="success">الخطة كاملة</Badge>}
        </div>
        <Button variant="outline" size="sm" onClick={handleGenerateClick} loading={isBusy}>
          Regenerate Plan
        </Button>
      </div>

      {message && (
        <div className="mb-4 rounded-[var(--v-radius-md)] border border-[var(--v-amber)]/30 bg-[var(--v-amber)]/10 p-3 text-xs text-[var(--v-amber)]">
          {message}
        </div>
      )}
      {plan!.status === "failed" && plan!.last_error && (
        <div className="mb-4 rounded-[var(--v-radius-md)] border border-[var(--v-red)]/30 bg-[var(--v-red)]/10 p-3 text-xs text-[var(--v-red)]">
          {plan!.last_error}
        </div>
      )}

      <div className="mb-4 rounded-[var(--v-radius-lg)] border border-[var(--v-border)] bg-[var(--v-surface)]/40 p-4">
        <p className="mb-1 text-sm font-semibold text-[var(--v-text)]">خطة التنفيذ</p>
        <p className="whitespace-pre-wrap text-sm text-[var(--v-text-secondary)]">{plan!.execution_summary}</p>
      </div>

      <div className="space-y-3">
        {stages.map((stage) => (
          <StageCard
            key={stage.stage_index}
            stage={stage}
            copied={copiedIndex === stage.stage_index}
            onCopy={() => handleCopyStage(stage)}
            onRetry={() => handleRetryStage(stage.stage_index)}
          />
        ))}
      </div>

      {showConfirm && (
        <RegenerateConfirmDialog
          title="يوجد خطة تنفيذ حالية"
          message="إعادة التخطيط هتمسح كل الـ Stages الحالية (بما فيها اللي اتولدت بالفعل) وتبني خطة جديدة من الصفر. انسخ أي Prompt محتاجه قبل ما تكمل."
          outdatedWarning={null}
          onCancel={() => setShowConfirm(false)}
          onConfirm={runGenerate}
        />
      )}
    </div>
  );
}

function StageCard({
  stage,
  copied,
  onCopy,
  onRetry,
}: {
  stage: PrototypePromptStage;
  copied: boolean;
  onCopy: () => void;
  onRetry: () => void;
}) {
  const [expanded, setExpanded] = useState(false);

  return (
    <div className="rounded-[var(--v-radius-lg)] border border-[var(--v-border)] p-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <span className="flex h-6 w-6 items-center justify-center rounded-full bg-[var(--v-primary)] text-[11px] font-bold text-white">
            {stage.stage_index}
          </span>
          <span className="text-sm font-semibold text-[var(--v-text)]">{stage.title}</span>
          <StageStatusBadge status={stage.status} />
        </div>
        <div className="flex items-center gap-2">
          {stage.status === "ready" && (
            <>
              <Button variant="outline" size="sm" onClick={() => setExpanded((v) => !v)}>
                {expanded ? "إخفاء" : "عرض"}
              </Button>
              <Button variant="outline" size="sm" onClick={onCopy}>
                {copied ? (
                  <>
                    <Check size={13} /> تم النسخ
                  </>
                ) : (
                  <>
                    <Copy size={13} /> Copy
                  </>
                )}
              </Button>
            </>
          )}
          {(stage.status === "failed" || stage.status === "ready") && (
            <Button variant="outline" size="sm" onClick={onRetry}>
              <RefreshCw size={13} /> {stage.status === "failed" ? "Retry" : "Regenerate"}
            </Button>
          )}
        </div>
      </div>
      <p className="mt-1 text-xs text-[var(--v-text-muted)]">{stage.summary}</p>
      {stage.status === "failed" && stage.last_error && (
        <p className="mt-2 text-xs text-[var(--v-red)]">{stage.last_error}</p>
      )}
      {expanded && stage.content && (
        <pre
          dir="ltr"
          className="mt-3 max-h-[400px] overflow-auto rounded-[var(--v-radius-md)] bg-[var(--v-surface)] p-3 text-left text-xs leading-relaxed whitespace-pre-wrap text-[var(--v-text)]"
        >
          {stage.content}
        </pre>
      )}
    </div>
  );
}

function StageStatusBadge({ status }: { status: string }) {
  const tone: BadgeTone =
    status === "ready" ? "success" : status === "failed" ? "danger" : status === "generating" ? "warning" : "neutral";
  return <Badge tone={tone}>{STAGE_STATUS_LABELS[status] ?? status}</Badge>;
}
