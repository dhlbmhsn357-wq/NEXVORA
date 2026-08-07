"use client";

/** NEXVORA External Partners Panel (P12) */
import { useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Plus, Ban, Copy } from "lucide-react";
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
  PARTNER_ROLES, PARTNER_ROLE_LABELS,
  PARTNER_STATUS_LABELS,
  type ExternalPartnerRow, type PartnerRole, type PartnerStatus,
} from "@/lib/handoff/types";
import { summarizePartners, isPartnerActive } from "@/lib/handoff/derive";
import { createPartnerAction, updatePartnerStatusAction, revokePartnerAction } from "../partner-actions";

const STATUS_TONE: Record<PartnerStatus, BadgeTone> = {
  invited: "info", active: "success", suspended: "warning", revoked: "danger", expired: "neutral",
};

export interface PartnersPanelProps {
  projectId: string;
  partners: ExternalPartnerRow[];
  canWrite: boolean;
}

export default function PartnersPanel({ projectId, partners, canWrite }: PartnersPanelProps) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [creating, setCreating] = useState(false);
  const nowISO = useMemo(() => new Date().toISOString(), []);
  const summary = useMemo(() => summarizePartners(partners, nowISO), [partners, nowISO]);

  function run(fn: () => Promise<{ ok: true } | { ok: false; message: string }>, okMsg: string) {
    startTransition(async () => {
      const res = await fn();
      if (res.ok) { toast.success(okMsg); router.refresh(); }
      else toast.error(res.message);
    });
  }

  function copyToken(token: string) {
    navigator.clipboard.writeText(token).then(() => toast.success("تم نسخ الرمز"), () => toast.error("تعذّر النسخ"));
  }

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-2 gap-3 md:grid-cols-5">
        <Tile label="الإجمالي" value={`${summary.total}`} />
        <Tile label="نشط" value={`${summary.active}`} tone="success" />
        <Tile label="مدعوّ" value={`${summary.invited}`} tone="info" />
        <Tile label="موقوف" value={`${summary.suspended}`} tone="warning" />
        <Tile label="ملغى/منتهي" value={`${summary.revoked + summary.expired}`} tone="danger" />
      </div>

      <Card>
        <Header title={`الشركاء الخارجيون (${partners.length})`} action={canWrite ? (
          <Button size="sm" variant="primary" icon={<Plus size={14} />} onClick={() => setCreating(true)}>دعوة شريك</Button>
        ) : null} />
        {partners.length === 0 ? (
          <EmptyState title="لا شركاء بعد" description="ادعُ شريكًا تقنيًا خارجيًا (viewer/editor) للاطلاع على المشروع." />
        ) : (
          <ul className="divide-y divide-[var(--v-border)]">
            {partners.map((p) => {
              const active = isPartnerActive(p, nowISO);
              return (
                <li key={p.id} className="flex items-start justify-between gap-3 py-3">
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <p className="font-medium text-[var(--v-text)]">{p.name}</p>
                      {p.organization && <span className="text-xs text-[var(--v-text-secondary)]">· {p.organization}</span>}
                      <Badge tone="neutral">{PARTNER_ROLE_LABELS[p.role]}</Badge>
                      <Badge tone={STATUS_TONE[p.status]}>{PARTNER_STATUS_LABELS[p.status]}</Badge>
                      {active && <Badge tone="success">نشط الآن</Badge>}
                    </div>
                    <p className="mt-1 text-[11px] text-[var(--v-text-subtle)]">{p.email}</p>
                    {p.expiresAt && <p className="text-[11px] text-[var(--v-text-subtle)]">تنتهي: {new Date(p.expiresAt).toLocaleDateString("ar-EG")}</p>}
                    {p.notes && <p className="text-[11px] text-[var(--v-text-secondary)]">{p.notes}</p>}
                  </div>
                  <div className="flex shrink-0 gap-1">
                    <Button size="sm" variant="ghost" icon={<Copy size={14} />} onClick={() => copyToken(p.accessToken)}>نسخ الرمز</Button>
                    {canWrite && p.status !== "revoked" && (
                      <>
                        {p.status === "invited" && (
                          <Button size="sm" variant="ghost" onClick={() => run(() => updatePartnerStatusAction(projectId, p.id, "active"), "تم التفعيل")}>تفعيل</Button>
                        )}
                        {p.status === "active" && (
                          <Button size="sm" variant="ghost" onClick={() => run(() => updatePartnerStatusAction(projectId, p.id, "suspended"), "تم الإيقاف")}>إيقاف</Button>
                        )}
                        {p.status === "suspended" && (
                          <Button size="sm" variant="ghost" onClick={() => run(() => updatePartnerStatusAction(projectId, p.id, "active"), "تم الاستئناف")}>استئناف</Button>
                        )}
                        <Button size="sm" variant="ghost" icon={<Ban size={14} />}
                          onClick={() => { const r = prompt("سبب الإلغاء؟") ?? ""; run(() => revokePartnerAction(projectId, p.id, r), "تم الإلغاء"); }}>إلغاء</Button>
                      </>
                    )}
                  </div>
                </li>
              );
            })}
          </ul>
        )}
      </Card>

      <NewPartnerDialog
        open={creating}
        onClose={() => setCreating(false)}
        onSave={(input) => {
          run(() => createPartnerAction(projectId, input).then((r) => r.ok ? { ok: true } : r), "تم إرسال الدعوة");
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

function NewPartnerDialog({ open, onClose, onSave }: {
  open: boolean; onClose: () => void;
  onSave: (input: { name: string; email: string; organization: string; role: PartnerRole; expiresInDays: number | null; notes: string }) => void;
}) {
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [organization, setOrganization] = useState("");
  const [role, setRole] = useState<PartnerRole>("viewer");
  const [expires, setExpires] = useState<number>(30);
  const [noExpiry, setNoExpiry] = useState(false);
  const [notes, setNotes] = useState("");
  return (
    <Modal open={open} onClose={onClose} maxWidth="max-w-lg">
      <div className="space-y-4 p-6">
        <h2 className="text-lg font-semibold text-[var(--v-text)]">دعوة شريك خارجي</h2>
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <Field label="الاسم *"><Input value={name} onChange={(e) => setName(e.target.value)} /></Field>
          <Field label="البريد *"><Input type="email" value={email} onChange={(e) => setEmail(e.target.value)} /></Field>
          <Field label="المنظمة"><Input value={organization} onChange={(e) => setOrganization(e.target.value)} /></Field>
          <Field label="الدور">
            <Select value={role} onChange={(e) => setRole(e.target.value as PartnerRole)}>
              {PARTNER_ROLES.map((r) => <option key={r} value={r}>{PARTNER_ROLE_LABELS[r]}</option>)}
            </Select>
          </Field>
          <Field label="ينتهي بعد (أيام)">
            <Input type="number" min={1} max={365} disabled={noExpiry} value={expires} onChange={(e) => setExpires(Number(e.target.value) || 30)} />
          </Field>
          <Field label=" ">
            <label className="flex items-center gap-2 text-xs text-[var(--v-text-secondary)]">
              <input type="checkbox" checked={noExpiry} onChange={(e) => setNoExpiry(e.target.checked)} /> بلا انتهاء
            </label>
          </Field>
          <Field label="ملاحظات" span={2}><Textarea rows={2} value={notes} onChange={(e) => setNotes(e.target.value)} /></Field>
        </div>
        <div className="flex justify-end gap-2">
          <Button variant="ghost" onClick={onClose}>إلغاء</Button>
          <Button variant="primary" onClick={() => onSave({ name, email, organization, role, expiresInDays: noExpiry ? null : expires, notes })}>دعوة</Button>
        </div>
      </div>
    </Modal>
  );
}
