"use client";

/**
 * NEXVORA Commercial Panel (P4)
 * =============================
 * تبويب تجاري يظهر داخل صفحة المشروع لما feature flag `product_mode` مفعّل.
 * ثلاث أقسام: حالة العميل، العقود، جدول الدفعات — كلها CRUD كامل مع
 * تحقق وأزرار انتقال محكومة بمنطق lib/commercial/derive.
 */
import { useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Plus, Pencil, Trash2, CheckCircle2, FileText, Wallet, User } from "lucide-react";
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
  CLIENT_LIFECYCLE_LABELS,
  CONTRACT_STATUS_LABELS,
  CONTRACT_STATUSES,
  PAYMENT_STATUS_LABELS,
  PAYMENT_STATUSES,
  type ClientLifecycleStatus,
  type ClientLifecycleStatusRow,
  type ContractRow,
  type ContractStatus,
  type PaymentScheduleRow,
  type PaymentStatus,
} from "@/lib/commercial/types";
import {
  allowedLifecycleTransitions,
  deriveEffectivePaymentStatus,
  formatMoney,
  summarizeContracts,
  summarizePayments,
} from "@/lib/commercial/derive";
import {
  setClientLifecycleAction,
  createContractAction,
  updateContractAction,
  deleteContractAction,
  createPaymentAction,
  updatePaymentAction,
  markPaymentPaidAction,
  deletePaymentAction,
} from "./commercial-actions";

// ---------------------------------------------------------------------------
// Tone mapping (bounds Badge tones)
// ---------------------------------------------------------------------------
const LIFECYCLE_TONE: Record<ClientLifecycleStatus, BadgeTone> = {
  prospect: "info", active: "success", paused: "warning",
  completed: "primary", lost: "danger", archived: "neutral",
};
const CONTRACT_TONE: Record<ContractStatus, BadgeTone> = {
  draft: "neutral", sent: "info", signed: "success", cancelled: "danger",
};
const PAYMENT_TONE: Record<PaymentStatus, BadgeTone> = {
  pending: "neutral", invoiced: "info", paid: "success",
  overdue: "danger", cancelled: "warning",
};

export interface CommercialPanelProps {
  projectId: string;
  lifecycle: ClientLifecycleStatusRow | null;
  contracts: ContractRow[];
  payments: PaymentScheduleRow[];
  canWrite: boolean;
  nowISO: string;
}

export default function CommercialPanel(props: CommercialPanelProps) {
  const { projectId, lifecycle, contracts, payments, canWrite, nowISO } = props;
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [editingContract, setEditingContract] = useState<ContractRow | null>(null);
  const [creatingContract, setCreatingContract] = useState(false);
  const [editingPayment, setEditingPayment] = useState<PaymentScheduleRow | null>(null);
  const [creatingPayment, setCreatingPayment] = useState(false);
  const [notesDraft, setNotesDraft] = useState(lifecycle?.notes ?? "");

  const paymentsSummary = useMemo(() => summarizePayments(payments, nowISO), [payments, nowISO]);
  const contractsSummary = useMemo(() => summarizeContracts(contracts), [contracts]);
  const currentStatus: ClientLifecycleStatus = lifecycle?.status ?? "prospect";
  const nextOptions = useMemo(() => allowedLifecycleTransitions(currentStatus), [currentStatus]);

  function refresh() { router.refresh(); }

  function runAction<T>(fn: () => Promise<{ ok: true; data?: T } | { ok: false; message: string }>, okMsg: string) {
    startTransition(async () => {
      const res = await fn();
      if (res.ok) { toast.success(okMsg); refresh(); }
      else toast.error(res.message);
    });
  }

  // -------------------------------------------------------------------------
  // Lifecycle transitions
  // -------------------------------------------------------------------------
  function transitionTo(next: ClientLifecycleStatus) {
    runAction(() => setClientLifecycleAction(projectId, next, notesDraft), `الحالة اتحدّثت إلى: ${CLIENT_LIFECYCLE_LABELS[next]}`);
  }
  function saveNotes() {
    runAction(() => setClientLifecycleAction(projectId, currentStatus, notesDraft), "الملاحظات اتحفظت");
  }

  return (
    <div className="space-y-6">
      {/* ملخص علوي */}
      <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
        <SummaryTile icon={<User size={16} />} label="حالة العميل" value={CLIENT_LIFECYCLE_LABELS[currentStatus]} tone={LIFECYCLE_TONE[currentStatus]} />
        <SummaryTile icon={<FileText size={16} />} label="العقود الموقّعة" value={`${contractsSummary.signed} / ${contractsSummary.total}`} />
        <SummaryTile icon={<Wallet size={16} />} label="مدفوع" value={`${paymentsSummary.paid}`} sub={paymentsSummary.paidAmount ? formatMoney(paymentsSummary.paidAmount, payments[0]?.currency ?? "EGP") : ""} />
        <SummaryTile icon={<Wallet size={16} />} label="متأخّر" value={`${paymentsSummary.overdue}`} sub={paymentsSummary.overdueAmount ? formatMoney(paymentsSummary.overdueAmount, payments[0]?.currency ?? "EGP") : ""} tone={paymentsSummary.overdue > 0 ? "danger" : "neutral"} />
      </div>

      {/* حالة العميل */}
      <Card>
        <SectionHeader title="حالة العميل" />
        <div className="space-y-4">
          <div className="flex flex-wrap items-center gap-2">
            <span className="text-sm text-[var(--v-text-secondary)]">الحالة الحالية:</span>
            <Badge tone={LIFECYCLE_TONE[currentStatus]}>{CLIENT_LIFECYCLE_LABELS[currentStatus]}</Badge>
            {lifecycle?.updatedAt && (
              <span className="text-[11px] text-[var(--v-text-subtle)]">
                آخر تحديث: {new Date(lifecycle.updatedAt).toLocaleString("ar-EG")}
              </span>
            )}
          </div>

          {canWrite && (
            <>
              <div>
                <label className="mb-1 block text-xs text-[var(--v-text-secondary)]">ملاحظات</label>
                <Textarea value={notesDraft} onChange={(e) => setNotesDraft(e.target.value)} rows={2} placeholder="سبب التغيير، ظروف، إلخ" />
              </div>
              <div className="flex flex-wrap gap-2">
                <Button variant="secondary" size="sm" onClick={saveNotes} disabled={pending || notesDraft === (lifecycle?.notes ?? "")}>حفظ الملاحظات</Button>
                {nextOptions.length === 0 ? (
                  <span className="self-center text-xs text-[var(--v-text-subtle)]">لا انتقالات متاحة من هذه الحالة.</span>
                ) : (
                  nextOptions.map((next) => (
                    <Button key={next} size="sm" variant={next === "lost" || next === "archived" ? "outline" : "primary"} onClick={() => transitionTo(next)} disabled={pending}>
                      → {CLIENT_LIFECYCLE_LABELS[next]}
                    </Button>
                  ))
                )}
              </div>
            </>
          )}
        </div>
      </Card>

      {/* العقود */}
      <Card>
        <SectionHeader
          title="العقود"
          action={canWrite ? (
            <Button size="sm" variant="primary" icon={<Plus size={14} />} onClick={() => setCreatingContract(true)}>عقد جديد</Button>
          ) : null}
        />
        {contracts.length === 0 ? (
          <EmptyState title="لا توجد عقود بعد" description={canWrite ? "ابدأ بإضافة عقد أوّلي — يقدر يكون مسودّة تعدّلها لاحقًا." : "لم تُسجَّل عقود لهذا المشروع بعد."} />
        ) : (
          <ul className="divide-y divide-[var(--v-border)]">
            {contracts.map((c) => (
              <li key={c.id} className="flex items-start justify-between gap-3 py-3">
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <p className="font-medium text-[var(--v-text)]">{c.title}</p>
                    <Badge tone={CONTRACT_TONE[c.status]}>{CONTRACT_STATUS_LABELS[c.status]}</Badge>
                    {c.totalAmount != null && (
                      <span className="text-sm text-[var(--v-text-secondary)]">{formatMoney(c.totalAmount, c.currency)}</span>
                    )}
                  </div>
                  {c.notes && <p className="mt-1 text-xs text-[var(--v-text-subtle)]">{c.notes}</p>}
                  {c.signedAt && (
                    <p className="mt-1 text-[11px] text-[var(--v-text-subtle)]">
                      وُقِّع في {new Date(c.signedAt).toLocaleDateString("ar-EG")}
                      {c.signedByClient ? ` بواسطة ${c.signedByClient}` : ""}
                    </p>
                  )}
                </div>
                {canWrite && (
                  <div className="flex shrink-0 gap-1">
                    <Button size="sm" variant="ghost" icon={<Pencil size={14} />} onClick={() => setEditingContract(c)}>تعديل</Button>
                    <Button size="sm" variant="ghost" icon={<Trash2 size={14} />}
                      onClick={() => {
                        if (!confirm(`حذف العقد "${c.title}"؟`)) return;
                        runAction(() => deleteContractAction(projectId, c.id), "تم الحذف");
                      }}>حذف</Button>
                  </div>
                )}
              </li>
            ))}
          </ul>
        )}
      </Card>

      {/* الدفعات */}
      <Card>
        <SectionHeader
          title={`جدول الدفعات (${payments.length})`}
          action={canWrite ? (
            <Button size="sm" variant="primary" icon={<Plus size={14} />} onClick={() => setCreatingPayment(true)}>دفعة جديدة</Button>
          ) : null}
        />
        {payments.length === 0 ? (
          <EmptyState title="لا دفعات مسجّلة" description={canWrite ? "أضف الدفعة الأولى (مثلاً: مقدّم توقيع العقد)." : "لم تُسجَّل دفعات لهذا المشروع بعد."} />
        ) : (
          <div className="overflow-x-auto">
            <table className="min-w-full text-sm">
              <thead>
                <tr className="border-b border-[var(--v-border)] text-right text-[11px] uppercase text-[var(--v-text-subtle)]">
                  <th className="py-2 pl-2">#</th>
                  <th className="py-2">العنوان</th>
                  <th className="py-2">المبلغ</th>
                  <th className="py-2">تاريخ الاستحقاق</th>
                  <th className="py-2">الحالة</th>
                  {canWrite && <th className="py-2"></th>}
                </tr>
              </thead>
              <tbody>
                {payments.map((p) => {
                  const eff = deriveEffectivePaymentStatus(p, nowISO);
                  return (
                    <tr key={p.id} className="border-b border-[var(--v-border)] last:border-b-0">
                      <td className="py-2 pl-2 font-mono text-xs text-[var(--v-text-subtle)]">{p.installmentNo}</td>
                      <td className="py-2">
                        <p className="font-medium text-[var(--v-text)]">{p.title}</p>
                        {p.notes && <p className="text-[11px] text-[var(--v-text-subtle)]">{p.notes}</p>}
                      </td>
                      <td className="py-2 whitespace-nowrap">{formatMoney(p.amount, p.currency)}</td>
                      <td className="py-2 whitespace-nowrap text-xs text-[var(--v-text-secondary)]">
                        {p.dueDate ? new Date(p.dueDate).toLocaleDateString("ar-EG") : "—"}
                      </td>
                      <td className="py-2"><Badge tone={PAYMENT_TONE[eff]}>{PAYMENT_STATUS_LABELS[eff]}</Badge></td>
                      {canWrite && (
                        <td className="py-2">
                          <div className="flex gap-1">
                            {p.status !== "paid" && p.status !== "cancelled" && (
                              <Button size="sm" variant="ghost" icon={<CheckCircle2 size={14} />}
                                onClick={() => runAction(() => markPaymentPaidAction(projectId, p.id), "تم تعليم الدفعة كمدفوعة")}>مدفوعة</Button>
                            )}
                            <Button size="sm" variant="ghost" icon={<Pencil size={14} />} onClick={() => setEditingPayment(p)}>تعديل</Button>
                            <Button size="sm" variant="ghost" icon={<Trash2 size={14} />}
                              onClick={() => {
                                if (!confirm(`حذف الدفعة "${p.title}"؟`)) return;
                                runAction(() => deletePaymentAction(projectId, p.id), "تم الحذف");
                              }}>حذف</Button>
                          </div>
                        </td>
                      )}
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </Card>

      {/* Modals — نمرّر key عشان الحقول تعمل reset كامل مع كل عملية فتح */}
      <ContractDialog
        key={editingContract?.id ?? (creatingContract ? "new-contract" : "closed-contract")}
        open={creatingContract || editingContract !== null}
        onClose={() => { setCreatingContract(false); setEditingContract(null); }}
        contract={editingContract}
        onSave={(input) => {
          if (editingContract) {
            runAction(() => updateContractAction(projectId, editingContract.id, input), "تم تحديث العقد");
          } else {
            runAction(() => createContractAction(projectId, input), "تم إنشاء العقد");
          }
          setCreatingContract(false); setEditingContract(null);
        }}
      />

      <PaymentDialog
        key={editingPayment?.id ?? (creatingPayment ? "new-payment" : "closed-payment")}
        open={creatingPayment || editingPayment !== null}
        onClose={() => { setCreatingPayment(false); setEditingPayment(null); }}
        payment={editingPayment}
        contracts={contracts}
        defaultInstallmentNo={(payments.reduce((max, p) => Math.max(max, p.installmentNo), 0) + 1)}
        onSave={(input) => {
          if (editingPayment) {
            runAction(() => updatePaymentAction(projectId, editingPayment.id, input), "تم تحديث الدفعة");
          } else {
            runAction(() => createPaymentAction(projectId, input as Parameters<typeof createPaymentAction>[1]), "تم إنشاء الدفعة");
          }
          setCreatingPayment(false); setEditingPayment(null);
        }}
      />
    </div>
  );
}

// ---------------------------------------------------------------------------
// Sub-components
// ---------------------------------------------------------------------------
function SectionHeader({ title, action }: { title: string; action?: React.ReactNode }) {
  return (
    <div className="mb-4 flex items-center justify-between gap-3 border-b border-[var(--v-border)] pb-3">
      <h3 className="text-base font-semibold text-[var(--v-text)]">{title}</h3>
      {action}
    </div>
  );
}

function SummaryTile({ icon, label, value, sub, tone }: { icon: React.ReactNode; label: string; value: string; sub?: string; tone?: BadgeTone }) {
  return (
    <div className="rounded-[var(--v-radius-md)] border border-[var(--v-border)] bg-[var(--v-surface)] p-3">
      <div className="flex items-center gap-1.5 text-[11px] text-[var(--v-text-muted)]">{icon}<span>{label}</span></div>
      <p className="mt-1 font-mono-plex text-lg font-semibold text-[var(--v-text)]">
        {tone ? <Badge tone={tone}>{value}</Badge> : value}
      </p>
      {sub && <p className="text-[11px] text-[var(--v-text-subtle)]">{sub}</p>}
    </div>
  );
}

function ContractDialog({
  open, onClose, contract, onSave,
}: {
  open: boolean;
  onClose: () => void;
  contract: ContractRow | null;
  onSave: (input: {
    title: string; status: ContractStatus; totalAmount: number | null; currency: string;
    notes: string; signedAt: string | null; signedByClient: string | null; documentUrl: string | null;
  }) => void;
}) {
  const [title, setTitle] = useState(contract?.title ?? "");
  const [status, setStatus] = useState<ContractStatus>(contract?.status ?? "draft");
  const [totalAmount, setTotalAmount] = useState<string>(contract?.totalAmount != null ? String(contract.totalAmount) : "");
  const [currency, setCurrency] = useState(contract?.currency ?? "EGP");
  const [notes, setNotes] = useState(contract?.notes ?? "");
  const [signedAt, setSignedAt] = useState(contract?.signedAt?.slice(0, 10) ?? "");
  const [signedByClient, setSignedByClient] = useState(contract?.signedByClient ?? "");
  const [documentUrl, setDocumentUrl] = useState(contract?.documentUrl ?? "");
  // ملاحظة: reset الحقول عند تبديل العقد بيحصل عن طريق `key` على مستوى
  // الأب — الـ Modal بيتعمله remount فيبتدي بقيم useState الأولى الجديدة.

  return (
    <Modal open={open} onClose={onClose} maxWidth="max-w-lg">
      <div className="space-y-4 p-6">
        <h2 className="text-lg font-semibold text-[var(--v-text)]">{contract ? "تعديل عقد" : "عقد جديد"}</h2>
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <Field label="العنوان *" span={2}><Input value={title} onChange={(e) => setTitle(e.target.value)} placeholder="عقد التنفيذ الأساسي" /></Field>
          <Field label="الحالة">
            <Select value={status} onChange={(e) => setStatus(e.target.value as ContractStatus)}>
              {CONTRACT_STATUSES.map((s) => <option key={s} value={s}>{CONTRACT_STATUS_LABELS[s]}</option>)}
            </Select>
          </Field>
          <Field label="القيمة">
            <Input type="number" min="0" step="0.01" value={totalAmount} onChange={(e) => setTotalAmount(e.target.value)} placeholder="0.00" />
          </Field>
          <Field label="العملة">
            <Input value={currency} onChange={(e) => setCurrency(e.target.value.toUpperCase())} maxLength={3} />
          </Field>
          <Field label="تاريخ التوقيع"><Input type="date" value={signedAt} onChange={(e) => setSignedAt(e.target.value)} /></Field>
          <Field label="وقّع من طرف العميل" span={2}><Input value={signedByClient} onChange={(e) => setSignedByClient(e.target.value)} placeholder="اسم الشخص أو الجهة" /></Field>
          <Field label="رابط الملف" span={2}><Input value={documentUrl} onChange={(e) => setDocumentUrl(e.target.value)} placeholder="https://…" /></Field>
          <Field label="ملاحظات" span={2}><Textarea value={notes} onChange={(e) => setNotes(e.target.value)} rows={2} /></Field>
        </div>
        <div className="flex justify-end gap-2 pt-2">
          <Button variant="ghost" onClick={onClose}>إلغاء</Button>
          <Button variant="primary" onClick={() => onSave({
            title, status,
            totalAmount: totalAmount === "" ? null : Number(totalAmount),
            currency, notes,
            signedAt: signedAt || null,
            signedByClient: signedByClient || null,
            documentUrl: documentUrl || null,
          })}>حفظ</Button>
        </div>
      </div>
    </Modal>
  );
}

function PaymentDialog({
  open, onClose, payment, contracts, defaultInstallmentNo, onSave,
}: {
  open: boolean; onClose: () => void; payment: PaymentScheduleRow | null;
  contracts: ContractRow[]; defaultInstallmentNo: number;
  onSave: (input: {
    installmentNo: number; title: string; amount: number; currency: string;
    dueDate: string | null; status: PaymentStatus; notes: string; contractId: string | null;
  }) => void;
}) {
  const [installmentNo, setInstallmentNo] = useState<string>(String(payment?.installmentNo ?? defaultInstallmentNo));
  const [title, setTitle] = useState(payment?.title ?? "");
  const [amount, setAmount] = useState<string>(payment?.amount != null ? String(payment.amount) : "");
  const [currency, setCurrency] = useState(payment?.currency ?? "EGP");
  const [dueDate, setDueDate] = useState(payment?.dueDate?.slice(0, 10) ?? "");
  const [status, setStatus] = useState<PaymentStatus>(payment?.status ?? "pending");
  const [notes, setNotes] = useState(payment?.notes ?? "");
  const [contractId, setContractId] = useState(payment?.contractId ?? "");
  // reset يحصل بالـ key على مستوى الأب.

  return (
    <Modal open={open} onClose={onClose} maxWidth="max-w-lg">
      <div className="space-y-4 p-6">
        <h2 className="text-lg font-semibold text-[var(--v-text)]">{payment ? "تعديل دفعة" : "دفعة جديدة"}</h2>
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <Field label="رقم القسط *"><Input type="number" min="1" value={installmentNo} onChange={(e) => setInstallmentNo(e.target.value)} /></Field>
          <Field label="العملة"><Input value={currency} onChange={(e) => setCurrency(e.target.value.toUpperCase())} maxLength={3} /></Field>
          <Field label="العنوان *" span={2}><Input value={title} onChange={(e) => setTitle(e.target.value)} placeholder="مقدّم التوقيع" /></Field>
          <Field label="المبلغ *"><Input type="number" min="0" step="0.01" value={amount} onChange={(e) => setAmount(e.target.value)} /></Field>
          <Field label="تاريخ الاستحقاق"><Input type="date" value={dueDate} onChange={(e) => setDueDate(e.target.value)} /></Field>
          <Field label="الحالة">
            <Select value={status} onChange={(e) => setStatus(e.target.value as PaymentStatus)}>
              {PAYMENT_STATUSES.map((s) => <option key={s} value={s}>{PAYMENT_STATUS_LABELS[s]}</option>)}
            </Select>
          </Field>
          <Field label="العقد المرتبط">
            <Select value={contractId} onChange={(e) => setContractId(e.target.value)}>
              <option value="">— لا شيء —</option>
              {contracts.map((c) => <option key={c.id} value={c.id}>{c.title}</option>)}
            </Select>
          </Field>
          <Field label="ملاحظات" span={2}><Textarea value={notes} onChange={(e) => setNotes(e.target.value)} rows={2} /></Field>
        </div>
        <div className="flex justify-end gap-2 pt-2">
          <Button variant="ghost" onClick={onClose}>إلغاء</Button>
          <Button variant="primary" onClick={() => onSave({
            installmentNo: Number(installmentNo),
            title, amount: Number(amount), currency,
            dueDate: dueDate || null, status, notes,
            contractId: contractId || null,
          })}>حفظ</Button>
        </div>
      </div>
    </Modal>
  );
}

function Field({ label, span = 1, children }: { label: string; span?: 1 | 2; children: React.ReactNode }) {
  return (
    <div className={span === 2 ? "sm:col-span-2" : ""}>
      <label className="mb-1 block text-xs text-[var(--v-text-secondary)]">{label}</label>
      {children}
    </div>
  );
}
