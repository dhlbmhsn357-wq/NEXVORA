"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import {
  resyncProjectBrain,
  editBrainSummary,
  acceptBrainProposal,
  keepCurrentSummary,
  toggleQuestionAnswered,
} from "./brain-actions";
import { Brain } from "lucide-react";
import Badge from "@/components/ui/Badge";
import Button from "@/components/ui/Button";
import EmptyState from "@/components/ui/EmptyState";
import Timeline from "@/components/ui/Timeline";
import type { ProjectBrain } from "@/lib/types/database";

export default function BrainPanel({
  projectId,
  brain,
}: {
  projectId: string;
  brain: ProjectBrain | null;
}) {
  const router = useRouter();
  const [syncing, setSyncing] = useState(false);
  const [syncMessage, setSyncMessage] = useState("");
  const [editingSummary, setEditingSummary] = useState(false);
  const [summaryDraft, setSummaryDraft] = useState(brain?.summary ?? "");
  const [savingSummary, setSavingSummary] = useState(false);
  const [resolvingProposal, setResolvingProposal] = useState(false);

  const isSyncing = syncing || brain?.sync_status === "syncing";

  async function handleResync() {
    setSyncing(true);
    setSyncMessage("");
    const result = await resyncProjectBrain(projectId);
    if (result.status === "already_syncing") {
      setSyncMessage("فيه مزامنة شغالة بالفعل، استنى تخلص.");
    } else if (result.status === "insufficient_data") {
      setSyncMessage(result.message);
    } else if (result.status === "error") {
      setSyncMessage(result.message);
    }
    setSyncing(false);
    router.refresh();
  }

  async function handleSaveSummary() {
    setSavingSummary(true);
    await editBrainSummary(projectId, summaryDraft);
    setSavingSummary(false);
    setEditingSummary(false);
    router.refresh();
  }

  async function handleAcceptProposal() {
    setResolvingProposal(true);
    await acceptBrainProposal(projectId);
    setResolvingProposal(false);
    router.refresh();
  }

  async function handleKeepCurrent() {
    setResolvingProposal(true);
    await keepCurrentSummary(projectId);
    setResolvingProposal(false);
    router.refresh();
  }

  async function handleToggleQuestion(index: number, current: boolean) {
    await toggleQuestionAnswered(projectId, index, !current);
    router.refresh();
  }

  const hasData =
    brain &&
    (brain.summary ||
      brain.key_facts.length > 0 ||
      brain.pain_points.length > 0 ||
      brain.decisions_log.length > 0 ||
      brain.open_questions.length > 0);

  return (
    <div>
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-2 text-xs text-[var(--v-text-muted)]">
          {brain && (
            <>
              <Badge>نسخة {brain.version}</Badge>
              <span>
                {brain.last_synced_at
                  ? `آخر مزامنة: ${new Date(brain.last_synced_at).toLocaleString("ar-EG")}`
                  : "لسه معملتش مزامنة"}
              </span>
              {brain.sync_status === "failed" && <Badge tone="danger">فشلت آخر مزامنة</Badge>}
              {isSyncing && (
                <Badge tone="warning">
                  <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-current" />
                  جاري المزامنة…
                </Badge>
              )}
            </>
          )}
        </div>
        <Button variant="outline" size="sm" onClick={handleResync} loading={isSyncing}>
          Re-sync
        </Button>
      </div>

      {syncMessage && (
        <div className="mb-4 rounded-[var(--v-radius-md)] border border-[var(--v-amber)]/30 bg-[var(--v-amber)]/10 p-3 text-xs text-[var(--v-amber)]">
          {syncMessage}
        </div>
      )}

      {brain?.last_sync_error && brain.sync_status === "failed" && (
        <div className="mb-4 rounded-[var(--v-radius-md)] border border-[var(--v-red)]/30 bg-[var(--v-red)]/10 p-3 text-xs text-[var(--v-red)]">
          {brain.last_sync_error}
        </div>
      )}

      {!hasData && !isSyncing && (
        <EmptyState
          icon={<Brain size={28} />}
          title="لسه مفيش Project Brain لهذا المشروع"
          description={'لازم بيانات في نموذج الاكتشاف أو اجتماعات معالجة أولاً، وبعدين اضغط "Re-sync" فوق.'}
        />
      )}

      {isSyncing && !hasData && (
        <div className="space-y-2">
          <div className="h-4 w-3/4 animate-pulse rounded bg-[var(--v-surface)]" />
          <div className="h-4 w-full animate-pulse rounded bg-[var(--v-surface)]" />
          <div className="h-4 w-1/2 animate-pulse rounded bg-[var(--v-surface)]" />
        </div>
      )}

      {hasData && brain && (
        <div className="space-y-4">
          {/* Pending proposal — Conflict Resolution */}
          {brain.pending_summary && (
            <div className="rounded-[var(--v-radius-lg)] border border-[var(--v-amber)]/30 bg-[var(--v-amber)]/5 p-4">
              <p className="mb-2 text-sm font-semibold text-[var(--v-amber)]">
                فيه اقتراح ملخص جديد من AI (عندك تعديل يدوي حالي)
              </p>
              <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
                <div>
                  <p className="mb-1 text-xs text-[var(--v-text-muted)]">النسخة الحالية (يدوي)</p>
                  <p className="rounded-[var(--v-radius-md)] bg-[var(--v-surface)] p-2 text-sm text-[var(--v-text)]">
                    {brain.summary}
                  </p>
                </div>
                <div>
                  <p className="mb-1 text-xs text-[var(--v-text-muted)]">النسخة المقترحة (AI)</p>
                  <p className="rounded-[var(--v-radius-md)] bg-[var(--v-surface)] p-2 text-sm text-[var(--v-text)]">
                    {brain.pending_summary}
                  </p>
                </div>
              </div>
              <div className="mt-3 flex gap-2">
                <button
                  type="button"
                  onClick={handleAcceptProposal}
                  disabled={resolvingProposal}
                  className="rounded-[var(--v-radius-md)] bg-[var(--v-primary)] px-3 py-1.5 text-xs font-bold text-white hover:bg-[var(--v-primary-hover)] disabled:opacity-50"
                >
                  قبول النسخة الجديدة
                </button>
                <button
                  type="button"
                  onClick={handleKeepCurrent}
                  disabled={resolvingProposal}
                  className="rounded-[var(--v-radius-md)] border border-[var(--v-border)] px-3 py-1.5 text-xs font-medium text-[var(--v-text)] hover:bg-[var(--v-surface)] disabled:opacity-50"
                >
                  الاحتفاظ بالحالية
                </button>
              </div>
            </div>
          )}

          {/* Summary */}
          <div className="rounded-[var(--v-radius-lg)] border border-[var(--v-border)] bg-[var(--v-bg)] p-4">
            <div className="mb-2 flex items-center justify-between">
              <p className="text-sm font-semibold text-[var(--v-text)]">
                الملخص {brain.summary_is_manual && <span className="text-[var(--v-text-muted)]">(معدّل يدويًا)</span>}
              </p>
              {!editingSummary && (
                <button
                  type="button"
                  onClick={() => {
                    setSummaryDraft(brain.summary);
                    setEditingSummary(true);
                  }}
                  className="text-xs text-[var(--v-primary)] hover:underline"
                >
                  تعديل
                </button>
              )}
            </div>
            {editingSummary ? (
              <div className="space-y-2">
                <textarea
                  value={summaryDraft}
                  onChange={(e) => setSummaryDraft(e.target.value)}
                  rows={4}
                  className="w-full rounded-[var(--v-radius-md)] border border-[var(--v-border)] bg-[var(--v-bg)] px-3 py-2 text-sm text-[var(--v-text)] outline-none focus:border-[var(--v-primary)]"
                />
                <div className="flex gap-2">
                  <button
                    type="button"
                    onClick={handleSaveSummary}
                    disabled={savingSummary}
                    className="rounded-[var(--v-radius-md)] bg-[var(--v-primary)] px-3 py-1.5 text-xs font-bold text-white hover:bg-[var(--v-primary-hover)] disabled:opacity-50"
                  >
                    {savingSummary ? "جاري الحفظ…" : "حفظ"}
                  </button>
                  <button
                    type="button"
                    onClick={() => setEditingSummary(false)}
                    disabled={savingSummary}
                    className="rounded-[var(--v-radius-md)] border border-[var(--v-border)] px-3 py-1.5 text-xs font-medium text-[var(--v-text)] hover:bg-[var(--v-surface)]"
                  >
                    إلغاء
                  </button>
                </div>
              </div>
            ) : (
              <p className="text-sm leading-relaxed text-[var(--v-text)]">
                {brain.summary || "لا يوجد ملخص بعد."}
              </p>
            )}
          </div>

          {/* Key Facts */}
          {brain.key_facts.length > 0 && (
            <div>
              <p className="mb-2 text-xs font-semibold text-[var(--v-text-muted)]">حقائق أساسية</p>
              <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
                {brain.key_facts.map((fact, i) => (
                  <div
                    key={i}
                    className="rounded-[var(--v-radius-md)] border border-[var(--v-border)] bg-[var(--v-bg)] p-3 text-sm text-[var(--v-text)]"
                  >
                    {fact}
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Pain Points */}
          {brain.pain_points.length > 0 && (
            <div>
              <p className="mb-2 text-xs font-semibold text-[var(--v-text-muted)]">نقاط الألم</p>
              <ul className="space-y-1.5">
                {brain.pain_points.map((point, i) => (
                  <li
                    key={i}
                    className="rounded-[var(--v-radius-md)] border border-[var(--v-red)]/20 bg-[var(--v-red)]/5 p-2 text-sm text-[var(--v-text)]"
                  >
                    {point}
                  </li>
                ))}
              </ul>
            </div>
          )}

          {/* Decisions Timeline */}
          {brain.decisions_log.length > 0 && (
            <div>
              <p className="mb-2 text-xs font-semibold text-[var(--v-text-muted)]">القرارات</p>
              <Timeline
                items={brain.decisions_log.map((d, i) => ({
                  key: String(i),
                  node: <span className="mt-1.5 h-2 w-2 shrink-0 rounded-full bg-[var(--v-primary)]" />,
                  content: (
                    <>
                      <p className="text-sm text-[var(--v-text)]">{d.content}</p>
                      <p className="text-[10px] text-[var(--v-text-muted)]">{d.source}</p>
                    </>
                  ),
                }))}
              />
            </div>
          )}

          {/* Open Questions */}
          {brain.open_questions.length > 0 && (
            <div>
              <p className="mb-2 text-xs font-semibold text-[var(--v-text-muted)]">أسئلة مفتوحة</p>
              <ul className="space-y-1.5">
                {brain.open_questions.map((q, i) => (
                  <li
                    key={i}
                    className="flex items-center gap-2 rounded-[var(--v-radius-md)] border border-[var(--v-border)] bg-[var(--v-bg)] p-2 text-sm"
                  >
                    <button
                      type="button"
                      onClick={() => handleToggleQuestion(i, q.answered)}
                      aria-pressed={q.answered}
                      aria-label={q.answered ? "تعليم كسؤال مفتوح" : "تعليم كمُجاب عليه"}
                      className={`h-4 w-4 flex-shrink-0 rounded border focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--v-primary)] ${
                        q.answered
                          ? "border-[var(--v-green)] bg-[var(--v-green)]"
                          : "border-[var(--v-border)]"
                      }`}
                    />
                    <span
                      className={
                        q.answered
                          ? "text-[var(--v-text-muted)] line-through"
                          : "text-[var(--v-text)]"
                      }
                    >
                      {q.question}
                    </span>
                  </li>
                ))}
              </ul>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
