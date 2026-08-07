"use client";

/** NEXVORA Handoff Package Panel (P12) */
import { useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { CheckCircle2, PackageCheck } from "lucide-react";
import Button from "@/components/ui/Button";
import Card from "@/components/ui/Card";
import Badge, { type BadgeTone } from "@/components/ui/Badge";
import Modal from "@/components/ui/Modal";
import Input from "@/components/ui/Input";
import Textarea from "@/components/ui/Textarea";
import Select from "@/components/ui/Select";
import Progress from "@/components/ui/Progress";
import EmptyState from "@/components/ui/EmptyState";
import { toast } from "@/components/ui/Toaster";
import {
  HANDOFF_ITEM_REGISTRY, HANDOFF_ITEM_STATUSES, HANDOFF_ITEM_STATUS_LABELS,
  HANDOFF_PACKAGE_STATUS_LABELS,
  type HandoffPackageRow, type HandoffItemRow, type HandoffItemStatus, type HandoffItemDef,
} from "@/lib/handoff/types";
import { deriveHandoffReadiness, effectivePackageStatus } from "@/lib/handoff/derive";
import { createPackageAction, updateItemAction, finalizePackageAction } from "../handoff-actions";

export interface HandoffPanelProps {
  projectId: string;
  packages: HandoffPackageRow[];
  items: HandoffItemRow[];   // items للحزمة الأخيرة فقط
  latestPackage: HandoffPackageRow | null;
  canWrite: boolean;
}

const CATEGORY_LABELS: Record<HandoffItemDef["category"], string> = {
  docs: "وثائق", code: "كود", ops: "تشغيل", handover: "تسليم", compliance: "امتثال",
};

export default function HandoffPanel({ projectId, packages, items, latestPackage, canWrite }: HandoffPanelProps) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [editing, setEditing] = useState<HandoffItemDef | null>(null);

  const readiness = useMemo(() => deriveHandoffReadiness(items), [items]);
  const effStatus = latestPackage ? effectivePackageStatus(latestPackage.status, readiness) : "draft";
  const itemsByKey = useMemo(() => new Map(items.map((i) => [i.itemKey, i])), [items]);

  const mandatoryDefs = HANDOFF_ITEM_REGISTRY.filter((d) => d.isMandatory);
  const optionalDefs = HANDOFF_ITEM_REGISTRY.filter((d) => !d.isMandatory);

  function run(fn: () => Promise<{ ok: true } | { ok: false; message: string }>, okMsg: string) {
    startTransition(async () => {
      const res = await fn();
      if (res.ok) { toast.success(okMsg); router.refresh(); }
      else toast.error(res.message);
    });
  }

  if (!latestPackage) {
    return (
      <Card>
        <EmptyState
          title="لا حزمة تسليم بعد"
          description="ابدأ حزمة تسليم جديدة — سيتم بذر الـ 7 عناصر الإلزامية تلقائيًا."
          primaryAction={canWrite ? {
            label: "حزمة جديدة",
            onClick: () => run(() => createPackageAction(projectId).then((r) => r.ok ? { ok: true } : r), "تم إنشاء الحزمة"),
          } : undefined}
        />
      </Card>
    );
  }

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
        <Tile label="النسخة" value={`v${latestPackage.version}`} />
        <Tile label="الحالة" value={HANDOFF_PACKAGE_STATUS_LABELS[effStatus]} tone={effStatus === "finalized" ? "success" : effStatus === "ready" ? "info" : "warning"} />
        <Tile label="الجاهزية الكلية" value={`${readiness.overallScore}%`} tone={readiness.ready ? "success" : "warning"} />
        <Tile label="الإلزاميات" value={`${readiness.mandatoryCompleted}/${readiness.mandatoryTotal}`} tone={readiness.ready ? "success" : "danger"} />
      </div>

      <Card>
        <Header title="مؤشر الجاهزية" />
        <div className="space-y-3">
          <Progress value={readiness.mandatoryPercent} tone={readiness.ready ? "success" : "warning"} label="الإلزاميات (7)" />
          <Progress value={readiness.optionalPercent} tone="primary" label="الاختياريات (18)" />
          <Progress value={readiness.overallScore} tone={readiness.ready ? "success" : "warning"} label="النقاط الكلية (80% إلزامي + 20% اختياري)" />
        </div>
        {readiness.missingMandatory.length > 0 && (
          <p className="mt-3 text-xs text-[var(--v-red)]">
            المفقود: {readiness.missingMandatory.map((d) => d.label).join(" · ")}
          </p>
        )}
        {canWrite && (
          <div className="mt-4 flex justify-end gap-2">
            <Button variant="ghost" onClick={() => run(() => createPackageAction(projectId).then((r) => r.ok ? { ok: true } : r), "تم إنشاء نسخة جديدة")}>نسخة جديدة</Button>
            <Button
              variant="primary" icon={<PackageCheck size={14} />}
              disabled={!readiness.ready || effStatus === "finalized"}
              onClick={() => { if (!confirm("تأكيد تسليم هذه الحزمة؟")) return; run(() => finalizePackageAction(projectId, latestPackage.id), "تم التسليم"); }}
            >
              {effStatus === "finalized" ? "مُسلَّمة" : "تسليم رسمي"}
            </Button>
          </div>
        )}
      </Card>

      <Card>
        <Header title={`العناصر الإلزامية (${mandatoryDefs.length})`} />
        <ItemsList defs={mandatoryDefs} itemsByKey={itemsByKey} onEdit={setEditing} canWrite={canWrite} />
      </Card>

      <Card>
        <Header title={`العناصر الاختيارية (${optionalDefs.length})`} />
        <ItemsList defs={optionalDefs} itemsByKey={itemsByKey} onEdit={setEditing} canWrite={canWrite} />
      </Card>

      {packages.length > 1 && (
        <Card>
          <Header title="النسخ السابقة" />
          <ul className="divide-y divide-[var(--v-border)]">
            {packages.filter((p) => p.id !== latestPackage.id).map((p) => (
              <li key={p.id} className="flex items-center justify-between py-2 text-sm">
                <span>v{p.version} · {p.title}</span>
                <Badge tone="neutral">{HANDOFF_PACKAGE_STATUS_LABELS[p.status]}</Badge>
              </li>
            ))}
          </ul>
        </Card>
      )}

      <ItemDialog
        key={editing?.key ?? "closed"}
        open={editing !== null}
        onClose={() => setEditing(null)}
        def={editing}
        current={editing ? itemsByKey.get(editing.key) ?? null : null}
        onSave={(input) => {
          if (!editing) return;
          run(() => updateItemAction(projectId, latestPackage.id, editing.key, input).then((r) => r.ok ? { ok: true } : r), "تم التحديث");
          setEditing(null);
        }}
      />
      {pending && <span className="sr-only">جارٍ الحفظ...</span>}
    </div>
  );
}

function ItemsList({ defs, itemsByKey, onEdit, canWrite }: {
  defs: readonly HandoffItemDef[];
  itemsByKey: Map<string, HandoffItemRow>;
  onEdit: (def: HandoffItemDef) => void;
  canWrite: boolean;
}) {
  return (
    <ul className="divide-y divide-[var(--v-border)]">
      {defs.map((d) => {
        const row = itemsByKey.get(d.key);
        const status = row?.status ?? "pending";
        const tone: BadgeTone = status === "completed" ? "success" : status === "in_progress" ? "info" : status === "skipped" ? "neutral" : "warning";
        return (
          <li key={d.key} className="flex items-start justify-between gap-3 py-2">
            <div className="min-w-0 flex-1">
              <div className="flex flex-wrap items-center gap-2">
                {status === "completed" && <CheckCircle2 size={14} className="text-[var(--v-green)]" />}
                <p className="text-sm font-medium text-[var(--v-text)]">{d.label}</p>
                <Badge tone="neutral">{CATEGORY_LABELS[d.category]}</Badge>
                <Badge tone={tone}>{HANDOFF_ITEM_STATUS_LABELS[status]}</Badge>
                {d.isMandatory && <Badge tone="danger">إلزامي</Badge>}
              </div>
              <p className="text-[11px] text-[var(--v-text-subtle)]">{d.description}</p>
              {row?.contentUrl && (
                <a className="mt-1 inline-block text-[11px] text-[var(--v-primary)] hover:underline" href={row.contentUrl} target="_blank" rel="noreferrer">{row.contentUrl}</a>
              )}
              {row?.notes && <p className="text-[11px] text-[var(--v-text-secondary)]">{row.notes}</p>}
            </div>
            {canWrite && <Button size="sm" variant="ghost" onClick={() => onEdit(d)}>تعديل</Button>}
          </li>
        );
      })}
    </ul>
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

function ItemDialog({ open, onClose, def, current, onSave }: {
  open: boolean; onClose: () => void; def: HandoffItemDef | null; current: HandoffItemRow | null;
  onSave: (input: { status: HandoffItemStatus; contentUrl: string; contentText: string; notes: string }) => void;
}) {
  const [status, setStatus] = useState<HandoffItemStatus>(current?.status ?? "pending");
  const [contentUrl, setContentUrl] = useState(current?.contentUrl ?? "");
  const [contentText, setContentText] = useState(current?.contentText ?? "");
  const [notes, setNotes] = useState(current?.notes ?? "");
  return (
    <Modal open={open} onClose={onClose} maxWidth="max-w-lg">
      <div className="space-y-4 p-6">
        <h2 className="text-lg font-semibold text-[var(--v-text)]">{def?.label ?? ""}</h2>
        {def && <p className="text-xs text-[var(--v-text-secondary)]">{def.description}</p>}
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <Field label="الحالة">
            <Select value={status} onChange={(e) => setStatus(e.target.value as HandoffItemStatus)}>
              {HANDOFF_ITEM_STATUSES.map((s) => <option key={s} value={s}>{HANDOFF_ITEM_STATUS_LABELS[s]}</option>)}
            </Select>
          </Field>
          <Field label="رابط المحتوى"><Input value={contentUrl} onChange={(e) => setContentUrl(e.target.value)} placeholder="https://..." /></Field>
          <Field label="محتوى نصّي" span={2}><Textarea rows={3} value={contentText} onChange={(e) => setContentText(e.target.value)} /></Field>
          <Field label="ملاحظات" span={2}><Textarea rows={2} value={notes} onChange={(e) => setNotes(e.target.value)} /></Field>
        </div>
        <div className="flex justify-end gap-2">
          <Button variant="ghost" onClick={onClose}>إلغاء</Button>
          <Button variant="primary" onClick={() => onSave({ status, contentUrl, contentText, notes })}>حفظ</Button>
        </div>
      </div>
    </Modal>
  );
}
