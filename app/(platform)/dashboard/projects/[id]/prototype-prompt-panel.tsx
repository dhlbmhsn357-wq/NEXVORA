"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import {
  generateFullPrototypePrompt,
  regeneratePrototypePromptSection,
  editPrototypePromptSection,
  getPrototypePromptVersions,
} from "./prototype-prompt-actions";
import { assemblePromptMarkdown, downloadMarkdown, sectionHeadings } from "@/lib/prototype-prompt/export";
import { CODE_WRITING_STANDARDS_HEADING, CODE_WRITING_STANDARDS_BODY } from "@/lib/prototype-prompt/code-standards";
import { listAvailableTools } from "@/lib/prototype-prompt/templates/registry";
import { PROTOTYPE_PROMPT_SECTION_KEYS } from "@/lib/types/database";
import PrototypePromptPipelinePanel from "./prototype-prompt-pipeline-panel";
import RegenerateConfirmDialog from "@/components/ui/RegenerateConfirmDialog";
import CompareModalShell from "@/components/ui/CompareModalShell";
import EditableSectionCard from "@/components/ui/EditableSectionCard";
import { Check } from "lucide-react";
import Badge from "@/components/ui/Badge";
import AiBadge from "@/components/ui/AiBadge";
import Button from "@/components/ui/Button";
import type {
  PrototypePrompt,
  PrototypePromptPlan,
  PrototypePromptSectionKey,
  PrototypePromptStage,
  PrototypePromptVersion,
} from "@/lib/types/database";
import { useBackgroundRefresh } from "@/lib/ui/use-background-refresh";

const USAGE_NOTE =
  "هذا البرومت مخصص للاستخدام المباشر داخل Claude Code عبر جلسات تطوير متكررة حتى اكتمال البروتوتايب.";

export default function PrototypePromptPanel({
  projectId,
  projectName,
  prompt,
  currentPrdVersion,
  currentBrainVersion,
  pipelinePlan,
  pipelineStages,
}: {
  projectId: string;
  projectName: string;
  prompt: PrototypePrompt | null;
  currentPrdVersion: number | null;
  currentBrainVersion: number | null;
  pipelinePlan: PrototypePromptPlan | null;
  pipelineStages: PrototypePromptStage[];
}) {
  const router = useRouter();
  const tools = listAvailableTools();
  const [mode, setMode] = useState<"legacy" | "pipeline">("legacy");
  const [targetTool, setTargetTool] = useState(prompt?.target_tool ?? "general");
  const [generating, setGenerating] = useState(false);
  const [message, setMessage] = useState("");
  const [showConfirm, setShowConfirm] = useState(false);
  const [viewMode, setViewMode] = useState<"rendered" | "raw">("rendered");
  const [copied, setCopied] = useState(false);
  const [showCompare, setShowCompare] = useState(false);
  const [versions, setVersions] = useState<PrototypePromptVersion[]>([]);
  const [loadingVersions, setLoadingVersions] = useState(false);
  const [compareA, setCompareA] = useState<number | null>(null);
  const [compareB, setCompareB] = useState<number | null>(null);

  // "generating" المحلي مجرد تلميح متفائل لحظة الضغط لحد ما الحالة من الـ
  // DB توصل؛ حالة الـ DB النهائية (failed/idle) بتلغيه دايمًا عشان مايعلّقش.
  const isGenerating =
    prompt?.sync_status === "generating" ||
    (generating && prompt?.sync_status !== "failed" && prompt?.sync_status !== "idle");
  const hasContent = !!(prompt && prompt.version > 0);

  // رسالة العرض: أولوية للرسالة المحلية (missing_prd/already_generating)،
  // وإلا سبب الفشل المحفوظ في الـ DB من الـ Background Job — مشتقّة من الـ
  // props مباشرة بدون setState داخل effect.
  const displayMessage =
    message || (prompt?.sync_status === "failed" ? prompt.last_error ?? "" : "");

  const isOutdated =
    hasContent &&
    prompt &&
    ((currentPrdVersion !== null && prompt.generated_from_prd_version !== currentPrdVersion) ||
      (currentBrainVersion !== null && prompt.generated_from_brain_version !== currentBrainVersion));

  // تحديث دوري مُجمَّع: منسّق واحد لكل الصفحة بدل مؤقّت لكل لوحة، بيقف
  // لما التبويب يكون مخفي وبيبطّل خالص لو المهمة اتعلّقت.
  useBackgroundRefresh(prompt?.sync_status === "generating");

  async function runGenerate(isRegeneration: boolean) {
    setShowConfirm(false);
    setGenerating(true);
    setMessage("");
    const result = await generateFullPrototypePrompt(projectId, targetTool, isRegeneration);
    if (result.status === "missing_prd") {
      setMessage(result.message);
      setGenerating(false);
    } else if (result.status === "already_generating") {
      setMessage("فيه توليد شغال بالفعل، استنى يخلص.");
    }
    // "started" → التوليد بدأ في الخلفية؛ الـ Polling هيلتقط النتيجة.
    router.refresh();
  }

  function handleGenerateClick() {
    if (hasContent) setShowConfirm(true);
    else runGenerate(false);
  }

  async function handleCopy() {
    if (!prompt) return;
    const text = assemblePromptMarkdown(prompt);
    await navigator.clipboard.writeText(text);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }

  function handleExport() {
    if (!prompt) return;
    downloadMarkdown(`Prototype-Prompt-${projectName}.md`, assemblePromptMarkdown(prompt));
  }

  async function handleOpenCompare() {
    setShowCompare(true);
    setLoadingVersions(true);
    const v = await getPrototypePromptVersions(projectId);
    setVersions(v);
    if (v.length >= 2) {
      setCompareA(v[1].version);
      setCompareB(v[0].version);
    }
    setLoadingVersions(false);
  }

  const modeToggle = (
    <div className="mb-4 flex w-fit gap-1 rounded-[var(--v-radius-md)] border border-[var(--v-border)] p-1 text-xs">
      <button
        type="button"
        onClick={() => setMode("legacy")}
        className={`rounded-[var(--v-radius-sm)] px-3 py-1.5 font-medium transition-colors focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--v-primary)] ${
          mode === "legacy" ? "bg-[var(--v-primary)] text-white" : "text-[var(--v-text-muted)] hover:text-[var(--v-text)]"
        }`}
      >
        Prompt واحد (Legacy)
      </button>
      <button
        type="button"
        onClick={() => setMode("pipeline")}
        className={`rounded-[var(--v-radius-sm)] px-3 py-1.5 font-medium transition-colors focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--v-primary)] ${
          mode === "pipeline" ? "bg-[var(--v-primary)] text-white" : "text-[var(--v-text-muted)] hover:text-[var(--v-text)]"
        }`}
      >
        Pipeline V2 (تجريبي)
      </button>
    </div>
  );

  if (mode === "pipeline") {
    return (
      <div>
        {modeToggle}
        <PrototypePromptPipelinePanel projectId={projectId} plan={pipelinePlan} stages={pipelineStages} />
      </div>
    );
  }

  if (!prompt || !hasContent) {
    return (
      <div>
        {modeToggle}
        <div className="rounded-[var(--v-radius-md)] border border-dashed border-[var(--v-border)] p-6 text-center">
        <p className="mb-2 text-xs font-medium text-[var(--v-text-secondary)]">{USAGE_NOTE}</p>
        <p className="text-sm text-[var(--v-text-muted)]">
          لسه مفيش Prototype Prompt لهذا المشروع. محتاج PRD جاهز أولاً (تبويب PRD).
        </p>
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
          <Button variant="primary" className="w-full" onClick={handleGenerateClick} loading={isGenerating}>
            Generate Prompt
          </Button>
        </div>
        {displayMessage && <p className="mt-3 text-xs text-[var(--v-amber)]">{displayMessage}</p>}
        {isGenerating && (
          <div className="mx-auto mt-4 max-w-sm space-y-2" aria-live="polite">
            <p className="text-xs text-[var(--v-text-muted)]">
              التوليد شغّال في الخلفية — تقدر تسيب الصفحة وترجع، مش هيضيع. ممكن ياخد لحد كام دقيقة لو الكوتة مزدحمة.
            </p>
            <div className="h-3 w-full animate-pulse rounded bg-[var(--v-surface)]" />
            <div className="h-3 w-3/4 animate-pulse rounded bg-[var(--v-surface)]" />
          </div>
        )}
        </div>
      </div>
    );
  }

  return (
    <div>
      {modeToggle}
      <p className="mb-3 text-xs font-medium text-[var(--v-text-secondary)]">{USAGE_NOTE}</p>
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <div className="flex flex-wrap items-center gap-2 text-xs text-[var(--v-text-muted)]">
          <AiBadge />
          <Badge>نسخة {prompt.version}</Badge>
          <Badge>{tools.find((t) => t.value === prompt.target_tool)?.label ?? prompt.target_tool}</Badge>
          {prompt.generated_from_prd_version !== null && <Badge>PRD v{prompt.generated_from_prd_version}</Badge>}
          {prompt.generated_from_brain_version !== null && (
            <Badge>Brain v{prompt.generated_from_brain_version}</Badge>
          )}
          <span>آخر تحديث: {new Date(prompt.updated_at).toLocaleString("ar-EG")}</span>
          {isOutdated && <Badge tone="warning">Prompt Outdated</Badge>}
          {isGenerating && (
            <Badge tone="warning">
              <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-current" />
              جاري التوليد…
            </Badge>
          )}
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <select
            value={targetTool}
            onChange={(e) => setTargetTool(e.target.value)}
            className="rounded-[var(--v-radius-md)] border border-[var(--v-border)] bg-[var(--v-bg)] px-2 py-1.5 text-xs text-[var(--v-text)]"
          >
            {tools.map((t) => (
              <option key={t.value} value={t.value}>
                {t.label}
              </option>
            ))}
          </select>
          <Button variant="outline" size="sm" onClick={handleGenerateClick} loading={isGenerating}>
            {isOutdated ? "Rebuild Prompt" : "Re-Generate"}
          </Button>
          <Button variant="outline" size="sm" onClick={handleOpenCompare}>
            Compare Versions
          </Button>
          <Button variant="outline" size="sm" onClick={handleCopy}>
            {copied ? (
              <>
                <Check size={13} /> تم النسخ
              </>
            ) : (
              "Copy Prompt"
            )}
          </Button>
          <Button variant="outline" size="sm" onClick={handleExport}>
            Export Markdown
          </Button>
        </div>
      </div>

      {message && (
        <div className="mb-4 rounded-[var(--v-radius-md)] border border-[var(--v-amber)]/30 bg-[var(--v-amber)]/10 p-3 text-xs text-[var(--v-amber)]">
          {message}
        </div>
      )}
      {prompt.last_error && prompt.sync_status === "failed" && (
        <div className="mb-4 rounded-[var(--v-radius-md)] border border-[var(--v-red)]/30 bg-[var(--v-red)]/10 p-3 text-xs text-[var(--v-red)]">
          {prompt.last_error}
        </div>
      )}

      <div className="mb-3 flex gap-1 rounded-[var(--v-radius-md)] border border-[var(--v-border)] p-1 text-xs">
        <button
          type="button"
          onClick={() => setViewMode("rendered")}
          className={`flex-1 rounded-md py-1.5 font-medium ${
            viewMode === "rendered"
              ? "bg-[var(--v-primary)] text-white"
              : "text-[var(--v-text-muted)] hover:text-[var(--v-text)]"
          }`}
        >
          Rendered
        </button>
        <button
          type="button"
          onClick={() => setViewMode("raw")}
          className={`flex-1 rounded-md py-1.5 font-medium ${
            viewMode === "raw"
              ? "bg-[var(--v-primary)] text-white"
              : "text-[var(--v-text-muted)] hover:text-[var(--v-text)]"
          }`}
        >
          Raw Markdown
        </button>
      </div>

      {viewMode === "raw" ? (
        <pre
          dir="ltr"
          className="max-h-[500px] overflow-auto rounded-[var(--v-radius-lg)] border border-[var(--v-border)] bg-[var(--v-surface)] p-4 text-left text-xs leading-relaxed text-[var(--v-text)] whitespace-pre-wrap"
        >
          {assemblePromptMarkdown(prompt)}
        </pre>
      ) : (
        <div dir="ltr" className="space-y-3 text-left">
          <div className="rounded-[var(--v-radius-lg)] border border-[var(--v-primary)]/30 bg-[var(--v-primary-tint)] p-3">
            <p className="font-display text-sm font-semibold text-[var(--v-text)]">
              # {CODE_WRITING_STANDARDS_HEADING}
            </p>
            <p className="mt-1 text-[11px] font-medium text-[var(--v-text-muted)]">
              قسم ثابت وإلزامي — يُضاف تلقائيًا في أول كل برومت (قبل تفاصيل المشروع) ولا يمكن تعديله أو حذفه.
            </p>
            <p className="mt-2 whitespace-pre-wrap text-sm text-[var(--v-text)]">
              {CODE_WRITING_STANDARDS_BODY}
            </p>
          </div>
          {PROTOTYPE_PROMPT_SECTION_KEYS.map((key) => (
            <SectionCard
              key={key}
              projectId={projectId}
              sectionKey={key}
              prompt={prompt}
              disabled={isGenerating}
              onChanged={() => router.refresh()}
            />
          ))}
        </div>
      )}

      {showConfirm && (
        <RegenerateConfirmDialog
          title="يوجد Prompt حالي (ربما فيه تعديلات يدوية)"
          message="التوليد الكامل الجديد هيستبدل المحتوى الحالي. النسخة الحالية هتفضل محفوظة بالكامل في سجل النسخ (Compare Versions)."
          outdatedWarning={
            isOutdated
              ? "تنبيه: PRD أو Project Brain اتغيّروا من آخر توليد للبرومت ده — النسخة الجديدة هتعتمد على أحدث البيانات، وممكن تختلف بشكل ملحوظ."
              : null
          }
          onCancel={() => setShowConfirm(false)}
          onConfirm={() => runGenerate(true)}
        />
      )}

      {showCompare && (
        <CompareModal
          versions={versions}
          loading={loadingVersions}
          compareA={compareA}
          compareB={compareB}
          setCompareA={setCompareA}
          setCompareB={setCompareB}
          onClose={() => setShowCompare(false)}
        />
      )}
    </div>
  );
}

function SectionCard({
  projectId,
  sectionKey,
  prompt,
  disabled,
  onChanged,
}: {
  projectId: string;
  sectionKey: PrototypePromptSectionKey;
  prompt: PrototypePrompt;
  disabled: boolean;
  onChanged: () => void;
}) {
  return (
    <EditableSectionCard
      headerLabel={
        <span className="font-display text-sm font-semibold text-[var(--v-text)]">
          # {sectionHeadings[sectionKey]}
        </span>
      }
      align="left"
      disabled={disabled}
      viewContent={<p className="whitespace-pre-wrap text-sm text-[var(--v-text)]">{prompt[sectionKey]}</p>}
      getInitialDraft={() => prompt[sectionKey]}
      onSave={async (draft) => {
        await editPrototypePromptSection(projectId, sectionKey, draft);
        return { ok: true };
      }}
      onChanged={onChanged}
      editLabel="Edit"
      cancelLabel="Cancel"
      saveLabel="Save"
      savingLabel="Saving…"
      textareaRows={6}
      regenerate={{
        label: "Rebuild Section",
        regeneratingLabel: "Regenerating…",
        onRegenerate: async () => {
          await regeneratePrototypePromptSection(projectId, sectionKey);
        },
      }}
    />
  );
}

function CompareModal({
  versions,
  loading,
  compareA,
  compareB,
  setCompareA,
  setCompareB,
  onClose,
}: {
  versions: PrototypePromptVersion[];
  loading: boolean;
  compareA: number | null;
  compareB: number | null;
  setCompareA: (v: number) => void;
  setCompareB: (v: number) => void;
  onClose: () => void;
}) {
  return (
    <CompareModalShell
      versions={versions}
      loading={loading}
      compareA={compareA}
      compareB={compareB}
      setCompareA={setCompareA}
      setCompareB={setCompareB}
      onClose={onClose}
    >
      {(versionA, versionB) => (
        <div dir="ltr" className="space-y-3 text-left">
          {PROTOTYPE_PROMPT_SECTION_KEYS.map((key) => {
            const oldVal = versionA[key] ?? "";
            const newVal = versionB[key] ?? "";
            if (oldVal === newVal) return null;
            return (
              <div key={key} className="rounded-[var(--v-radius-md)] border border-[var(--v-border)] p-2">
                <p className="text-xs font-semibold text-[var(--v-text)]">
                  {sectionHeadings[key]} — changed
                </p>
                <div className="mt-1 grid grid-cols-1 gap-2 md:grid-cols-2">
                  <div className="rounded bg-[var(--v-red)]/5 p-2 text-[11px] text-[var(--v-text-secondary)]">
                    v{versionA.version}: {oldVal || "—"}
                  </div>
                  <div className="rounded bg-[var(--v-green)]/5 p-2 text-[11px] text-[var(--v-text-secondary)]">
                    v{versionB.version}: {newVal || "—"}
                  </div>
                </div>
              </div>
            );
          })}
          {PROTOTYPE_PROMPT_SECTION_KEYS.every((key) => (versionA[key] ?? "") === (versionB[key] ?? "")) && (
            <p className="text-xs text-[var(--v-text-muted)]">لا يوجد فرق بين النسختين.</p>
          )}
        </div>
      )}
    </CompareModalShell>
  );
}
