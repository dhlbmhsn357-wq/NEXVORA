"use client";

/**
 * NEXVORA Stage Owners Panel (0107)
 * جدول للمراحل السبع v2 مع owner/reviewer/dueDate/status لكل مرحلة.
 * يبرز الصفوف المتأخّرة ويعرض عدد القرارات/المخاطر المفتوحة المربوطة بكل مرحلة.
 */
import { useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { AlertTriangle } from "lucide-react";
import Card from "@/components/ui/Card";
import Button from "@/components/ui/Button";
import Badge, { type BadgeTone } from "@/components/ui/Badge";
import Input from "@/components/ui/Input";
import Select from "@/components/ui/Select";
import { toast } from "@/components/ui/Toaster";
import {
  STAGE_KEYS, STAGE_KEY_LABELS,
  STAGE_ASSIGNMENT_STATUSES, STAGE_ASSIGNMENT_STATUS_LABELS,
  type StageAssignmentRow, type StageKey, type StageAssignmentStatus,
} from "@/lib/stage-assignments/types";
import { isStageOverdue, summarizeAssignments, getStageProgress } from "@/lib/stage-assignments/derive";
import type { ProductDecisionItemRow } from "@/lib/product-decisions/types";
import { upsertStageAssignmentAction } from "../stage-assignment-actions";

const STATUS_TONE: Record<StageAssignmentStatus, BadgeTone> = {
  not_started: "neutral",
  in_progress: "info",
  blocked: "danger",
  ready_for_review: "warning",
  completed: "success",
};

export interface StageOwnersPanelProps {
  projectId: string;
  assignments: StageAssignmentRow[];
  users: { id: string; name: string }[];
  decisions: ProductDecisionItemRow[];
  canWrite: boolean;
}

export default function StageOwnersPanel({
  projectId, assignments, users, decisions, canWrite,
}: StageOwnersPanelProps) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const nowISO = useMemo(() => new Date().toISOString(), []);
  const byStage = useMemo(() => new Map(assignments.map((a) => [a.stageKey, a])), [assignments]);
  const summary = useMemo(() => summarizeAssignments(assignments, nowISO), [assignments, nowISO]);
  const progress = useMemo(() => getStageProgress(assignments), [assignments]);

  // عدد القرارات/المخاطر المفتوحة لكل مرحلة (بحسب stage_key على العنصر)
  const openByStage = useMemo(() => {
    const m = new Map<string, number>();
    for (const d of decisions) {
      if (!d.stageKey) continue;
      if (d.status === "resolved" || d.status === "rejected" || d.status === "deferred") continue;
      m.set(d.stageKey, (m.get(d.stageKey) ?? 0) + 1);
    }
    return m;
  }, [decisions]);

  function save(stageKey: StageKey, patch: Parameters<typeof upsertStageAssignmentAction>[2]) {
    startTransition(async () => {
      const res = await upsertStageAssignmentAction(projectId, stageKey, patch);
      if (res.ok) { toast.success("تم الحفظ"); router.refresh(); }
      else toast.error(res.message);
    });
  }

  const userName = (id: string | null) => users.find((u) => u.id === id)?.name ?? "—";

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
        <Tile label="التقدّم العام" value={`${progress}%`} tone="info" />
        <Tile label="مُسندة" value={`${summary.assigned}/${STAGE_KEYS.length}`} />
        <Tile label="متأخرة" value={`${summary.overdue}`} tone={summary.overdue > 0 ? "danger" : "neutral"} />
        <Tile label="مكتملة" value={`${summary.byStatus.completed}`} tone="success" />
      </div>

      <Card>
        <div className="mb-3 border-b border-[var(--v-border)] pb-2">
          <h3 className="text-base font-semibold text-[var(--v-text)]">تعيين مسؤولي المراحل السبع (v2)</h3>
          <p className="text-xs text-[var(--v-text-secondary)]">لكل مرحلة: مسؤول + مراجع + موعد نهائي + حالة.</p>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full min-w-[680px] text-sm">
            <thead>
              <tr className="border-b border-[var(--v-border)] text-right text-xs text-[var(--v-text-muted)]">
                <th className="p-2">المرحلة</th>
                <th className="p-2">المسؤول</th>
                <th className="p-2">المراجع</th>
                <th className="p-2">الموعد النهائي</th>
                <th className="p-2">الحالة</th>
                <th className="p-2">فتحات ذات صلة</th>
              </tr>
            </thead>
            <tbody>
              {STAGE_KEYS.map((k) => {
                const row = byStage.get(k);
                const overdue = row ? isStageOverdue(row, nowISO) : false;
                const openCount = openByStage.get(k) ?? 0;
                return (
                  <StageRow
                    key={k}
                    stageKey={k}
                    row={row}
                    users={users}
                    overdue={overdue}
                    openCount={openCount}
                    canWrite={canWrite}
                    userName={userName}
                    onSave={(patch) => save(k, patch)}
                  />
                );
              })}
            </tbody>
          </table>
        </div>
      </Card>
      {pending && <span className="sr-only">جارٍ الحفظ...</span>}
    </div>
  );
}

function StageRow({
  stageKey, row, users, overdue, openCount, canWrite, userName, onSave,
}: {
  stageKey: StageKey;
  row: StageAssignmentRow | undefined;
  users: { id: string; name: string }[];
  overdue: boolean;
  openCount: number;
  canWrite: boolean;
  userName: (id: string | null) => string;
  onSave: (patch: {
    ownerId?: string | null; reviewerId?: string | null;
    dueDate?: string | null; status?: StageAssignmentStatus; notes?: string;
  }) => void;
}) {
  const [ownerId, setOwnerId] = useState(row?.ownerId ?? "");
  const [reviewerId, setReviewerId] = useState(row?.reviewerId ?? "");
  const [dueDate, setDueDate] = useState(row?.dueDate ?? "");
  const [status, setStatus] = useState<StageAssignmentStatus>(row?.status ?? "not_started");

  if (!canWrite) {
    return (
      <tr className={overdue ? "border-b border-[var(--v-red)]/40 bg-[var(--v-red)]/5" : "border-b border-[var(--v-border)]"}>
        <td className="p-2">{STAGE_KEY_LABELS[stageKey]}</td>
        <td className="p-2">{userName(row?.ownerId ?? null)}</td>
        <td className="p-2">{userName(row?.reviewerId ?? null)}</td>
        <td className="p-2">{row?.dueDate ?? "—"} {overdue && <AlertTriangle size={12} className="inline text-[var(--v-red)]" />}</td>
        <td className="p-2"><Badge tone={row ? STATUS_TONE[row.status] : "neutral"}>{row ? STAGE_ASSIGNMENT_STATUS_LABELS[row.status] : "—"}</Badge></td>
        <td className="p-2">{openCount}</td>
      </tr>
    );
  }

  return (
    <tr className={overdue ? "border-b border-[var(--v-red)]/40 bg-[var(--v-red)]/5" : "border-b border-[var(--v-border)]"}>
      <td className="p-2 font-medium text-[var(--v-text)]">{STAGE_KEY_LABELS[stageKey]}</td>
      <td className="p-2">
        <Select value={ownerId} onChange={(e) => setOwnerId(e.target.value)}>
          <option value="">— بلا —</option>
          {users.map((u) => <option key={u.id} value={u.id}>{u.name}</option>)}
        </Select>
      </td>
      <td className="p-2">
        <Select value={reviewerId} onChange={(e) => setReviewerId(e.target.value)}>
          <option value="">— بلا —</option>
          {users.map((u) => <option key={u.id} value={u.id}>{u.name}</option>)}
        </Select>
      </td>
      <td className="p-2">
        <Input type="date" value={dueDate} onChange={(e) => setDueDate(e.target.value)} />
      </td>
      <td className="p-2">
        <Select value={status} onChange={(e) => setStatus(e.target.value as StageAssignmentStatus)}>
          {STAGE_ASSIGNMENT_STATUSES.map((s) => <option key={s} value={s}>{STAGE_ASSIGNMENT_STATUS_LABELS[s]}</option>)}
        </Select>
      </td>
      <td className="p-2 text-center">
        <div className="flex items-center justify-center gap-2">
          <span className={openCount > 0 ? "text-[var(--v-red)] font-semibold" : ""}>{openCount}</span>
          <Button size="sm" variant="ghost" onClick={() => onSave({
            ownerId: ownerId || null, reviewerId: reviewerId || null,
            dueDate: dueDate || null, status,
          })}>حفظ</Button>
        </div>
      </td>
    </tr>
  );
}

function Tile({ label, value, tone }: { label: string; value: string; tone?: BadgeTone }) {
  return (
    <div className="rounded-[var(--v-radius-md)] border border-[var(--v-border)] bg-[var(--v-surface)] p-3">
      <p className="text-[11px] text-[var(--v-text-muted)]">{label}</p>
      <p className="mt-1 font-mono-plex text-lg font-semibold text-[var(--v-text)]">
        {tone ? <Badge tone={tone}>{value}</Badge> : value}
      </p>
    </div>
  );
}
