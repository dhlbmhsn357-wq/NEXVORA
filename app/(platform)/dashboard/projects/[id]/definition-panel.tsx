"use client";

/**
 * NEXVORA Product Definition Panel (P6)
 * ======================================
 * تبويب "تعريف المنتج" — يظهر داخل صفحة المشروع لما product_mode مفعّل.
 * ثلاث أقسام: Personas / User Flows / Requirements (MoSCoW).
 */
import { useEffect, useMemo, useState, useTransition, useCallback } from "react";
import { useRouter } from "next/navigation";
import {
  Plus, Pencil, Trash2, Star, GitBranch, ListChecks, Target, CheckCircle2, CheckCheck, Download, Brain,
  ShieldCheck, MessageSquareText, ChevronDown, ChevronUp, Workflow,
} from "lucide-react";
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
  type FlowStep, type FlowStepUIElement,
} from "@/lib/product-definition/types";
import {
  BUSINESS_RULE_ENFORCEMENT_POINTS, BUSINESS_RULE_ENFORCEMENT_POINT_LABELS,
  SYSTEM_MESSAGE_TYPES, SYSTEM_MESSAGE_TYPE_LABELS,
  type BusinessRuleRow, type BusinessRuleEnforcementPoint,
  type SystemMessageRow, type SystemMessageType,
} from "@/lib/product-definition/business-rules-types";
import { stepDetailBadgeLabel } from "@/lib/product-definition/flow-step-detail";
import type { StateMachineRow, StateMachineTransition } from "@/lib/product-definition/state-machine-types";
import { stateChainString, transitionEndpointOptions } from "@/lib/product-definition/state-machine-chain";
import {
  summarizePersonas, summarizeFlows, summarizeRequirements,
  deriveDefinitionReadiness,
} from "@/lib/product-definition/derive";
import {
  createPersonaAction, updatePersonaAction, deletePersonaAction,
  createFlowAction, updateFlowAction, deleteFlowAction,
  createRequirementAction, updateRequirementAction, deleteRequirementAction,
  planImportFromBrainAction, applyImportFromBrainAction,
  createBusinessRuleAction, updateBusinessRuleAction, deleteBusinessRuleAction,
  createSystemMessageAction, updateSystemMessageAction, deleteSystemMessageAction,
  createStateMachineAction, updateStateMachineAction, deleteStateMachineAction,
} from "./definition-actions";
import type { BrainImportPlan } from "@/lib/product-definition/import-from-brain";

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
const ENFORCEMENT_TONE: Record<BusinessRuleEnforcementPoint, BadgeTone> = {
  client: "info", server: "primary", both: "warning",
};
const MESSAGE_TYPE_TONE: Record<SystemMessageType, BadgeTone> = {
  success: "success", error: "danger", info: "info", warning: "warning",
};

export interface DefinitionPanelProps {
  projectId: string;
  personas: PersonaRow[];
  flows: UserFlowRow[];
  requirements: RequirementRow[];
  businessRules: BusinessRuleRow[];
  systemMessages: SystemMessageRow[];
  stateMachines: StateMachineRow[];
  canWrite: boolean;
}

export default function DefinitionPanel(props: DefinitionPanelProps) {
  const { projectId, personas, flows, requirements, businessRules, systemMessages, stateMachines, canWrite } = props;
  const router = useRouter();
  const [pending, startTransition] = useTransition();

  const [editingPersona, setEditingPersona] = useState<PersonaRow | null>(null);
  const [creatingPersona, setCreatingPersona] = useState(false);
  const [editingFlow, setEditingFlow] = useState<UserFlowRow | null>(null);
  const [creatingFlow, setCreatingFlow] = useState(false);
  const [editingReq, setEditingReq] = useState<RequirementRow | null>(null);
  const [creatingReq, setCreatingReq] = useState(false);
  const [editingRule, setEditingRule] = useState<BusinessRuleRow | null>(null);
  const [creatingRule, setCreatingRule] = useState(false);
  const [editingMsg, setEditingMsg] = useState<SystemMessageRow | null>(null);
  const [creatingMsg, setCreatingMsg] = useState(false);
  const [msgTypeFilter, setMsgTypeFilter] = useState<SystemMessageType | "all">("all");
  const [editingSM, setEditingSM] = useState<StateMachineRow | null>(null);
  const [creatingSM, setCreatingSM] = useState(false);

  const personaNameById = useMemo(() => new Map(personas.map((p) => [p.id, p.name])), [personas]);

  // استيراد من Project Brain المعتمد
  const [brainPlan, setBrainPlan] = useState<BrainImportPlan | null>(null);
  const [brainPlanLoading, setBrainPlanLoading] = useState(false);
  const [brainPreviewOpen, setBrainPreviewOpen] = useState(false);

  const refreshBrainPlan = useCallback(() => {
    setBrainPlanLoading(true);
    startTransition(async () => {
      const res = await planImportFromBrainAction(projectId);
      setBrainPlanLoading(false);
      if (res.ok && res.data) setBrainPlan(res.data);
    });
  }, [projectId]);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- تحميل أولي لخطة الاستيراد، مش مزامنة state خارجي.
    refreshBrainPlan();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [projectId]);

  const brainAvailableCount = brainPlan
    ? brainPlan.personasToCreate.length + brainPlan.requirementsToCreate.length
    : 0;

  function confirmBrainImport() {
    startTransition(async () => {
      const res = await applyImportFromBrainAction(projectId);
      if (res.ok && res.data) {
        toast.success(`تم استيراد ${res.data.personasCreated} persona و${res.data.requirementsCreated} متطلب كمسودّات — راجعها واعتمدها.`);
        setBrainPreviewOpen(false);
        router.refresh();
        refreshBrainPlan();
      } else if (!res.ok) {
        toast.error(res.message);
      }
    });
  }

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

  // Quick Approve — متطلبات
  const mustUnapproved = useMemo(
    () => requirements.filter((r) => r.priority === "must" && r.status !== "approved" && r.status !== "done"),
    [requirements],
  );
  function approveReq(id: string) {
    runAction(() => updateRequirementAction(projectId, id, { status: "approved" }), "تم الاعتماد");
  }
  function bulkApproveMust() {
    if (mustUnapproved.length === 0) return;
    if (!confirm(`سيتم اعتماد ${mustUnapproved.length} متطلب Must. متأكد؟`)) return;
    startTransition(async () => {
      let ok = 0, fail = 0;
      for (const r of mustUnapproved) {
        const res = await updateRequirementAction(projectId, r.id, { status: "approved" });
        if (res.ok) ok++; else fail++;
      }
      if (fail === 0) toast.success(`تم اعتماد ${ok} متطلب.`);
      else toast.error(`اعتُمد ${ok} · فشل ${fail}`);
      router.refresh();
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

      {/* Import from Project Brain */}
      {canWrite && (
        <div className="flex items-center justify-between gap-3 rounded-[var(--v-radius-lg)] border border-dashed border-[var(--v-border)] bg-[var(--v-surface)] px-4 py-3">
          <div className="flex items-center gap-2 text-xs text-[var(--v-text-muted)]">
            <Brain size={14} className="text-[var(--v-primary)]" />
            {brainPlan?.reason ? (
              <span>{brainPlan.reason}</span>
            ) : brainAvailableCount === 0 && !brainPlanLoading ? (
              <span>كل عناصر الـ Brain المعتمدة مستوردة بالفعل.</span>
            ) : (
              <span>يمكنك استيراد شرائح المستخدمين والمتطلبات المعتمدة من Project Brain مباشرة كمسوّدات.</span>
            )}
          </div>
          <Button
            size="sm"
            variant="secondary"
            icon={<Download size={14} />}
            loading={brainPlanLoading}
            disabled={brainPlanLoading || brainAvailableCount === 0}
            onClick={() => setBrainPreviewOpen(true)}
            title={brainAvailableCount === 0 ? "لا توجد عناصر Brain جديدة للاستيراد" : "معاينة الاستيراد من الـ Brain المعتمد"}
          >
            استورد من الـ Brain المعتمد {brainAvailableCount > 0 ? `(${brainAvailableCount} عنصر متاح)` : ""}
          </Button>
        </div>
      )}

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
        <SectionHeader title={`المتطلبات (${requirements.length})`} action={canWrite ? (
          <div className="flex flex-wrap items-center gap-2">
            {mustUnapproved.length > 0 && (
              <Button size="sm" variant="success" icon={<CheckCheck size={14} />} onClick={bulkApproveMust} disabled={pending}>
                اعتمد كل متطلبات Must غير المعتمدة ({mustUnapproved.length})
              </Button>
            )}
            <Button size="sm" variant="primary" icon={<Plus size={14} />} onClick={() => setCreatingReq(true)}>متطلب جديد</Button>
          </div>
        ) : null} />
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
                            {r.status !== "approved" && r.status !== "done" && (
                              <Button size="sm" variant="success" icon={<CheckCircle2 size={14} />}
                                onClick={() => approveReq(r.id)} disabled={pending}>اعتمد</Button>
                            )}
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

      {/* القواعد والرسائل — قواعد العمل + رسائل النظام */}
      <div>
        <h2 className="mb-3 text-lg font-semibold text-[var(--v-text)]">القواعد والرسائل</h2>
        <div className="space-y-6">
          {/* Business Rules */}
          <Card>
            <SectionHeader
              title={<span className="inline-flex items-center gap-1.5"><ShieldCheck size={16} /> قواعد العمل ({businessRules.length})</span>}
              action={canWrite ? <Button size="sm" variant="primary" icon={<Plus size={14} />} onClick={() => setCreatingRule(true)}>قاعدة جديدة</Button> : null}
            />
            {businessRules.length === 0 ? (
              <EmptyState title="لا توجد قواعد عمل بعد" description="أضف أول قاعدة لتوثيق حالة خاصة أو حد استخدام." />
            ) : (
              <ul className="divide-y divide-[var(--v-border)]">
                {businessRules.map((r) => {
                  const linkedFlow = r.linkedFlowId ? flows.find((f) => f.id === r.linkedFlowId) : null;
                  const linkedPersonaName = r.linkedPersonaId ? personaNameById.get(r.linkedPersonaId) : null;
                  return (
                    <li key={r.id} className="flex items-start justify-between gap-3 py-3">
                      <div className="min-w-0 flex-1">
                        <div className="flex flex-wrap items-center gap-2">
                          <p className="font-medium text-[var(--v-text)]">{r.title}</p>
                          <Badge tone={ENFORCEMENT_TONE[r.enforcementPoint]}>{BUSINESS_RULE_ENFORCEMENT_POINT_LABELS[r.enforcementPoint]}</Badge>
                          {linkedPersonaName && <Badge tone="neutral">موديول: {linkedPersonaName}</Badge>}
                          {linkedFlow && <span className="text-[11px] text-[var(--v-text-subtle)]">مرتبط بـ: {linkedFlow.name}</span>}
                        </div>
                        {r.triggerCondition && <p className="mt-1 text-xs text-[var(--v-text-secondary)]"><b>الشرط:</b> {r.triggerCondition}</p>}
                        {r.thresholdValue && <p className="mt-1 text-xs text-[var(--v-text-secondary)]"><b>القيمة الحدّية:</b> {r.thresholdValue}</p>}
                        {r.onViolation && <p className="mt-1 text-xs text-[var(--v-text-secondary)]"><b>عند التجاوز:</b> {r.onViolation}</p>}
                      </div>
                      {canWrite && (
                        <div className="flex shrink-0 gap-1">
                          <Button size="sm" variant="ghost" icon={<Pencil size={14} />} onClick={() => setEditingRule(r)}>تعديل</Button>
                          <Button size="sm" variant="ghost" icon={<Trash2 size={14} />}
                            onClick={() => { if (!confirm(`حذف "${r.title}"؟`)) return; runAction(() => deleteBusinessRuleAction(projectId, r.id), "تم الحذف"); }}>حذف</Button>
                        </div>
                      )}
                    </li>
                  );
                })}
              </ul>
            )}
          </Card>

          {/* System Messages */}
          <Card>
            <SectionHeader
              title={<span className="inline-flex items-center gap-1.5"><MessageSquareText size={16} /> رسائل النظام ({systemMessages.length})</span>}
              action={canWrite ? <Button size="sm" variant="primary" icon={<Plus size={14} />} onClick={() => setCreatingMsg(true)}>رسالة جديدة</Button> : null}
            />
            {systemMessages.length > 0 && (
              <div className="mb-3 flex flex-wrap gap-1.5">
                <FilterChip active={msgTypeFilter === "all"} label="الكل" onClick={() => setMsgTypeFilter("all")} />
                {SYSTEM_MESSAGE_TYPES.map((t) => (
                  <FilterChip key={t} active={msgTypeFilter === t} label={SYSTEM_MESSAGE_TYPE_LABELS[t]} onClick={() => setMsgTypeFilter(t)} />
                ))}
              </div>
            )}
            {systemMessages.length === 0 ? (
              <EmptyState title="لا توجد رسائل نظام موثّقة بعد" description="وثّق كل رسالة نجاح/خطأ يراها المستخدم لضمان دقة الـ PRD." />
            ) : (
              (() => {
                const filtered = msgTypeFilter === "all" ? systemMessages : systemMessages.filter((m) => m.messageType === msgTypeFilter);
                if (filtered.length === 0) return <p className="py-3 text-center text-xs text-[var(--v-text-muted)]">لا رسائل من هذا النوع.</p>;
                return (
                  <ul className="divide-y divide-[var(--v-border)]">
                    {filtered.map((m) => {
                      const linkedFlow = m.linkedFlowId ? flows.find((f) => f.id === m.linkedFlowId) : null;
                      const linkedPersonaName = m.linkedPersonaId ? personaNameById.get(m.linkedPersonaId) : null;
                      return (
                        <li key={m.id} className="flex items-start justify-between gap-3 py-3">
                          <div className="min-w-0 flex-1">
                            <div className="flex flex-wrap items-center gap-2">
                              <p className="font-medium text-[var(--v-text)]">{m.eventName}</p>
                              <Badge tone={MESSAGE_TYPE_TONE[m.messageType]}>{SYSTEM_MESSAGE_TYPE_LABELS[m.messageType]}</Badge>
                              {linkedPersonaName && <Badge tone="neutral">موديول: {linkedPersonaName}</Badge>}
                              {linkedFlow && <span className="text-[11px] text-[var(--v-text-subtle)]">مرتبط بـ: {linkedFlow.name}</span>}
                            </div>
                            {m.messageText && <p className="mt-1 text-xs text-[var(--v-text-secondary)]">{m.messageText}</p>}
                          </div>
                          {canWrite && (
                            <div className="flex shrink-0 gap-1">
                              <Button size="sm" variant="ghost" icon={<Pencil size={14} />} onClick={() => setEditingMsg(m)}>تعديل</Button>
                              <Button size="sm" variant="ghost" icon={<Trash2 size={14} />}
                                onClick={() => { if (!confirm(`حذف "${m.eventName}"؟`)) return; runAction(() => deleteSystemMessageAction(projectId, m.id), "تم الحذف"); }}>حذف</Button>
                            </div>
                          )}
                        </li>
                      );
                    })}
                  </ul>
                );
              })()
            )}
          </Card>

          {/* State Machines */}
          <Card>
            <SectionHeader
              title={<span className="inline-flex items-center gap-1.5"><Workflow size={16} /> آلات الحالة (State Machines) ({stateMachines.length})</span>}
              action={canWrite ? <Button size="sm" variant="primary" icon={<Plus size={14} />} onClick={() => setCreatingSM(true)}>آلة حالة جديدة</Button> : null}
            />
            {stateMachines.length === 0 ? (
              <EmptyState
                title="لا توجد آلات حالة موثّقة بعد"
                description="وثّق دورة حياة أي طلب/عملية معقدة (مثال: طلب اختبار: مُستلم ← مجدول ← جارٍ ← مُقيَّم ← ناجح/راسب) لضمان دقة الـ PRD."
              />
            ) : (
              <ul className="divide-y divide-[var(--v-border)]">
                {stateMachines.map((sm) => {
                  const linkedFlow = sm.linkedFlowId ? flows.find((f) => f.id === sm.linkedFlowId) : null;
                  const linkedPersonaName = sm.linkedPersonaId ? personaNameById.get(sm.linkedPersonaId) : null;
                  const chain = stateChainString(sm.states);
                  return (
                    <li key={sm.id} className="flex items-start justify-between gap-3 py-3">
                      <div className="min-w-0 flex-1">
                        <div className="flex flex-wrap items-center gap-2">
                          <p className="font-medium text-[var(--v-text)]">{sm.name}</p>
                          {linkedPersonaName && <Badge tone="neutral">موديول: {linkedPersonaName}</Badge>}
                          {linkedFlow && <span className="text-[11px] text-[var(--v-text-subtle)]">مرتبط بـ: {linkedFlow.name}</span>}
                        </div>
                        {sm.description && <p className="mt-1 text-xs text-[var(--v-text-secondary)]">{sm.description}</p>}
                        {chain && <p className="mt-1 text-xs text-[var(--v-text)]" dir="ltr">{chain}</p>}
                      </div>
                      {canWrite && (
                        <div className="flex shrink-0 gap-1">
                          <Button size="sm" variant="ghost" icon={<Pencil size={14} />} onClick={() => setEditingSM(sm)}>تعديل</Button>
                          <Button size="sm" variant="ghost" icon={<Trash2 size={14} />}
                            onClick={() => { if (!confirm(`حذف "${sm.name}"؟`)) return; runAction(() => deleteStateMachineAction(projectId, sm.id), "تم الحذف"); }}>حذف</Button>
                        </div>
                      )}
                    </li>
                  );
                })}
              </ul>
            )}
          </Card>
        </div>
      </div>

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
      <RuleDialog
        key={editingRule?.id ?? (creatingRule ? "new-rule" : "closed-rule")}
        open={creatingRule || editingRule !== null}
        onClose={() => { setCreatingRule(false); setEditingRule(null); }}
        item={editingRule}
        flows={flows}
        personas={personas}
        onSave={(input) => {
          if (editingRule) runAction(() => updateBusinessRuleAction(projectId, editingRule.id, input), "تم التحديث");
          else runAction(() => createBusinessRuleAction(projectId, input), "تم الإنشاء");
          setCreatingRule(false); setEditingRule(null);
        }}
      />
      <MessageDialog
        key={editingMsg?.id ?? (creatingMsg ? "new-msg" : "closed-msg")}
        open={creatingMsg || editingMsg !== null}
        onClose={() => { setCreatingMsg(false); setEditingMsg(null); }}
        item={editingMsg}
        flows={flows}
        personas={personas}
        onSave={(input) => {
          if (editingMsg) runAction(() => updateSystemMessageAction(projectId, editingMsg.id, input), "تم التحديث");
          else runAction(() => createSystemMessageAction(projectId, input), "تم الإنشاء");
          setCreatingMsg(false); setEditingMsg(null);
        }}
      />
      <StateMachineDialog
        key={editingSM?.id ?? (creatingSM ? "new-sm" : "closed-sm")}
        open={creatingSM || editingSM !== null}
        onClose={() => { setCreatingSM(false); setEditingSM(null); }}
        item={editingSM}
        personas={personas}
        flows={flows}
        onSave={(input) => {
          if (editingSM) runAction(() => updateStateMachineAction(projectId, editingSM.id, input), "تم التحديث");
          else runAction(() => createStateMachineAction(projectId, input), "تم الإنشاء");
          setCreatingSM(false); setEditingSM(null);
        }}
      />
      {/* Brain Import Preview Modal */}
      {brainPreviewOpen && (
        <Modal open={true} onClose={() => setBrainPreviewOpen(false)} maxWidth="max-w-lg">
          <div className="space-y-4 p-6" dir="rtl">
            <div>
              <h2 className="text-lg font-semibold text-[var(--v-text)]">
                <span className="inline-flex items-center gap-1.5"><Brain size={16} /> استيراد من الـ Brain المعتمد</span>
              </h2>
              <p className="mt-1 text-xs text-[var(--v-text-muted)]">
                سيتم إنشاء العناصر التالية كمسوّدات (draft) فقط — راجعها وعدّلها ثم اعتمدها يدويًا كالمعتاد.
              </p>
            </div>

            <BrainImportPreviewSection
              title={`شرائح المستخدمين (${brainPlan?.personasToCreate.length ?? 0})`}
              items={(brainPlan?.personasToCreate ?? []).map((p) => `${p.name}${p.role ? ` — ${p.role}` : ""}`)}
            />
            <BrainImportPreviewSection
              title={`المتطلبات (${brainPlan?.requirementsToCreate.length ?? 0})`}
              items={(brainPlan?.requirementsToCreate ?? []).map((r) => r.title)}
            />

            {(brainPlan?.alreadyImportedCount ?? 0) > 0 && (
              <p className="text-[11px] text-[var(--v-text-muted)]">
                تم تخطّي <b>{brainPlan?.alreadyImportedCount}</b> عنصر مستورَد بالفعل.
              </p>
            )}

            <div className="flex justify-end gap-2 pt-1">
              <Button variant="ghost" onClick={() => setBrainPreviewOpen(false)} disabled={pending}>إلغاء</Button>
              <Button
                variant="primary"
                onClick={confirmBrainImport}
                loading={pending}
                disabled={brainAvailableCount === 0}
              >
                تأكيد الاستيراد
              </Button>
            </div>
          </div>
        </Modal>
      )}

      {pending && <span className="sr-only">جارٍ الحفظ...</span>}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Shared sub-components
// ---------------------------------------------------------------------------
function SectionHeader({ title, action }: { title: React.ReactNode; action?: React.ReactNode }) {
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
function BrainImportPreviewSection({ title, items }: { title: string; items: string[] }) {
  return (
    <div>
      <p className="mb-1.5 text-xs font-semibold text-[var(--v-text)]">{title}</p>
      {items.length === 0 ? (
        <p className="rounded-[var(--v-radius-md)] border border-dashed border-[var(--v-border)] p-2 text-center text-[11px] text-[var(--v-text-muted)]">
          لا عناصر جديدة.
        </p>
      ) : (
        <ul className="max-h-40 space-y-1 overflow-y-auto rounded-[var(--v-radius-md)] border border-[var(--v-border)] bg-[var(--v-surface)] p-2">
          {items.map((it, i) => (
            <li key={i} className="truncate text-[11px] text-[var(--v-text-secondary)]">• {it}</li>
          ))}
        </ul>
      )}
    </div>
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
function FilterChip({ active, label, onClick }: { active: boolean; label: string; onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`rounded-[var(--v-radius-full)] border px-2.5 py-1 text-[11px] font-medium transition ${
        active
          ? "border-[var(--v-primary)] bg-[var(--v-primary-tint)] text-[var(--v-primary)]"
          : "border-[var(--v-border)] text-[var(--v-text-muted)] hover:border-[var(--v-primary)] hover:text-[var(--v-text)]"
      }`}
    >
      {label}
    </button>
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
    triggerEvent: string; successOutcome: string; steps: FlowStep[];
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
  const [steps, setSteps] = useState<FlowStep[]>(item?.steps ?? []);
  const [openDetail, setOpenDetail] = useState<Set<number>>(new Set());

  function addStep() {
    setSteps((s) => [...s, { order: s.length + 1, action: "", expectedResult: "", notes: "" }]);
  }
  function updateStep(idx: number, patch: Partial<{ action: string; expectedResult: string; notes: string }>) {
    setSteps((s) => s.map((step, i) => (i === idx ? { ...step, ...patch } : step)));
  }
  function removeStep(idx: number) {
    setSteps((s) => s.filter((_, i) => i !== idx).map((step, i) => ({ ...step, order: i + 1 })));
    setOpenDetail((prev) => {
      const next = new Set<number>();
      for (const i of prev) {
        if (i === idx) continue;
        next.add(i > idx ? i - 1 : i);
      }
      return next;
    });
  }
  function toggleDetail(idx: number) {
    setOpenDetail((prev) => {
      const next = new Set(prev);
      if (next.has(idx)) next.delete(idx);
      else next.add(idx);
      return next;
    });
  }
  function updateStepDetail(idx: number, patch: Partial<Pick<FlowStep, "successMessage">>) {
    setSteps((s) => s.map((step, i) => (i === idx ? { ...step, ...patch } : step)));
  }
  function addUiElement(idx: number) {
    setSteps((s) => s.map((step, i) => (i === idx
      ? { ...step, uiElements: [...(step.uiElements ?? []), { fieldName: "", fieldType: "", validationRule: "" }] }
      : step)));
  }
  function updateUiElement(idx: number, elIdx: number, patch: Partial<FlowStepUIElement>) {
    setSteps((s) => s.map((step, i) => {
      if (i !== idx) return step;
      return { ...step, uiElements: (step.uiElements ?? []).map((el, j) => (j === elIdx ? { ...el, ...patch } : el)) };
    }));
  }
  function removeUiElement(idx: number, elIdx: number) {
    setSteps((s) => s.map((step, i) => (i === idx
      ? { ...step, uiElements: (step.uiElements ?? []).filter((_, j) => j !== elIdx) }
      : step)));
  }
  function addErrorMessage(idx: number) {
    setSteps((s) => s.map((step, i) => (i === idx
      ? { ...step, errorMessages: [...(step.errorMessages ?? []), ""] }
      : step)));
  }
  function updateErrorMessage(idx: number, msgIdx: number, value: string) {
    setSteps((s) => s.map((step, i) => {
      if (i !== idx) return step;
      return { ...step, errorMessages: (step.errorMessages ?? []).map((m, j) => (j === msgIdx ? value : m)) };
    }));
  }
  function removeErrorMessage(idx: number, msgIdx: number) {
    setSteps((s) => s.map((step, i) => (i === idx
      ? { ...step, errorMessages: (step.errorMessages ?? []).filter((_, j) => j !== msgIdx) }
      : step)));
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
            {steps.map((step, idx) => {
              const detailOpen = openDetail.has(idx);
              const badgeLabel = stepDetailBadgeLabel(step);
              return (
                <li key={idx} className="rounded-[var(--v-radius-md)] border border-[var(--v-border)] bg-[var(--v-surface)] p-2">
                  <div className="mb-1 flex items-center gap-2">
                    <span className="font-mono text-xs text-[var(--v-text-subtle)]">#{step.order}</span>
                    {badgeLabel && <Badge tone="primary">{badgeLabel}</Badge>}
                    <Button size="sm" variant="ghost" icon={<Trash2 size={12} />} onClick={() => removeStep(idx)}>حذف</Button>
                  </div>
                  <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
                    <Input value={step.action} onChange={(e) => updateStep(idx, { action: e.target.value })} placeholder="الفعل" />
                    <Input value={step.expectedResult} onChange={(e) => updateStep(idx, { expectedResult: e.target.value })} placeholder="النتيجة المتوقعة" />
                  </div>

                  {/* تفاصيل تنفيذية (اختياري) — مطوية افتراضيًا عشان السيناريوهات
                      البسيطة متتأثرش بصريًا. */}
                  <button
                    type="button"
                    onClick={() => toggleDetail(idx)}
                    className="mt-2 flex items-center gap-1 text-[11px] font-medium text-[var(--v-primary)] hover:underline"
                  >
                    {detailOpen ? <ChevronUp size={12} /> : <ChevronDown size={12} />}
                    تفاصيل تنفيذية (اختياري)
                  </button>

                  {detailOpen && (
                    <div className="mt-2 space-y-3 rounded-[var(--v-radius-md)] border border-dashed border-[var(--v-border)] bg-[var(--v-bg)] p-2">
                      {/* عناصر الواجهة */}
                      <div>
                        <div className="mb-1 flex items-center justify-between">
                          <p className="text-[11px] font-semibold text-[var(--v-text)]">عناصر الواجهة</p>
                          <Button size="sm" variant="ghost" icon={<Plus size={12} />} onClick={() => addUiElement(idx)}>عنصر</Button>
                        </div>
                        {(step.uiElements ?? []).length === 0 ? (
                          <p className="text-[11px] text-[var(--v-text-muted)]">لا عناصر واجهة موثّقة لهذه الخطوة.</p>
                        ) : (
                          <ul className="space-y-1.5">
                            {(step.uiElements ?? []).map((el, elIdx) => (
                              <li key={elIdx} className="grid grid-cols-1 gap-1.5 sm:grid-cols-[1fr_1fr_1fr_auto] sm:items-center">
                                <Input value={el.fieldName} onChange={(e) => updateUiElement(idx, elIdx, { fieldName: e.target.value })} placeholder="اسم الحقل" />
                                <Input value={el.fieldType} onChange={(e) => updateUiElement(idx, elIdx, { fieldType: e.target.value })} placeholder="النوع" />
                                <Input value={el.validationRule} onChange={(e) => updateUiElement(idx, elIdx, { validationRule: e.target.value })} placeholder="قاعدة التحقق" />
                                <Button size="sm" variant="ghost" icon={<Trash2 size={12} />} onClick={() => removeUiElement(idx, elIdx)}>حذف</Button>
                              </li>
                            ))}
                          </ul>
                        )}
                      </div>

                      {/* رسالة النجاح */}
                      <div>
                        <label className="mb-1 block text-[11px] font-semibold text-[var(--v-text)]">رسالة النجاح</label>
                        <Input
                          value={step.successMessage ?? ""}
                          onChange={(e) => updateStepDetail(idx, { successMessage: e.target.value })}
                          placeholder="تم الحفظ بنجاح"
                        />
                      </div>

                      {/* رسائل الخطأ */}
                      <div>
                        <div className="mb-1 flex items-center justify-between">
                          <p className="text-[11px] font-semibold text-[var(--v-text)]">رسائل الخطأ</p>
                          <Button size="sm" variant="ghost" icon={<Plus size={12} />} onClick={() => addErrorMessage(idx)}>رسالة خطأ</Button>
                        </div>
                        {(step.errorMessages ?? []).length === 0 ? (
                          <p className="text-[11px] text-[var(--v-text-muted)]">لا رسائل خطأ موثّقة لهذه الخطوة.</p>
                        ) : (
                          <ul className="space-y-1.5">
                            {(step.errorMessages ?? []).map((msg, msgIdx) => (
                              <li key={msgIdx} className="flex items-center gap-1.5">
                                <Input value={msg} onChange={(e) => updateErrorMessage(idx, msgIdx, e.target.value)} placeholder="نص رسالة الخطأ" />
                                <Button size="sm" variant="ghost" icon={<Trash2 size={12} />} onClick={() => removeErrorMessage(idx, msgIdx)}>حذف</Button>
                              </li>
                            ))}
                          </ul>
                        )}
                      </div>
                    </div>
                  )}
                </li>
              );
            })}
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

// ---------------------------------------------------------------------------
// Business Rule Dialog
// ---------------------------------------------------------------------------
function RuleDialog({
  open, onClose, item, flows, personas, onSave,
}: {
  open: boolean; onClose: () => void; item: BusinessRuleRow | null;
  flows: UserFlowRow[]; personas: PersonaRow[];
  onSave: (input: {
    title: string; triggerCondition: string; thresholdValue: string;
    onViolation: string; enforcementPoint: BusinessRuleEnforcementPoint;
    linkedFlowId: string | null; linkedPersonaId: string | null; notes: string;
  }) => void;
}) {
  const [title, setTitle] = useState(item?.title ?? "");
  const [triggerCondition, setTriggerCondition] = useState(item?.triggerCondition ?? "");
  const [thresholdValue, setThresholdValue] = useState(item?.thresholdValue ?? "");
  const [onViolation, setOnViolation] = useState(item?.onViolation ?? "");
  const [enforcementPoint, setEnforcementPoint] = useState<BusinessRuleEnforcementPoint>(item?.enforcementPoint ?? "server");
  const [linkedFlowId, setLinkedFlow] = useState(item?.linkedFlowId ?? "");
  const [linkedPersonaId, setLinkedPersona] = useState(item?.linkedPersonaId ?? "");
  const [notes, setNotes] = useState(item?.notes ?? "");

  return (
    <Modal open={open} onClose={onClose} maxWidth="max-w-lg">
      <div className="space-y-4 p-6">
        <h2 className="text-lg font-semibold text-[var(--v-text)]">{item ? "تعديل قاعدة عمل" : "قاعدة عمل جديدة"}</h2>
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <Field label="اسم القاعدة *" span={2}><Input value={title} onChange={(e) => setTitle(e.target.value)} placeholder="حد أقصى لعدد محاولات الدفع" /></Field>
          <Field label="الشرط المُفعِّل"><Textarea value={triggerCondition} onChange={(e) => setTriggerCondition(e.target.value)} rows={2} placeholder="عند فشل الدفع 3 مرات متتالية" /></Field>
          <Field label="القيمة الحدّية"><Input value={thresholdValue} onChange={(e) => setThresholdValue(e.target.value)} placeholder="3 مرات / لا يوجد حد" /></Field>
          <Field label="ماذا يحدث عند التجاوز" span={2}><Textarea value={onViolation} onChange={(e) => setOnViolation(e.target.value)} rows={2} placeholder="يُقفَل الحساب مؤقتًا لمدة ساعة" /></Field>
          <Field label="من يطبّقها">
            <Select value={enforcementPoint} onChange={(e) => setEnforcementPoint(e.target.value as BusinessRuleEnforcementPoint)}>
              {BUSINESS_RULE_ENFORCEMENT_POINTS.map((p) => <option key={p} value={p}>{BUSINESS_RULE_ENFORCEMENT_POINT_LABELS[p]}</option>)}
            </Select>
          </Field>
          <Field label="ربط اختياري بتدفّق">
            <Select value={linkedFlowId} onChange={(e) => setLinkedFlow(e.target.value)}>
              <option value="">— بلا —</option>
              {flows.map((f) => <option key={f.id} value={f.id}>{f.name}</option>)}
            </Select>
          </Field>
          <Field label="الشخصية المرتبطة (اختياري)" span={2}>
            <Select value={linkedPersonaId} onChange={(e) => setLinkedPersona(e.target.value)}>
              <option value="">— بلا ربط (عام) —</option>
              {personas.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
            </Select>
          </Field>
          <Field label="ملاحظات" span={2}><Textarea value={notes} onChange={(e) => setNotes(e.target.value)} rows={2} /></Field>
        </div>
        <div className="flex justify-end gap-2 pt-2">
          <Button variant="ghost" onClick={onClose}>إلغاء</Button>
          <Button variant="primary" onClick={() => onSave({
            title, triggerCondition, thresholdValue, onViolation, enforcementPoint,
            linkedFlowId: linkedFlowId || null, linkedPersonaId: linkedPersonaId || null, notes,
          })}>حفظ</Button>
        </div>
      </div>
    </Modal>
  );
}

// ---------------------------------------------------------------------------
// System Message Dialog
// ---------------------------------------------------------------------------
function MessageDialog({
  open, onClose, item, flows, personas, onSave,
}: {
  open: boolean; onClose: () => void; item: SystemMessageRow | null;
  flows: UserFlowRow[]; personas: PersonaRow[];
  onSave: (input: {
    eventName: string; messageType: SystemMessageType; messageText: string;
    linkedFlowId: string | null; linkedPersonaId: string | null; notes: string;
  }) => void;
}) {
  const [eventName, setEventName] = useState(item?.eventName ?? "");
  const [messageType, setMessageType] = useState<SystemMessageType>(item?.messageType ?? "info");
  const [messageText, setMessageText] = useState(item?.messageText ?? "");
  const [linkedFlowId, setLinkedFlow] = useState(item?.linkedFlowId ?? "");
  const [linkedPersonaId, setLinkedPersona] = useState(item?.linkedPersonaId ?? "");
  const [notes, setNotes] = useState(item?.notes ?? "");

  return (
    <Modal open={open} onClose={onClose} maxWidth="max-w-lg">
      <div className="space-y-4 p-6">
        <h2 className="text-lg font-semibold text-[var(--v-text)]">{item ? "تعديل رسالة نظام" : "رسالة نظام جديدة"}</h2>
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <Field label="اسم الحدث *" span={2}><Input value={eventName} onChange={(e) => setEventName(e.target.value)} placeholder="تسجيل دخول ناجح" /></Field>
          <Field label="نوع الرسالة">
            <Select value={messageType} onChange={(e) => setMessageType(e.target.value as SystemMessageType)}>
              {SYSTEM_MESSAGE_TYPES.map((t) => <option key={t} value={t}>{SYSTEM_MESSAGE_TYPE_LABELS[t]}</option>)}
            </Select>
          </Field>
          <Field label="ربط اختياري بتدفّق">
            <Select value={linkedFlowId} onChange={(e) => setLinkedFlow(e.target.value)}>
              <option value="">— بلا —</option>
              {flows.map((f) => <option key={f.id} value={f.id}>{f.name}</option>)}
            </Select>
          </Field>
          <Field label="الشخصية المرتبطة (اختياري)" span={2}>
            <Select value={linkedPersonaId} onChange={(e) => setLinkedPersona(e.target.value)}>
              <option value="">— بلا ربط (عام) —</option>
              {personas.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
            </Select>
          </Field>
          <Field label="نص الرسالة كما يظهر للمستخدم" span={2}><Textarea value={messageText} onChange={(e) => setMessageText(e.target.value)} rows={2} placeholder="تم تسجيل الدخول بنجاح، مرحبًا بعودتك." /></Field>
          <Field label="ملاحظات" span={2}><Textarea value={notes} onChange={(e) => setNotes(e.target.value)} rows={2} /></Field>
        </div>
        <div className="flex justify-end gap-2 pt-2">
          <Button variant="ghost" onClick={onClose}>إلغاء</Button>
          <Button variant="primary" onClick={() => onSave({
            eventName, messageType, messageText,
            linkedFlowId: linkedFlowId || null, linkedPersonaId: linkedPersonaId || null, notes,
          })}>حفظ</Button>
        </div>
      </div>
    </Modal>
  );
}

// ---------------------------------------------------------------------------
// State Machine Dialog (0122 Part 2/2) — states builder + transitions builder
// ---------------------------------------------------------------------------
function StateMachineDialog({
  open, onClose, item, personas, flows, onSave,
}: {
  open: boolean; onClose: () => void; item: StateMachineRow | null;
  personas: PersonaRow[]; flows: UserFlowRow[];
  onSave: (input: {
    name: string; description: string; states: string[]; transitions: StateMachineTransition[];
    linkedPersonaId: string | null; linkedFlowId: string | null; notes: string;
  }) => void;
}) {
  const [name, setName] = useState(item?.name ?? "");
  const [description, setDescription] = useState(item?.description ?? "");
  const [states, setStates] = useState<string[]>(item?.states ?? []);
  const [transitions, setTransitions] = useState<StateMachineTransition[]>(item?.transitions ?? []);
  const [linkedPersonaId, setLinkedPersona] = useState(item?.linkedPersonaId ?? "");
  const [linkedFlowId, setLinkedFlow] = useState(item?.linkedFlowId ?? "");
  const [notes, setNotes] = useState(item?.notes ?? "");

  const chainPreview = stateChainString(states);

  function addState() {
    setStates((s) => [...s, ""]);
  }
  function updateState(idx: number, value: string) {
    setStates((s) => s.map((st, i) => (i === idx ? value : st)));
  }
  function removeState(idx: number) {
    setStates((s) => s.filter((_, i) => i !== idx));
  }
  function moveState(idx: number, dir: -1 | 1) {
    setStates((s) => {
      const target = idx + dir;
      if (target < 0 || target >= s.length) return s;
      const next = [...s];
      [next[idx], next[target]] = [next[target], next[idx]];
      return next;
    });
  }

  function addTransition() {
    setTransitions((t) => [...t, { from: "", to: "", trigger: "" }]);
  }
  function updateTransition(idx: number, patch: Partial<StateMachineTransition>) {
    setTransitions((t) => t.map((tr, i) => (i === idx ? { ...tr, ...patch } : tr)));
  }
  function removeTransition(idx: number) {
    setTransitions((t) => t.filter((_, i) => i !== idx));
  }

  return (
    <Modal open={open} onClose={onClose} maxWidth="max-w-2xl">
      <div className="space-y-4 p-6">
        <h2 className="text-lg font-semibold text-[var(--v-text)]">{item ? "تعديل آلة حالة" : "آلة حالة جديدة"}</h2>
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <Field label="اسم الآلة *" span={2}><Input value={name} onChange={(e) => setName(e.target.value)} placeholder="دورة حياة طلب الاختبار" /></Field>
          <Field label="الوصف" span={2}><Textarea value={description} onChange={(e) => setDescription(e.target.value)} rows={2} /></Field>
          <Field label="ربط اختياري بشخصية">
            <Select value={linkedPersonaId} onChange={(e) => setLinkedPersona(e.target.value)}>
              <option value="">— بلا ربط (عام) —</option>
              {personas.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
            </Select>
          </Field>
          <Field label="ربط اختياري بتدفّق">
            <Select value={linkedFlowId} onChange={(e) => setLinkedFlow(e.target.value)}>
              <option value="">— بلا —</option>
              {flows.map((f) => <option key={f.id} value={f.id}>{f.name}</option>)}
            </Select>
          </Field>
        </div>

        {/* الحالات */}
        <div>
          <div className="mb-2 flex items-center justify-between">
            <p className="text-sm font-semibold text-[var(--v-text)]">الحالات ({states.length})</p>
            <Button size="sm" variant="secondary" icon={<Plus size={14} />} onClick={addState}>حالة</Button>
          </div>
          {states.length === 0 ? (
            <p className="rounded-[var(--v-radius-md)] border border-dashed border-[var(--v-border)] p-3 text-center text-xs text-[var(--v-text-muted)]">
              لا حالات بعد. أضف أول حالة (مثال: &quot;مُستلم&quot;).
            </p>
          ) : (
            <ul className="space-y-1.5">
              {states.map((st, idx) => (
                <li key={idx} className="flex items-center gap-1.5">
                  <span className="font-mono text-xs text-[var(--v-text-subtle)]">#{idx + 1}</span>
                  <Input value={st} onChange={(e) => updateState(idx, e.target.value)} placeholder="اسم الحالة" />
                  <Button size="sm" variant="ghost" icon={<ChevronUp size={12} />} onClick={() => moveState(idx, -1)} disabled={idx === 0}>أعلى</Button>
                  <Button size="sm" variant="ghost" icon={<ChevronDown size={12} />} onClick={() => moveState(idx, 1)} disabled={idx === states.length - 1}>أسفل</Button>
                  <Button size="sm" variant="ghost" icon={<Trash2 size={12} />} onClick={() => removeState(idx)}>حذف</Button>
                </li>
              ))}
            </ul>
          )}
          {chainPreview && (
            <p className="mt-2 rounded-[var(--v-radius-md)] border border-[var(--v-border)] bg-[var(--v-surface)] p-2 text-xs text-[var(--v-text)]" dir="ltr">
              {chainPreview}
            </p>
          )}
        </div>

        {/* الانتقالات */}
        <div>
          <div className="mb-2 flex items-center justify-between">
            <p className="text-sm font-semibold text-[var(--v-text)]">الانتقالات ({transitions.length})</p>
            <Button size="sm" variant="secondary" icon={<Plus size={14} />} onClick={addTransition}>انتقال</Button>
          </div>
          {transitions.length === 0 ? (
            <p className="rounded-[var(--v-radius-md)] border border-dashed border-[var(--v-border)] p-3 text-center text-xs text-[var(--v-text-muted)]">
              لا انتقالات بعد (اختياري).
            </p>
          ) : (
            <ul className="space-y-1.5">
              {transitions.map((t, idx) => {
                // ملاحظة تصميمية (0122 Part 2/2): لو الحالة المشار إليها في
                // from/to اتمسحت أو اتغيّر اسمها من قائمة الحالات أعلاه —
                // بدل ما نمسحها بصمت أو نكسر الـ Select، بنضيفها كخيار
                // إضافي في نفس الـ Select (transitionEndpointOptions) —
                // فـ الـ Select يفضل شغال دايمًا ومفيش قيمة تتفقد بصمت،
                // والمستخدم شايف بوضوح إنها لسه لازمها تصحيح قبل الحفظ.
                const fromOptions = transitionEndpointOptions(states, t.from);
                const toOptions = transitionEndpointOptions(states, t.to);
                return (
                  <li key={idx} className="grid grid-cols-1 gap-1.5 sm:grid-cols-[1fr_1fr_1fr_auto] sm:items-center">
                    <Select value={t.from} onChange={(e) => updateTransition(idx, { from: e.target.value })}>
                      <option value="">— من حالة —</option>
                      {fromOptions.map((s) => <option key={s} value={s}>{s}</option>)}
                    </Select>
                    <Select value={t.to} onChange={(e) => updateTransition(idx, { to: e.target.value })}>
                      <option value="">— إلى حالة —</option>
                      {toOptions.map((s) => <option key={s} value={s}>{s}</option>)}
                    </Select>
                    <Input value={t.trigger} onChange={(e) => updateTransition(idx, { trigger: e.target.value })} placeholder="المُحفِّز (اختياري)" />
                    <Button size="sm" variant="ghost" icon={<Trash2 size={12} />} onClick={() => removeTransition(idx)}>حذف</Button>
                  </li>
                );
              })}
            </ul>
          )}
        </div>

        <Field label="ملاحظات" span={2}><Textarea value={notes} onChange={(e) => setNotes(e.target.value)} rows={2} /></Field>

        <div className="flex justify-end gap-2 pt-2">
          <Button variant="ghost" onClick={onClose}>إلغاء</Button>
          <Button
            variant="primary"
            onClick={() => onSave({
              name,
              description,
              states: states.map((s) => s.trim()).filter(Boolean),
              transitions: transitions.filter((t) => t.from.trim() || t.to.trim() || t.trigger.trim()),
              linkedPersonaId: linkedPersonaId || null,
              linkedFlowId: linkedFlowId || null,
              notes,
            })}
          >
            حفظ
          </Button>
        </div>
      </div>
    </Modal>
  );
}
