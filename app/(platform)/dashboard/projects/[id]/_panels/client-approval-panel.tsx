"use client";

/** NEXVORA Client Approval Portal Panel (P11) */
import { useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Plus, Link2, Ban, Copy } from "lucide-react";
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
  APPROVAL_TARGET_LABELS,
  APPROVAL_STATUS_LABELS, APPROVAL_DECISION_LABELS,
  type ClientApprovalRow, type ApprovalTargetType, type ApprovalStatus,
} from "@/lib/client-approval/types";
// brain intentionally excluded from UI — reserved for future brain-summary feature
const CREATE_APPROVAL_TARGET_TYPES: readonly ApprovalTargetType[] = ["prd", "presentation", "proposal"] as const;
import { effectiveStatus, summarizeApprovals } from "@/lib/client-approval/derive";
import {
  createApprovalAction, revokeApprovalAction,
} from "../client-approval-actions";

const STATUS_TONE: Record<ApprovalStatus, BadgeTone> = {
  pending: "warning", decided: "success", expired: "neutral", revoked: "danger",
};

export interface ClientApprovalPanelProps {
  projectId: string;
  approvals: ClientApprovalRow[];
  baseUrl: string;
  canWrite: boolean;
}

export default function ClientApprovalPanel({ projectId, approvals, baseUrl, canWrite }: ClientApprovalPanelProps) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [creating, setCreating] = useState(false);
  const nowISO = useMemo(() => new Date().toISOString(), []);
  const summary = useMemo(() => summarizeApprovals(approvals, nowISO), [approvals, nowISO]);

  function run(fn: () => Promise<{ ok: true } | { ok: false; message: string }>, okMsg: string) {
    startTransition(async () => {
      const res = await fn();
      if (res.ok) { toast.success(okMsg); router.refresh(); }
      else toast.error(res.message);
    });
  }

  function copyLink(token: string) {
    const url = `${baseUrl}/approve/${token}`;
    navigator.clipboard.writeText(url).then(
      () => toast.success("تم نسخ الرابط"),
      () => toast.error("تعذّر النسخ"),
    );
  }

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
        <Tile label="الإجمالي" value={`${summary.total}`} />
        <Tile label="معلّق" value={`${summary.pending}`} tone={summary.pending > 0 ? "warning" : "neutral"} />
        <Tile label="معتمد" value={`${summary.approved}`} tone="success" />
        <Tile label="مرفوض/تعديلات" value={`${summary.rejected + summary.changesRequested}`} tone={summary.rejected > 0 ? "danger" : "neutral"} />
      </div>

      <Card>
        <Header title={`روابط الاعتماد (${approvals.length})`} action={canWrite ? (
          <Button size="sm" variant="primary" icon={<Plus size={14} />} onClick={() => setCreating(true)}>رابط جديد</Button>
        ) : null} />
        {approvals.length === 0 ? (
          <div>
            <EmptyState
              title="لا يوجد مخرَج جاهز للاعتماد حتى الآن"
              description="جهّز PRD أو العرض التنفيذي أو العرض التجاري أولًا، ثم أنشئ رابط اعتماد للعميل."
            />
            <div className="mt-3 flex flex-wrap gap-2">
              <a
                className="rounded-[var(--v-radius-md)] border border-[var(--v-border)] px-3 py-1.5 text-xs text-[var(--v-text-secondary)] hover:border-[var(--v-primary)] hover:text-[var(--v-primary)]"
                href={`/dashboard/projects/${projectId}?tab=prd`}
              >
                الذهاب إلى PRD
              </a>
              <a
                className="rounded-[var(--v-radius-md)] border border-[var(--v-border)] px-3 py-1.5 text-xs text-[var(--v-text-secondary)] hover:border-[var(--v-primary)] hover:text-[var(--v-primary)]"
                href={`/dashboard/projects/${projectId}?tab=clientDelivery`}
              >
                تجهيز العرض التنفيذي
              </a>
              <a
                className="rounded-[var(--v-radius-md)] border border-[var(--v-border)] px-3 py-1.5 text-xs text-[var(--v-text-secondary)] hover:border-[var(--v-primary)] hover:text-[var(--v-primary)]"
                href={`/dashboard/projects/${projectId}?tab=commercial&section=proposals`}
              >
                الذهاب إلى العرض التجاري
              </a>
            </div>
          </div>
        ) : (
          <ul className="divide-y divide-[var(--v-border)]">
            {approvals.map((a) => {
              const eff = effectiveStatus(a, nowISO);
              return (
                <li key={a.id} className="flex items-start justify-between gap-3 py-3">
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <p className="font-medium text-[var(--v-text)]">{a.title}</p>
                      <Badge tone="info">{APPROVAL_TARGET_LABELS[a.targetType]}</Badge>
                      <Badge tone={STATUS_TONE[eff]}>{APPROVAL_STATUS_LABELS[eff]}</Badge>
                      {a.decision && <Badge tone={a.decision === "approved" ? "success" : a.decision === "rejected" ? "danger" : "warning"}>{APPROVAL_DECISION_LABELS[a.decision]}</Badge>}
                    </div>
                    {a.summary && <p className="mt-1 text-xs text-[var(--v-text-secondary)]">{a.summary}</p>}
                    <p className="mt-1 text-[11px] text-[var(--v-text-subtle)]">
                      عميل: {a.clientName || "—"} · {a.clientEmail || "—"} · تنتهي: {new Date(a.expiresAt).toLocaleDateString("ar-EG")}
                    </p>
                    {a.decisionNote && <p className="mt-1 text-[11px] text-[var(--v-text-subtle)]"><b>ملاحظة القرار:</b> {a.decisionNote}</p>}
                  </div>
                  <div className="flex shrink-0 gap-1">
                    <Button size="sm" variant="ghost" icon={<Copy size={14} />} onClick={() => copyLink(a.publicToken)}>نسخ الرابط</Button>
                    <a
                      className="inline-flex items-center gap-1 rounded-[var(--v-radius-md)] border border-[var(--v-border)] px-2 py-1 text-xs text-[var(--v-text-secondary)] hover:border-[var(--v-primary)] hover:text-[var(--v-primary)]"
                      href={`/approve/${a.publicToken}`} target="_blank" rel="noreferrer"
                    >
                      <Link2 size={12} /> فتح
                    </a>
                    {canWrite && eff === "pending" && (
                      <Button size="sm" variant="ghost" icon={<Ban size={14} />}
                        onClick={() => { const r = prompt("سبب الإلغاء؟") ?? ""; run(() => revokeApprovalAction(projectId, a.id, r), "تم الإلغاء"); }}>إلغاء</Button>
                    )}
                  </div>
                </li>
              );
            })}
          </ul>
        )}
      </Card>

      <NewApprovalDialog
        open={creating}
        onClose={() => setCreating(false)}
        onSave={(input) => {
          run(() => createApprovalAction(projectId, input).then((r) => r.ok ? { ok: true } : r), "تم الإنشاء");
          setCreating(false);
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
function Tile({ label, value, tone }: { label: string; value: string; tone?: BadgeTone }) {
  return (
    <div className="rounded-[var(--v-radius-md)] border border-[var(--v-border)] bg-[var(--v-surface)] p-3">
      <p className="text-[11px] text-[var(--v-text-muted)]">{label}</p>
      <p className="mt-1 font-mono-plex text-lg font-semibold text-[var(--v-text)]">
        {tone ? <Badge tone={tone}>{value}</Badge> : value}
      </p>
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

function NewApprovalDialog({ open, onClose, onSave }: {
  open: boolean; onClose: () => void;
  onSave: (input: {
    targetType: ApprovalTargetType; title: string; summary: string;
    clientName: string; clientEmail: string; expiresInDays: number;
  }) => void;
}) {
  const [targetType, setTargetType] = useState<ApprovalTargetType>("prd");
  const [title, setTitle] = useState("");
  const [summary, setSummary] = useState("");
  const [clientName, setClientName] = useState("");
  const [clientEmail, setClientEmail] = useState("");
  const [expiresInDays, setExpiresInDays] = useState(14);
  return (
    <Modal open={open} onClose={onClose} maxWidth="max-w-lg">
      <div className="space-y-4 p-6">
        <h2 className="text-lg font-semibold text-[var(--v-text)]">رابط اعتماد جديد</h2>
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <Field label="نوع الهدف">
            <Select value={targetType} onChange={(e) => setTargetType(e.target.value as ApprovalTargetType)}>
              {CREATE_APPROVAL_TARGET_TYPES.map((t) => <option key={t} value={t}>{APPROVAL_TARGET_LABELS[t]}</option>)}
            </Select>
          </Field>
          <Field label="ينتهي بعد (أيام)">
            <Input type="number" min={1} max={90} value={expiresInDays} onChange={(e) => setExpiresInDays(Number(e.target.value) || 14)} />
          </Field>
          <Field label="العنوان *" span={2}>
            <Input value={title} onChange={(e) => setTitle(e.target.value)} placeholder="اعتماد PRD v2" />
          </Field>
          <Field label="اسم العميل"><Input value={clientName} onChange={(e) => setClientName(e.target.value)} /></Field>
          <Field label="بريد العميل"><Input value={clientEmail} onChange={(e) => setClientEmail(e.target.value)} type="email" /></Field>
          <Field label="ملخّص" span={2}><Textarea rows={3} value={summary} onChange={(e) => setSummary(e.target.value)} /></Field>
        </div>
        <div className="flex justify-end gap-2">
          <Button variant="ghost" onClick={onClose}>إلغاء</Button>
          <Button variant="primary" onClick={() => onSave({ targetType, title, summary, clientName, clientEmail, expiresInDays })}>إنشاء الرابط</Button>
        </div>
      </div>
    </Modal>
  );
}
