"use client";

import { useEffect, useMemo, useState } from "react";
import Modal from "@/components/ui/Modal";
import Button from "@/components/ui/Button";
import Select from "@/components/ui/Select";
import Textarea from "@/components/ui/Textarea";
import { toast } from "@/components/ui/Toaster";
import { renderTemplate, buildWhatsAppLink, DEFAULT_PAIN_HYPOTHESIS_FALLBACK } from "@/lib/prospecting/whatsapp";
import { listMessageTemplatesAction, recordWhatsappOpenedAction, confirmMessageSentAction } from "./prospect-actions";
import type { ProspectRow, ProspectMessageTemplateRow, ProspectTemplateType } from "@/lib/prospecting/types";

const TEMPLATE_TYPE_LABELS: Record<ProspectTemplateType, string> = {
  first_contact: "أول تواصل",
  no_reply_follow_up: "متابعة عدم الرد",
  meeting_booking: "حجز اجتماع",
};

export default function WhatsAppSendModal({
  prospect,
  onClose,
  onChanged,
}: {
  prospect: ProspectRow;
  onClose: () => void;
  onChanged: () => void;
}) {
  const [templates, setTemplates] = useState<ProspectMessageTemplateRow[]>([]);
  const [templateType, setTemplateType] = useState<ProspectTemplateType>("first_contact");
  const [message, setMessage] = useState("");
  const [opened, setOpened] = useState(false);
  const [showConfirmPrompt, setShowConfirmPrompt] = useState(false);
  const [confirming, setConfirming] = useState(false);

  const phone = prospect.primaryPhoneNormalized;

  useEffect(() => {
    let alive = true;
    listMessageTemplatesAction().then((r) => {
      if (!alive) return;
      if (r.ok) setTemplates(r.data);
    });
    return () => {
      alive = false;
    };
  }, []);

  const selectedTemplate = useMemo(
    () => templates.find((t) => t.templateType === templateType && t.isDefault) ?? templates.find((t) => t.templateType === templateType),
    [templates, templateType]
  );

  useEffect(() => {
    if (!selectedTemplate) return;
    const rendered = renderTemplate(selectedTemplate.body, {
      organization_name: prospect.organizationName,
      pain_hypothesis: prospect.painHypothesis?.trim() || DEFAULT_PAIN_HYPOTHESIS_FALLBACK,
      sender_name: "فريق NEXVORA",
      meeting_datetime: "",
    });
    // eslint-disable-next-line react-hooks/set-state-in-effect -- تهيئة نص افتراضي قابل للتعديل عند تغيير القالب المختار.
    setMessage(rendered);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedTemplate]);

  function handleOpenWhatsApp() {
    if (!phone) return;
    const link = buildWhatsAppLink(phone, message);
    window.open(link, "_blank");
    setOpened(true);
    setShowConfirmPrompt(true);
    // إطلاق فوري بدون انتظار — لا توجد طريقة موثوقة لكشف عودة التركيز.
    recordWhatsappOpenedAction(prospect.id);
  }

  async function handleConfirmSent() {
    setConfirming(true);
    const result = await confirmMessageSentAction(prospect.id);
    setConfirming(false);
    if (!result.ok) return toast.error(result.message ?? "فشل تسجيل التأكيد.");
    toast.success("تم تسجيل الإرسال.");
    onChanged();
    onClose();
  }

  if (!phone) {
    return (
      <Modal open onClose={onClose}>
        <p className="text-sm text-[var(--v-text)]">لا يمكن فتح واتساب لأن الرقم غير صالح.</p>
        <div className="mt-4 flex justify-end">
          <Button variant="ghost" onClick={onClose}>إغلاق</Button>
        </div>
      </Modal>
    );
  }

  return (
    <Modal open onClose={onClose} maxWidth="max-w-lg">
      <div className="max-h-[75vh] space-y-3 overflow-y-auto">
        <h3 className="text-base font-semibold text-[var(--v-text)]">فتح واتساب — {prospect.organizationName}</h3>

        {!showConfirmPrompt ? (
          <>
            <Select label="القالب" value={templateType} onChange={(e) => setTemplateType(e.target.value as ProspectTemplateType)}>
              {(Object.keys(TEMPLATE_TYPE_LABELS) as ProspectTemplateType[]).map((t) => (
                <option key={t} value={t}>{TEMPLATE_TYPE_LABELS[t]}</option>
              ))}
            </Select>
            <Textarea
              label="الرسالة (قابلة للتعديل قبل الإرسال)"
              rows={8}
              value={message}
              onChange={(e) => setMessage(e.target.value)}
            />
            <div className="flex justify-end gap-2">
              <Button variant="ghost" onClick={onClose}>إلغاء</Button>
              <Button variant="success" onClick={handleOpenWhatsApp}>فتح في واتساب</Button>
            </div>
          </>
        ) : (
          <div className="space-y-3">
            {opened && (
              <p className="text-xs text-[var(--v-text-muted)]">
                تم فتح واتساب — فتح الرابط لا يعني إرسال الرسالة فعليًا.
              </p>
            )}
            <p className="text-sm font-medium text-[var(--v-text)]">هل تم إرسال الرسالة بالفعل؟</p>
            <div className="flex flex-wrap justify-end gap-2">
              <Button variant="ghost" onClick={onClose}>إلغاء</Button>
              <Button variant="outline" onClick={onClose}>لا، فتحت واتساب فقط</Button>
              <Button variant="success" loading={confirming} onClick={handleConfirmSent}>نعم، تم الإرسال</Button>
            </div>
          </div>
        )}
      </div>
    </Modal>
  );
}
