"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import {
  generateDeveloperHandoff,
  editDeveloperHandoffSection,
  changeDeveloperHandoffStatus,
  updateAccessCredentialsRef,
  getDeveloperHandoffVersions,
  generateHandoffShareLink,
  revokeHandoffShareLink,
} from "./developer-handoff-actions";
import { Package, Check } from "lucide-react";
import { assembleHandoffMarkdown, downloadMarkdown, sectionHeadings } from "@/lib/developer-handoff/export";
import RegenerateConfirmDialog from "@/components/ui/RegenerateConfirmDialog";
import CompareModalShell from "@/components/ui/CompareModalShell";
import EditableSectionCard from "@/components/ui/EditableSectionCard";
import Badge from "@/components/ui/Badge";
import AiBadge from "@/components/ui/AiBadge";
import Button from "@/components/ui/Button";
import EmptyState from "@/components/ui/EmptyState";
import { DEVELOPER_HANDOFF_SECTION_KEYS } from "@/lib/types/database";
import type {
  DeveloperHandoff,
  DeveloperHandoffSectionKey,
  DeveloperHandoffStatus,
  DeveloperHandoffVersion,
} from "@/lib/types/database";
import { useBackgroundRefresh } from "@/lib/ui/use-background-refresh";

const statusLabels: Record<DeveloperHandoffStatus, string> = {
  draft: "مسودة (Draft)",
  in_review: "قيد المراجعة (In Review)",
  completed: "مكتملة (Completed)",
};

export default function DeveloperHandoffPanel({
  projectId,
  projectName,
  handoff,
  currentPrdVersion,
  currentReviewVersion,
  currentBrainVersion,
}: {
  projectId: string;
  projectName: string;
  handoff: DeveloperHandoff | null;
  currentPrdVersion: number | null;
  currentReviewVersion: number | null;
  currentBrainVersion: number | null;
}) {
  const router = useRouter();
  const [generating, setGenerating] = useState(false);
  const [message, setMessage] = useState("");
  const [showGapsConfirm, setShowGapsConfirm] = useState(false);
  const [showRegenConfirm, setShowRegenConfirm] = useState(false);
  const [copied, setCopied] = useState(false);
  const [credentialsRef, setCredentialsRef] = useState(handoff?.access_credentials_ref ?? "");
  const [credentialsError, setCredentialsError] = useState("");
  const [savingCredentials, setSavingCredentials] = useState(false);
  const [showCompare, setShowCompare] = useState(false);
  const [versions, setVersions] = useState<DeveloperHandoffVersion[]>([]);
  const [loadingVersions, setLoadingVersions] = useState(false);
  const [compareA, setCompareA] = useState<number | null>(null);
  const [compareB, setCompareB] = useState<number | null>(null);

  const isGenerating =
    handoff?.sync_status === "generating" ||
    (generating && handoff?.sync_status !== "failed" && handoff?.sync_status !== "idle");
  const hasContent = !!(handoff && handoff.version > 0);
  const shareUrl = handoff?.share_token
    ? `${typeof window !== "undefined" ? window.location.origin : ""}/developer-handoff-share/${handoff.share_token}`
    : null;

  const isOutdated =
    hasContent &&
    handoff &&
    ((currentPrdVersion !== null && handoff.generated_from_prd_version !== currentPrdVersion) ||
      (currentReviewVersion !== null && handoff.generated_from_review_version !== currentReviewVersion) ||
      (currentBrainVersion !== null && handoff.generated_from_brain_version !== currentBrainVersion));

  const displayMessage = message || (handoff?.sync_status === "failed" ? handoff.last_error ?? "" : "");

  // تحديث دوري مُجمَّع: منسّق واحد لكل الصفحة بدل مؤقّت لكل لوحة، بيقف
  // لما التبويب يكون مخفي وبيبطّل خالص لو المهمة اتعلّقت.
  useBackgroundRefresh(handoff?.sync_status === "generating");

  async function runGenerate(confirmContinueWithGaps?: boolean) {
    setShowGapsConfirm(false);
    setShowRegenConfirm(false);
    setGenerating(true);
    setMessage("");
    const result = await generateDeveloperHandoff(projectId, confirmContinueWithGaps);
    if (result.status === "no_review") {
      setMessage(result.message);
      setGenerating(false);
    } else if (result.status === "missing_prd_or_brain") {
      setMessage(result.message);
      setGenerating(false);
    } else if (result.status === "major_gaps_warning") {
      setShowGapsConfirm(true);
      setGenerating(false);
    } else if (result.status === "already_generating") {
      setMessage("فيه توليد شغال بالفعل، استنى يخلص.");
    }
    // "started" → التوليد بدأ في الخلفية؛ الـ Polling هيلتقط النتيجة.
    router.refresh();
  }

  function handleGenerateClick() {
    if (hasContent) setShowRegenConfirm(true);
    else runGenerate();
  }

  async function handleSaveCredentials() {
    setSavingCredentials(true);
    setCredentialsError("");
    const result = await updateAccessCredentialsRef(projectId, credentialsRef);
    if (!result.ok) setCredentialsError(result.reason ?? "قيمة غير صالحة.");
    setSavingCredentials(false);
    router.refresh();
  }

  async function handleStatusChange(status: DeveloperHandoffStatus) {
    await changeDeveloperHandoffStatus(projectId, status);
    router.refresh();
  }

  async function handleGenerateLink() {
    await generateHandoffShareLink(projectId);
    router.refresh();
  }

  async function handleRevokeLink() {
    if (!window.confirm("الرابط الحالي هيتوقف فورًا ولو متضمّن في مكان تاني، هيبقى مكسور. متأكد؟")) {
      return;
    }
    await revokeHandoffShareLink(projectId);
    router.refresh();
  }

  async function handleCopyLink() {
    if (!shareUrl) return;
    await navigator.clipboard.writeText(shareUrl);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }

  function handleExport() {
    if (!handoff) return;
    downloadMarkdown(`Developer-Handoff-${projectName}.md`, assembleHandoffMarkdown(handoff));
  }

  async function handleOpenCompare() {
    setShowCompare(true);
    setLoadingVersions(true);
    const v = await getDeveloperHandoffVersions(projectId);
    setVersions(v);
    if (v.length >= 2) {
      setCompareA(v[1].version);
      setCompareB(v[0].version);
    }
    setLoadingVersions(false);
  }

  if (!handoff || !hasContent) {
    return (
      <>
        <EmptyState
          icon={<Package size={28} />}
          title="لسه مفيش Developer Handoff Package لهذا المشروع"
          description="محتاج Prototype Review معتمد أولاً (تبويب Prototype Review) — البروتوتايب المفروض يكون خلص، والحزمة دي لمراجعته قبل التسليم النهائي."
          primaryAction={{
            label: isGenerating ? "جاري التوليد…" : "Generate Developer Handoff",
            onClick: handleGenerateClick,
            loading: isGenerating,
          }}
        />
        {displayMessage && <p className="mt-3 text-xs text-[var(--v-amber)]">{displayMessage}</p>}
        {isGenerating && (
          <p className="mt-2 text-xs text-[var(--v-text-muted)]">
            التوليد شغّال في الخلفية — تقدر تسيب الصفحة وترجع، مش هيضيع. ممكن ياخد لحد كام دقيقة لو الكوتة مزدحمة.
          </p>
        )}
        {showGapsConfirm && (
          <GapsConfirmModal onCancel={() => setShowGapsConfirm(false)} onConfirm={() => runGenerate(true)} />
        )}
      </>
    );
  }

  return (
    <div>
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <div className="flex flex-wrap items-center gap-2 text-xs text-[var(--v-text-muted)]">
          <AiBadge />
          <Badge>نسخة {handoff.version}</Badge>
          <Badge
            tone={
              handoff.handoff_status === "completed"
                ? "success"
                : handoff.handoff_status === "in_review"
                  ? "warning"
                  : "neutral"
            }
          >
            {statusLabels[handoff.handoff_status]}
          </Badge>
          {handoff.generated_from_prd_version !== null && <Badge>PRD v{handoff.generated_from_prd_version}</Badge>}
          {handoff.generated_from_review_version !== null && (
            <Badge>Review v{handoff.generated_from_review_version}</Badge>
          )}
          {isOutdated && <Badge tone="warning">Handoff Outdated</Badge>}
          {isGenerating && (
            <Badge tone="warning">
              <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-current" />
              جاري التوليد…
            </Badge>
          )}
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <select
            value={handoff.handoff_status}
            onChange={(e) => handleStatusChange(e.target.value as DeveloperHandoffStatus)}
            className="rounded-[var(--v-radius-md)] border border-[var(--v-border)] bg-[var(--v-bg)] px-2 py-1.5 text-xs text-[var(--v-text)]"
          >
            {(Object.keys(statusLabels) as DeveloperHandoffStatus[]).map((s) => (
              <option key={s} value={s}>
                {statusLabels[s]}
              </option>
            ))}
          </select>
          <Button variant="outline" size="sm" onClick={handleGenerateClick} loading={isGenerating}>
            {isOutdated ? "Rebuild Handoff" : "Re-Generate"}
          </Button>
          <Button variant="outline" size="sm" onClick={handleOpenCompare}>
            Compare Versions
          </Button>
          <Button variant="outline" size="sm" onClick={handleExport}>
            Export Markdown
          </Button>
          <Link
            href={`/developer-handoff-print/${projectId}`}
            target="_blank"
            className="rounded-[var(--v-radius-md)] border border-[var(--v-border)] px-4 py-2 text-sm font-medium text-[var(--v-text)] transition hover:border-[var(--v-primary)]"
          >
            Export PDF
          </Link>
        </div>
      </div>

      {message && (
        <div className="mb-4 rounded-[var(--v-radius-md)] border border-[var(--v-amber)]/30 bg-[var(--v-amber)]/10 p-3 text-xs text-[var(--v-amber)]">
          {message}
        </div>
      )}
      {handoff.last_error && handoff.sync_status === "failed" && (
        <div className="mb-4 rounded-[var(--v-radius-md)] border border-[var(--v-red)]/30 bg-[var(--v-red)]/10 p-3 text-xs text-[var(--v-red)]">
          {handoff.last_error}
        </div>
      )}

      <div className="mb-4 rounded-[var(--v-radius-lg)] border border-[var(--v-border)] bg-[var(--v-bg)] p-4">
        <p className="mb-2 text-sm font-semibold text-[var(--v-text)]">Access Credentials Reference</p>
        <p className="mb-2 text-[11px] text-[var(--v-text-muted)]">
          مرجع نصي بس (زي &quot;see 1Password vault X&quot;) — ممنوع تخزين أي Secret أو Production Credential فعلي هنا.
        </p>
        <div className="flex flex-wrap gap-2">
          <input
            value={credentialsRef}
            onChange={(e) => setCredentialsRef(e.target.value)}
            placeholder="see 1Password vault …"
            dir="ltr"
            className="flex-1 rounded-[var(--v-radius-md)] border border-[var(--v-border)] bg-[var(--v-bg)] px-3 py-2 text-sm text-[var(--v-text)] outline-none focus:border-[var(--v-primary)]"
          />
          <Button variant="primary" onClick={handleSaveCredentials} loading={savingCredentials}>
            حفظ
          </Button>
        </div>
        {credentialsError && <p className="mt-2 text-xs text-[var(--v-red)]">{credentialsError}</p>}
      </div>

      <div className="mb-4 rounded-[var(--v-radius-lg)] border border-[var(--v-border)] bg-[var(--v-bg)] p-4">
        <p className="mb-2 text-sm font-semibold text-[var(--v-text)]">رابط مشاركة للمراجع (Read Only)</p>
        {shareUrl ? (
          <div className="flex flex-wrap items-center gap-2">
            <code dir="ltr" className="flex-1 truncate rounded-[var(--v-radius-md)] bg-[var(--v-surface)] px-3 py-2 text-xs text-[var(--v-text)]">
              {shareUrl}
            </code>
            <Button variant="outline" size="sm" onClick={handleCopyLink}>
              {copied ? (
                <>
                  <Check size={13} /> تم النسخ
                </>
              ) : (
                "Copy Link"
              )}
            </Button>
            <Button variant="danger" size="sm" onClick={handleRevokeLink}>
              Revoke Link
            </Button>
          </div>
        ) : (
          <Button variant="primary" onClick={handleGenerateLink}>
            إنشاء رابط مشاركة
          </Button>
        )}
      </div>

      <div className="space-y-3">
        {DEVELOPER_HANDOFF_SECTION_KEYS.map((key) => (
          <SectionCard
            key={key}
            projectId={projectId}
            sectionKey={key}
            handoff={handoff}
            disabled={isGenerating}
            onChanged={() => router.refresh()}
          />
        ))}
      </div>

      {showRegenConfirm && (
        <RegenerateConfirmDialog
          title="يوجد Handoff حالي (ربما فيه تعديلات يدوية)"
          message="التوليد الجديد هيستبدل المحتوى الحالي. النسخة الحالية هتفضل محفوظة بالكامل في سجل النسخ."
          outdatedWarning={
            isOutdated
              ? "تنبيه: PRD أو Prototype Review اتغيّروا من آخر توليد لهذه الحزمة — النسخة الجديدة هتعتمد على أحدث البيانات، وممكن تختلف بشكل ملحوظ."
              : null
          }
          onCancel={() => setShowRegenConfirm(false)}
          onConfirm={() => runGenerate()}
        />
      )}

      {showGapsConfirm && (
        <GapsConfirmModal onCancel={() => setShowGapsConfirm(false)} onConfirm={() => runGenerate(true)} />
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

function GapsConfirmModal({ onCancel, onConfirm }: { onCancel: () => void; onConfirm: () => void }) {
  return (
    <div role="dialog" aria-modal="true" className="fixed inset-0 z-20 flex items-center justify-center bg-black/40 px-6">
      <div className="w-full max-w-md rounded-[var(--v-radius-lg)] border border-[var(--v-border)] bg-[var(--v-bg)] p-5">
        <p className="text-sm font-semibold text-[var(--v-red)]">تحذير — آخر Prototype Review فيه فجوات جوهرية</p>
        <p className="mt-2 text-xs text-[var(--v-text-secondary)]">
          آخر مراجعة حالتها Blocked (فيه Missing Features أو نسبة إنجاز أقل من 50%). حزمة المراجعة
          هتتولد وتعكس هذه الفجوات كما هي في Known State — بدون أي إخفاء أو تجميل. تقدر تكمل لو عايز.
        </p>
        <div className="mt-4 flex justify-end gap-2">
          <button
            type="button"
            onClick={onCancel}
            className="rounded-[var(--v-radius-md)] border border-[var(--v-border)] px-3 py-1.5 text-xs font-medium text-[var(--v-text)] hover:bg-[var(--v-surface)]"
          >
            إلغاء
          </button>
          <button
            type="button"
            onClick={onConfirm}
            className="rounded-[var(--v-radius-md)] bg-[var(--v-red)] px-3 py-1.5 text-xs font-bold text-white hover:opacity-90"
          >
            كمّل رغم الفجوات
          </button>
        </div>
      </div>
    </div>
  );
}

function SectionCard({
  projectId,
  sectionKey,
  handoff,
  disabled,
  onChanged,
}: {
  projectId: string;
  sectionKey: DeveloperHandoffSectionKey;
  handoff: DeveloperHandoff;
  disabled: boolean;
  onChanged: () => void;
}) {
  const value = handoff.package_content[sectionKey];

  return (
    <EditableSectionCard
      headerLabel={
        <span className="font-display text-sm font-semibold text-[var(--v-text)]">
          # {sectionHeadings[sectionKey]}
        </span>
      }
      align="left"
      disabled={disabled}
      viewContent={
        <pre dir="ltr" className="max-h-[300px] overflow-auto whitespace-pre-wrap rounded-[var(--v-radius-md)] bg-[var(--v-surface)] p-2 text-left text-xs text-[var(--v-text)]">
          {JSON.stringify(value, null, 2)}
        </pre>
      }
      getInitialDraft={() => JSON.stringify(value, null, 2)}
      onSave={async (draft) => {
        let parsed: unknown;
        try {
          parsed = JSON.parse(draft);
        } catch {
          return { ok: false, error: "JSON غير صالح — راجع الصياغة." };
        }
        await editDeveloperHandoffSection(projectId, sectionKey, parsed);
        return { ok: true };
      }}
      onChanged={onChanged}
      editLabel="Edit"
      cancelLabel="Cancel"
      saveLabel="Save"
      savingLabel="Saving…"
      textareaRows={10}
      textareaDir="ltr"
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
  versions: DeveloperHandoffVersion[];
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
      optionLabel={(v) => `نسخة ${v.version} (${v.reason})`}
    >
      {(versionA, versionB) => (
        <div dir="ltr" className="space-y-3 text-left">
          {DEVELOPER_HANDOFF_SECTION_KEYS.map((key) => {
            const oldVal = JSON.stringify(versionA.package_content?.[key]);
            const newVal = JSON.stringify(versionB.package_content?.[key]);
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
          {DEVELOPER_HANDOFF_SECTION_KEYS.every(
            (key) => JSON.stringify(versionA.package_content?.[key]) === JSON.stringify(versionB.package_content?.[key])
          ) && <p className="text-xs text-[var(--v-text-muted)]">لا يوجد فرق بين النسختين.</p>}
        </div>
      )}
    </CompareModalShell>
  );
}
