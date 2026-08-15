"use client";

import { useState } from "react";
import Modal from "@/components/ui/Modal";
import Button from "@/components/ui/Button";
import Select from "@/components/ui/Select";
import Textarea from "@/components/ui/Textarea";
import Input from "@/components/ui/Input";
import { toast } from "@/components/ui/Toaster";
import { recordContactResultAction } from "./prospect-actions";
import { CONTACT_OUTCOME_LABELS, CONTACT_CHANNEL_OPTIONS } from "./prospect-ui-constants";
import type { ProspectRow, ContactOutcome } from "@/lib/prospecting/types";
import type { AssignableProfile } from "./prospects-client";

export default function RecordContactResultModal({
  prospect,
  profiles,
  onClose,
  onChanged,
}: {
  prospect: ProspectRow;
  profiles: AssignableProfile[];
  onClose: () => void;
  onChanged: () => void;
}) {
  const [channel, setChannel] = useState<string>("whatsapp");
  const [outcome, setOutcome] = useState<ContactOutcome>("no_answer");
  const [note, setNote] = useState("");
  const [nextFollowUpAt, setNextFollowUpAt] = useState("");
  const [assigneeId, setAssigneeId] = useState(prospect.assignedTo ?? "");
  const [saving, setSaving] = useState(false);

  async function handleSave() {
    setSaving(true);
    const result = await recordContactResultAction(prospect.id, {
      channel,
      outcome,
      note: note.trim() || undefined,
      nextFollowUpAt: nextFollowUpAt ? new Date(nextFollowUpAt).toISOString() : undefined,
      assigneeId: assigneeId || undefined,
    });
    setSaving(false);
    if (!result.ok) return toast.error(result.message ?? "فشل تسجيل النتيجة.");
    toast.success("تم تسجيل نتيجة التواصل.");
    onChanged();
    onClose();
  }

  return (
    <Modal open onClose={onClose} maxWidth="max-w-lg">
      <div className="max-h-[75vh] space-y-3 overflow-y-auto">
        <h3 className="text-base font-semibold text-[var(--v-text)]">تسجيل نتيجة تواصل — {prospect.organizationName}</h3>

        <Select label="القناة" value={channel} onChange={(e) => setChannel(e.target.value)}>
          {CONTACT_CHANNEL_OPTIONS.map((c) => (
            <option key={c.value} value={c.value}>{c.label}</option>
          ))}
        </Select>

        <Select label="النتيجة" value={outcome} onChange={(e) => setOutcome(e.target.value as ContactOutcome)}>
          {(Object.keys(CONTACT_OUTCOME_LABELS) as ContactOutcome[]).map((o) => (
            <option key={o} value={o}>{CONTACT_OUTCOME_LABELS[o]}</option>
          ))}
        </Select>

        <Textarea label="ملاحظة" rows={3} value={note} onChange={(e) => setNote(e.target.value)} />

        <Input
          type="date"
          label="موعد المتابعة القادمة"
          value={nextFollowUpAt}
          onChange={(e) => setNextFollowUpAt(e.target.value)}
        />

        <Select label="المسؤول عن المتابعة" value={assigneeId} onChange={(e) => setAssigneeId(e.target.value)}>
          <option value="">— بدون تغيير —</option>
          {profiles.map((u) => (
            <option key={u.id} value={u.id}>{u.name}</option>
          ))}
        </Select>

        <div className="flex justify-end gap-2">
          <Button variant="ghost" onClick={onClose}>إلغاء</Button>
          <Button variant="primary" loading={saving} onClick={handleSave}>حفظ</Button>
        </div>
      </div>
    </Modal>
  );
}
