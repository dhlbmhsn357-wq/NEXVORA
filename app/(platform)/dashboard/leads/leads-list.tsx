"use client";

import { useEffect, useMemo, useRef, useState, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useVirtualizer } from "@tanstack/react-virtual";
import { Users, MessageCircle, Pencil } from "lucide-react";
import ConvertLeadButton from "./convert-lead-button";
import ArchiveButton from "../archive-button";
import Modal from "@/components/ui/Modal";
import { toast } from "@/components/ui/Toaster";
import { getLeadForEdit, updateLead, type LeadEditData } from "./lead-actions";
import { loadMoreLeads, type LeadListItem } from "./load-more-leads-action";
import { normalizePhone, waMeLink } from "@/lib/whatsapp/phone";
import type { LeadStatus } from "@/lib/types/database";
import Card from "@/components/ui/Card";
import Badge from "@/components/ui/Badge";
import Button from "@/components/ui/Button";
import EmptyState from "@/components/ui/EmptyState";
import Input from "@/components/ui/Input";
import Select from "@/components/ui/Select";
import BottomSheet from "@/components/ui/BottomSheet";

// تحت العدد ده مفيش داعي لـ Virtualization — التكلفة أعلى من الفايدة.
const VIRTUALIZE_THRESHOLD = 30;

const statusLabels: Record<LeadStatus, string> = {
  new: "جديد",
  contacted: "تم التواصل",
  qualified: "مؤهّل",
  converted: "تم التحويل",
  lost: "مفقود",
};

// الأزرق محجوز كـ Accent للـ CTAs بس — شارات الحالة بتاخد لون دلالي
// (أخضر لتحويل ناجح، أحمر لمفقود) أو محايد للحالات الوسيطة.
const statusTones: Record<LeadStatus, "neutral" | "success" | "danger"> = {
  new: "neutral",
  contacted: "neutral",
  qualified: "neutral",
  converted: "success",
  lost: "danger",
};

// ترتيب المسار الطبيعي لـ Lead — من أول ما يتسجّل لحد ما يتحول أو يضيع.
const pipelineOrder: LeadStatus[] = ["new", "contacted", "qualified", "converted", "lost"];

export default function LeadsList({
  initialLeads,
  initialHasMore,
  canEdit = false,
}: {
  initialLeads: LeadListItem[];
  initialHasMore: boolean;
  canEdit?: boolean;
}) {
  const router = useRouter();
  const [editingId, setEditingId] = useState<string | null>(null);
  const [leads, setLeads] = useState(initialLeads);
  const [hasMore, setHasMore] = useState(initialHasMore);
  const [loadingMore, setLoadingMore] = useState(false);
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState<LeadStatus | "all">("all");
  const [filtersSheetOpen, setFiltersSheetOpen] = useState(false);

  async function handleLoadMore() {
    setLoadingMore(true);
    const result = await loadMoreLeads(leads.length);
    setLeads((prev) => [...prev, ...result.items]);
    setHasMore(result.hasMore);
    setLoadingMore(false);
  }

  const statusCounts = useMemo(() => {
    const counts = new Map<LeadStatus, number>();
    for (const l of leads) counts.set(l.status, (counts.get(l.status) ?? 0) + 1);
    return counts;
  }, [leads]);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return leads.filter((l) => {
      if (statusFilter !== "all" && l.status !== statusFilter) return false;
      if (!q) return true;
      const company = l.clients?.company_name?.toLowerCase() ?? "";
      const source = l.source?.toLowerCase() ?? "";
      const notes = l.notes?.toLowerCase() ?? "";
      return company.includes(q) || source.includes(q) || notes.includes(q);
    });
  }, [leads, search, statusFilter]);

  const scrollRef = useRef<HTMLDivElement>(null);
  const virtualizeEnabled = filtered.length > VIRTUALIZE_THRESHOLD;
  // eslint-disable-next-line react-hooks/incompatible-library -- tanstack-virtual returns non-memoizable helpers by design
  const virtualizer = useVirtualizer({
    count: filtered.length,
    getScrollElement: () => scrollRef.current,
    estimateSize: () => 100,
    overscan: 6,
    enabled: virtualizeEnabled,
  });

  function renderLead(lead: LeadListItem) {
    const rawPhone = lead.contact?.whatsapp?.trim() || lead.contact?.phone?.trim() || "";
    const normalized = rawPhone ? normalizePhone(rawPhone, "EG") : { ok: false as const, reason: "" };
    const waHref = normalized.ok ? waMeLink(normalized.e164) : null;

    return (
      <Card key={lead.id} padding={virtualizeEnabled ? "sm" : "md"} hover>
        <div className="flex items-start justify-between">
          <div>
            <p className="text-sm font-semibold text-[var(--v-text)]">
              {lead.clients?.company_name || "بدون اسم شركة"}
            </p>
            <p className="mt-1 text-xs text-[var(--v-text-muted)]">
              {lead.source || "مصدر غير محدد"} · {new Date(lead.created_at).toLocaleDateString("ar-EG")}
            </p>
          </div>
          <Badge tone={statusTones[lead.status]}>{statusLabels[lead.status]}</Badge>
        </div>
        {lead.notes && <p className="mt-2 text-xs text-[var(--v-text-muted)]">{lead.notes}</p>}
        <div className="mt-3 flex flex-wrap items-center gap-2">
          {lead.converted_to_project_id ? (
            <Link
              href={`/dashboard/projects/${lead.converted_to_project_id}`}
              className="text-xs font-medium text-[var(--v-green)] hover:underline"
            >
              تم التحويل لمشروع ← فتح المشروع
            </Link>
          ) : (
            <ConvertLeadButton
              leadId={lead.id}
              clientId={lead.client_id}
              defaultName={lead.clients?.company_name || ""}
            />
          )}
          {waHref && (
            <a
              href={waHref}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-1 rounded-[var(--v-radius-md)] border border-[var(--v-green)] px-2.5 py-1 text-[11px] font-medium text-[var(--v-green)] transition hover:bg-[var(--v-green)]/8"
              title={`فتح واتساب مع ${lead.contact?.full_name ?? ""}`}
            >
              <MessageCircle size={12} /> واتساب
            </a>
          )}
          {canEdit && (
            <button
              type="button"
              onClick={() => setEditingId(lead.id)}
              className="inline-flex items-center gap-1 rounded-[var(--v-radius-md)] border border-[var(--v-border)] px-2.5 py-1 text-[11px] font-medium text-[var(--v-text-secondary)] transition hover:border-[var(--v-primary)] hover:text-[var(--v-primary)]"
            >
              <Pencil size={12} /> تعديل
            </button>
          )}
          <ArchiveButton table="leads" id={lead.id} revalidateHref="/dashboard/leads" />
        </div>
      </Card>
    );
  }

  return (
    <div>
      <div className="mb-4 flex flex-wrap items-center gap-1.5" role="tablist" aria-label="فلترة حسب حالة المسار">
        {pipelineOrder.map((s, i) => {
          const active = statusFilter === s;
          const count = statusCounts.get(s) ?? 0;
          return (
            <div key={s} className="flex items-center gap-1.5">
              <button
                type="button"
                role="tab"
                aria-selected={active}
                onClick={() => setStatusFilter(active ? "all" : s)}
                className={`flex items-center gap-1.5 rounded-[var(--v-radius-full)] border px-3 py-1.5 text-xs font-medium transition ${
                  active
                    ? "border-[var(--v-primary)] bg-[var(--v-primary-tint)] text-[var(--v-primary)]"
                    : "border-[var(--v-border)] text-[var(--v-text-secondary)] hover:border-[var(--v-primary)]"
                }`}
              >
                {statusLabels[s]}
                <span className="tabular-nums opacity-70">{count}</span>
              </button>
              {i < pipelineOrder.length - 1 && (
                <span className="text-[var(--v-border-strong)]" aria-hidden="true">
                  ←
                </span>
              )}
            </div>
          );
        })}
      </div>

      <div className="mb-3 flex flex-wrap gap-2">
        <div className="flex-1">
          <Input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="بحث في اسم الشركة، المصدر، أو الملاحظات…"
          />
        </div>
        <div className="hidden w-40 sm:block">
          <Select value={statusFilter} onChange={(e) => setStatusFilter(e.target.value as LeadStatus | "all")}>
            <option value="all">كل الحالات</option>
            {(Object.keys(statusLabels) as LeadStatus[]).map((s) => (
              <option key={s} value={s}>
                {statusLabels[s]}
              </option>
            ))}
          </Select>
        </div>
        <Button variant="outline" size="sm" className="sm:hidden" onClick={() => setFiltersSheetOpen(true)}>
          فلاتر{statusFilter !== "all" ? " (1)" : ""}
        </Button>
      </div>

      <BottomSheet open={filtersSheetOpen} onClose={() => setFiltersSheetOpen(false)} title="فلاتر العملاء المحتملين">
        <Select value={statusFilter} onChange={(e) => setStatusFilter(e.target.value as LeadStatus | "all")}>
          <option value="all">كل الحالات</option>
          {(Object.keys(statusLabels) as LeadStatus[]).map((s) => (
            <option key={s} value={s}>
              {statusLabels[s]}
            </option>
          ))}
        </Select>
      </BottomSheet>

      {filtered.length === 0 && (
        <EmptyState
          icon={<Users size={28} />}
          title={leads.length === 0 ? "لا يوجد عملاء محتملون بعد" : "مفيش نتائج مطابقة"}
        />
      )}

      {virtualizeEnabled ? (
        <div ref={scrollRef} className="max-h-[70vh] overflow-y-auto">
          <div className="relative" style={{ height: virtualizer.getTotalSize() }}>
            {virtualizer.getVirtualItems().map((row) => (
              <div
                key={row.key}
                ref={virtualizer.measureElement}
                data-index={row.index}
                className="absolute top-0 left-0 w-full pb-2"
                style={{ transform: `translateY(${row.start}px)` }}
              >
                {renderLead(filtered[row.index])}
              </div>
            ))}
          </div>
        </div>
      ) : (
        <div className="space-y-3">{filtered.map(renderLead)}</div>
      )}

      {hasMore && (
        <div className="mt-3 text-center">
          <Button variant="outline" size="sm" onClick={handleLoadMore} loading={loadingMore}>
            تحميل المزيد
          </Button>
          <p className="mt-1 text-[10px] text-[var(--v-text-muted)]">
            البحث والفلاتر بيشتغلوا بس على العناصر المحمّلة حاليًا.
          </p>
        </div>
      )}

      {editingId && (
        <EditLeadModal
          leadId={editingId}
          onClose={() => setEditingId(null)}
          onSaved={() => { setEditingId(null); router.refresh(); }}
        />
      )}
    </div>
  );
}

const editInputCls =
  "h-10 w-full rounded-[var(--v-radius-md)] border border-[var(--v-border)] bg-[var(--v-bg)] px-3 text-sm text-[var(--v-text)] outline-none focus:border-[var(--v-primary)]";

function EditLeadModal({ leadId, onClose, onSaved }: { leadId: string; onClose: () => void; onSaved: () => void }) {
  const [data, setData] = useState<LeadEditData | null>(null);
  const [error, setError] = useState("");
  const [pending, startTransition] = useTransition();

  useEffect(() => {
    let alive = true;
    getLeadForEdit(leadId).then((r) => {
      if (!alive) return;
      if (r.ok && r.data) setData(r.data);
      else setError(r.message ?? "تعذّر تحميل البيانات.");
    });
    return () => { alive = false; };
  }, [leadId]);

  function set<K extends keyof LeadEditData>(key: K, value: LeadEditData[K]) {
    setData((d) => (d ? { ...d, [key]: value } : d));
  }

  function save() {
    if (!data) return;
    setError("");
    startTransition(async () => {
      const res = await updateLead(leadId, {
        companyName: data.companyName, contactName: data.contactName, email: data.email,
        phone: data.phone, whatsapp: data.whatsapp, source: data.source, notes: data.notes, status: data.status,
      });
      if (res.ok) { toast.success("تم حفظ التعديلات."); onSaved(); }
      else setError(res.message ?? "فشل الحفظ.");
    });
  }

  return (
    <Modal open onClose={onClose} maxWidth="max-w-lg">
      <div className="space-y-3">
        <h3 className="text-base font-semibold text-[var(--v-text)]">تعديل بيانات العميل المحتمل</h3>
        {!data ? (
          <p className="py-6 text-center text-sm text-[var(--v-text-muted)]">{error || "جارٍ التحميل…"}</p>
        ) : (
          <>
            <div className="grid grid-cols-2 gap-3">
              <label className="text-[11px] text-[var(--v-text-muted)]">اسم الشركة *<input value={data.companyName} onChange={(e) => set("companyName", e.target.value)} className={editInputCls} /></label>
              <label className="text-[11px] text-[var(--v-text-muted)]">اسم المسؤول *<input value={data.contactName} onChange={(e) => set("contactName", e.target.value)} className={editInputCls} /></label>
              <label className="text-[11px] text-[var(--v-text-muted)]">البريد<input value={data.email} onChange={(e) => set("email", e.target.value)} className={editInputCls} /></label>
              <label className="text-[11px] text-[var(--v-text-muted)]">الهاتف<input value={data.phone} onChange={(e) => set("phone", e.target.value)} className={editInputCls} /></label>
              <label className="text-[11px] text-[var(--v-text-muted)]">واتساب<input value={data.whatsapp} onChange={(e) => set("whatsapp", e.target.value)} className={editInputCls} /></label>
              <label className="text-[11px] text-[var(--v-text-muted)]">المصدر<input value={data.source} onChange={(e) => set("source", e.target.value)} className={editInputCls} /></label>
              <label className="col-span-2 text-[11px] text-[var(--v-text-muted)]">الحالة
                <select value={data.status} onChange={(e) => set("status", e.target.value as LeadEditData["status"])} className={editInputCls}>
                  {(Object.keys(statusLabels) as LeadStatus[]).map((s) => <option key={s} value={s}>{statusLabels[s]}</option>)}
                </select>
              </label>
            </div>
            <label className="block text-[11px] text-[var(--v-text-muted)]">ملاحظات<textarea value={data.notes} onChange={(e) => set("notes", e.target.value)} rows={3} className={`${editInputCls} h-auto py-2`} /></label>
            {error && <p className="text-xs text-[var(--v-red)]">{error}</p>}
            <div className="flex justify-end gap-2">
              <Button variant="ghost" onClick={onClose}>إلغاء</Button>
              <Button variant="primary" loading={pending} onClick={save}>حفظ</Button>
            </div>
          </>
        )}
      </div>
    </Modal>
  );
}
