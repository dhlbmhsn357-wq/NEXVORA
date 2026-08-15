"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { MessageCircle, Clock, ThumbsUp, ThumbsDown, ArrowUpRight, Pencil, PhoneOff } from "lucide-react";
import Card from "@/components/ui/Card";
import Badge from "@/components/ui/Badge";
import Button from "@/components/ui/Button";
import Tooltip from "@/components/ui/Tooltip";
import Timeline from "@/components/ui/Timeline";
import { toast } from "@/components/ui/Toaster";
import WhatsAppSendModal from "../whatsapp-send-modal";
import RecordContactResultModal from "../record-contact-result-modal";
import ConvertToLeadModal from "../convert-to-lead-modal";
import EditProspectModal from "../edit-prospect-modal";
import { recordContactResultAction, assignProspectAction } from "../prospect-actions";
import {
  STATUS_TONE,
  PROSPECT_STATUS_LABELS,
  PRIORITY_LABELS,
  PRIORITY_TONE,
  CONFIDENCE_LABELS,
  ACTIVITY_TYPE_LABELS,
  formatDate,
  formatDateTime,
} from "../prospect-ui-constants";
import type { ProspectWithActivities } from "@/lib/prospecting/types";

export default function ProspectDetailClient({
  prospect,
  canManage,
  isOwnerOrAdmin,
  profiles,
}: {
  prospect: ProspectWithActivities;
  canManage: boolean;
  isOwnerOrAdmin: boolean;
  profiles: { id: string; name: string }[];
}) {
  const router = useRouter();
  const [whatsappOpen, setWhatsappOpen] = useState(false);
  const [contactResultOpen, setContactResultOpen] = useState(false);
  const [convertOpen, setConvertOpen] = useState(false);
  const [editOpen, setEditOpen] = useState(false);
  const [quickBusy, setQuickBusy] = useState<string | null>(null);

  const hasValidPhone = !!prospect.primaryPhoneNormalized;
  const profileNameById = new Map(profiles.map((p) => [p.id, p.name]));

  function refresh() {
    router.refresh();
  }

  async function handleAssign(assigneeId: string) {
    if (!assigneeId) return;
    const result = await assignProspectAction(prospect.id, assigneeId);
    if (!result.ok) return toast.error(result.message ?? "فشل الإسناد.");
    toast.success("تم الإسناد.");
    refresh();
  }

  async function quickAction(outcome: "interested" | "not_interested", label: string) {
    setQuickBusy(outcome);
    const result = await recordContactResultAction(prospect.id, { outcome });
    setQuickBusy(null);
    if (!result.ok) return toast.error(result.message ?? "فشل الإجراء.");
    toast.success(label);
    refresh();
  }

  return (
    <div className="grid grid-cols-1 gap-6 lg:grid-cols-[1fr_360px]">
      <div className="space-y-4">
        {/* شريط الإجراءات */}
        <Card padding="md">
          <div className="flex flex-wrap items-center gap-2">
            {hasValidPhone ? (
              <Button variant="success" size="sm" icon={<MessageCircle size={14} />} onClick={() => setWhatsappOpen(true)}>
                فتح واتساب
              </Button>
            ) : (
              <Tooltip label="لا يمكن فتح واتساب لأن الرقم غير صالح.">
                <span>
                  <Button variant="success" size="sm" icon={<PhoneOff size={14} />} disabled>
                    فتح واتساب
                  </Button>
                </span>
              </Tooltip>
            )}
            <Button variant="outline" size="sm" icon={<Clock size={14} />} onClick={() => setContactResultOpen(true)}>
              تسجيل اتصال/رد
            </Button>
            <Button variant="outline" size="sm" icon={<ThumbsUp size={14} />} loading={quickBusy === "interested"} onClick={() => quickAction("interested", "تم تسجيل الاهتمام.")}>
              مهتم
            </Button>
            <Button variant="outline" size="sm" onClick={() => setContactResultOpen(true)}>
              متابعة لاحقة
            </Button>
            <Button variant="outline" size="sm" icon={<ThumbsDown size={14} />} loading={quickBusy === "not_interested"} onClick={() => quickAction("not_interested", "تم تسجيل عدم الملاءمة.")}>
              غير مناسب
            </Button>
            {canManage && (
              <Button variant="primary" size="sm" icon={<ArrowUpRight size={14} />} onClick={() => setConvertOpen(true)}>
                تحويل إلى Lead
              </Button>
            )}
            {canManage && (
              <Button variant="ghost" size="sm" icon={<Pencil size={14} />} onClick={() => setEditOpen(true)}>
                تعديل
              </Button>
            )}
          </div>
        </Card>

        <Card padding="md">
          <p className="mb-2 text-sm font-semibold text-[var(--v-text)]">البيانات الأساسية</p>
          <dl className="grid grid-cols-2 gap-2 text-xs">
            <Field label="اسم الجهة" value={prospect.organizationName} />
            <Field label="القطاع" value={prospect.sector} />
            <Field label="المحافظة" value={prospect.governorate} />
            <Field label="المدينة/المنطقة" value={prospect.cityOrArea} />
            <Field label="عدد الفروع" value={prospect.branchesCount != null ? String(prospect.branchesCount) : null} />
            <Field label="ملاحظات النطاق" value={prospect.scopeNotes} />
          </dl>
        </Card>

        <Card padding="md">
          <p className="mb-2 text-sm font-semibold text-[var(--v-text)]">أرقام التواصل</p>
          <dl className="grid grid-cols-2 gap-2 text-xs">
            <Field label="الهاتف الأساسي" value={prospect.primaryPhoneNormalized || prospect.primaryPhoneRaw} />
            <Field label="أرقام إضافية" value={prospect.secondaryPhones.join("، ") || null} />
            <Field label="البريد الإلكتروني" value={prospect.email} />
          </dl>
        </Card>

        <Card padding="md">
          <p className="mb-2 text-sm font-semibold text-[var(--v-text)]">الروابط والمصادر</p>
          <dl className="grid grid-cols-2 gap-2 text-xs">
            <Field label="الموقع الإلكتروني" value={prospect.websiteUrl} link />
            <Field label="رابط اجتماعي" value={prospect.socialUrl} link />
            <Field label="مصادر" value={prospect.sourceUrls.join("، ") || null} />
          </dl>
        </Card>

        <Card padding="md">
          <p className="mb-2 text-sm font-semibold text-[var(--v-text)]">دليل الحجم والنشاط</p>
          <p className="text-xs text-[var(--v-text-secondary)]">{prospect.visibleSizeEvidence || "—"}</p>
          {prospect.activitySignal && <p className="mt-1 text-xs text-[var(--v-text-muted)]">إشارة نشاط: {prospect.activitySignal}</p>}
        </Card>

        <Card padding="md">
          <p className="mb-2 text-sm font-semibold text-[var(--v-text)]">فرضية المشكلة</p>
          <p className="text-xs text-[var(--v-text-secondary)]">{prospect.painHypothesis || "—"}</p>
        </Card>

        <Card padding="md">
          <p className="mb-2 text-sm font-semibold text-[var(--v-text)]">العرض المقترح</p>
          <p className="text-xs text-[var(--v-text-secondary)]">{prospect.suggestedOffer || "—"}</p>
        </Card>

        {prospect.notes && (
          <Card padding="md">
            <p className="mb-2 text-sm font-semibold text-[var(--v-text)]">ملاحظات</p>
            <p className="text-xs whitespace-pre-line text-[var(--v-text-secondary)]">{prospect.notes}</p>
          </Card>
        )}

        <Card padding="md">
          <p className="mb-3 text-sm font-semibold text-[var(--v-text)]">Timeline كامل</p>
          {prospect.activities.length === 0 ? (
            <p className="text-xs text-[var(--v-text-muted)]">لا يوجد نشاط مسجَّل بعد.</p>
          ) : (
            <Timeline
              items={prospect.activities.map((a) => ({
                key: a.id,
                node: <span className="mt-1 h-2.5 w-2.5 rounded-full bg-[var(--v-primary)]" />,
                content: (
                  <div>
                    <p className="text-xs font-medium text-[var(--v-text)]">{ACTIVITY_TYPE_LABELS[a.activityType]}</p>
                    {a.note && <p className="mt-0.5 text-xs text-[var(--v-text-secondary)]">{a.note}</p>}
                    <p className="mt-0.5 text-[10px] text-[var(--v-text-muted)]">{formatDateTime(a.createdAt)}</p>
                  </div>
                ),
              }))}
            />
          )}
        </Card>
      </div>

      <div className="space-y-4">
        <Card padding="md">
          <p className="mb-2 text-sm font-semibold text-[var(--v-text)]">الحالة والتصنيف</p>
          <dl className="space-y-2 text-xs">
            <div className="flex items-center justify-between">
              <span className="text-[var(--v-text-muted)]">الحالة البيعية</span>
              <Badge tone={STATUS_TONE[prospect.status]}>{PROSPECT_STATUS_LABELS[prospect.status]}</Badge>
            </div>
            <div className="flex items-center justify-between">
              <span className="text-[var(--v-text-muted)]">الأولوية</span>
              <Badge tone={PRIORITY_TONE[prospect.priority]}>{PRIORITY_LABELS[prospect.priority]}</Badge>
            </div>
            <div className="flex items-center justify-between">
              <span className="text-[var(--v-text-muted)]">الثقة</span>
              <span className="text-[var(--v-text)]">{CONFIDENCE_LABELS[prospect.confidence]}</span>
            </div>
            <div className="flex items-center justify-between">
              <span className="text-[var(--v-text-muted)]">حالة التحقق</span>
              <span className="text-[var(--v-text)]">
                {prospect.verificationStatus === "verified" ? "تم التحقق" : prospect.verificationStatus === "invalid_phone" ? "رقم غير صالح" : "غير محقق"}
              </span>
            </div>
            <div className="flex items-center justify-between">
              <span className="text-[var(--v-text-muted)]">درجة البحث</span>
              <span className="text-[var(--v-text)]">{prospect.researchScore ?? "—"}</span>
            </div>
          </dl>
        </Card>

        <Card padding="md">
          <p className="mb-2 text-sm font-semibold text-[var(--v-text)]">المسؤول عنها</p>
          {canManage ? (
            <select
              value={prospect.assignedTo ?? ""}
              onChange={(e) => handleAssign(e.target.value)}
              className="w-full rounded-[var(--v-radius-sm)] border border-[var(--v-border)] bg-[var(--v-bg)] px-2 py-1.5 text-sm"
            >
              <option value="">— بدون —</option>
              {profiles.map((u) => (
                <option key={u.id} value={u.id}>{u.name}</option>
              ))}
            </select>
          ) : (
            <p className="text-sm text-[var(--v-text)]">{(prospect.assignedTo && profileNameById.get(prospect.assignedTo)) || "غير مسند"}</p>
          )}
        </Card>

        <Card padding="md">
          <p className="mb-2 text-sm font-semibold text-[var(--v-text)]">التواصل والمتابعة</p>
          <dl className="space-y-2 text-xs">
            <div className="flex items-center justify-between">
              <span className="text-[var(--v-text-muted)]">آخر تواصل</span>
              <span className="text-[var(--v-text)]">{formatDate(prospect.lastContactedAt)}</span>
            </div>
            <div className="flex items-center justify-between">
              <span className="text-[var(--v-text-muted)]">موعد المتابعة القادمة</span>
              <span className="text-[var(--v-text)]">{formatDate(prospect.nextFollowUpAt)}</span>
            </div>
          </dl>
        </Card>

        {prospect.convertedLeadId && (
          <Card padding="md">
            <p className="mb-2 text-sm font-semibold text-[var(--v-green)]">تم التحويل إلى Lead</p>
            <a
              href={`/dashboard/leads?highlight=${prospect.convertedLeadId}`}
              className="text-xs font-medium text-[var(--v-primary)] hover:underline"
            >
              فتح العميل المحتمل داخل NEXVORA
            </a>
          </Card>
        )}
      </div>

      {whatsappOpen && (
        <WhatsAppSendModal prospect={prospect} onClose={() => setWhatsappOpen(false)} onChanged={refresh} />
      )}
      {contactResultOpen && (
        <RecordContactResultModal prospect={prospect} profiles={profiles} onClose={() => setContactResultOpen(false)} onChanged={refresh} />
      )}
      {convertOpen && (
        <ConvertToLeadModal prospect={prospect} isOwnerOrAdmin={isOwnerOrAdmin} onClose={() => setConvertOpen(false)} onChanged={refresh} />
      )}
      {editOpen && (
        <EditProspectModal prospect={prospect} onClose={() => setEditOpen(false)} onChanged={refresh} />
      )}
    </div>
  );
}

function Field({ label, value, link }: { label: string; value: string | null; link?: boolean }) {
  return (
    <div>
      <dt className="text-[var(--v-text-muted)]">{label}</dt>
      <dd className="mt-0.5 text-[var(--v-text)]">
        {value ? (
          link ? (
            <a href={value} target="_blank" rel="noopener noreferrer" className="text-[var(--v-primary)] hover:underline">
              {value}
            </a>
          ) : (
            value
          )
        ) : (
          "—"
        )}
      </dd>
    </div>
  );
}
