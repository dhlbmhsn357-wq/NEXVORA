"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import Modal from "@/components/ui/Modal";
import Button from "@/components/ui/Button";
import Textarea from "@/components/ui/Textarea";
import { toast } from "@/components/ui/Toaster";
import { checkExistingLeadMatchAction, executeConversionAction } from "./prospect-actions";
import type { ProspectRow } from "@/lib/prospecting/types";
import type { ExistingLeadMatch } from "@/lib/prospecting/conversion-service";

export default function ConvertToLeadModal({
  prospect,
  isOwnerOrAdmin,
  onClose,
  onChanged,
}: {
  prospect: ProspectRow;
  isOwnerOrAdmin: boolean;
  onClose: () => void;
  onChanged: () => void;
}) {
  const [loading, setLoading] = useState(true);
  const [match, setMatch] = useState<ExistingLeadMatch | null>(null);
  const [choice, setChoice] = useState<"link" | "create">("link");
  const [overrideReason, setOverrideReason] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [resultLeadId, setResultLeadId] = useState<string | null>(null);

  const needsOverride = prospect.status !== "interested";

  useEffect(() => {
    let alive = true;
    checkExistingLeadMatchAction(prospect.id).then((r) => {
      if (!alive) return;
      setLoading(false);
      if (r.ok) {
        setMatch(r.data);
        setChoice(r.data ? "link" : "create");
      }
    });
    return () => {
      alive = false;
    };
  }, [prospect.id]);

  async function handleConfirm() {
    if (needsOverride && (!isOwnerOrAdmin || !overrideReason.trim())) return;
    setSubmitting(true);
    const result = await executeConversionAction(
      prospect.id,
      choice,
      choice === "link" ? (match?.leadId ?? undefined) : undefined,
      needsOverride ? overrideReason.trim() : undefined
    );
    setSubmitting(false);
    if (!result.ok) return toast.error(result.message ?? "فشل التحويل.");
    toast.success("تم تحويل الجهة إلى عميل محتمل بنجاح.");
    setResultLeadId(result.leadId);
    onChanged();
  }

  const canSubmit = !needsOverride || (isOwnerOrAdmin && overrideReason.trim().length > 0);

  return (
    <Modal open onClose={onClose} maxWidth="max-w-lg">
      <div className="max-h-[75vh] space-y-3 overflow-y-auto">
        <h3 className="text-base font-semibold text-[var(--v-text)]">تحويل إلى Lead — {prospect.organizationName}</h3>

        {resultLeadId ? (
          <div className="space-y-3">
            <p className="text-sm text-[var(--v-green)]">تم تحويل الجهة إلى عميل محتمل بنجاح.</p>
            <Link
              href={`/dashboard/leads?highlight=${resultLeadId}`}
              className="inline-block text-sm font-medium text-[var(--v-primary)] hover:underline"
            >
              فتح العميل المحتمل داخل NEXVORA
            </Link>
            <div className="flex justify-end">
              <Button variant="ghost" onClick={onClose}>إغلاق</Button>
            </div>
          </div>
        ) : loading ? (
          <p className="py-6 text-center text-sm text-[var(--v-text-muted)]">جارٍ التحقق من وجود Lead مطابق…</p>
        ) : (
          <>
            <div className="rounded-[var(--v-radius-md)] border border-[var(--v-border)] p-3 text-xs text-[var(--v-text-secondary)]">
              <p><strong className="text-[var(--v-text)]">الاسم:</strong> {prospect.organizationName}</p>
              <p><strong className="text-[var(--v-text)]">الهاتف:</strong> {prospect.primaryPhoneNormalized || "—"}</p>
              <p><strong className="text-[var(--v-text)]">البريد:</strong> {prospect.email || "—"}</p>
              <p><strong className="text-[var(--v-text)]">القطاع:</strong> {prospect.sector || "—"}</p>
              <p><strong className="text-[var(--v-text)]">المحافظة:</strong> {prospect.governorate || "—"}</p>
              {prospect.notes && <p><strong className="text-[var(--v-text)]">ملاحظات:</strong> {prospect.notes}</p>}
            </div>

            {match ? (
              <div className="rounded-[var(--v-radius-md)] border border-[var(--v-amber)]/40 bg-[var(--v-amber)]/5 p-3 text-xs">
                <p className="font-medium text-[var(--v-amber)]">يوجد Lead حالي يحمل نفس رقم الهاتف.</p>
                <p className="mt-1 text-[var(--v-text-secondary)]">
                  {match.companyName || match.contactName || "Lead موجود"} — مطابقة عبر {match.matchedBy === "phone" ? "الهاتف" : "البريد"}
                </p>
                <div className="mt-2 flex flex-wrap gap-3">
                  <label className="flex items-center gap-1.5 text-xs">
                    <input type="radio" checked={choice === "link"} onChange={() => setChoice("link")} /> الربط بالـLead الموجود
                  </label>
                  <label className="flex items-center gap-1.5 text-xs">
                    <input type="radio" checked={choice === "create"} onChange={() => setChoice("create")} /> إنشاء جديد
                  </label>
                </div>
              </div>
            ) : (
              <p className="text-xs text-[var(--v-text-muted)]">لا يوجد Lead مطابق حاليًا — سيتم إنشاء Lead جديد.</p>
            )}

            {needsOverride && (
              isOwnerOrAdmin ? (
                <Textarea
                  label="سبب التحويل (مطلوب — الجهة ليست في حالة «مهتم»)"
                  rows={2}
                  value={overrideReason}
                  onChange={(e) => setOverrideReason(e.target.value)}
                />
              ) : (
                <p className="text-xs text-[var(--v-red)]">
                  لا يمكن تحويل جهة لم تُظهر اهتمامًا بعد (interested) إلا بصلاحية owner/admin مع سبب تحويل واضح.
                </p>
              )
            )}

            <div className="flex justify-end gap-2">
              <Button variant="ghost" onClick={onClose}>إلغاء</Button>
              <Button variant="primary" loading={submitting} disabled={!canSubmit} onClick={handleConfirm}>
                تأكيد التحويل
              </Button>
            </div>
          </>
        )}
      </div>
    </Modal>
  );
}
