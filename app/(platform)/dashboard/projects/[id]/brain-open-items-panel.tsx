"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { HelpCircle, Lightbulb, CheckCircle2, XCircle, MessageSquarePlus, Clock3, Pencil, CheckCheck } from "lucide-react";
import Card from "@/components/ui/Card";
import Badge, { type BadgeTone } from "@/components/ui/Badge";
import Button from "@/components/ui/Button";
import { toast } from "@/components/ui/Toaster";
import {
  setAssumptionDispositionAction,
  setMissingInfoDispositionAction,
  bulkResolveOpenItemsAction,
} from "./brain-review-actions";
import { ASSUMPTION_LABELS, MISSING_INFO_LABELS } from "@/lib/brain-v2/review-types";
import type {
  AssumptionDisposition,
  AssumptionDispositionsMap,
  MissingInfoDisposition,
  MissingInfoDispositionsMap,
} from "@/lib/brain-v2/review-types";
import type { BrainContent } from "@/lib/brain-v2/types";
import { isOpenItemPending } from "@/lib/brain-v2/open-items-helpers";

const TONE: Record<string, BadgeTone> = {
  pending: "warning",
  resolved: "success",
  accepted: "success",
  ignored: "neutral",
  rejected: "danger",
  converted_to_meeting_question: "info",
};

/** النص المحفوظ مع القرار (إجابة أو سبب) — مصدر واحد للعرض. */
function savedNote(d: MissingInfoDisposition | AssumptionDisposition | undefined): string | null {
  if (!d) return null;
  if ("note" in d && d.note) return d.note;
  if ("reason" in d && d.reason) return d.reason;
  return null;
}

const isPending = isOpenItemPending;

/**
 * «البنود المفتوحة» — المعلومات الناقصة والافتراضات اللي لازم تتحسم قبل
 * اعتماد الـ Brain. لكل بند: تكتب إجابتك/قرارك بنص عادي وتختار الحالة،
 * والحالة بتتغيّر فورًا وبتتشال من قائمة معوّقات الاعتماد.
 *
 * بيظهر في Project Brain (مكان الاعتماد) وفي Brain Review — نفس المكوّن،
 * عشان مايبقاش فيه واجهتين مختلفتين لنفس القرار.
 */
export default function BrainOpenItemsPanel({
  projectId,
  documentId,
  content,
  missingDispositions,
  assumptionDispositions,
  canReview,
  editable,
}: {
  projectId: string;
  documentId: string;
  content: BrainContent;
  missingDispositions: MissingInfoDispositionsMap;
  assumptionDispositions: AssumptionDispositionsMap;
  canReview: boolean;
  /** التعديل مسموح على draft/in_review فقط. */
  editable: boolean;
}) {
  const router = useRouter();
  const [busyKey, setBusyKey] = useState<string | null>(null);
  const [drafts, setDrafts] = useState<Record<string, string>>({});
  const [openEditor, setOpenEditor] = useState<Record<string, boolean>>({});
  const [isBulkPending, startBulk] = useTransition();

  const missingItems = content.missing_information.content;
  const assumptionItems = content.assumptions.content;

  const missingPendingIndexes = missingItems
    .map((_, i) => i)
    .filter((i) => isPending(missingDispositions[String(i)]));
  const assumptionPendingIndexes = assumptionItems
    .map((_, i) => i)
    .filter((i) => isPending(assumptionDispositions[String(i)]));
  const missingPending = missingPendingIndexes.length;
  const assumptionPending = assumptionPendingIndexes.length;
  const totalPending = missingPending + assumptionPending;
  const totalItems = missingItems.length + assumptionItems.length;

  if (totalItems === 0) return null;

  function bulkResolve() {
    if (totalPending === 0) return;
    if (totalPending > 5) {
      const ok = window.confirm(`متأكد من اعتماد ${totalPending} عنصر دفعة واحدة؟`);
      if (!ok) return;
    }
    startBulk(async () => {
      const r = await bulkResolveOpenItemsAction({
        documentId,
        projectId,
        missingIndexes: missingPendingIndexes,
        assumptionIndexes: assumptionPendingIndexes,
      });
      if (!r.ok) {
        toast.error(r.message);
        return;
      }
      toast.success(`تم اعتماد ${r.resolvedCount ?? totalPending} عنصر — الافتراضات اتأكّدت والمعلومات الناقصة اتحوّلت لأسئلة اجتماع.`);
      router.refresh();
    });
  }

  function draftKey(kind: "m" | "a", index: number) {
    return `${kind}${index}`;
  }

  async function saveMissing(index: number, state: "resolved" | "ignored" | "converted_to_meeting_question") {
    const key = draftKey("m", index);
    const text = (drafts[key] ?? "").trim();

    if (state === "resolved" && !text) {
      toast.error("اكتب الإجابة أو المعلومة اللي وصلتلك قبل ما تعلّمه محلولًا.");
      return;
    }

    const disposition: MissingInfoDisposition =
      state === "resolved"
        ? { state: "resolved", by: null, at: "", note: text }
        : state === "ignored"
          ? { state: "ignored", by: null, at: "", reason: text || null }
          : { state: "converted_to_meeting_question", by: null, at: "" };

    setBusyKey(key);
    const r = await setMissingInfoDispositionAction({ documentId, projectId, index, disposition });
    setBusyKey(null);
    if (!r.ok) {
      toast.error(r.message ?? "فشل الحفظ.");
      return;
    }
    setOpenEditor((p) => ({ ...p, [key]: false }));
    setDrafts((p) => ({ ...p, [key]: "" }));
    toast.success("اتسجّل القرار — البند اتشال من معوّقات الاعتماد.");
    router.refresh();
  }

  async function saveAssumption(index: number, state: "accepted" | "rejected" | "converted_to_meeting_question") {
    const key = draftKey("a", index);
    const text = (drafts[key] ?? "").trim();

    const disposition: AssumptionDisposition =
      state === "accepted"
        ? { state: "accepted", by: null, at: "" }
        : state === "rejected"
          ? { state: "rejected", by: null, at: "", reason: text || null }
          : { state: "converted_to_meeting_question", by: null, at: "" };

    setBusyKey(key);
    const r = await setAssumptionDispositionAction({ documentId, projectId, index, disposition });
    setBusyKey(null);
    if (!r.ok) {
      toast.error(r.message ?? "فشل الحفظ.");
      return;
    }
    setOpenEditor((p) => ({ ...p, [key]: false }));
    setDrafts((p) => ({ ...p, [key]: "" }));
    toast.success("اتسجّل القرار — البند اتشال من معوّقات الاعتماد.");
    router.refresh();
  }

  return (
    <Card padding="md">
      <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
        <p className="flex items-center gap-2 text-sm font-semibold text-[var(--v-text)]">
          <Clock3 size={16} className="text-[var(--v-amber)]" /> بنود مفتوحة لازم تُحسم قبل الاعتماد
        </p>
        <div className="flex items-center gap-2">
          <Badge tone={totalPending === 0 ? "success" : "warning"}>
            {totalPending === 0 ? "كل البنود محسومة ✓" : `${totalPending} من ${totalItems} لسه معلّقة`}
          </Badge>
          {canReview && editable && totalPending > 0 && (
            <Button variant="success" size="sm" onClick={bulkResolve} loading={isBulkPending} disabled={isBulkPending}>
              <CheckCheck size={13} /> اعتماد الكل ({totalPending})
            </Button>
          )}
        </div>
      </div>

      {!editable && (
        <p className="mb-3 rounded-[var(--v-radius-md)] border border-[var(--v-border)] bg-[var(--v-surface-2)] p-2.5 text-[11px] text-[var(--v-text-muted)]">
          النسخة دي مش مسوّدة — الحسم متاح على المسوّدات فقط.
        </p>
      )}

      <div className="space-y-4">
        {missingItems.length > 0 && (
          <div>
            <p className="mb-2 flex items-center gap-1.5 text-xs font-semibold text-[var(--v-text-secondary)]">
              <HelpCircle size={13} /> معلومات ناقصة ({missingItems.length})
            </p>
            <div className="space-y-2">
              {missingItems.map((item, i) => {
                const key = draftKey("m", i);
                const d = missingDispositions[String(i)];
                const pending = isPending(d);
                const note = savedNote(d);
                const showEditor = openEditor[key] ?? pending;

                return (
                  <div
                    key={i}
                    className={`rounded-[var(--v-radius-md)] border p-3 ${
                      pending ? "border-[var(--v-amber)]/40 bg-[var(--v-amber)]/5" : "border-[var(--v-border)]"
                    }`}
                  >
                    <div className="mb-1 flex flex-wrap items-start justify-between gap-2">
                      <p className="text-xs font-medium text-[var(--v-text)]">{item.info}</p>
                      <Badge tone={TONE[d?.state ?? "pending"] ?? "neutral"}>
                        {MISSING_INFO_LABELS[d?.state ?? "pending"]}
                      </Badge>
                    </div>
                    {item.reason && <p className="text-[11px] text-[var(--v-text-muted)]">السبب: {item.reason}</p>}

                    {note && !showEditor && (
                      <p className="mt-2 rounded-[var(--v-radius-sm)] border-r-2 border-[var(--v-green)] bg-[var(--v-surface-2)] p-2 text-[11px] text-[var(--v-text)]">
                        <span className="font-semibold">إجابتك: </span>
                        {note}
                      </p>
                    )}

                    {canReview && editable && (
                      <>
                        {!showEditor ? (
                          <button
                            type="button"
                            onClick={() => setOpenEditor((p) => ({ ...p, [key]: true }))}
                            className="mt-2 inline-flex items-center gap-1 text-[11px] font-medium text-[var(--v-primary)] hover:underline"
                          >
                            <Pencil size={11} /> تعديل القرار
                          </button>
                        ) : (
                          <div className="mt-2">
                            <textarea
                              value={drafts[key] ?? ""}
                              onChange={(e) => setDrafts((p) => ({ ...p, [key]: e.target.value }))}
                              rows={2}
                              placeholder="اكتب المعلومة اللي وصلتلك من العميل، أو سبب التجاهل…"
                              className="w-full rounded-[var(--v-radius-sm)] border border-[var(--v-border)] bg-[var(--v-bg)] px-2 py-1.5 text-xs text-[var(--v-text)] outline-none focus:border-[var(--v-primary)]"
                            />
                            <div className="mt-1.5 flex flex-wrap gap-1.5">
                              <Button variant="success" size="sm" onClick={() => saveMissing(i, "resolved")} disabled={busyKey === key}>
                                <CheckCircle2 size={12} /> تم حله
                              </Button>
                              <Button variant="ghost" size="sm" onClick={() => saveMissing(i, "converted_to_meeting_question")} disabled={busyKey === key}>
                                <MessageSquarePlus size={12} /> سؤال للاجتماع
                              </Button>
                              <Button variant="ghost" size="sm" onClick={() => saveMissing(i, "ignored")} disabled={busyKey === key}>
                                <XCircle size={12} /> تجاهل
                              </Button>
                            </div>
                          </div>
                        )}
                      </>
                    )}
                  </div>
                );
              })}
            </div>
          </div>
        )}

        {assumptionItems.length > 0 && (
          <div>
            <p className="mb-2 flex items-center gap-1.5 text-xs font-semibold text-[var(--v-text-secondary)]">
              <Lightbulb size={13} /> افتراضات ({assumptionItems.length})
            </p>
            <div className="space-y-2">
              {assumptionItems.map((item, i) => {
                const key = draftKey("a", i);
                const d = assumptionDispositions[String(i)];
                const pending = isPending(d);
                const note = savedNote(d);
                const showEditor = openEditor[key] ?? pending;

                return (
                  <div
                    key={i}
                    className={`rounded-[var(--v-radius-md)] border p-3 ${
                      pending ? "border-[var(--v-amber)]/40 bg-[var(--v-amber)]/5" : "border-[var(--v-border)]"
                    }`}
                  >
                    <div className="mb-1 flex flex-wrap items-start justify-between gap-2">
                      <p className="text-xs font-medium text-[var(--v-text)]">{item.statement}</p>
                      <Badge tone={TONE[d?.state ?? "pending"] ?? "neutral"}>
                        {ASSUMPTION_LABELS[d?.state ?? "pending"]}
                      </Badge>
                    </div>
                    {item.reason && <p className="text-[11px] text-[var(--v-text-muted)]">السبب: {item.reason}</p>}

                    {note && !showEditor && (
                      <p className="mt-2 rounded-[var(--v-radius-sm)] border-r-2 border-[var(--v-red)] bg-[var(--v-surface-2)] p-2 text-[11px] text-[var(--v-text)]">
                        <span className="font-semibold">سبب الرفض: </span>
                        {note}
                      </p>
                    )}

                    {canReview && editable && (
                      <>
                        {!showEditor ? (
                          <button
                            type="button"
                            onClick={() => setOpenEditor((p) => ({ ...p, [key]: true }))}
                            className="mt-2 inline-flex items-center gap-1 text-[11px] font-medium text-[var(--v-primary)] hover:underline"
                          >
                            <Pencil size={11} /> تعديل القرار
                          </button>
                        ) : (
                          <div className="mt-2">
                            <textarea
                              value={drafts[key] ?? ""}
                              onChange={(e) => setDrafts((p) => ({ ...p, [key]: e.target.value }))}
                              rows={2}
                              placeholder="لو هترفض الافتراض، اكتب الصح إيه (اختياري للتأكيد)…"
                              className="w-full rounded-[var(--v-radius-sm)] border border-[var(--v-border)] bg-[var(--v-bg)] px-2 py-1.5 text-xs text-[var(--v-text)] outline-none focus:border-[var(--v-primary)]"
                            />
                            <div className="mt-1.5 flex flex-wrap gap-1.5">
                              <Button variant="success" size="sm" onClick={() => saveAssumption(i, "accepted")} disabled={busyKey === key}>
                                <CheckCircle2 size={12} /> مؤكَّد
                              </Button>
                              <Button variant="ghost" size="sm" onClick={() => saveAssumption(i, "rejected")} disabled={busyKey === key}>
                                <XCircle size={12} /> غير صحيح
                              </Button>
                              <Button variant="ghost" size="sm" onClick={() => saveAssumption(i, "converted_to_meeting_question")} disabled={busyKey === key}>
                                <MessageSquarePlus size={12} /> سؤال للاجتماع
                              </Button>
                            </div>
                          </div>
                        )}
                      </>
                    )}
                  </div>
                );
              })}
            </div>
          </div>
        )}
      </div>
    </Card>
  );
}
