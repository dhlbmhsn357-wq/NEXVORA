"use client";

/**
 * NEXVORA Commercial Full Panel (P10)
 * ====================================
 * Proposals (بإصدارات) + بنود + Change Requests + قوالب Pricing المتاحة.
 * Client Lifecycle + Contracts + Payments بيفضلوا في CommercialPanel القديم.
 */
import { useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Plus, Pencil, Trash2, Send, CheckCircle2, XCircle, FileText, GitPullRequest } from "lucide-react";
import Button from "@/components/ui/Button";
import Card from "@/components/ui/Card";
import Badge, { type BadgeTone } from "@/components/ui/Badge";
import Modal from "@/components/ui/Modal";
import Input from "@/components/ui/Input";
import Textarea from "@/components/ui/Textarea";
import Select from "@/components/ui/Select";
import EmptyState from "@/components/ui/EmptyState";
import { toast } from "@/components/ui/Toaster";
import type { ContractRow } from "@/lib/commercial/types";
import { formatMoney } from "@/lib/commercial/derive";
import {
  PROPOSAL_STATUSES, PROPOSAL_STATUS_LABELS,
  CHANGE_REQUEST_STATUSES, CR_STATUS_LABELS,
  PACKAGE_TIERS, PACKAGE_TIER_LABELS,
  type ProposalRow, type ProposalItemRow, type ProposalStatus,
  type ChangeRequestRow, type ChangeRequestStatus,
  type PricingPackageRow, type PackageTier,
} from "@/lib/commercial-full/types";
import {
  summarizeProposals, summarizeChangeRequests,
  isProposalTransitionAllowed, isCrTransitionAllowed,
} from "@/lib/commercial-full/derive";
import {
  createProposalAction, updateProposalAction, deleteProposalAction,
  addItemAction, updateItemAction, deleteItemAction,
  createCrAction, updateCrAction, deleteCrAction,
  createPackageAction, updatePackageAction, deletePackageAction,
} from "./commercial-full-actions";

const PROP_STATUS_TONE: Record<ProposalStatus, BadgeTone> = {
  draft: "neutral", sent: "info", accepted: "success",
  rejected: "danger", expired: "warning", superseded: "neutral",
};
const CR_STATUS_TONE: Record<ChangeRequestStatus, BadgeTone> = {
  draft: "neutral", submitted: "info", under_review: "warning",
  approved: "success", rejected: "danger", cancelled: "neutral", implemented: "primary",
};

export interface CommercialFullPanelProps {
  projectId: string;
  proposals: ProposalRow[];
  proposalItems: ProposalItemRow[];
  changeRequests: ChangeRequestRow[];
  pricingPackages: PricingPackageRow[];
  contracts: ContractRow[];
  canWrite: boolean;
}

export default function CommercialFullPanel(props: CommercialFullPanelProps) {
  const { projectId, proposals, proposalItems, changeRequests, pricingPackages, contracts, canWrite } = props;
  const router = useRouter();
  const [pending, startTransition] = useTransition();

  const [editingProp, setEditingProp] = useState<ProposalRow | null>(null);
  const [creatingProp, setCreatingProp] = useState(false);
  const [addingItemFor, setAddingItemFor] = useState<ProposalRow | null>(null);
  const [editingItem, setEditingItem] = useState<ProposalItemRow | null>(null);
  const [editingCr, setEditingCr] = useState<ChangeRequestRow | null>(null);
  const [creatingCr, setCreatingCr] = useState(false);
  const [editingPkg, setEditingPkg] = useState<PricingPackageRow | null>(null);
  const [creatingPkg, setCreatingPkg] = useState(false);
  const [expanded, setExpanded] = useState<Set<string>>(() => new Set());

  const propSummary = useMemo(() => summarizeProposals(proposals), [proposals]);
  const crSummary = useMemo(() => summarizeChangeRequests(changeRequests), [changeRequests]);
  const itemsByProposal = useMemo(() => {
    const m = new Map<string, ProposalItemRow[]>();
    for (const i of proposalItems) {
      const arr = m.get(i.proposalId) ?? []; arr.push(i); m.set(i.proposalId, arr);
    }
    return m;
  }, [proposalItems]);

  function run<T>(fn: () => Promise<{ ok: true; data?: T } | { ok: false; message: string }>, okMsg: string) {
    startTransition(async () => {
      const res = await fn();
      if (res.ok) { toast.success(okMsg); router.refresh(); }
      else toast.error(res.message);
    });
  }

  function toggleExpanded(id: string) {
    setExpanded((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  }

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
        <Tile label="عروض مقبولة" value={`${propSummary.byStatus.accepted}`} tone="success" />
        <Tile label="عروض قيد الإرسال" value={`${propSummary.byStatus.sent}`} tone="info" />
        <Tile label="طلبات تغيير معلّقة" value={`${crSummary.pending}`} tone={crSummary.pending > 0 ? "warning" : "success"} />
        <Tile label="تأثير CRs المعتمدة" value={crSummary.totalApprovedImpactCost ? formatMoney(crSummary.totalApprovedImpactCost, proposals[0]?.currency ?? "EGP") : "—"} sub={crSummary.totalApprovedImpactDays ? `+${crSummary.totalApprovedImpactDays} يوم` : ""} />
      </div>

      {/* Proposals */}
      <Card>
        <Header title={`العروض (${proposals.length})`}
          action={canWrite ? <Button size="sm" variant="primary" icon={<Plus size={14} />} onClick={() => setCreatingProp(true)}>عرض جديد</Button> : null} />
        {proposals.length === 0 ? (
          <EmptyState title="لا عروض بعد" description={canWrite ? "أنشئ عرضًا لتوثيق التسعير للعميل." : "لم تُسجَّل عروض بعد."} />
        ) : (
          <ul className="space-y-3">
            {proposals.map((p) => {
              const items = itemsByProposal.get(p.id) ?? [];
              const isExpanded = expanded.has(p.id);
              const allowedNext = PROPOSAL_STATUSES.filter((s) => s !== p.status && isProposalTransitionAllowed(p.status, s));
              return (
                <li key={p.id} className="rounded-[var(--v-radius-md)] border border-[var(--v-border)] bg-[var(--v-surface)] p-3">
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0 flex-1">
                      <div className="flex flex-wrap items-center gap-2">
                        <span className="font-mono text-[11px] text-[var(--v-text-subtle)]">v{p.version}</span>
                        <p className="font-medium text-[var(--v-text)]">{p.title}</p>
                        <Badge tone={PROP_STATUS_TONE[p.status]}>{PROPOSAL_STATUS_LABELS[p.status]}</Badge>
                        <span className="text-sm text-[var(--v-text-secondary)]">{formatMoney(p.totalAmount, p.currency)}</span>
                        {p.validUntil && <span className="text-[11px] text-[var(--v-text-subtle)]">صالح حتى {new Date(p.validUntil).toLocaleDateString("ar-EG")}</span>}
                      </div>
                      {p.summary && <p className="mt-1 text-xs text-[var(--v-text-secondary)]">{p.summary}</p>}
                    </div>
                    <div className="flex shrink-0 gap-1">
                      <Button size="sm" variant="ghost" onClick={() => toggleExpanded(p.id)}>
                        {isExpanded ? "طيّ" : `البنود (${items.length})`}
                      </Button>
                      {canWrite && (
                        <>
                          <Button size="sm" variant="ghost" icon={<Pencil size={14} />} onClick={() => setEditingProp(p)}>تعديل</Button>
                          <Button size="sm" variant="ghost" icon={<Trash2 size={14} />}
                            onClick={() => { if (!confirm(`حذف "${p.title}" v${p.version}؟`)) return; run(() => deleteProposalAction(projectId, p.id), "تم الحذف"); }}>حذف</Button>
                        </>
                      )}
                    </div>
                  </div>

                  {/* Quick transitions */}
                  {canWrite && allowedNext.length > 0 && (
                    <div className="mt-2 flex flex-wrap gap-1">
                      {allowedNext.map((next) => (
                        <Button key={next} size="sm" variant={next === "sent" ? "primary" : next === "accepted" ? "success" : next === "rejected" ? "danger" : "outline"}
                          icon={next === "sent" ? <Send size={12} /> : next === "accepted" ? <CheckCircle2 size={12} /> : next === "rejected" ? <XCircle size={12} /> : undefined}
                          onClick={() => run(() => updateProposalAction(projectId, p.id, { status: next }), `تم التحديث إلى: ${PROPOSAL_STATUS_LABELS[next]}`)}>
                          → {PROPOSAL_STATUS_LABELS[next]}
                        </Button>
                      ))}
                    </div>
                  )}

                  {/* Items */}
                  {isExpanded && (
                    <div className="mt-3 border-t border-dashed border-[var(--v-border)] pt-3">
                      <div className="mb-2 flex items-center justify-between">
                        <p className="text-[11px] font-semibold uppercase text-[var(--v-text-subtle)]">البنود</p>
                        {canWrite && <Button size="sm" variant="secondary" icon={<Plus size={12} />} onClick={() => setAddingItemFor(p)}>بند</Button>}
                      </div>
                      {items.length === 0 ? (
                        <p className="rounded-[var(--v-radius-md)] border border-dashed border-[var(--v-border)] p-2 text-center text-[11px] text-[var(--v-text-muted)]">لا بنود.</p>
                      ) : (
                        <div className="overflow-x-auto">
                          <table className="min-w-full text-sm">
                            <thead>
                              <tr className="border-b border-[var(--v-border)] text-right text-[11px] uppercase text-[var(--v-text-subtle)]">
                                <th className="py-1 pl-2">#</th><th>البند</th><th>كمية</th><th>سعر الوحدة</th><th>الإجمالي</th>
                                {canWrite && <th></th>}
                              </tr>
                            </thead>
                            <tbody>
                              {items.map((it) => (
                                <tr key={it.id} className="border-b border-[var(--v-border)] last:border-b-0">
                                  <td className="py-1 pl-2 font-mono text-xs text-[var(--v-text-subtle)]">{it.orderIndex}</td>
                                  <td><p className="font-medium text-[var(--v-text)]">{it.title}</p>{it.description && <p className="text-[11px] text-[var(--v-text-subtle)]">{it.description}</p>}</td>
                                  <td>{it.quantity}</td>
                                  <td>{formatMoney(it.unitPrice, p.currency)}</td>
                                  <td>{formatMoney(it.lineTotal, p.currency)}</td>
                                  {canWrite && (
                                    <td>
                                      <div className="flex gap-1">
                                        <Button size="sm" variant="ghost" icon={<Pencil size={12} />} onClick={() => setEditingItem(it)}>تعديل</Button>
                                        <Button size="sm" variant="ghost" icon={<Trash2 size={12} />}
                                          onClick={() => { if (!confirm("حذف البند؟")) return; run(() => deleteItemAction(projectId, it.id), "تم الحذف"); }}>حذف</Button>
                                      </div>
                                    </td>
                                  )}
                                </tr>
                              ))}
                            </tbody>
                          </table>
                        </div>
                      )}
                      <p className="mt-2 text-[11px] text-[var(--v-text-subtle)]">
                        Subtotal: {formatMoney(p.subtotal, p.currency)} · خصم: {formatMoney(p.discountAmount, p.currency)} · ضريبة: {formatMoney(p.taxAmount, p.currency)} · <b className="text-[var(--v-text)]">Total: {formatMoney(p.totalAmount, p.currency)}</b>
                      </p>
                    </div>
                  )}
                </li>
              );
            })}
          </ul>
        )}
      </Card>

      {/* Change Requests */}
      <Card>
        <Header title={`طلبات التغيير (${changeRequests.length})`}
          action={canWrite ? <Button size="sm" variant="primary" icon={<Plus size={14} />} onClick={() => setCreatingCr(true)}>طلب تغيير جديد</Button> : null} />
        {changeRequests.length === 0 ? (
          <EmptyState title="لا طلبات تغيير" description="أضف طلب تغيير عند وجود تعديل يتأثر بالسعر أو الزمن." />
        ) : (
          <ul className="divide-y divide-[var(--v-border)]">
            {changeRequests.map((c) => {
              const allowedNext = CHANGE_REQUEST_STATUSES.filter((s) => s !== c.status && isCrTransitionAllowed(c.status, s));
              return (
                <li key={c.id} className="py-3">
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0 flex-1">
                      <div className="flex flex-wrap items-center gap-2">
                        {c.code && <span className="font-mono text-[11px] text-[var(--v-text-subtle)]">{c.code}</span>}
                        <p className="font-medium text-[var(--v-text)]">{c.title}</p>
                        <Badge tone={CR_STATUS_TONE[c.status]}>{CR_STATUS_LABELS[c.status]}</Badge>
                        {c.impactCost > 0 && <span className="text-xs text-[var(--v-text-secondary)]">+{formatMoney(c.impactCost, proposals[0]?.currency ?? "EGP")}</span>}
                        {c.impactTimeDays > 0 && <span className="text-xs text-[var(--v-text-secondary)]">+{c.impactTimeDays} يوم</span>}
                      </div>
                      {c.description && <p className="mt-1 text-xs text-[var(--v-text-secondary)]">{c.description}</p>}
                      {c.reason && <p className="mt-1 text-[11px] text-[var(--v-text-subtle)]"><b>السبب:</b> {c.reason}</p>}
                      {c.decisionNote && <p className="mt-1 text-[11px] text-[var(--v-text-subtle)]"><b>القرار:</b> {c.decisionNote}</p>}
                    </div>
                    {canWrite && (
                      <div className="flex shrink-0 gap-1">
                        <Button size="sm" variant="ghost" icon={<Pencil size={14} />} onClick={() => setEditingCr(c)}>تعديل</Button>
                        <Button size="sm" variant="ghost" icon={<Trash2 size={14} />}
                          onClick={() => { if (!confirm(`حذف "${c.title}"؟`)) return; run(() => deleteCrAction(projectId, c.id), "تم الحذف"); }}>حذف</Button>
                      </div>
                    )}
                  </div>
                  {canWrite && allowedNext.length > 0 && (
                    <div className="mt-2 flex flex-wrap gap-1">
                      {allowedNext.map((next) => (
                        <Button key={next} size="sm" variant={next === "approved" ? "success" : next === "rejected" ? "danger" : "outline"}
                          onClick={() => run(() => updateCrAction(projectId, c.id, { status: next }), `تم التحديث إلى: ${CR_STATUS_LABELS[next]}`)}>
                          → {CR_STATUS_LABELS[next]}
                        </Button>
                      ))}
                    </div>
                  )}
                </li>
              );
            })}
          </ul>
        )}
      </Card>

      {/* Pricing Packages (system-wide) */}
      <Card>
        <Header title={`قوالب التسعير (${pricingPackages.length})`}
          action={canWrite ? <Button size="sm" variant="primary" icon={<Plus size={14} />} onClick={() => setCreatingPkg(true)}>قالب جديد</Button> : null} />
        {pricingPackages.length === 0 ? (
          <EmptyState title="لا قوالب تسعير" description="أنشئ قوالب لإعادة استخدامها في العروض عبر كل المشاريع." />
        ) : (
          <ul className="grid grid-cols-1 gap-2 md:grid-cols-2 lg:grid-cols-3">
            {pricingPackages.map((pkg) => (
              <li key={pkg.id} className={`rounded-[var(--v-radius-md)] border p-3 ${pkg.isActive ? "border-[var(--v-border)] bg-[var(--v-surface)]" : "border-dashed border-[var(--v-border)] opacity-60"}`}>
                <div className="flex items-start justify-between">
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <p className="font-medium text-[var(--v-text)]">{pkg.name}</p>
                      <Badge tone="info">{PACKAGE_TIER_LABELS[pkg.tier]}</Badge>
                      {!pkg.isActive && <Badge tone="neutral">معطّل</Badge>}
                    </div>
                    <p className="mt-1 font-mono-plex text-sm text-[var(--v-text-secondary)]">{formatMoney(pkg.basePrice, pkg.currency)}</p>
                    {pkg.description && <p className="mt-1 text-xs text-[var(--v-text-subtle)]">{pkg.description}</p>}
                    {pkg.features.length > 0 && (
                      <ul className="mt-1 space-y-0.5 pr-3 text-[11px] text-[var(--v-text-subtle)]">
                        {pkg.features.slice(0, 4).map((f, i) => <li key={i}>• {f}</li>)}
                        {pkg.features.length > 4 && <li className="text-[var(--v-text-muted)]">+{pkg.features.length - 4} أخرى</li>}
                      </ul>
                    )}
                  </div>
                  {canWrite && (
                    <div className="flex shrink-0 flex-col gap-1">
                      <Button size="sm" variant="ghost" icon={<Pencil size={12} />} onClick={() => setEditingPkg(pkg)}>تعديل</Button>
                      <Button size="sm" variant="ghost" icon={<Trash2 size={12} />}
                        onClick={() => { if (!confirm(`حذف قالب "${pkg.name}"؟`)) return; run(() => deletePackageAction(pkg.id), "تم الحذف"); }}>حذف</Button>
                    </div>
                  )}
                </div>
              </li>
            ))}
          </ul>
        )}
      </Card>

      {/* Dialogs */}
      <ProposalDialog
        key={editingProp?.id ?? (creatingProp ? "new-p" : "closed-p")}
        open={creatingProp || editingProp !== null}
        onClose={() => { setCreatingProp(false); setEditingProp(null); }}
        item={editingProp} packages={pricingPackages}
        onSave={(input) => {
          if (editingProp) run(() => updateProposalAction(projectId, editingProp.id, input), "تم التحديث");
          else run(() => createProposalAction(projectId, input), "تم الإنشاء");
          setCreatingProp(false); setEditingProp(null);
        }}
      />
      <ItemDialog
        key={editingItem?.id ?? (addingItemFor ? `new-item-${addingItemFor.id}` : "closed-item")}
        open={addingItemFor !== null || editingItem !== null}
        onClose={() => { setAddingItemFor(null); setEditingItem(null); }}
        item={editingItem}
        proposalId={editingItem?.proposalId ?? addingItemFor?.id ?? ""}
        nextOrder={((addingItemFor && (itemsByProposal.get(addingItemFor.id)?.length ?? 0)) ?? 0) + 1}
        onSave={(input) => {
          if (editingItem) run(() => updateItemAction(projectId, editingItem.id, input), "تم التحديث");
          else if (addingItemFor) run(() => addItemAction(projectId, { proposalId: addingItemFor.id, ...input }), "تم الإضافة");
          setAddingItemFor(null); setEditingItem(null);
        }}
      />
      <CrDialog
        key={editingCr?.id ?? (creatingCr ? "new-cr" : "closed-cr")}
        open={creatingCr || editingCr !== null}
        onClose={() => { setCreatingCr(false); setEditingCr(null); }}
        item={editingCr} proposals={proposals} contracts={contracts}
        onSave={(input) => {
          if (editingCr) run(() => updateCrAction(projectId, editingCr.id, input), "تم التحديث");
          else run(() => createCrAction(projectId, input), "تم الإنشاء");
          setCreatingCr(false); setEditingCr(null);
        }}
      />
      <PackageDialog
        key={editingPkg?.id ?? (creatingPkg ? "new-pkg" : "closed-pkg")}
        open={creatingPkg || editingPkg !== null}
        onClose={() => { setCreatingPkg(false); setEditingPkg(null); }}
        item={editingPkg}
        onSave={(input) => {
          if (editingPkg) run(() => updatePackageAction(editingPkg.id, input), "تم التحديث");
          else run(() => createPackageAction(input), "تم الإنشاء");
          setCreatingPkg(false); setEditingPkg(null);
        }}
      />
      {pending && <span className="sr-only">جارٍ الحفظ...</span>}
    </div>
  );
}

function Header({ title, action }: { title: string; action?: React.ReactNode }) {
  return (
    <div className="mb-4 flex items-center justify-between gap-3 border-b border-[var(--v-border)] pb-3">
      <h3 className="text-base font-semibold text-[var(--v-text)]">{title}</h3>{action}
    </div>
  );
}
function Tile({ label, value, sub, tone }: { label: string; value: string; sub?: string; tone?: BadgeTone }) {
  return (
    <div className="rounded-[var(--v-radius-md)] border border-[var(--v-border)] bg-[var(--v-surface)] p-3">
      <p className="text-[11px] text-[var(--v-text-muted)]">{label}</p>
      <p className="mt-1 font-mono-plex text-lg font-semibold text-[var(--v-text)]">
        {tone ? <Badge tone={tone}>{value}</Badge> : value}
      </p>
      {sub && <p className="text-[11px] text-[var(--v-text-subtle)]">{sub}</p>}
    </div>
  );
}
function Field({ label, span = 1, children }: { label: string; span?: 1 | 2; children: React.ReactNode }) {
  return (
    <div className={span === 2 ? "sm:col-span-2" : ""}>
      <label className="mb-1 block text-xs text-[var(--v-text-secondary)]">{label}</label>{children}
    </div>
  );
}

function ProposalDialog({
  open, onClose, item, packages, onSave,
}: {
  open: boolean; onClose: () => void; item: ProposalRow | null; packages: PricingPackageRow[];
  onSave: (input: {
    title: string; summary: string; status: ProposalStatus; currency: string;
    discountAmount: number; taxAmount: number; validUntil: string | null;
    linkedPackageId: string | null; notes: string;
  }) => void;
}) {
  const [title, setTitle] = useState(item?.title ?? "");
  const [summary, setSummary] = useState(item?.summary ?? "");
  const [status, setStatus] = useState<ProposalStatus>(item?.status ?? "draft");
  const [currency, setCurrency] = useState(item?.currency ?? "EGP");
  const [discountAmount, setDiscount] = useState<string>(item?.discountAmount ? String(item.discountAmount) : "0");
  const [taxAmount, setTax] = useState<string>(item?.taxAmount ? String(item.taxAmount) : "0");
  const [validUntil, setValidUntil] = useState(item?.validUntil?.slice(0, 10) ?? "");
  const [linkedPackageId, setLinkedPkg] = useState(item?.linkedPackageId ?? "");
  const [notes, setNotes] = useState(item?.notes ?? "");

  return (
    <Modal open={open} onClose={onClose} maxWidth="max-w-lg">
      <div className="space-y-4 p-6">
        <h2 className="text-lg font-semibold text-[var(--v-text)]">{item ? `تعديل عرض v${item.version}` : "عرض جديد"}</h2>
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <Field label="العنوان *" span={2}><Input value={title} onChange={(e) => setTitle(e.target.value)} placeholder="عرض تنفيذ ERP" /></Field>
          <Field label="الحالة">
            <Select value={status} onChange={(e) => setStatus(e.target.value as ProposalStatus)}>
              {PROPOSAL_STATUSES.map((s) => <option key={s} value={s}>{PROPOSAL_STATUS_LABELS[s]}</option>)}
            </Select>
          </Field>
          <Field label="العملة"><Input value={currency} onChange={(e) => setCurrency(e.target.value.toUpperCase())} maxLength={3} /></Field>
          <Field label="خصم"><Input type="number" min="0" step="0.01" value={discountAmount} onChange={(e) => setDiscount(e.target.value)} /></Field>
          <Field label="ضريبة"><Input type="number" min="0" step="0.01" value={taxAmount} onChange={(e) => setTax(e.target.value)} /></Field>
          <Field label="صالح حتى"><Input type="date" value={validUntil} onChange={(e) => setValidUntil(e.target.value)} /></Field>
          <Field label="قالب مرتبط">
            <Select value={linkedPackageId} onChange={(e) => setLinkedPkg(e.target.value)}>
              <option value="">— بلا —</option>
              {packages.filter((p) => p.isActive).map((p) => <option key={p.id} value={p.id}>{p.name} — {PACKAGE_TIER_LABELS[p.tier]}</option>)}
            </Select>
          </Field>
          <Field label="ملخّص" span={2}><Textarea value={summary} onChange={(e) => setSummary(e.target.value)} rows={2} /></Field>
          <Field label="ملاحظات" span={2}><Textarea value={notes} onChange={(e) => setNotes(e.target.value)} rows={2} /></Field>
        </div>
        <div className="flex justify-end gap-2">
          <Button variant="ghost" onClick={onClose}>إلغاء</Button>
          <Button variant="primary" onClick={() => onSave({
            title, summary, status, currency,
            discountAmount: Number(discountAmount || 0), taxAmount: Number(taxAmount || 0),
            validUntil: validUntil || null,
            linkedPackageId: linkedPackageId || null, notes,
          })}>حفظ</Button>
        </div>
      </div>
    </Modal>
  );
}

function ItemDialog({
  open, onClose, item, proposalId, nextOrder, onSave,
}: {
  open: boolean; onClose: () => void; item: ProposalItemRow | null;
  proposalId: string; nextOrder: number;
  onSave: (input: { orderIndex: number; title: string; description: string; quantity: number; unitPrice: number; notes: string }) => void;
}) {
  const [orderIndex, setOrder] = useState<string>(String(item?.orderIndex ?? nextOrder));
  const [title, setTitle] = useState(item?.title ?? "");
  const [description, setDescription] = useState(item?.description ?? "");
  const [quantity, setQty] = useState<string>(String(item?.quantity ?? 1));
  const [unitPrice, setPrice] = useState<string>(String(item?.unitPrice ?? 0));
  const [notes, setNotes] = useState(item?.notes ?? "");

  return (
    <Modal open={open} onClose={onClose} maxWidth="max-w-md">
      <div className="space-y-4 p-6">
        <h2 className="text-lg font-semibold text-[var(--v-text)]">{item ? "تعديل بند" : "بند جديد"}</h2>
        {!item && !proposalId && <p className="text-xs text-[var(--v-red)]">لا عرض محدّد.</p>}
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <Field label="#"><Input type="number" min="1" value={orderIndex} onChange={(e) => setOrder(e.target.value)} /></Field>
          <Field label="العنوان *" span={2}><Input value={title} onChange={(e) => setTitle(e.target.value)} placeholder="تحليل ومتطلبات" /></Field>
          <Field label="الكمية"><Input type="number" min="0" step="0.01" value={quantity} onChange={(e) => setQty(e.target.value)} /></Field>
          <Field label="سعر الوحدة"><Input type="number" min="0" step="0.01" value={unitPrice} onChange={(e) => setPrice(e.target.value)} /></Field>
          <Field label="الوصف" span={2}><Textarea value={description} onChange={(e) => setDescription(e.target.value)} rows={2} /></Field>
          <Field label="ملاحظات" span={2}><Input value={notes} onChange={(e) => setNotes(e.target.value)} /></Field>
        </div>
        <div className="flex justify-end gap-2">
          <Button variant="ghost" onClick={onClose}>إلغاء</Button>
          <Button variant="primary" onClick={() => onSave({
            orderIndex: Number(orderIndex || 1), title, description,
            quantity: Number(quantity || 0), unitPrice: Number(unitPrice || 0), notes,
          })}>حفظ</Button>
        </div>
      </div>
    </Modal>
  );
}

function CrDialog({
  open, onClose, item, proposals, contracts, onSave,
}: {
  open: boolean; onClose: () => void; item: ChangeRequestRow | null;
  proposals: ProposalRow[]; contracts: ContractRow[];
  onSave: (input: {
    code: string; title: string; description: string; reason: string;
    impactScope: string; impactCost: number; impactTimeDays: number;
    status: ChangeRequestStatus; requestedBy: string;
    linkedContractId: string | null; linkedProposalId: string | null;
    decisionNote: string;
  }) => void;
}) {
  const [code, setCode] = useState(item?.code ?? "");
  const [title, setTitle] = useState(item?.title ?? "");
  const [description, setDescription] = useState(item?.description ?? "");
  const [reason, setReason] = useState(item?.reason ?? "");
  const [impactScope, setImpactScope] = useState(item?.impactScope ?? "");
  const [impactCost, setImpactCost] = useState<string>(String(item?.impactCost ?? 0));
  const [impactTimeDays, setImpactDays] = useState<string>(String(item?.impactTimeDays ?? 0));
  const [status, setStatus] = useState<ChangeRequestStatus>(item?.status ?? "draft");
  const [requestedBy, setRequestedBy] = useState(item?.requestedBy ?? "");
  const [linkedContractId, setLinkedContract] = useState(item?.linkedContractId ?? "");
  const [linkedProposalId, setLinkedProposal] = useState(item?.linkedProposalId ?? "");
  const [decisionNote, setDecisionNote] = useState(item?.decisionNote ?? "");

  return (
    <Modal open={open} onClose={onClose} maxWidth="max-w-lg">
      <div className="space-y-4 p-6">
        <h2 className="text-lg font-semibold text-[var(--v-text)]">
          <span className="inline-flex items-center gap-1.5"><GitPullRequest size={16} /> {item ? "تعديل طلب تغيير" : "طلب تغيير جديد"}</span>
        </h2>
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <Field label="الكود"><Input value={code} onChange={(e) => setCode(e.target.value)} placeholder="CR-001" /></Field>
          <Field label="الحالة">
            <Select value={status} onChange={(e) => setStatus(e.target.value as ChangeRequestStatus)}>
              {CHANGE_REQUEST_STATUSES.map((s) => <option key={s} value={s}>{CR_STATUS_LABELS[s]}</option>)}
            </Select>
          </Field>
          <Field label="العنوان *" span={2}><Input value={title} onChange={(e) => setTitle(e.target.value)} placeholder="إضافة وحدة تقارير مخصّصة" /></Field>
          <Field label="مقدّم الطلب"><Input value={requestedBy} onChange={(e) => setRequestedBy(e.target.value)} placeholder="اسم أو دور" /></Field>
          <Field label="تأثير التكلفة"><Input type="number" min="0" step="0.01" value={impactCost} onChange={(e) => setImpactCost(e.target.value)} /></Field>
          <Field label="تأثير الزمن (أيام)"><Input type="number" min="0" value={impactTimeDays} onChange={(e) => setImpactDays(e.target.value)} /></Field>
          <Field label="نطاق التأثير"><Input value={impactScope} onChange={(e) => setImpactScope(e.target.value)} placeholder="frontend + backend + docs" /></Field>
          <Field label="العرض المرتبط">
            <Select value={linkedProposalId} onChange={(e) => setLinkedProposal(e.target.value)}>
              <option value="">— بلا —</option>
              {proposals.map((p) => <option key={p.id} value={p.id}>{p.title} v{p.version}</option>)}
            </Select>
          </Field>
          <Field label="العقد المرتبط" span={2}>
            <Select value={linkedContractId} onChange={(e) => setLinkedContract(e.target.value)}>
              <option value="">— بلا —</option>
              {contracts.map((c) => <option key={c.id} value={c.id}>{c.title}</option>)}
            </Select>
          </Field>
          <Field label="الوصف" span={2}><Textarea value={description} onChange={(e) => setDescription(e.target.value)} rows={2} /></Field>
          <Field label="السبب / المبرّر" span={2}><Textarea value={reason} onChange={(e) => setReason(e.target.value)} rows={2} /></Field>
          <Field label="ملاحظات القرار" span={2}><Textarea value={decisionNote} onChange={(e) => setDecisionNote(e.target.value)} rows={2} /></Field>
        </div>
        <div className="flex justify-end gap-2">
          <Button variant="ghost" onClick={onClose}>إلغاء</Button>
          <Button variant="primary" onClick={() => onSave({
            code, title, description, reason, impactScope,
            impactCost: Number(impactCost || 0), impactTimeDays: Number(impactTimeDays || 0),
            status, requestedBy,
            linkedContractId: linkedContractId || null,
            linkedProposalId: linkedProposalId || null,
            decisionNote,
          })}>حفظ</Button>
        </div>
      </div>
    </Modal>
  );
}

function PackageDialog({
  open, onClose, item, onSave,
}: {
  open: boolean; onClose: () => void; item: PricingPackageRow | null;
  onSave: (input: { name: string; tier: PackageTier; description: string; basePrice: number; currency: string; features: string; isActive: boolean }) => void;
}) {
  const [name, setName] = useState(item?.name ?? "");
  const [tier, setTier] = useState<PackageTier>(item?.tier ?? "standard");
  const [description, setDescription] = useState(item?.description ?? "");
  const [basePrice, setBasePrice] = useState<string>(String(item?.basePrice ?? 0));
  const [currency, setCurrency] = useState(item?.currency ?? "EGP");
  const [features, setFeatures] = useState(item?.features.join("\n") ?? "");
  const [isActive, setIsActive] = useState<boolean>(item?.isActive ?? true);

  return (
    <Modal open={open} onClose={onClose} maxWidth="max-w-lg">
      <div className="space-y-4 p-6">
        <h2 className="text-lg font-semibold text-[var(--v-text)]">
          <span className="inline-flex items-center gap-1.5"><FileText size={16} /> {item ? "تعديل قالب تسعير" : "قالب تسعير جديد"}</span>
        </h2>
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <Field label="الاسم *" span={2}><Input value={name} onChange={(e) => setName(e.target.value)} placeholder="Standard ERP" /></Field>
          <Field label="الشريحة">
            <Select value={tier} onChange={(e) => setTier(e.target.value as PackageTier)}>
              {PACKAGE_TIERS.map((t) => <option key={t} value={t}>{PACKAGE_TIER_LABELS[t]}</option>)}
            </Select>
          </Field>
          <Field label="نشط">
            <div className="flex h-10 items-center gap-2">
              <input type="checkbox" checked={isActive} onChange={(e) => setIsActive(e.target.checked)} />
              <span className="text-sm text-[var(--v-text-secondary)]">قابل للاستخدام في العروض</span>
            </div>
          </Field>
          <Field label="السعر الأساسي"><Input type="number" min="0" step="0.01" value={basePrice} onChange={(e) => setBasePrice(e.target.value)} /></Field>
          <Field label="العملة"><Input value={currency} onChange={(e) => setCurrency(e.target.value.toUpperCase())} maxLength={3} /></Field>
          <Field label="الوصف" span={2}><Textarea value={description} onChange={(e) => setDescription(e.target.value)} rows={2} /></Field>
          <Field label="المزايا (سطر لكل ميزة)" span={2}><Textarea value={features} onChange={(e) => setFeatures(e.target.value)} rows={4} placeholder={"لوحة تحكم كاملة\nتقارير أساسية\nدعم فني"} /></Field>
        </div>
        <div className="flex justify-end gap-2">
          <Button variant="ghost" onClick={onClose}>إلغاء</Button>
          <Button variant="primary" onClick={() => onSave({ name, tier, description, basePrice: Number(basePrice || 0), currency, features, isActive })}>حفظ</Button>
        </div>
      </div>
    </Modal>
  );
}
