"use client";

/**
 * NEXVORA Product Definition Panel (P6)
 * ======================================
 * تبويب "تعريف المنتج" — يظهر داخل صفحة المشروع لما product_mode مفعّل.
 * ثلاث أقسام: Personas / User Flows / Requirements (MoSCoW).
 */
import { useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Plus, Pencil, Trash2, Star, GitBranch, ListChecks, Target } from "lucide-react";
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
  FLOW_TYPES, FLOW_TYPE_LABELS,
  MOSCOW_PRIORITIES, MOSCOW_LABELS,
  REQUIREMENT_STATUSES, REQUIREMENT_STATUS_LABELS,
  REQUIREMENT_TYPES, REQUIREMENT_TYPE_LABELS,
  type PersonaRow, type UserFlowRow, type RequirementRow, type FlowType,
  type MoscowPriority, type RequirementStatus, type RequirementType,
} from "@/lib/product-definition/types";
import {
  summarizePersonas, summarizeFlows, summarizeRequirements,
  deriveDefinitionReadiness,
} from "@/lib/product-definition/derive";
import {
  createPersonaAction, updatePersonaAction, deletePersonaAction,
  createFlowAction, updateFlowAction, deleteFlowAction,
  createRequirementAction, updateRequirementAction, deleteRequirementAction,
} from "./definition-actions";

// ---------------------------------------------------------------------------
// Tones
// ---------------------------------------------------------------------------
const FLOW_TONE: Record<FlowType, BadgeTone> = {
  primary: "primary", secondary: "info", edge: "warning",
};
const MOSCOW_TONE: Record<MoscowPriority, BadgeTone> = {
  must: "danger", should: "warning", could: "info", wont: "neutral",
};
const REQ_STATUS_TONE: Record<RequirementStatus, BadgeTone> = {
  draft: "neutral", approved: "info", in_progress: "warning",
  done: "success", deferred: "neutral",
};

export interface DefinitionPanelProps {
  projectId: string;
  personas: PersonaRow[];
  flows: UserFlowRow[];
  requirements: RequirementRow[];
  canWrite: boolean;
}

export default function DefinitionPanel(props: DefinitionPanelProps) {
  const { projectId, personas, flows, requirements, canWrite } = props;
  const router = useRouter();
  const [pending, startTransition] = useTransition();

  const [editingPersona, setEditingPersona] = useState<PersonaRow | null>(null);
  const [creatingPersona, setCreatingPersona] = useState(false);
  const [editingFlow, setEditingFlow] = useState<UserFlowRow | null>(null);
  const [creatingFlow, setCreatingFlow] = useState(false);
  const [editingReq, setEditingReq] = useState<RequirementRow | null>(null);
  const [creatingReq, setCreatingReq] = useState(false);

  const pSum = useMemo(() => summarizePersonas(personas), [personas]);
  const fSum = useMemo(() => summarizeFlows(flows), [flows]);
  const rSum = useMemo(() => summarizeRequirements(requirements), [requirements]);
  const readiness = useMemo(
    () => deriveDefinitionReadiness(personas, flows, requirements),
    [personas, flows, requirements],
  );

  function runAction<T>(fn: () => Promise<{ ok: true; data?: T } | { ok: false; message: string }>, okMsg: string) {
    startTransition(async () => {
      const res = await fn();
      if (res.ok) { toast.success(okMsg); router.refresh(); }
      else toast.error(res.message);
    });
  }

  return (
    <div className="space-y-6">
      {/* Header stats */}
      <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
        <StatTile icon={<Star size={16} />} label="شرائح المستخدمين" value={`${pSum.total}`} sub={pSum.primary ? `${pSum.primary} رئيسية` : ""} />
        <StatTile icon={<GitBranch size={16} />} label="سيناريوهات" value={`${fSum.total}`} sub={`${fSum.byType.primary} رئيسي`} />
        <StatTile icon={<ListChecks size={16} />} label="متطلبات" value={`${rSum.total}`} sub={`Must ${rSum.mustRatio}%`} tone={rSum.mustRatio > 60 ? "warning" : undefined} />
        <StatTile icon={<Target size={16} />} label="جاهزية التعريف" value={`${readiness.score}%`} tone={readiness.ready ? "success" : readiness.score >= 40 ? "warning" : "danger"} />
      </div>

      {/* Readiness checklist */}
      <Card>
        <SectionHeader title="مؤشر جاهزية تعريف المنتج قبل PRD" />
        <ul className="grid grid-cols-1 gap-2 md:grid-cols-2 lg:grid-cols-3">
          <ReadinessCheck ok={readiness.checks.hasPrimaryPersonaOk} label="≥ 1 persona رئيسية" actual={`${readiness.breakdown.primaryPersonas}`} />
          <ReadinessCheck ok={readiness.checks.hasPrimaryFlowOk} label="≥ 1 flow رئيسي" actual={`${readiness.breakdown.primaryFlows}`} />
          <ReadinessCheck ok={readiness.checks.minApprovedReqsOk} label="≥ 5 متطلبات معتمدة" actual={`${readiness.breakdown.approvedReqs}`} />
          <ReadinessCheck ok={readiness.checks.healthyMustRatioOk} label="Must ≤ 60% (تركيز صحي)" actual={`${readiness.breakdown.mustRatio}%`} />
          <ReadinessCheck ok={readiness.checks.lowOrphanRatioOk} label="Orphans ≤ 20%" actual={`${readiness.breakdown.orphanRatio}%`} />
        </ul>
        {!readiness.ready && (
          <p className="mt-3 text-xs text-[var(--v-text-muted)]">
            الجاهزية الحالية {readiness.score}% — التوصية بلوغ 70% قبل الانتقال لـ PRD/User Stories.
          </p>
        )}
      </Card>

      {/* Personas */}
      <Card>
        <SectionHeader title={`شرائح المستخدمين (${personas.length})`} action={canWrite ? <Button size="sm" variant="primary" icon={<Plus size={14} />} onClick={() => setCreatingPersona(true)}>Persona جديدة</Button> : null} />
        {personas.length === 0 ? (
          <EmptyState title="لا شرائح مستخدمين بعد" description={canWrite ? "ابدأ بتعريف Persona رئيسية للمنتج." : "لم تُسجَّل شرائح بعد."} />
        ) : (
          <ul className="divide-y divide-[var(--v-border)]">
            {personas.map((p) => (
              <li key={p.id} className="flex items-start justify-between gap-3 py-3">
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <p className="font-medium text-[var(--v-text)]">{p.name}</p>
                    {p.isPrimary && <Badge tone="primary">رئيسية</Badge>}
                    {p.role && <span className="text-xs text-[var(--v-text-secondary)]">{p.role}</span>}
                    {p.segment && <span className="text-[11px] text-[var(--v-text-subtle)]">· {p.segment}</span>}
                  </div>
                  {p.jobsToBeDone && <p className="mt-1 text-xs text-[var(--v-text-secondary)]"><b>المهمّة:</b> {p.jobsToBeDone}</p>}
                  {p.pains && <p className="mt-1 text-xs text-[var(--v-text-secondary)]"><b>الألم:</b> {p.pains}</p>}
                </div>
                {canWrite && (
                  <div className="flex shrink-0 gap-1">
                    <Button size="sm" variant="ghost" icon={<Pencil size={14} />} onClick={() => setEditingPersona(p)}>تعديل</Button>
                    <Button size="sm" variant="ghost" icon={<Trash2 size={14} />}
                      onClick={() => { if (!confirm(`حذف "${p.name}"؟`)) return; runAction(() => deletePersonaAction(projectId, p.id), "تم الحذف"); }}>حذف</Button>
                  </div>
                )}
              </li>
            ))}
          </ul>
        )}
      </Card>

      {/* User Flows */}
      <Card>
        <SectionHeader title={`سيناريوهات الاستخدام (${flows.length})`} action={canWrite ? <Button size="sm" variant="primary" icon={<Plus size={14} />} onClick={() => setCreatingFlow(true)}>سيناريو جديد</Button> : null} />
        {flows.length === 0 ? (
          <EmptyState title="لا سيناريوهات بعد" description={canWrite ? "أضف الـ flow الرئيسي (المسار اليومي للمستخدم)." : "لم تُسجَّل سيناريوهات بعد."} />
        ) : (
          <ul className="divide-y divide-[var(--v-border)]">
            {flows.map((f) => (
              <li key={f.id} className="flex items-start justify-between gap-3 py-3">
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <p className="font-medium text-[var(--v-text)]">{f.name}</p>
                    <Badge tone={FLOW_TONE[f.flowType]}>{FLOW_TYPE_LABELS[f.flowType]}</Badge>
                    <span className="text-[11px] text-[var(--v-text-subtle)]">{f.steps.length} خطوات</span>
                  </div>
                  {f.description && <p className="mt-1 text-xs text-[var(--v-text-secondary)]">{f.description}</p>}
                  {(f.triggerEvent || f.successOutcome) && (
                    <p className="mt-1 text-[11px] text-[var(--v-text-subtle)]">
                      {f.triggerEvent && <>Trigger: {f.triggerEvent}</>}
                      {f.triggerEvent && f.successOutcome && " · "}
                      {f.successOutcome && <>Outcome: {f.successOutcome}</>}
                    </p>
                  )}
                </div>
                {canWrite && (
                  <div className="flex shrink-0 gap-1">
                    <Button size="sm" variant="ghost" icon={<Pencil size={14} />} onClick={() => setEditingFlow(f)}>تعديل</Button>
                    <Button size="sm" variant="ghost" icon={<Trash2 size={14} />}
                      onClick={() => { if (!confirm(`حذف "${f.name}"؟`)) return; runAction(() => deleteFlowAction(projectId, f.id), "تم الحذف"); }}>حذف</Button>
                  </div>
                )}
              </li>
            ))}
          </ul>
        )}
      </Card>

      {/* Requirements (grouped by MoSCoW) */}
      <Card>
        <SectionHeader title={`المتطلبات (${requirements.length})`} action={canWrite ? <Button size="sm" variant="primary" icon={<Plus size={14} />} onClick={() => setCreatingReq(true)}>متطلب جديد</Button> : null} />
        {requirements.length === 0 ? (
          <EmptyState title="لا متطلبات بعد" description={canWrite ? "أضف أوّل متطلب — Must/Should/Could/Won't." : "لم تُسجَّل متطلبات بعد."} />
        ) : (
          <div className="space-y-4">
            {MOSCOW_PRIORITIES.map((prio) => {
              const items = requirements.filter((r) => r.priority === prio);
              if (items.length === 0) return null;
              return (
                <div key={prio}>
                  <div className="mb-1 flex items-center gap-2 border-b border-[var(--v-border)] pb-1">
                    <Badge tone={MOSCOW_TONE[prio]}>{MOSCOW_LABELS[prio]}</Badge>
                    <span className="text-[11px] text-[var(--v-text-subtle)]">{items.length}</span>
                  </div>
                  <ul className="divide-y divide-[var(--v-border)]">
                    {items.map((r) => (
                      <li key={r.id} className="flex items-start justify-between gap-3 py-2">
                        <div className="min-w-0 flex-1">
                          <div className="flex flex-wrap items-center gap-2">
                            {r.code && <span className="font-mono text-[11px] text-[var(--v-text-subtle)]">{r.code}</span>}
                            <p className="font-medium text-[var(--v-text)]">{r.title}</p>
                            <Badge tone={REQ_STATUS_TONE[r.status]}>{REQUIREMENT_STATUS_LABELS[r.status]}</Badge>
                            <span className="text-[11px] text-[var(--v-text-subtle)]">{REQUIREMENT_TYPE_LABELS[r.requirementType]}</span>
                          </div>
                          {r.description && <p className="mt-1 text-xs text-[var(--v-text-secondary)]">{r.description}</p>}
                          {r.acceptanceHint && <p className="mt-1 text-[11px] text-[var(--v-text-subtle)]"><b>القبول:</b> {r.acceptanceHint}</p>}
                        </div>
                        {canWrite && (
                          <div className="flex shrink-0 gap-1">
                            <Button size="sm" variant="ghost" icon={<Pencil size={14} />} onClick={() => setEditingReq(r)}>تعديل</Button>
                            <Button size="sm" variant="ghost" icon={<Trash2 size={14} />}
                              onClick={() => { if (!confirm(`حذف "${r.title}"؟`)) return; runAction(() => deleteRequirementAction(projectId, r.id), "تم الحذف"); }}>حذف</Button>
                          </div>
                        )}
                      </li>
                    ))}
                  </ul>
                </div>
              );
            })}
          </div>
        )}
      </Card>

      {/* Modals */}
      <PersonaDialog
        key={editingPersona?.id ?? (creatingPersona ? "new-persona" : "closed-persona")}
        open={creatingPersona || editingPersona !== null}
        onClose={() => { setCreatingPersona(false); setEditingPersona(null); }}
        item={editingPersona}
        onSave={(input) => {
          if (editingPersona) runAction(() => updatePersonaAction(projectId, editingPersona.id, input), "تم التحديث");
          else runAction(() => createPersonaAction(projectId, input), "تم الإنشاء");
          setCreatingPersona(false); setEditingPersona(null);
        }}
      />
      <FlowDialog
        key={editingFlow?.id ?? (creatingFlow ? "new-flow" : "closed-flow")}
        open={creatingFlow || editingFlow !== null}
        onClose={() => { setCreatingFlow(false); setEditingFlow(null); }}
        item={editingFlow}
        personas={personas}
        onSave={(input) => {
          if (editingFlow) runAction(() => updateFlowAction(projectId, editingFlow.id, input), "تم التحديث");
          else runAction(() => createFlowAction(projectId, input), "تم الإنشاء");
          setCreatingFlow(false); setEditingFlow(null);
        }}
      />
      <RequirementDialog
        key={editingReq?.id ?? (creatingReq ? "new-req" : "closed-req")}
        open={creatingReq || editingReq !== null}
        onClose={() => { setCreatingReq(false); setEditingReq(null); }}
        item={editingReq}
        personas={personas}
        flows={flows}
        onSave={(input) => {
          if (editingReq) runAction(() => updateRequirementAction(projectId, editingReq.id, input), "تم التحديث");
          else runAction(() => createRequirementAction(projectId, input), "تم الإنشاء");
          setCreatingReq(false); setEditingReq(null);
        }}
      />
      {pending && <span className="sr-only">جارٍ الحفظ...</span>}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Shared sub-components
// ---------------------------------------------------------------------------
function SectionHeader({ title, action }: { title: string; action?: React.ReactNode }) {
  return (
    <div className="mb-4 flex items-center justify-between gap-3 border-b border-[var(--v-border)] pb-3">
      <h3 className="text-base font-semibold text-[var(--v-text)]">{title}</h3>
      {action}
    </div>
  );
}
function StatTile({ icon, label, value, sub, tone }: { icon: React.ReactNode; label: string; value: string; sub?: string; tone?: BadgeTone }) {
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
function ReadinessCheck({ ok, label, actual }: { ok: boolean; label: string; actual: string }) {
  return (
    <li className="flex items-center justify-between rounded-[var(--v-radius-md)] border border-[var(--v-border)] bg-[var(--v-surface)] px-3 py-2 text-sm">
      <span className={ok ? "text-[var(--v-text)]" : "text-[var(--v-text-secondary)]"}>{label}</span>
      <Badge tone={ok ? "success" : "danger"}>{actual}</Badge>
    </li>
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

// ---------------------------------------------------------------------------
// Persona Dialog
// ---------------------------------------------------------------------------
function PersonaDialog({
  open, onClose, item, onSave,
}: {
  open: boolean; onClose: () => void; item: PersonaRow | null;
  onSave: (input: {
    name: string; role: string; segment: string; jobsToBeDone: string;
    goals: string; pains: string; channels: string; techSavviness: number;
    notes: string; isPrimary: boolean;
  }) => void;
}) {
  const [name, setName] = useState(item?.name ?? "");
  const [role, setRole] = useState(item?.role ?? "");
  const [segment, setSegment] = useState(item?.segment ?? "");
  const [jobsToBeDone, setJobs] = useState(item?.jobsToBeDone ?? "");
  const [goals, setGoals] = useState(item?.goals ?? "");
  const [pains, setPains] = useState(item?.pains ?? "");
  const [channels, setChannels] = useState(item?.channels.join(", ") ?? "");
  const [techSavviness, setTech] = useState<number>(item?.techSavviness ?? 50);
  const [notes, setNotes] = useState(item?.notes ?? "");
  const [isPrimary, setIsPrimary] = useState<boolean>(item?.isPrimary ?? false);

  return (
    <Modal open={open} onClose={onClose} maxWidth="max-w-lg">
      <div className="space-y-4 p-6">
        <h2 className="text-lg font-semibold text-[var(--v-text)]">{item ? "تعديل Persona" : "Persona جديدة"}</h2>
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <Field label="الاسم *"><Input value={name} onChange={(e) => setName(e.target.value)} placeholder="مثلاً: مدير المشتريات" /></Field>
          <Field label="الدور"><Input value={role} onChange={(e) => setRole(e.target.value)} placeholder="Purchasing Manager" /></Field>
          <Field label="الشريحة"><Input value={segment} onChange={(e) => setSegment(e.target.value)} placeholder="SMB / Enterprise" /></Field>
          <Field label={`المستوى التقني: ${techSavviness}%`}>
            <input type="range" min={0} max={100} step={5} value={techSavviness} onChange={(e) => setTech(Number(e.target.value))} className="w-full" />
          </Field>
          <Field label="Jobs to be Done" span={2}><Textarea value={jobsToBeDone} onChange={(e) => setJobs(e.target.value)} rows={2} /></Field>
          <Field label="الأهداف"><Textarea value={goals} onChange={(e) => setGoals(e.target.value)} rows={2} /></Field>
          <Field label="الآلام"><Textarea value={pains} onChange={(e) => setPains(e.target.value)} rows={2} /></Field>
          <Field label="القنوات (مفصولة بفاصلة)" span={2}><Input value={channels} onChange={(e) => setChannels(e.target.value)} placeholder="Email, WhatsApp, Portal" /></Field>
          <Field label="ملاحظات" span={2}><Textarea value={notes} onChange={(e) => setNotes(e.target.value)} rows={2} /></Field>
          <label className="flex items-center gap-2 text-sm text-[var(--v-text)] sm:col-span-2">
            <input type="checkbox" checked={isPrimary} onChange={(e) => setIsPrimary(e.target.checked)} />
            <span>Persona رئيسية للمنتج</span>
          </label>
        </div>
        <div className="flex justify-end gap-2 pt-2">
          <Button variant="ghost" onClick={onClose}>إلغاء</Button>
          <Button variant="primary" onClick={() => onSave({ name, role, segment, jobsToBeDone, goals, pains, channels, techSavviness, notes, isPrimary })}>حفظ</Button>
        </div>
      </div>
    </Modal>
  );
}

// ---------------------------------------------------------------------------
// Flow Dialog (with steps builder)
// ---------------------------------------------------------------------------
function FlowDialog({
  open, onClose, item, personas, onSave,
}: {
  open: boolean; onClose: () => void; item: UserFlowRow | null;
  personas: PersonaRow[];
  onSave: (input: {
    personaId: string | null; name: string; description: string; flowType: FlowType;
    triggerEvent: string; successOutcome: string; steps: { order: number; action: string; expectedResult: string; notes: string }[];
    notes: string;
  }) => void;
}) {
  const [personaId, setPersonaId] = useState(item?.personaId ?? "");
  const [name, setName] = useState(item?.name ?? "");
  const [description, setDescription] = useState(item?.description ?? "");
  const [flowType, setFlowType] = useState<FlowType>(item?.flowType ?? "primary");
  const [triggerEvent, setTrigger] = useState(item?.triggerEvent ?? "");
  const [successOutcome, setOutcome] = useState(item?.successOutcome ?? "");
  const [notes, setNotes] = useState(item?.notes ?? "");
  const [steps, setSteps] = useState(item?.steps ?? []);

  function addStep() {
    setSteps((s) => [...s, { order: s.length + 1, action: "", expectedResult: "", notes: "" }]);
  }
  function updateStep(idx: number, patch: Partial<{ action: string; expectedResult: string; notes: string }>) {
    setSteps((s) => s.map((step, i) => (i === idx ? { ...step, ...patch } : step)));
  }
  function removeStep(idx: number) {
    setSteps((s) => s.filter((_, i) => i !== idx).map((step, i) => ({ ...step, order: i + 1 })));
  }

  return (
    <Modal open={open} onClose={onClose} maxWidth="max-w-2xl">
      <div className="space-y-4 p-6">
        <h2 className="text-lg font-semibold text-[var(--v-text)]">{item ? "تعديل سيناريو" : "سيناريو جديد"}</h2>
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <Field label="الاسم *" span={2}><Input value={name} onChange={(e) => setName(e.target.value)} placeholder="طلب صرف صنف من المخزن" /></Field>
          <Field label="النوع">
            <Select value={flowType} onChange={(e) => setFlowType(e.target.value as FlowType)}>
              {FLOW_TYPES.map((t) => <option key={t} value={t}>{FLOW_TYPE_LABELS[t]}</option>)}
            </Select>
          </Field>
          <Field label="Persona">
            <Select value={personaId} onChange={(e) => setPersonaId(e.target.value)}>
              <option value="">— بلا —</option>
              {personas.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
            </Select>
          </Field>
          <Field label="Trigger (المُحفِّز)" span={2}><Input value={triggerEvent} onChange={(e) => setTrigger(e.target.value)} placeholder="طلب جديد يصل من قسم آخر" /></Field>
          <Field label="Success Outcome" span={2}><Input value={successOutcome} onChange={(e) => setOutcome(e.target.value)} placeholder="اعتماد الصرف وتحديث المخزون" /></Field>
          <Field label="الوصف" span={2}><Textarea value={description} onChange={(e) => setDescription(e.target.value)} rows={2} /></Field>
        </div>

        <div>
          <div className="mb-2 flex items-center justify-between">
            <p className="text-sm font-semibold text-[var(--v-text)]">الخطوات ({steps.length})</p>
            <Button size="sm" variant="secondary" icon={<Plus size={14} />} onClick={addStep}>خطوة</Button>
          </div>
          {steps.length === 0 && (
            <p className="rounded-[var(--v-radius-md)] border border-dashed border-[var(--v-border)] p-3 text-center text-xs text-[var(--v-text-muted)]">
              لا خطوات بعد. أضف الخطوة الأولى.
            </p>
          )}
          <ul className="space-y-2">
            {steps.map((step, idx) => (
              <li key={idx} className="rounded-[var(--v-radius-md)] border border-[var(--v-border)] bg-[var(--v-surface)] p-2">
                <div className="mb-1 flex items-center gap-2">
                  <span className="font-mono text-xs text-[var(--v-text-subtle)]">#{step.order}</span>
                  <Button size="sm" variant="ghost" icon={<Trash2 size={12} />} onClick={() => removeStep(idx)}>حذف</Button>
                </div>
                <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
                  <Input value={step.action} onChange={(e) => updateStep(idx, { action: e.target.value })} placeholder="الفعل" />
                  <Input value={step.expectedResult} onChange={(e) => updateStep(idx, { expectedResult: e.target.value })} placeholder="النتيجة المتوقعة" />
                </div>
              </li>
            ))}
          </ul>
        </div>

        <Field label="ملاحظات" span={2}><Textarea value={notes} onChange={(e) => setNotes(e.target.value)} rows={2} /></Field>

        <div className="flex justify-end gap-2 pt-2">
          <Button variant="ghost" onClick={onClose}>إلغاء</Button>
          <Button variant="primary" onClick={() => onSave({
            personaId: personaId || null, name, description, flowType,
            triggerEvent, successOutcome, steps, notes,
          })}>حفظ</Button>
        </div>
      </div>
    </Modal>
  );
}

// ---------------------------------------------------------------------------
// Requirement Dialog
// ---------------------------------------------------------------------------
function RequirementDialog({
  open, onClose, item, personas, flows, onSave,
}: {
  open: boolean; onClose: () => void; item: RequirementRow | null;
  personas: PersonaRow[]; flows: UserFlowRow[];
  onSave: (input: {
    code: string; title: string; description: string; requirementType: RequirementType;
    priority: MoscowPriority; status: RequirementStatus;
    rationale: string; acceptanceHint: string; effortEstimate: string;
    linkedPersonaId: string | null; linkedFlowId: string | null; tags: string;
  }) => void;
}) {
  const [code, setCode] = useState(item?.code ?? "");
  const [title, setTitle] = useState(item?.title ?? "");
  const [description, setDescription] = useState(item?.description ?? "");
  const [requirementType, setReqType] = useState<RequirementType>(item?.requirementType ?? "functional");
  const [priority, setPriority] = useState<MoscowPriority>(item?.priority ?? "should");
  const [status, setStatus] = useState<RequirementStatus>(item?.status ?? "draft");
  const [rationale, setRationale] = useState(item?.rationale ?? "");
  const [acceptanceHint, setAcceptance] = useState(item?.acceptanceHint ?? "");
  const [effortEstimate, setEffort] = useState(item?.effortEstimate ?? "");
  const [linkedPersonaId, setLinkedPersona] = useState(item?.linkedPersonaId ?? "");
  const [linkedFlowId, setLinkedFlow] = useState(item?.linkedFlowId ?? "");
  const [tags, setTags] = useState(item?.tags.join(", ") ?? "");

  return (
    <Modal open={open} onClose={onClose} maxWidth="max-w-lg">
      <div className="space-y-4 p-6">
        <h2 className="text-lg font-semibold text-[var(--v-text)]">{item ? "تعديل متطلب" : "متطلب جديد"}</h2>
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <Field label="الكود"><Input value={code} onChange={(e) => setCode(e.target.value)} placeholder="REQ-001" /></Field>
          <Field label="التقدير (S/M/L)"><Input value={effortEstimate} onChange={(e) => setEffort(e.target.value)} placeholder="M أو 8h" /></Field>
          <Field label="العنوان *" span={2}><Input value={title} onChange={(e) => setTitle(e.target.value)} placeholder="اعتماد طلب الشراء على مرحلتين" /></Field>
          <Field label="الوصف" span={2}><Textarea value={description} onChange={(e) => setDescription(e.target.value)} rows={2} /></Field>
          <Field label="النوع">
            <Select value={requirementType} onChange={(e) => setReqType(e.target.value as RequirementType)}>
              {REQUIREMENT_TYPES.map((t) => <option key={t} value={t}>{REQUIREMENT_TYPE_LABELS[t]}</option>)}
            </Select>
          </Field>
          <Field label="الأولوية (MoSCoW)">
            <Select value={priority} onChange={(e) => setPriority(e.target.value as MoscowPriority)}>
              {MOSCOW_PRIORITIES.map((p) => <option key={p} value={p}>{MOSCOW_LABELS[p]}</option>)}
            </Select>
          </Field>
          <Field label="الحالة">
            <Select value={status} onChange={(e) => setStatus(e.target.value as RequirementStatus)}>
              {REQUIREMENT_STATUSES.map((s) => <option key={s} value={s}>{REQUIREMENT_STATUS_LABELS[s]}</option>)}
            </Select>
          </Field>
          <Field label="مرتبط بـ Persona">
            <Select value={linkedPersonaId} onChange={(e) => setLinkedPersona(e.target.value)}>
              <option value="">— بلا —</option>
              {personas.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
            </Select>
          </Field>
          <Field label="مرتبط بـ سيناريو" span={2}>
            <Select value={linkedFlowId} onChange={(e) => setLinkedFlow(e.target.value)}>
              <option value="">— بلا —</option>
              {flows.map((f) => <option key={f.id} value={f.id}>{f.name}</option>)}
            </Select>
          </Field>
          <Field label="المبرّر"><Textarea value={rationale} onChange={(e) => setRationale(e.target.value)} rows={2} /></Field>
          <Field label="معيار القبول"><Textarea value={acceptanceHint} onChange={(e) => setAcceptance(e.target.value)} rows={2} /></Field>
          <Field label="وسوم" span={2}><Input value={tags} onChange={(e) => setTags(e.target.value)} placeholder="approval, workflow" /></Field>
        </div>
        <div className="flex justify-end gap-2 pt-2">
          <Button variant="ghost" onClick={onClose}>إلغاء</Button>
          <Button variant="primary" onClick={() => onSave({
            code, title, description, requirementType, priority, status,
            rationale, acceptanceHint, effortEstimate,
            linkedPersonaId: linkedPersonaId || null,
            linkedFlowId: linkedFlowId || null,
            tags,
          })}>حفظ</Button>
        </div>
      </div>
    </Modal>
  );
}
