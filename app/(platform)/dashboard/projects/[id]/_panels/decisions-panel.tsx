"use client";

/**
 * NEXVORA Product Decisions Register — Panel (0107)
 * 4 أعمدة (Assumptions / Risks / Open Questions / Decisions) + فلاتر
 * حالة/أولوية + Modal إضافة/تعديل + ربط بمتطلب/قصّة + مؤشّر overdue.
 */
import { useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Plus, AlertTriangle, Link as LinkIcon } from "lucide-react";
import Button from "@/components/ui/Button";
import Card from "@/components/ui/Card";
import Badge, { type BadgeTone } from "@/components/ui/Badge";
import Modal from "@/components/ui/Modal";
import Input from "@/components/ui/Input";
import Textarea from "@/components/ui/Textarea";
import Select from "@/components/ui/Select";
import EmptyState from "@/components/ui/EmptyState";
import { toast } from "@/components/ui/Toaster";
import {
  ITEM_TYPES, ITEM_TYPE_LABELS, ITEM_STATUSES, ITEM_STATUS_LABELS,
  ITEM_PRIORITIES, ITEM_PRIORITY_LABELS,
  type ProductDecisionItemRow, type ItemType, type ItemStatus, type ItemPriority,
} from "@/lib/product-decisions/types";
import { isOverdue, filterByType, countOpen } from "@/lib/product-decisions/derive";
import type { RequirementRow } from "@/lib/product-definition/types";
import type { UserStoryRow } from "@/lib/user-stories/types";
import {
  createDecisionItemAction, updateDecisionItemAction, deleteDecisionItemAction,
  setDecisionStatusAction,
} from "../decisions-actions";

const STATUS_TONE: Record<ItemStatus, BadgeTone> = {
  open: "warning", in_review: "info", confirmed: "success",
  resolved: "success", rejected: "neutral", deferred: "neutral",
};
const PRIORITY_TONE: Record<ItemPriority, BadgeTone> = {
  low: "neutral", medium: "info", high: "warning", critical: "danger",
};
const TYPE_LABELS: Record<ItemType, string> = ITEM_TYPE_LABELS;
const COLUMN_ORDER: readonly ItemType[] = ["assumption", "risk", "open_question", "decision"];

export interface DecisionsPanelProps {
  projectId: string;
  items: ProductDecisionItemRow[];
  requirements: RequirementRow[];
  stories: UserStoryRow[];
  evidenceCounts: Record<string, number>; // item.id → count
  canWrite: boolean;
}

export default function DecisionsPanel({
  projectId, items, requirements, stories, evidenceCounts, canWrite,
}: DecisionsPanelProps) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [statusFilter, setStatusFilter] = useState<"" | ItemStatus>("");
  const [priorityFilter, setPriorityFilter] = useState<"" | ItemPriority>("");
  const [editing, setEditing] = useState<ProductDecisionItemRow | null>(null);
  const [creatingType, setCreatingType] = useState<ItemType | null>(null);
  const nowISO = useMemo(() => new Date().toISOString(), []);

  const filtered = useMemo(() => items.filter((r) => {
    if (statusFilter && r.status !== statusFilter) return false;
    if (priorityFilter && r.priority !== priorityFilter) return false;
    return true;
  }), [items, statusFilter, priorityFilter]);

  function run(fn: () => Promise<{ ok: true } | { ok: false; message: string }>, okMsg: string) {
    startTransition(async () => {
      const res = await fn();
      if (res.ok) { toast.success(okMsg); router.refresh(); }
      else toast.error(res.message);
    });
  }

  return (
    <div className="space-y-6">
      {/* عدّادات سريعة */}
      <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
        {COLUMN_ORDER.map((t) => {
          const rows = filterByType(items, t);
          return (
            <div key={t} className="rounded-[var(--v-radius-md)] border border-[var(--v-border)] bg-[var(--v-surface)] p-3">
              <p className="text-[11px] text-[var(--v-text-muted)]">{TYPE_LABELS[t]}</p>
              <p className="mt-1 font-mono-plex text-lg font-semibold text-[var(--v-text)]">
                {rows.length}
                <span className="mr-1 text-xs text-[var(--v-text-secondary)]">
                  ({countOpen(rows)} مفتوح)
                </span>
              </p>
            </div>
          );
        })}
      </div>

      {/* فلاتر */}
      <Card>
        <div className="flex flex-wrap items-center gap-2">
          <span className="text-xs text-[var(--v-text-muted)]">تصفية:</span>
          <Select value={statusFilter} onChange={(e) => setStatusFilter(e.target.value as ItemStatus | "")}>
            <option value="">كل الحالات</option>
            {ITEM_STATUSES.map((s) => <option key={s} value={s}>{ITEM_STATUS_LABELS[s]}</option>)}
          </Select>
          <Select value={priorityFilter} onChange={(e) => setPriorityFilter(e.target.value as ItemPriority | "")}>
            <option value="">كل الأولويات</option>
            {ITEM_PRIORITIES.map((p) => <option key={p} value={p}>{ITEM_PRIORITY_LABELS[p]}</option>)}
          </Select>
        </div>
      </Card>

      {/* 4 أعمدة */}
      <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-4">
        {COLUMN_ORDER.map((t) => {
          const rows = filterByType(filtered, t);
          return (
            <Card key={t}>
              <div className="mb-3 flex items-center justify-between gap-2 border-b border-[var(--v-border)] pb-2">
                <h3 className="text-sm font-semibold text-[var(--v-text)]">
                  {TYPE_LABELS[t]} <span className="text-xs text-[var(--v-text-muted)]">({rows.length})</span>
                </h3>
                {canWrite && (
                  <Button size="sm" variant="ghost" icon={<Plus size={12} />} onClick={() => setCreatingType(t)}>إضافة</Button>
                )}
              </div>
              {rows.length === 0 ? (
                <EmptyState title="—" description="لا عناصر بعد" />
              ) : (
                <ul className="space-y-2">
                  {rows.map((r) => {
                    const overdue = isOverdue(r, nowISO);
                    const evCount = evidenceCounts[r.id] ?? 0;
                    return (
                      <li key={r.id}
                          className={`rounded-[var(--v-radius-md)] border p-2 ${overdue ? "border-[var(--v-red)]" : "border-[var(--v-border)]"} bg-[var(--v-bg)]`}>
                        <div className="flex flex-wrap items-center gap-1">
                          <p className="flex-1 text-sm font-medium text-[var(--v-text)]">{r.title}</p>
                          <Badge tone={STATUS_TONE[r.status]}>{ITEM_STATUS_LABELS[r.status]}</Badge>
                          <Badge tone={PRIORITY_TONE[r.priority]}>{ITEM_PRIORITY_LABELS[r.priority]}</Badge>
                          {overdue && (
                            <span title="متأخر" className="inline-flex items-center text-[var(--v-red)]">
                              <AlertTriangle size={12} />
                            </span>
                          )}
                        </div>
                        {r.description && <p className="mt-1 text-[11px] text-[var(--v-text-secondary)]">{r.description}</p>}
                        {r.dueDate && <p className="text-[11px] text-[var(--v-text-muted)]">موعد نهائي: {r.dueDate}</p>}
                        {(r.linkedRequirementId || r.linkedStoryId) && (
                          <p className="mt-1 inline-flex items-center gap-1 text-[11px] text-[var(--v-primary)]">
                            <LinkIcon size={10} />
                            {r.linkedRequirementId && <span>متطلب</span>}
                            {r.linkedStoryId && <span>قصّة</span>}
                          </p>
                        )}
                        <p className="text-[10px] text-[var(--v-text-muted)]">أدلة: {evCount}</p>
                        {canWrite && (
                          <div className="mt-1 flex flex-wrap gap-1">
                            <Button size="sm" variant="ghost" onClick={() => setEditing(r)}>تعديل</Button>
                            {r.status !== "resolved" && (
                              <Button size="sm" variant="ghost"
                                onClick={() => run(() => setDecisionStatusAction(projectId, r.id, "resolved"), "تم الإغلاق")}>إغلاق</Button>
                            )}
                            <Button size="sm" variant="ghost"
                              onClick={() => { if (!confirm("حذف؟")) return; run(() => deleteDecisionItemAction(projectId, r.id), "تم الحذف"); }}>حذف</Button>
                          </div>
                        )}
                      </li>
                    );
                  })}
                </ul>
              )}
            </Card>
          );
        })}
      </div>

      <ItemDialog
        open={editing !== null || creatingType !== null}
        onClose={() => { setEditing(null); setCreatingType(null); }}
        initial={editing ?? undefined}
        defaultType={creatingType ?? undefined}
        requirements={requirements}
        stories={stories}
        onSave={(input) => {
          if (editing) {
            run(() => updateDecisionItemAction(projectId, editing.id, input), "تم التحديث");
          } else {
            run(() => createDecisionItemAction(projectId, input).then((r) => r.ok ? { ok: true } : r), "تم الإنشاء");
          }
          setEditing(null); setCreatingType(null);
        }}
      />
      {pending && <span className="sr-only">جارٍ الحفظ...</span>}
    </div>
  );
}

function ItemDialog({
  open, onClose, initial, defaultType, requirements, stories, onSave,
}: {
  open: boolean; onClose: () => void;
  initial?: ProductDecisionItemRow; defaultType?: ItemType;
  requirements: RequirementRow[]; stories: UserStoryRow[];
  onSave: (input: {
    itemType: ItemType; title: string; description: string;
    status: ItemStatus; priority: ItemPriority;
    dueDate: string | null; impact: string; mitigation: string;
    resolution: string; decisionDate: string | null;
    linkedRequirementId: string | null; linkedStoryId: string | null;
  }) => void;
}) {
  const [itemType, setItemType] = useState<ItemType>(initial?.itemType ?? defaultType ?? "assumption");
  const [title, setTitle] = useState(initial?.title ?? "");
  const [description, setDescription] = useState(initial?.description ?? "");
  const [status, setStatus] = useState<ItemStatus>(initial?.status ?? "open");
  const [priority, setPriority] = useState<ItemPriority>(initial?.priority ?? "medium");
  const [dueDate, setDueDate] = useState(initial?.dueDate ?? "");
  const [impact, setImpact] = useState(initial?.impact ?? "");
  const [mitigation, setMitigation] = useState(initial?.mitigation ?? "");
  const [resolution, setResolution] = useState(initial?.resolution ?? "");
  const [decisionDate, setDecisionDate] = useState(initial?.decisionDate ?? "");
  const [linkedRequirementId, setLinkedRequirementId] = useState(initial?.linkedRequirementId ?? "");
  const [linkedStoryId, setLinkedStoryId] = useState(initial?.linkedStoryId ?? "");

  return (
    <Modal open={open} onClose={onClose} maxWidth="max-w-2xl">
      <div className="space-y-4 p-6">
        <h2 className="text-lg font-semibold text-[var(--v-text)]">{initial ? "تعديل" : "إضافة"} عنصر</h2>
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <Field label="النوع">
            <Select value={itemType} onChange={(e) => setItemType(e.target.value as ItemType)}>
              {ITEM_TYPES.map((t) => <option key={t} value={t}>{ITEM_TYPE_LABELS[t]}</option>)}
            </Select>
          </Field>
          <Field label="العنوان *"><Input value={title} onChange={(e) => setTitle(e.target.value)} /></Field>
          <Field label="الوصف" span={2}><Textarea rows={2} value={description} onChange={(e) => setDescription(e.target.value)} /></Field>
          <Field label="الحالة">
            <Select value={status} onChange={(e) => setStatus(e.target.value as ItemStatus)}>
              {ITEM_STATUSES.map((s) => <option key={s} value={s}>{ITEM_STATUS_LABELS[s]}</option>)}
            </Select>
          </Field>
          <Field label="الأولوية">
            <Select value={priority} onChange={(e) => setPriority(e.target.value as ItemPriority)}>
              {ITEM_PRIORITIES.map((p) => <option key={p} value={p}>{ITEM_PRIORITY_LABELS[p]}</option>)}
            </Select>
          </Field>
          <Field label="الموعد النهائي"><Input type="date" value={dueDate} onChange={(e) => setDueDate(e.target.value)} /></Field>
          {itemType === "decision" && (
            <Field label="تاريخ القرار"><Input type="date" value={decisionDate} onChange={(e) => setDecisionDate(e.target.value)} /></Field>
          )}
          <Field label="الأثر" span={2}><Textarea rows={2} value={impact} onChange={(e) => setImpact(e.target.value)} /></Field>
          {itemType === "risk" && (
            <Field label="التخفيف" span={2}><Textarea rows={2} value={mitigation} onChange={(e) => setMitigation(e.target.value)} /></Field>
          )}
          {(itemType === "open_question" || itemType === "decision") && (
            <Field label="الحلّ/القرار" span={2}><Textarea rows={2} value={resolution} onChange={(e) => setResolution(e.target.value)} /></Field>
          )}
          <Field label="ربط بمتطلب">
            <Select value={linkedRequirementId} onChange={(e) => setLinkedRequirementId(e.target.value)}>
              <option value="">— بلا —</option>
              {requirements.map((r) => <option key={r.id} value={r.id}>{r.title}</option>)}
            </Select>
          </Field>
          <Field label="ربط بقصّة">
            <Select value={linkedStoryId} onChange={(e) => setLinkedStoryId(e.target.value)}>
              <option value="">— بلا —</option>
              {stories.map((s) => <option key={s.id} value={s.id}>{s.title}</option>)}
            </Select>
          </Field>
        </div>
        <div className="flex justify-end gap-2">
          <Button variant="ghost" onClick={onClose}>إلغاء</Button>
          <Button variant="primary" onClick={() => {
            if (!title.trim()) { toast.error("العنوان مطلوب"); return; }
            onSave({
              itemType, title: title.trim(), description, status, priority,
              dueDate: dueDate || null, impact, mitigation, resolution,
              decisionDate: decisionDate || null,
              linkedRequirementId: linkedRequirementId || null,
              linkedStoryId: linkedStoryId || null,
            });
          }}>حفظ</Button>
        </div>
      </div>
    </Modal>
  );
}

function Field({ label, span = 1, children }: { label: string; span?: 1 | 2; children: React.ReactNode }) {
  return (
    <div className={span === 2 ? "sm:col-span-2" : ""}>
      <label className="mb-1 block text-xs text-[var(--v-text-secondary)]">{label}</label>{children}
    </div>
  );
}
