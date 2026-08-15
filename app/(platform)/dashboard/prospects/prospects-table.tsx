"use client";

import { useState } from "react";
import Link from "next/link";
import { MessageCircle, Pencil, Archive, ArrowUpRight, PhoneOff, Trash2 } from "lucide-react";
import Badge from "@/components/ui/Badge";
import Tooltip from "@/components/ui/Tooltip";
import { toast } from "@/components/ui/Toaster";
import WhatsAppSendModal from "./whatsapp-send-modal";
import RecordContactResultModal from "./record-contact-result-modal";
import ConvertToLeadModal from "./convert-to-lead-modal";
import EditProspectModal from "./edit-prospect-modal";
import { archiveProspectAction, assignProspectAction, deleteProspectAction } from "./prospect-actions";
import { STATUS_TONE, PROSPECT_STATUS_LABELS, PRIORITY_LABELS, PRIORITY_TONE, formatDate } from "./prospect-ui-constants";
import type { ProspectRow } from "@/lib/prospecting/types";
import type { AssignableProfile } from "./prospects-client";

export default function ProspectsTable({
  items,
  canManage,
  isOwnerOrAdmin,
  profiles,
  profileNameById,
  onChanged,
}: {
  items: ProspectRow[];
  canManage: boolean;
  isOwnerOrAdmin: boolean;
  profiles: AssignableProfile[];
  profileNameById: Map<string, string>;
  onChanged: () => void;
}) {
  const [whatsappFor, setWhatsappFor] = useState<ProspectRow | null>(null);
  const [contactResultFor, setContactResultFor] = useState<ProspectRow | null>(null);
  const [convertFor, setConvertFor] = useState<ProspectRow | null>(null);
  const [editFor, setEditFor] = useState<ProspectRow | null>(null);
  const [archivingId, setArchivingId] = useState<string | null>(null);
  const [deletingId, setDeletingId] = useState<string | null>(null);

  async function handleArchive(id: string) {
    setArchivingId(id);
    const result = await archiveProspectAction(id);
    setArchivingId(null);
    if (!result.ok) return toast.error(result.message ?? "فشلت الأرشفة.");
    toast.success("تمت الأرشفة.");
    onChanged();
  }

  async function handleDelete(id: string, name: string) {
    const ok = window.confirm(
      `حذف "${name}" نهائيًا؟ ده إجراء لا يمكن التراجع عنه — كل سجل التواصل الخاص بيها هيتحذف معاها. لو الجهة مش مهمة بس عايز تخفيها بس، استخدم «أرشفة» بدل كده.`
    );
    if (!ok) return;
    setDeletingId(id);
    const result = await deleteProspectAction(id);
    setDeletingId(null);
    if (!result.ok) return toast.error(result.message ?? "فشل الحذف.");
    toast.success("تم الحذف نهائيًا.");
    onChanged();
  }

  async function handleAssign(id: string, assigneeId: string) {
    if (!assigneeId) return;
    const result = await assignProspectAction(id, assigneeId);
    if (!result.ok) return toast.error(result.message ?? "فشل الإسناد.");
    toast.success("تم الإسناد.");
    onChanged();
  }

  return (
    <div className="overflow-x-auto rounded-[var(--v-radius-lg)] border border-[var(--v-border)]">
      <table className="w-full min-w-[1100px] text-sm">
        <thead className="bg-[var(--v-surface)] text-[11px] text-[var(--v-text-muted)]">
          <tr>
            <th className="px-3 py-2 text-start font-medium">اسم الجهة</th>
            <th className="px-3 py-2 text-start font-medium">القطاع</th>
            <th className="px-3 py-2 text-start font-medium">المحافظة/المنطقة</th>
            <th className="px-3 py-2 text-start font-medium">الهاتف</th>
            <th className="px-3 py-2 text-start font-medium">الأولوية</th>
            <th className="px-3 py-2 text-start font-medium">درجة البحث</th>
            <th className="px-3 py-2 text-start font-medium">الثقة</th>
            <th className="px-3 py-2 text-start font-medium">الحالة</th>
            <th className="px-3 py-2 text-start font-medium">المسؤول</th>
            <th className="px-3 py-2 text-start font-medium">آخر تواصل</th>
            <th className="px-3 py-2 text-start font-medium">المتابعة القادمة</th>
            <th className="px-3 py-2 text-start font-medium">إجراءات</th>
          </tr>
        </thead>
        <tbody>
          {items.map((p) => {
            const hasValidPhone = !!p.primaryPhoneNormalized;
            return (
              <tr key={p.id} className="border-t border-[var(--v-border)] hover:bg-[var(--v-surface)]/50">
                <td className="px-3 py-2">
                  <Link href={`/dashboard/prospects/${p.id}`} className="font-medium text-[var(--v-text)] hover:text-[var(--v-primary)] hover:underline">
                    {p.organizationName}
                  </Link>
                </td>
                <td className="px-3 py-2 text-[var(--v-text-secondary)]">{p.sector || "—"}</td>
                <td className="px-3 py-2 text-[var(--v-text-secondary)]">
                  {[p.governorate, p.cityOrArea].filter(Boolean).join(" / ") || "—"}
                </td>
                <td className="px-3 py-2 tabular-nums text-[var(--v-text-secondary)]">
                  {p.primaryPhoneNormalized || p.primaryPhoneRaw || "—"}
                </td>
                <td className="px-3 py-2"><Badge tone={PRIORITY_TONE[p.priority]}>{PRIORITY_LABELS[p.priority]}</Badge></td>
                <td className="px-3 py-2 tabular-nums text-[var(--v-text-secondary)]">{p.researchScore ?? "—"}</td>
                <td className="px-3 py-2 text-[var(--v-text-secondary)]">{p.confidence}</td>
                <td className="px-3 py-2"><Badge tone={STATUS_TONE[p.status]}>{PROSPECT_STATUS_LABELS[p.status]}</Badge></td>
                <td className="px-3 py-2 text-[var(--v-text-secondary)]">
                  {canManage ? (
                    <select
                      value={p.assignedTo ?? ""}
                      onChange={(e) => handleAssign(p.id, e.target.value)}
                      className="rounded-[var(--v-radius-sm)] border border-[var(--v-border)] bg-[var(--v-bg)] px-1.5 py-1 text-[11px]"
                    >
                      <option value="">— بدون —</option>
                      {profiles.map((u) => (
                        <option key={u.id} value={u.id}>{u.name}</option>
                      ))}
                    </select>
                  ) : (
                    (p.assignedTo && profileNameById.get(p.assignedTo)) || "—"
                  )}
                </td>
                <td className="px-3 py-2 text-[var(--v-text-secondary)]">{formatDate(p.lastContactedAt)}</td>
                <td className="px-3 py-2 text-[var(--v-text-secondary)]">{formatDate(p.nextFollowUpAt)}</td>
                <td className="px-3 py-2">
                  <div className="flex flex-wrap items-center gap-1.5">
                    {hasValidPhone ? (
                      <button
                        type="button"
                        onClick={() => setWhatsappFor(p)}
                        title="فتح واتساب"
                        className="inline-flex items-center gap-1 rounded-[var(--v-radius-md)] border border-[var(--v-green)] px-2 py-1 text-[11px] font-medium text-[var(--v-green)] transition hover:bg-[var(--v-green)]/8"
                      >
                        <MessageCircle size={12} /> واتساب
                      </button>
                    ) : (
                      <Tooltip label="لا يمكن فتح واتساب لأن الرقم غير صالح.">
                        <span className="inline-flex cursor-not-allowed items-center gap-1 rounded-[var(--v-radius-md)] border border-[var(--v-border)] px-2 py-1 text-[11px] font-medium text-[var(--v-text-muted)] opacity-60">
                          <PhoneOff size={12} /> واتساب
                        </span>
                      </Tooltip>
                    )}
                    <button
                      type="button"
                      onClick={() => setContactResultFor(p)}
                      className="rounded-[var(--v-radius-md)] border border-[var(--v-border)] px-2 py-1 text-[11px] font-medium text-[var(--v-text-secondary)] hover:border-[var(--v-primary)] hover:text-[var(--v-primary)]"
                    >
                      تسجيل نتيجة
                    </button>
                    {canManage && (
                      <button
                        type="button"
                        onClick={() => setConvertFor(p)}
                        className="inline-flex items-center gap-1 rounded-[var(--v-radius-md)] border border-[var(--v-primary)] px-2 py-1 text-[11px] font-medium text-[var(--v-primary)] hover:bg-[var(--v-primary-tint)]"
                      >
                        <ArrowUpRight size={12} /> تحويل إلى Lead
                      </button>
                    )}
                    {canManage && (
                      <button
                        type="button"
                        onClick={() => setEditFor(p)}
                        className="inline-flex items-center gap-1 rounded-[var(--v-radius-md)] border border-[var(--v-border)] px-2 py-1 text-[11px] font-medium text-[var(--v-text-secondary)] hover:border-[var(--v-primary)] hover:text-[var(--v-primary)]"
                      >
                        <Pencil size={12} /> تعديل
                      </button>
                    )}
                    {canManage && p.status !== "archived" && (
                      <button
                        type="button"
                        disabled={archivingId === p.id}
                        onClick={() => handleArchive(p.id)}
                        className="inline-flex items-center gap-1 rounded-[var(--v-radius-md)] border border-[var(--v-border)] px-2 py-1 text-[11px] font-medium text-[var(--v-text-muted)] hover:border-[var(--v-red)] hover:text-[var(--v-red)] disabled:opacity-50"
                      >
                        <Archive size={12} /> أرشفة
                      </button>
                    )}
                    {isOwnerOrAdmin && !p.convertedLeadId && (
                      <Tooltip label="حذف نهائي — لا يمكن التراجع عنه. للأخطاء (زي صفوف استيراد غلط).">
                        <button
                          type="button"
                          disabled={deletingId === p.id}
                          onClick={() => handleDelete(p.id, p.organizationName)}
                          className="inline-flex items-center gap-1 rounded-[var(--v-radius-md)] border border-[var(--v-border)] px-2 py-1 text-[11px] font-medium text-[var(--v-text-muted)] hover:border-[var(--v-red)] hover:bg-[var(--v-red)]/5 hover:text-[var(--v-red)] disabled:opacity-50"
                        >
                          <Trash2 size={12} /> حذف نهائي
                        </button>
                      </Tooltip>
                    )}
                  </div>
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>

      {whatsappFor && (
        <WhatsAppSendModal prospect={whatsappFor} onClose={() => setWhatsappFor(null)} onChanged={onChanged} />
      )}
      {contactResultFor && (
        <RecordContactResultModal
          prospect={contactResultFor}
          profiles={profiles}
          onClose={() => setContactResultFor(null)}
          onChanged={onChanged}
        />
      )}
      {convertFor && (
        <ConvertToLeadModal
          prospect={convertFor}
          isOwnerOrAdmin={isOwnerOrAdmin}
          onClose={() => setConvertFor(null)}
          onChanged={onChanged}
        />
      )}
      {editFor && (
        <EditProspectModal prospect={editFor} onClose={() => setEditFor(null)} onChanged={onChanged} />
      )}
    </div>
  );
}
