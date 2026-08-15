"use client";

import { useState } from "react";
import Modal from "@/components/ui/Modal";
import Button from "@/components/ui/Button";
import Input from "@/components/ui/Input";
import Select from "@/components/ui/Select";
import Textarea from "@/components/ui/Textarea";
import { toast } from "@/components/ui/Toaster";
import { updateProspectAction } from "./prospect-actions";
import { PRIORITY_LABELS, CONFIDENCE_LABELS } from "./prospect-ui-constants";
import type { ProspectRow, ProspectPriority, ProspectConfidence } from "@/lib/prospecting/types";

export default function EditProspectModal({
  prospect,
  onClose,
  onChanged,
}: {
  prospect: ProspectRow;
  onClose: () => void;
  onChanged: () => void;
}) {
  const [organizationName, setOrganizationName] = useState(prospect.organizationName);
  const [sector, setSector] = useState(prospect.sector ?? "");
  const [governorate, setGovernorate] = useState(prospect.governorate ?? "");
  const [cityOrArea, setCityOrArea] = useState(prospect.cityOrArea ?? "");
  const [primaryPhoneRaw, setPrimaryPhoneRaw] = useState(prospect.primaryPhoneRaw ?? "");
  const [email, setEmail] = useState(prospect.email ?? "");
  const [websiteUrl, setWebsiteUrl] = useState(prospect.websiteUrl ?? "");
  const [visibleSizeEvidence, setVisibleSizeEvidence] = useState(prospect.visibleSizeEvidence ?? "");
  const [painHypothesis, setPainHypothesis] = useState(prospect.painHypothesis ?? "");
  const [suggestedOffer, setSuggestedOffer] = useState(prospect.suggestedOffer ?? "");
  const [priority, setPriority] = useState<ProspectPriority>(prospect.priority);
  const [confidence, setConfidence] = useState<ProspectConfidence>(prospect.confidence);
  const [notes, setNotes] = useState(prospect.notes ?? "");
  const [saving, setSaving] = useState(false);

  async function handleSave() {
    setSaving(true);
    const result = await updateProspectAction(prospect.id, {
      organizationName,
      sector: sector || null,
      governorate: governorate || null,
      cityOrArea: cityOrArea || null,
      primaryPhoneRaw: primaryPhoneRaw || null,
      email: email || null,
      websiteUrl: websiteUrl || null,
      visibleSizeEvidence: visibleSizeEvidence || null,
      painHypothesis: painHypothesis || null,
      suggestedOffer: suggestedOffer || null,
      priority,
      confidence,
      notes: notes || null,
    });
    setSaving(false);
    if (!result.ok) return toast.error(result.message ?? "فشل الحفظ.");
    toast.success("تم حفظ التعديلات.");
    onChanged();
    onClose();
  }

  return (
    <Modal open onClose={onClose} maxWidth="max-w-lg">
      <div className="max-h-[75vh] space-y-3 overflow-y-auto">
        <h3 className="text-base font-semibold text-[var(--v-text)]">تعديل بيانات الجهة</h3>
        <Input label="اسم الجهة *" value={organizationName} onChange={(e) => setOrganizationName(e.target.value)} />
        <div className="grid grid-cols-2 gap-3">
          <Input label="القطاع" value={sector} onChange={(e) => setSector(e.target.value)} />
          <Input label="المحافظة" value={governorate} onChange={(e) => setGovernorate(e.target.value)} />
          <Input label="المدينة/المنطقة" value={cityOrArea} onChange={(e) => setCityOrArea(e.target.value)} />
          <Input label="الهاتف" value={primaryPhoneRaw} onChange={(e) => setPrimaryPhoneRaw(e.target.value)} />
          <Input label="البريد" value={email} onChange={(e) => setEmail(e.target.value)} />
          <Input label="الموقع الإلكتروني" value={websiteUrl} onChange={(e) => setWebsiteUrl(e.target.value)} />
        </div>
        <Textarea label="دليل الحجم والنشاط" rows={2} value={visibleSizeEvidence} onChange={(e) => setVisibleSizeEvidence(e.target.value)} />
        <Textarea label="فرضية المشكلة" rows={2} value={painHypothesis} onChange={(e) => setPainHypothesis(e.target.value)} />
        <Textarea label="العرض المقترح" rows={2} value={suggestedOffer} onChange={(e) => setSuggestedOffer(e.target.value)} />
        <div className="grid grid-cols-2 gap-3">
          <Select label="الأولوية" value={priority} onChange={(e) => setPriority(e.target.value as ProspectPriority)}>
            {(Object.keys(PRIORITY_LABELS) as ProspectPriority[]).map((p) => (
              <option key={p} value={p}>{PRIORITY_LABELS[p]}</option>
            ))}
          </Select>
          <Select label="الثقة" value={confidence} onChange={(e) => setConfidence(e.target.value as ProspectConfidence)}>
            {(Object.keys(CONFIDENCE_LABELS) as ProspectConfidence[]).map((c) => (
              <option key={c} value={c}>{CONFIDENCE_LABELS[c]}</option>
            ))}
          </Select>
        </div>
        <Textarea label="ملاحظات" rows={2} value={notes} onChange={(e) => setNotes(e.target.value)} />
        <div className="flex justify-end gap-2">
          <Button variant="ghost" onClick={onClose}>إلغاء</Button>
          <Button variant="primary" loading={saving} onClick={handleSave}>حفظ</Button>
        </div>
      </div>
    </Modal>
  );
}
