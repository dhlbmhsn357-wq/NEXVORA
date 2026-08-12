"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { GitPullRequestArrow, Check, X, GitMerge, CheckCheck } from "lucide-react";
import Card from "@/components/ui/Card";
import Badge, { type BadgeTone } from "@/components/ui/Badge";
import Button from "@/components/ui/Button";
import EmptyState from "@/components/ui/EmptyState";
import { toast } from "@/components/ui/Toaster";
import { acceptBrainPendingChange, rejectBrainPendingChange, mergeBrainPendingChange, bulkAcceptBrainPendingChanges } from "./brain-v2-actions";
import { KNOWLEDGE_SOURCE_LABELS } from "@/lib/brain-v2/knowledge-sources";
import { BRAIN_SECTION_LABELS, type BrainSectionKey } from "@/lib/brain-v2/types";
import { DOWNSTREAM_OF_BRAIN, SYNC_ARTIFACT_LABELS } from "@/lib/knowledge-sync/graph";
import type { BrainPendingChange } from "@/lib/types/database";

function confidenceTone(score: number): BadgeTone {
  if (score >= 85) return "success";
  if (score >= 60) return "info";
  return "warning";
}

function primaryText(value: unknown): string {
  if (typeof value !== "object" || value === null) return String(value ?? "—");
  const rec = value as Record<string, unknown>;
  const candidate = rec.statement ?? rec.rule ?? rec.constraint ?? rec.fact ?? rec.risk ?? rec.title ?? rec.goal ?? rec.question ?? rec.name;
  return typeof candidate === "string" ? candidate : JSON.stringify(value);
}

/**
 * Conflict Center — كل تغيير معلّق من أي مصدر (اجتماع/ملاحظة يدوية/
 * Prototype Review/دعم) بانتظار قرار PM صريح: Accept/Reject/Merge.
 * ممنوع أي تحديث صامت — راجع lib/brain-v2/pending-changes-service.ts.
 */
export default function PendingChangesPanel({
  projectId,
  pendingChanges,
  canManage,
}: {
  projectId: string;
  pendingChanges: BrainPendingChange[];
  canManage: boolean;
}) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [mergingId, setMergingId] = useState<string | null>(null);
  const [mergeText, setMergeText] = useState("");

  function accept(id: string) {
    startTransition(async () => {
      const r = await acceptBrainPendingChange(projectId, id);
      if (!r.ok) toast.error(r.message);
      else toast.success("تم اعتماد التغيير في Project Brain");
      router.refresh();
    });
  }

  function reject(id: string) {
    startTransition(async () => {
      const r = await rejectBrainPendingChange(projectId, id);
      if (!r.ok) toast.error(r.message);
      router.refresh();
    });
  }

  function bulkAccept() {
    if (pendingChanges.length === 0) return;
    if (pendingChanges.length > 5) {
      const ok = window.confirm(`متأكد من اعتماد ${pendingChanges.length} عنصر دفعة واحدة؟`);
      if (!ok) return;
    }
    startTransition(async () => {
      const ids = pendingChanges.map((c) => c.id);
      const r = await bulkAcceptBrainPendingChanges(projectId, ids);
      if (!r.ok) {
        toast.error(r.message);
        return;
      }
      toast.success(
        r.failedCount && r.failedCount > 0
          ? `تم اعتماد ${r.acceptedCount} عنصر (وفشل ${r.failedCount}).`
          : `تم اعتماد ${r.acceptedCount} عنصر`
      );
      router.refresh();
    });
  }

  function openMerge(change: BrainPendingChange) {
    setMergingId(change.id);
    setMergeText(JSON.stringify(change.new_value, null, 2));
  }

  function submitMerge(id: string) {
    startTransition(async () => {
      const r = await mergeBrainPendingChange(projectId, id, mergeText);
      if (!r.ok) {
        toast.error(r.message);
        return;
      }
      toast.success("تم دمج التغيير المعدَّل في Project Brain");
      setMergingId(null);
      router.refresh();
    });
  }

  if (pendingChanges.length === 0) {
    return (
      <Card padding="md">
        <p className="mb-2 flex items-center gap-2 text-sm font-semibold text-[var(--v-text)]">
          <GitPullRequestArrow size={16} className="text-[var(--v-primary)]" /> المعرفة المعلّقة (Conflict Center)
        </p>
        <EmptyState title="لا توجد تغييرات معلّقة" description="أي معرفة جديدة من اجتماعات/ملاحظات/Prototype Review/الدعم هتظهر هنا بانتظار اعتمادك." />
      </Card>
    );
  }

  return (
    <Card padding="md">
      <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
        <p className="flex items-center gap-2 text-sm font-semibold text-[var(--v-text)]">
          <GitPullRequestArrow size={16} className="text-[var(--v-primary)]" /> المعرفة المعلّقة ({pendingChanges.length})
        </p>
        {canManage && (
          <Button variant="success" size="sm" onClick={bulkAccept} loading={isPending} disabled={isPending}>
            <CheckCheck size={13} /> اعتماد الكل ({pendingChanges.length})
          </Button>
        )}
      </div>
      <p className="mb-3 text-[11px] text-[var(--v-text-muted)]">
        Impact Report — أي اعتماد هنا هيحدّث Project Brain، وبعده هيتم تحديث تلقائي (لو مفعّل) لـ:{" "}
        {DOWNSTREAM_OF_BRAIN.map((k) => SYNC_ARTIFACT_LABELS[k]).join("، ")}.
      </p>
      <div className="space-y-3">
        {pendingChanges.map((change) => (
          <div key={change.id} className="rounded-[var(--v-radius-md)] border border-[var(--v-border)] p-3">
            <div className="flex flex-wrap items-center gap-2">
              <Badge tone="primary">{BRAIN_SECTION_LABELS[change.section_key as BrainSectionKey] ?? change.section_key}</Badge>
              <Badge tone="neutral">{KNOWLEDGE_SOURCE_LABELS[change.source_type]}</Badge>
              <Badge tone={confidenceTone(change.confidence_score)}>ثقة {change.confidence_score}%</Badge>
              {change.conflict && <Badge tone="danger">تعارض مع معلومة موجودة</Badge>}
            </div>

            {change.conflict ? (
              <div className="mt-2 grid gap-2 sm:grid-cols-2">
                <div className="rounded-[var(--v-radius-sm)] bg-[var(--v-red)]/5 p-2">
                  <p className="text-[10px] font-semibold text-[var(--v-red)]">القيمة القديمة</p>
                  <p className="mt-0.5 text-xs text-[var(--v-text)]">{primaryText(change.old_value)}</p>
                </div>
                <div className="rounded-[var(--v-radius-sm)] bg-[var(--v-green)]/5 p-2">
                  <p className="text-[10px] font-semibold text-[var(--v-green)]">القيمة الجديدة المقترحة</p>
                  <p className="mt-0.5 text-xs text-[var(--v-text)]">{primaryText(change.new_value)}</p>
                </div>
              </div>
            ) : (
              <p className="mt-2 text-sm text-[var(--v-text)]">{primaryText(change.new_value)}</p>
            )}

            {change.rationale && <p className="mt-1.5 text-[11px] text-[var(--v-text-muted)]">{change.rationale}</p>}

            {canManage && (
              <div className="mt-2.5 flex flex-wrap gap-1.5">
                <Button variant="success" size="sm" onClick={() => accept(change.id)} disabled={isPending}>
                  <Check size={13} /> اعتماد
                </Button>
                {change.conflict && (
                  <Button variant="outline" size="sm" onClick={() => openMerge(change)} disabled={isPending}>
                    <GitMerge size={13} /> دمج بتعديل
                  </Button>
                )}
                <Button variant="danger" size="sm" onClick={() => reject(change.id)} disabled={isPending}>
                  <X size={13} /> رفض
                </Button>
              </div>
            )}

            {mergingId === change.id && (
              <div className="mt-2.5 rounded-[var(--v-radius-md)] border border-[var(--v-border)] bg-[var(--v-surface)] p-2.5">
                <p className="mb-1.5 text-[11px] text-[var(--v-text-muted)]">عدّل القيمة (صيغة JSON) قبل الاعتماد:</p>
                <textarea
                  value={mergeText}
                  onChange={(e) => setMergeText(e.target.value)}
                  rows={5}
                  className="w-full rounded-[var(--v-radius-sm)] border border-[var(--v-border)] bg-[var(--v-bg)] px-2 py-1.5 font-mono-plex text-[11px] text-[var(--v-text)] outline-none focus:border-[var(--v-primary)]"
                />
                <div className="mt-1.5 flex justify-end gap-1.5">
                  <Button variant="ghost" size="sm" onClick={() => setMergingId(null)}>
                    إلغاء
                  </Button>
                  <Button variant="primary" size="sm" onClick={() => submitMerge(change.id)} disabled={isPending}>
                    حفظ ودمج
                  </Button>
                </div>
              </div>
            )}
          </div>
        ))}
      </div>
    </Card>
  );
}
