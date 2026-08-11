"use client";

/** NEXVORA Handoff Package Panel (P12) */
import { useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { CheckCircle2, PackageCheck, Printer, Sparkles, Lock, AlertTriangle } from "lucide-react";
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
  HANDOFF_QUESTION_STATUSES, HANDOFF_QUESTION_STATUS_LABELS,
  HANDOFF_DELIVERY_STATUSES, HANDOFF_DELIVERY_STATUS_LABELS,
  type HandoffPackageRow, type HandoffItemRow, type HandoffItemStatus, type HandoffItemDef,
  type HandoffQuestionRow,
  type HandoffDeliveryRow, type HandoffDeliveryStatus,
  type ExternalPartnerRow,
} from "@/lib/handoff/types";
import { deriveHandoffReadiness, effectivePackageStatus, summarizeQuestions } from "@/lib/handoff/derive";
import {
  createPackageAction, updateItemAction, finalizePackageAction,
  createQuestionAction, answerQuestionAction, updateQuestionStatusAction,
  createDeliveryAction, updateDeliveryStatusAction,
  previewAssemblyAction, applyAssemblyAction,
  freezePackageAction,
} from "../handoff-actions";
import type { AssemblyPreview } from "@/lib/handoff/assembler";

export interface HandoffPanelProps {
  projectId: string;
  packages: HandoffPackageRow[];
  items: HandoffItemRow[];   // items للحزمة الأخيرة فقط
  latestPackage: HandoffPackageRow | null;
  canWrite: boolean;
  questions?: HandoffQuestionRow[];
  deliveries?: HandoffDeliveryRow[];
  partners?: ExternalPartnerRow[];
}

type SubTab = "items" | "questions" | "deliveries";

const CATEGORY_LABELS: Record<HandoffItemDef["category"], string> = {
  docs: "وثائق", code: "كود", ops: "تشغيل", handover: "تسليم", compliance: "امتثال",
};

export default function HandoffPanel({
  projectId, packages, items, latestPackage, canWrite,
  questions = [], deliveries = [], partners = [],
}: HandoffPanelProps) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [editing, setEditing] = useState<HandoffItemDef | null>(null);
  const [subtab, setSubtab] = useState<SubTab>("items");
  const [preview, setPreview] = useState<AssemblyPreview[] | null>(null);
  const [previewLoading, setPreviewLoading] = useState(false);
  const [frozenSnap, setFrozenSnap] = useState<{ snapshotId: string; version: number } | null>(null);

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

  async function openPreview() {
    if (!latestPackage) return;
    setPreviewLoading(true);
    const res = await previewAssemblyAction(projectId, latestPackage.id);
    setPreviewLoading(false);
    if (!res.ok) { toast.error(res.message); return; }
    setPreview(res.data ?? []);
  }
  function applyAndClose() {
    if (!latestPackage) return;
    startTransition(async () => {
      const res = await applyAssemblyAction(projectId, latestPackage.id);
      if (!res.ok) { toast.error(res.message); return; }
      const d = res.data;
      toast.success(`تم التجميع: تحديث ${d?.updated ?? 0} · تخطّي ${d?.skipped ?? 0}${d && d.failed > 0 ? ` · فشل ${d.failed}` : ""}`);
      setPreview(null);
      router.refresh();
    });
  }
  function doFreeze() {
    if (!latestPackage) return;
    if (!confirm("تسليم رسمي: سيُنشأ Snapshot ثابت للحزمة. متابعة؟")) return;
    startTransition(async () => {
      const res = await freezePackageAction(projectId, latestPackage.id);
      if (!res.ok) { toast.error(res.message); return; }
      toast.success(`تم تجميد النسخة v${res.data?.version ?? "?"}`);
      setFrozenSnap(res.data ?? null);
      router.refresh();
    });
  }

  if (!latestPackage) {
    return (
      <Card>
        <EmptyState
          title="لا حزمة تسليم بعد"
          description="ابدأ حزمة تسليم جديدة — سيتم بذر الـ 7 عناصر الإلزامية تلقائيًا، ويمكنك بعدها تجميعها تلقائيًا من مخرجات المشروع."
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
        <div className="mt-4 flex justify-end gap-2">
          <Button
            variant="ghost"
            size="sm"
            icon={<Printer size={13} />}
            onClick={() => window.open(`/handoff-print/${projectId}`, "_blank")}
          >
            طباعة / تصدير PDF
          </Button>
        </div>
        {canWrite && (
          <div className="mt-4 flex flex-wrap items-center justify-end gap-2">
            <Button
              variant="primary" icon={<Sparkles size={14} />}
              disabled={previewLoading || effStatus === "finalized"}
              onClick={openPreview}
            >
              {previewLoading ? "جارٍ الفحص..." : "تجميع الحزمة من المشروع"}
            </Button>
            <Button variant="ghost" onClick={() => run(() => createPackageAction(projectId).then((r) => r.ok ? { ok: true } : r), "تم إنشاء نسخة جديدة")}>نسخة جديدة</Button>
            <Button
              variant="primary" icon={<Lock size={14} />}
              disabled={!readiness.ready || effStatus === "finalized"}
              onClick={doFreeze}
            >
              {effStatus === "finalized" ? "مُسلَّمة (مُجمَّدة)" : "تسليم رسمي"}
            </Button>
            <Button
              variant="ghost"
              disabled={!readiness.ready || effStatus === "finalized"}
              onClick={() => { if (!confirm("تأكيد تسليم هذه الحزمة (بدون تجميد Snapshot)؟")) return; run(() => finalizePackageAction(projectId, latestPackage.id), "تم التسليم"); }}
            >
              <PackageCheck size={14} /> تسليم بلا تجميد
            </Button>
          </div>
        )}
        {frozenSnap && (
          <p className="mt-2 text-xs text-[var(--v-green)]">
            تم إنشاء Snapshot v{frozenSnap.version} (id: {frozenSnap.snapshotId.slice(0, 8)}…)
          </p>
        )}
        {readiness.stale > 0 && (
          <p className="mt-2 text-xs text-[var(--v-amber)] flex items-center gap-1">
            <AlertTriangle size={12} /> {readiness.stale} عنصر تلقائي تغيّر مصدره — أعد التجميع.
          </p>
        )}
      </Card>

      {/* Subtabs (0107) */}
      <div className="flex flex-wrap gap-1 border-b border-[var(--v-border)]">
        <SubtabButton active={subtab === "items"} onClick={() => setSubtab("items")}>عناصر التسليم</SubtabButton>
        <SubtabButton active={subtab === "questions"} onClick={() => setSubtab("questions")}>أسئلة الشريك ({questions.length})</SubtabButton>
        <SubtabButton active={subtab === "deliveries"} onClick={() => setSubtab("deliveries")}>سجل التسليم ({deliveries.length})</SubtabButton>
      </div>

      {subtab === "items" && (
        <>
          <Card>
            <Header title={`العناصر الإلزامية (${mandatoryDefs.length})`} />
            <ItemsList defs={mandatoryDefs} itemsByKey={itemsByKey} onEdit={setEditing} canWrite={canWrite} />
          </Card>
          <Card>
            <Header title={`العناصر الاختيارية (${optionalDefs.length})`} />
            <ItemsList defs={optionalDefs} itemsByKey={itemsByKey} onEdit={setEditing} canWrite={canWrite} />
          </Card>
        </>
      )}

      {subtab === "questions" && (
        <QuestionsSection
          projectId={projectId}
          packageId={latestPackage.id}
          questions={questions}
          partners={partners}
          canWrite={canWrite}
          runFn={run}
        />
      )}

      {subtab === "deliveries" && (
        <DeliveriesSection
          projectId={projectId}
          packageId={latestPackage.id}
          deliveries={deliveries}
          partners={partners}
          canWrite={canWrite}
          runFn={run}
        />
      )}

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
      <PreviewModal
        open={preview !== null}
        previews={preview ?? []}
        onClose={() => setPreview(null)}
        onConfirm={applyAndClose}
        pending={pending}
      />
      {pending && <span className="sr-only">جارٍ الحفظ...</span>}
    </div>
  );
}

function PreviewModal({
  open, previews, onClose, onConfirm, pending,
}: {
  open: boolean; previews: AssemblyPreview[];
  onClose: () => void; onConfirm: () => void; pending: boolean;
}) {
  const actionLabel: Record<AssemblyPreview["action"], string> = {
    will_link: "سيُربط تلقائيًا",
    already_linked_same: "مُربوط أصلًا",
    stale_will_update: "قديم — سيُحدَّث",
    skipped_manual: "تم تخطّيه (Manual Override)",
    cannot_resolve: "لا يمكن حلّه",
  };
  const actionTone: Record<AssemblyPreview["action"], BadgeTone> = {
    will_link: "success",
    already_linked_same: "neutral",
    stale_will_update: "warning",
    skipped_manual: "info",
    cannot_resolve: "danger",
  };
  const applicable = previews.filter((p) => p.action === "will_link" || p.action === "stale_will_update").length;
  return (
    <Modal open={open} onClose={onClose} maxWidth="max-w-2xl">
      <div className="space-y-4 p-6">
        <h2 className="text-lg font-semibold text-[var(--v-text)]">فحص المخرجات وتجميع الحزمة</h2>
        <p className="text-xs text-[var(--v-text-secondary)]">
          سيتم قراءة المصادر المعتمَدة داخل المشروع فقط (مسوّدات لا تُحسب) وربطها بعناصر الحزمة.
          العناصر ذات Manual Override لا تُلمس.
        </p>
        <div className="max-h-[50vh] overflow-y-auto rounded-[var(--v-radius-md)] border border-[var(--v-border)]">
          <ul className="divide-y divide-[var(--v-border)]">
            {previews.map((p) => {
              const def = HANDOFF_ITEM_REGISTRY.find((d) => d.key === p.itemKey);
              return (
                <li key={p.itemKey} className="flex flex-col gap-1 p-3">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="text-sm font-medium text-[var(--v-text)]">{def?.label ?? p.itemKey}</span>
                    <Badge tone={actionTone[p.action]}>{actionLabel[p.action]}</Badge>
                    <Badge tone="neutral">مصدر: {p.resolved.sourceType}</Badge>
                  </div>
                  <p className="text-[11px] text-[var(--v-text-subtle)]">
                    الحالة الحالية: {p.currentStatus} · مصدر: {p.resolved.status} · {p.resolved.reason}
                  </p>
                </li>
              );
            })}
          </ul>
        </div>
        <div className="flex items-center justify-between gap-2">
          <span className="text-xs text-[var(--v-text-secondary)]">
            سيُطبَّق على {applicable} عنصر.
          </span>
          <div className="flex gap-2">
            <Button variant="ghost" onClick={onClose} disabled={pending}>إلغاء</Button>
            <Button variant="primary" onClick={onConfirm} disabled={pending || applicable === 0}>
              {pending ? "جارٍ التطبيق..." : "تأكيد التجميع"}
            </Button>
          </div>
        </div>
      </div>
    </Modal>
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
                {row?.sourceType && !row.isManualOverride && (
                  <Badge tone="info">
                    Auto · {row.sourceType}{row.sourceVersion ? ` v${row.sourceVersion.replace(/^listhash:/, "L:")}` : ""}
                  </Badge>
                )}
                {row?.isManualOverride && <Badge tone="warning">Manual Override</Badge>}
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

// ============================================================================
// Subtab helpers (0107)
// ============================================================================
function SubtabButton({ active, onClick, children }: { active: boolean; onClick: () => void; children: React.ReactNode }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`px-3 py-2 text-sm ${active ? "border-b-2 border-[var(--v-primary)] font-semibold text-[var(--v-primary)]" : "text-[var(--v-text-secondary)] hover:text-[var(--v-text)]"}`}
    >
      {children}
    </button>
  );
}

type RunFn = (
  fn: () => Promise<{ ok: true } | { ok: false; message: string }>,
  okMsg: string,
) => void;

function QuestionsSection({
  projectId, packageId, questions, partners, canWrite, runFn,
}: {
  projectId: string; packageId: string;
  questions: HandoffQuestionRow[]; partners: ExternalPartnerRow[];
  canWrite: boolean; runFn: RunFn;
}) {
  const [creating, setCreating] = useState(false);
  const [answering, setAnswering] = useState<HandoffQuestionRow | null>(null);
  const summary = useMemo(() => summarizeQuestions(questions), [questions]);

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
        <Tile label="مفتوح" value={`${summary.open}`} tone="warning" />
        <Tile label="مُجاب" value={`${summary.answered}`} tone="info" />
        <Tile label="يحتاج توضيح" value={`${summary.needsClarification}`} tone="warning" />
        <Tile label="مغلق" value={`${summary.closed}`} tone="success" />
      </div>
      <Card>
        <Header title="أسئلة الشريك" action={canWrite ? (
          <Button size="sm" variant="primary" onClick={() => setCreating(true)}>سؤال جديد</Button>
        ) : null} />
        {questions.length === 0 ? (
          <EmptyState title="لا أسئلة" description="ابدأ بتسجيل أول سؤال من شريك التسليم." />
        ) : (
          <ul className="divide-y divide-[var(--v-border)]">
            {questions.map((q) => {
              const p = partners.find((x) => x.id === q.partnerId);
              return (
                <li key={q.id} className="py-3">
                  <div className="flex flex-wrap items-center gap-2">
                    <p className="flex-1 text-sm font-medium text-[var(--v-text)]">{q.question}</p>
                    <Badge tone={q.status === "closed" ? "success" : q.status === "answered" ? "info" : "warning"}>
                      {HANDOFF_QUESTION_STATUS_LABELS[q.status]}
                    </Badge>
                  </div>
                  {p && <p className="text-[11px] text-[var(--v-text-subtle)]">شريك: {p.name}</p>}
                  {q.answer && (
                    <p className="mt-1 rounded-[var(--v-radius-sm)] bg-[var(--v-bg)] p-2 text-xs text-[var(--v-text-secondary)]">
                      الإجابة: {q.answer}
                    </p>
                  )}
                  {canWrite && (
                    <div className="mt-2 flex flex-wrap gap-1">
                      <Button size="sm" variant="ghost" onClick={() => setAnswering(q)}>إجابة</Button>
                      {HANDOFF_QUESTION_STATUSES.filter((s) => s !== q.status).map((s) => (
                        <Button key={s} size="sm" variant="ghost"
                          onClick={() => runFn(() => updateQuestionStatusAction(projectId, q.id, s), "تم التحديث")}
                        >
                          {HANDOFF_QUESTION_STATUS_LABELS[s]}
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
      <NewQuestionDialog
        open={creating}
        onClose={() => setCreating(false)}
        partners={partners}
        onSave={(input) => {
          runFn(() => createQuestionAction(projectId, packageId, input).then((r) => r.ok ? { ok: true } : r), "تم الإنشاء");
          setCreating(false);
        }}
      />
      <AnswerQuestionDialog
        open={answering !== null}
        onClose={() => setAnswering(null)}
        question={answering}
        onSave={(answer) => {
          if (!answering) return;
          runFn(() => answerQuestionAction(projectId, answering.id, answer), "تم إرسال الإجابة");
          setAnswering(null);
        }}
      />
    </div>
  );
}

function NewQuestionDialog({ open, onClose, partners, onSave }: {
  open: boolean; onClose: () => void;
  partners: ExternalPartnerRow[];
  onSave: (input: { question: string; partnerId: string | null }) => void;
}) {
  const [question, setQuestion] = useState("");
  const [partnerId, setPartnerId] = useState("");
  return (
    <Modal open={open} onClose={onClose} maxWidth="max-w-lg">
      <div className="space-y-4 p-6">
        <h2 className="text-lg font-semibold text-[var(--v-text)]">سؤال جديد</h2>
        <Field label="السؤال *" span={2}><Textarea rows={3} value={question} onChange={(e) => setQuestion(e.target.value)} /></Field>
        <Field label="الشريك">
          <Select value={partnerId} onChange={(e) => setPartnerId(e.target.value)}>
            <option value="">— بلا —</option>
            {partners.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
          </Select>
        </Field>
        <div className="flex justify-end gap-2">
          <Button variant="ghost" onClick={onClose}>إلغاء</Button>
          <Button variant="primary" onClick={() => onSave({ question, partnerId: partnerId || null })}>إرسال</Button>
        </div>
      </div>
    </Modal>
  );
}

function AnswerQuestionDialog({ open, onClose, question, onSave }: {
  open: boolean; onClose: () => void;
  question: HandoffQuestionRow | null;
  onSave: (answer: string) => void;
}) {
  const [answer, setAnswer] = useState(question?.answer ?? "");
  return (
    <Modal open={open} onClose={onClose} maxWidth="max-w-lg">
      <div className="space-y-4 p-6">
        <h2 className="text-lg font-semibold text-[var(--v-text)]">إجابة السؤال</h2>
        {question && <p className="text-sm text-[var(--v-text-secondary)]">{question.question}</p>}
        <Field label="الإجابة" span={2}><Textarea rows={4} value={answer} onChange={(e) => setAnswer(e.target.value)} /></Field>
        <div className="flex justify-end gap-2">
          <Button variant="ghost" onClick={onClose}>إلغاء</Button>
          <Button variant="primary" onClick={() => onSave(answer)}>إرسال</Button>
        </div>
      </div>
    </Modal>
  );
}

function DeliveriesSection({
  projectId, packageId, deliveries, partners, canWrite, runFn,
}: {
  projectId: string; packageId: string;
  deliveries: HandoffDeliveryRow[]; partners: ExternalPartnerRow[];
  canWrite: boolean; runFn: RunFn;
}) {
  const [creating, setCreating] = useState(false);
  return (
    <div className="space-y-4">
      <Card>
        <Header title="سجل التسليم" action={canWrite ? (
          <Button size="sm" variant="primary" onClick={() => setCreating(true)}>تسجيل تسليم</Button>
        ) : null} />
        {deliveries.length === 0 ? (
          <EmptyState title="لا تسليمات" description="ابدأ بتسجيل أول عملية تسليم أو استلام." />
        ) : (
          <ul className="divide-y divide-[var(--v-border)]">
            {deliveries.map((d) => (
              <li key={d.id} className="py-3">
                <div className="flex flex-wrap items-center gap-2">
                  <p className="flex-1 text-sm font-medium text-[var(--v-text)]">
                    {d.partnerName || partners.find((p) => p.id === d.partnerId)?.name || "شريك"}
                  </p>
                  <Badge tone={d.receiptStatus === "accepted" ? "success" : d.receiptStatus === "rejected" ? "danger" : "info"}>
                    {HANDOFF_DELIVERY_STATUS_LABELS[d.receiptStatus]}
                  </Badge>
                </div>
                <div className="mt-1 flex flex-wrap gap-3 text-[11px] text-[var(--v-text-muted)]">
                  {d.sentAt && <span>أُرسل: {new Date(d.sentAt).toLocaleString("ar-EG")}</span>}
                  {d.receivedAt && <span>استُلم: {new Date(d.receivedAt).toLocaleString("ar-EG")}</span>}
                  {d.acceptedAt && <span>قُبل: {new Date(d.acceptedAt).toLocaleString("ar-EG")}</span>}
                  {d.rejectedAt && <span className="text-[var(--v-red)]">رُفض: {new Date(d.rejectedAt).toLocaleString("ar-EG")}</span>}
                </div>
                {d.notes && <p className="mt-1 text-xs text-[var(--v-text-secondary)]">{d.notes}</p>}
                {canWrite && (
                  <div className="mt-2 flex flex-wrap gap-1">
                    {HANDOFF_DELIVERY_STATUSES.filter((s) => s !== d.receiptStatus).map((s) => (
                      <Button key={s} size="sm" variant="ghost"
                        onClick={() => runFn(() => updateDeliveryStatusAction(projectId, d.id, s), "تم التحديث")}
                      >
                        {HANDOFF_DELIVERY_STATUS_LABELS[s]}
                      </Button>
                    ))}
                  </div>
                )}
              </li>
            ))}
          </ul>
        )}
      </Card>
      <NewDeliveryDialog
        open={creating}
        onClose={() => setCreating(false)}
        partners={partners}
        onSave={(input) => {
          runFn(() => createDeliveryAction(projectId, packageId, input).then((r) => r.ok ? { ok: true } : r), "تم الإنشاء");
          setCreating(false);
        }}
      />
    </div>
  );
}

function NewDeliveryDialog({ open, onClose, partners, onSave }: {
  open: boolean; onClose: () => void;
  partners: ExternalPartnerRow[];
  onSave: (input: {
    partnerId: string | null; partnerName: string; receiptStatus: HandoffDeliveryStatus; notes: string;
  }) => void;
}) {
  const [partnerId, setPartnerId] = useState("");
  const [partnerName, setPartnerName] = useState("");
  const [receiptStatus, setReceiptStatus] = useState<HandoffDeliveryStatus>("sent");
  const [notes, setNotes] = useState("");
  return (
    <Modal open={open} onClose={onClose} maxWidth="max-w-lg">
      <div className="space-y-4 p-6">
        <h2 className="text-lg font-semibold text-[var(--v-text)]">تسجيل تسليم جديد</h2>
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <Field label="الشريك (اختياري)">
            <Select value={partnerId} onChange={(e) => setPartnerId(e.target.value)}>
              <option value="">— بلا —</option>
              {partners.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
            </Select>
          </Field>
          <Field label="اسم الشريك (لو بلا صفّية)"><Input value={partnerName} onChange={(e) => setPartnerName(e.target.value)} /></Field>
          <Field label="الحالة">
            <Select value={receiptStatus} onChange={(e) => setReceiptStatus(e.target.value as HandoffDeliveryStatus)}>
              {HANDOFF_DELIVERY_STATUSES.map((s) => <option key={s} value={s}>{HANDOFF_DELIVERY_STATUS_LABELS[s]}</option>)}
            </Select>
          </Field>
          <Field label="ملاحظات" span={2}><Textarea rows={2} value={notes} onChange={(e) => setNotes(e.target.value)} /></Field>
        </div>
        <div className="flex justify-end gap-2">
          <Button variant="ghost" onClick={onClose}>إلغاء</Button>
          <Button variant="primary" onClick={() => onSave({ partnerId: partnerId || null, partnerName, receiptStatus, notes })}>حفظ</Button>
        </div>
      </div>
    </Modal>
  );
}
