"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { AlertTriangle, CheckCircle2, Plus, Trash2, Users, ListChecks } from "lucide-react";
import Card from "@/components/ui/Card";
import Badge from "@/components/ui/Badge";
import Button from "@/components/ui/Button";
import Input from "@/components/ui/Input";
import { toast } from "@/components/ui/Toaster";
import {
  updateMeetingPrepEssentialsAction,
  addMeetingPrepParticipantAction,
  removeMeetingPrepParticipantAction,
  addMeetingRequiredItemAction,
  toggleMeetingRequiredItemAction,
  removeMeetingRequiredItemAction,
} from "./meeting-prep-essentials-actions";
import { checkPreparationCompleteness } from "@/lib/meeting-prep/completeness";
import type { MeetingPreparationRow } from "@/lib/meeting-prep/types";
import type { MeetingPrepParticipant, MeetingRequiredItem, MeetingRequiredItemType } from "@/lib/types/database";

const ITEM_TYPE_LABEL: Record<MeetingRequiredItemType, string> = { file: "ملف", image: "صورة", document: "مستند", spreadsheet: "جدول بيانات" };

/**
 * "المعلومات الأساسية" لتجهيز الاجتماع — العنوان/النتائج المتوقعة/
 * المشاركين وأدوارهم/العناصر المطلوبة — بديل الحقول الناقصة اللي
 * كانت غير موجودة أصلًا في تجهيز الاجتماع القديم (13 قسم AI بس، من
 * غير عنوان أو مشاركين). البانر تحت بيعكس نفس البوابة اللي بتمنع
 * Start Meeting فعليًا (lib/meeting-prep/completeness.ts).
 */
export default function MeetingPrepEssentialsPanel({
  projectId,
  prep,
  participants,
  requiredItems,
  isAdmin,
}: {
  projectId: string;
  prep: MeetingPreparationRow;
  participants: MeetingPrepParticipant[];
  requiredItems: MeetingRequiredItem[];
  isAdmin: boolean;
}) {
  const router = useRouter();
  const [, startAction] = useTransition();
  const [title, setTitle] = useState(prep.title ?? "");
  const [outcomes, setOutcomes] = useState(prep.expected_outcomes.join("\n"));
  const [participantName, setParticipantName] = useState("");
  const [participantRole, setParticipantRole] = useState("");
  const [participantIsClient, setParticipantIsClient] = useState(true);
  const [itemTitle, setItemTitle] = useState("");
  const [itemType, setItemType] = useState<MeetingRequiredItemType>("document");

  const completeness = checkPreparationCompleteness(prep, participants, requiredItems);

  function saveEssentials() {
    startAction(async () => {
      const result = await updateMeetingPrepEssentialsAction(
        prep.id,
        projectId,
        title,
        outcomes.split("\n").map((o) => o.trim()).filter(Boolean)
      );
      if (!result.ok) toast.error(result.message);
      else {
        toast.success("تم الحفظ.");
        router.refresh();
      }
    });
  }

  function addParticipant() {
    if (!participantName.trim()) return;
    startAction(async () => {
      const result = await addMeetingPrepParticipantAction(prep.id, projectId, participantName, participantRole, participantIsClient, true);
      if (!result.ok) toast.error(result.message);
      else {
        setParticipantName("");
        setParticipantRole("");
        router.refresh();
      }
    });
  }

  function addRequiredItem() {
    if (!itemTitle.trim()) return;
    startAction(async () => {
      const result = await addMeetingRequiredItemAction(prep.id, projectId, itemType, itemTitle, "");
      if (!result.ok) toast.error(result.message);
      else {
        setItemTitle("");
        router.refresh();
      }
    });
  }

  return (
    <div className="space-y-4">
      <Card padding="md" className={completeness.complete ? "border-[var(--v-success)]/40" : "border-[var(--v-warning)]/40"}>
        <div className="flex items-start gap-2">
          {completeness.complete ? (
            <CheckCircle2 size={18} className="mt-0.5 shrink-0 text-[var(--v-success)]" />
          ) : (
            <AlertTriangle size={18} className="mt-0.5 shrink-0 text-[var(--v-warning)]" />
          )}
          <div>
            <p className="text-sm font-semibold text-[var(--v-text)]">
              {completeness.complete ? "التجهيز مكتمل — يمكن بدء الاجتماع" : "التجهيز غير مكتمل"}
            </p>
            {!completeness.complete && (
              <ul className="mt-1 list-inside list-disc text-xs text-[var(--v-text-secondary)]">
                {completeness.missingReasons.map((r) => (
                  <li key={r}>{r}</li>
                ))}
              </ul>
            )}
          </div>
        </div>
      </Card>

      <Card padding="md">
        <p className="mb-3 text-sm font-semibold text-[var(--v-text)]">معلومات أساسية</p>
        <div className="space-y-3">
          <div>
            <label className="mb-1 block text-[11px] text-[var(--v-text-muted)]">عنوان الاجتماع</label>
            <Input value={title} onChange={(e) => setTitle(e.target.value)} placeholder="مثال: اجتماع اكتشاف — المرحلة الأولى" />
          </div>
          <div>
            <label className="mb-1 block text-[11px] text-[var(--v-text-muted)]">النتائج المتوقعة (سطر لكل نتيجة)</label>
            <textarea
              value={outcomes}
              onChange={(e) => setOutcomes(e.target.value)}
              rows={3}
              className="w-full rounded-[var(--v-radius-md)] border border-[var(--v-border)] bg-[var(--v-bg-soft)] p-2.5 text-sm text-[var(--v-text)] focus:border-[var(--v-primary)] focus:outline-none"
            />
          </div>
          {isAdmin && (
            <Button variant="primary" size="sm" onClick={saveEssentials}>
              حفظ
            </Button>
          )}
        </div>
      </Card>

      <Card padding="md">
        <p className="mb-3 flex items-center gap-2 text-sm font-semibold text-[var(--v-text)]">
          <Users size={16} className="text-[var(--v-primary)]" /> المشاركون
        </p>
        <div className="space-y-2">
          {participants.map((p) => (
            <div key={p.id} className="flex items-center justify-between gap-2 rounded-[var(--v-radius-md)] border border-[var(--v-border)] p-2.5">
              <div>
                <span className="text-sm text-[var(--v-text)]">{p.full_name}</span>
                {p.role && <span className="ms-2 text-xs text-[var(--v-text-muted)]">({p.role})</span>}
                {p.is_client && <Badge tone="info">عميل</Badge>}
              </div>
              {isAdmin && (
                <button
                  type="button"
                  onClick={() => startAction(async () => { await removeMeetingPrepParticipantAction(p.id, projectId); router.refresh(); })}
                  className="text-[var(--v-text-muted)] hover:text-[var(--v-danger)]"
                >
                  <Trash2 size={14} />
                </button>
              )}
            </div>
          ))}
        </div>
        {isAdmin && (
          <div className="mt-3 flex flex-wrap items-end gap-2">
            <Input value={participantName} onChange={(e) => setParticipantName(e.target.value)} placeholder="الاسم" className="flex-1 min-w-[120px]" />
            <Input value={participantRole} onChange={(e) => setParticipantRole(e.target.value)} placeholder="الدور" className="flex-1 min-w-[100px]" />
            <label className="flex items-center gap-1 text-xs text-[var(--v-text-secondary)]">
              <input type="checkbox" checked={participantIsClient} onChange={(e) => setParticipantIsClient(e.target.checked)} /> عميل
            </label>
            <Button variant="outline" size="sm" onClick={addParticipant} icon={<Plus size={13} />}>
              إضافة
            </Button>
          </div>
        )}
      </Card>

      <Card padding="md">
        <p className="mb-3 flex items-center gap-2 text-sm font-semibold text-[var(--v-text)]">
          <ListChecks size={16} className="text-[var(--v-primary)]" /> العناصر المطلوبة قبل الاجتماع
        </p>
        <div className="space-y-2">
          {requiredItems.map((item) => (
            <div key={item.id} className="flex items-center justify-between gap-2 rounded-[var(--v-radius-md)] border border-[var(--v-border)] p-2.5">
              <div className="flex items-center gap-2">
                <input
                  type="checkbox"
                  checked={item.is_provided}
                  onChange={(e) => startAction(async () => { await toggleMeetingRequiredItemAction(item.id, projectId, e.target.checked); router.refresh(); })}
                />
                <span className="text-sm text-[var(--v-text)]">{item.title}</span>
                <Badge tone="neutral">{ITEM_TYPE_LABEL[item.item_type]}</Badge>
              </div>
              {isAdmin && (
                <button
                  type="button"
                  onClick={() => startAction(async () => { await removeMeetingRequiredItemAction(item.id, projectId); router.refresh(); })}
                  className="text-[var(--v-text-muted)] hover:text-[var(--v-danger)]"
                >
                  <Trash2 size={14} />
                </button>
              )}
            </div>
          ))}
        </div>
        {isAdmin && (
          <div className="mt-3 flex flex-wrap items-end gap-2">
            <Input value={itemTitle} onChange={(e) => setItemTitle(e.target.value)} placeholder="عنوان العنصر المطلوب" className="flex-1 min-w-[160px]" />
            <select
              value={itemType}
              onChange={(e) => setItemType(e.target.value as MeetingRequiredItemType)}
              className="rounded-[var(--v-radius-md)] border border-[var(--v-border)] bg-[var(--v-bg-soft)] px-2 py-2 text-sm text-[var(--v-text)]"
            >
              {(Object.keys(ITEM_TYPE_LABEL) as MeetingRequiredItemType[]).map((t) => (
                <option key={t} value={t}>{ITEM_TYPE_LABEL[t]}</option>
              ))}
            </select>
            <Button variant="outline" size="sm" onClick={addRequiredItem} icon={<Plus size={13} />}>
              إضافة
            </Button>
          </div>
        )}
      </Card>
    </div>
  );
}
