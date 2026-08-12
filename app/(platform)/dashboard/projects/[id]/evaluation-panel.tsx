"use client";

/**
 * NEXVORA Product Evaluation Panel (P9)
 */
import { useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Plus, Pencil, Trash2, PlayCircle, Target, CheckCircle2, XCircle, Wand2 } from "lucide-react";
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
  NEW_EVAL_CATEGORIES, EVAL_CATEGORY_LABELS,
  EVAL_SEVERITIES, EVAL_SEVERITY_LABELS,
  EVAL_RUN_RESULTS, EVAL_RUN_RESULT_LABELS,
  type EvaluationScenarioRow, type EvaluationRunRow,
  type EvalCategory, type EvalSeverity, type EvalRunResult, type EvalStep,
} from "@/lib/evaluation/types";
import type { UserStoryRow } from "@/lib/user-stories/types";
import type { UserFlowRow } from "@/lib/product-definition/types";
import { latestRunByScenario, summarizeEvaluation, deriveEvaluationReadiness } from "@/lib/evaluation/derive";
import {
  createScenarioAction, updateScenarioAction, deleteScenarioAction,
  recordRunAction, deleteRunAction,
} from "./evaluation-actions";
import {
  deriveDraftsFromScenarioAction,
  planScenariosFromStoriesAction,
  applyScenariosFromStoriesAction,
} from "./scenario-derivation-actions";
import type { ScenarioDerivedPlan } from "@/lib/scenario-derivation/service";
import type { DerivedScenarioPlan } from "@/lib/scenario-derivation/from-story";

const SEVERITY_TONE: Record<EvalSeverity, BadgeTone> = {
  low: "success", medium: "warning", high: "danger", critical: "danger",
};
const RESULT_TONE: Record<EvalRunResult, BadgeTone> = {
  pass: "success", fail: "danger", blocked: "warning", skipped: "neutral",
};

export interface EvaluationPanelProps {
  projectId: string;
  scenarios: EvaluationScenarioRow[];
  runs: EvaluationRunRow[];
  stories: UserStoryRow[];
  flows: UserFlowRow[];
  canWrite: boolean;
}

export default function EvaluationPanel(props: EvaluationPanelProps) {
  const { projectId, scenarios, runs, stories, flows, canWrite } = props;
  const router = useRouter();
  const [pending, startTransition] = useTransition();

  const [editing, setEditing] = useState<EvaluationScenarioRow | null>(null);
  const [creating, setCreating] = useState(false);
  const [runningFor, setRunningFor] = useState<EvaluationScenarioRow | null>(null);
  const [derivePreview, setDerivePreview] = useState<{ scenarioId: string; plan: ScenarioDerivedPlan } | null>(null);
  const [deriveLoadingId, setDeriveLoadingId] = useState<string | null>(null);
  const [fromStoriesPreview, setFromStoriesPreview] = useState<DerivedScenarioPlan | null>(null);
  const [fromStoriesLoading, setFromStoriesLoading] = useState(false);

  // عدّ القصص المعتمدة اللي مالهاش سيناريو مرتبط — للعرض على الزر.
  const missingCount = useMemo(() => {
    const linked = new Set(
      scenarios.map((s) => s.linkedStoryId).filter((v): v is string => typeof v === "string"),
    );
    const approvedSet = new Set(["approved", "in_dev", "done"]);
    return stories.filter((s) => approvedSet.has(s.status) && !linked.has(s.id)).length;
  }, [scenarios, stories]);

  function openFromStoriesPreview() {
    setFromStoriesLoading(true);
    startTransition(async () => {
      const res = await planScenariosFromStoriesAction(projectId);
      setFromStoriesLoading(false);
      if (res.ok && res.data) {
        setFromStoriesPreview(res.data);
      } else if (!res.ok) {
        toast.error(res.message);
      }
    });
  }

  function confirmFromStoriesApply() {
    if (!fromStoriesPreview) return;
    startTransition(async () => {
      const res = await applyScenariosFromStoriesAction(projectId);
      if (res.ok && res.data) {
        toast.success(`تم إنشاء ${res.data.created} سيناريو draft. راجعهم واعتمدهم.`);
        setFromStoriesPreview(null);
        router.refresh();
      } else if (!res.ok) {
        toast.error(res.message);
      }
    });
  }

  function openDerivePreview(scenarioId: string) {
    setDeriveLoadingId(scenarioId);
    startTransition(async () => {
      const res = await deriveDraftsFromScenarioAction(projectId, scenarioId, true);
      setDeriveLoadingId(null);
      if (res.ok && res.data) {
        setDerivePreview({ scenarioId, plan: res.data.plan });
      } else if (!res.ok) {
        toast.error(res.message);
      }
    });
  }

  function confirmDeriveApply() {
    if (!derivePreview) return;
    const { scenarioId } = derivePreview;
    startTransition(async () => {
      const res = await deriveDraftsFromScenarioAction(projectId, scenarioId, false);
      if (res.ok && res.data?.applied) {
        const c = res.data.applied.createdIds;
        toast.success(`تم إنشاء ${c.requirements.length} متطلب، ${c.stories.length} قصص، ${c.acs.length} معايير قبول.`);
        setDerivePreview(null);
        router.refresh();
      } else if (!res.ok) {
        toast.error(res.message);
      }
    });
  }

  const summary = useMemo(() => summarizeEvaluation(scenarios, runs), [scenarios, runs]);
  const readiness = useMemo(() => deriveEvaluationReadiness(scenarios, runs), [scenarios, runs]);
  const latestRun = useMemo(() => latestRunByScenario(runs), [runs]);

  function run<T>(fn: () => Promise<{ ok: true; data?: T } | { ok: false; message: string }>, okMsg: string) {
    startTransition(async () => {
      const res = await fn();
      if (res.ok) { toast.success(okMsg); router.refresh(); }
      else toast.error(res.message);
    });
  }

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
        <Tile label="السيناريوهات" value={`${summary.totalScenarios}`} />
        <Tile label="نسبة النجاح" value={`${summary.passRate}%`} tone={summary.passRate >= 90 ? "success" : summary.passRate >= 60 ? "warning" : "danger"} />
        <Tile label="لم تُشغَّل" value={`${summary.scenariosNeverRun}`} tone={summary.scenariosNeverRun > 0 ? "warning" : "success"} />
        <Tile label="جاهزية التقييم" value={`${readiness.score}%`} tone={readiness.ready ? "success" : "warning"} />
      </div>

      <Card>
        <Header title="مؤشر جاهزية التقييم" />
        <ul className="grid grid-cols-1 gap-2 md:grid-cols-2">
          <Check ok={readiness.checks.minScenariosOk} label="≥ 5 سيناريوهات" actual={`${readiness.breakdown.scenarios}`} />
          <Check ok={readiness.checks.allRunOk} label="كلها مُشغَّلة" actual={`${readiness.breakdown.runCoverage}%`} />
          <Check ok={readiness.checks.passRateOk} label="النجاح ≥ 90%" actual={`${readiness.breakdown.passRate}%`} />
          <Check ok={readiness.checks.noCriticalFailuresOk} label="لا فشل حرِج" actual={`${readiness.breakdown.criticalFailures}`} />
        </ul>
      </Card>

      <Card>
        <Header
          title={`السيناريوهات (${scenarios.length})`}
          action={canWrite ? (
            <div className="flex flex-wrap items-center gap-2">
              <Button
                size="sm"
                variant="secondary"
                icon={<Wand2 size={14} />}
                onClick={openFromStoriesPreview}
                loading={fromStoriesLoading}
                disabled={missingCount === 0 || pending}
                title={
                  missingCount === 0
                    ? "كل القصص المعتمَدة لها سيناريو"
                    : "توليد سيناريوهات تقييم مسوّدة من القصص المعتمدة"
                }
              >
                {missingCount === 0
                  ? "كل القصص المعتمَدة لها سيناريو"
                  : `توليد سيناريوهات من القصص المعتمدة (${missingCount})`}
              </Button>
              <Button size="sm" variant="primary" icon={<Plus size={14} />} onClick={() => setCreating(true)}>سيناريو جديد</Button>
            </div>
          ) : null}
        />
        {scenarios.length === 0 ? (
          <div>
            <EmptyState
              title="لا سيناريوهات بعد"
              description={
                stories.length === 0 && flows.length === 0
                  ? "سيناريوهات التقييم تُبنى على قصص المستخدم ومساراته. أنشئ قصة أو مسارًا أولًا."
                  : "ابدأ بسيناريو تقييم أول (يمكنك ربطه بقصة أو مسار)."
              }
            />
            {(stories.length === 0 && flows.length === 0) && (
              <div className="mt-3 flex flex-wrap justify-center gap-2">
                <a
                  className="rounded-[var(--v-radius-md)] border border-[var(--v-border)] px-3 py-1.5 text-xs text-[var(--v-text-secondary)] hover:border-[var(--v-primary)] hover:text-[var(--v-primary)]"
                  href={`/dashboard/projects/${projectId}?tab=stories`}
                >
                  الذهاب إلى قصص المستخدم
                </a>
                <a
                  className="rounded-[var(--v-radius-md)] border border-[var(--v-border)] px-3 py-1.5 text-xs text-[var(--v-text-secondary)] hover:border-[var(--v-primary)] hover:text-[var(--v-primary)]"
                  href={`/dashboard/projects/${projectId}?tab=definition`}
                >
                  الذهاب إلى تعريف المنتج
                </a>
              </div>
            )}
          </div>
        ) : (
          <ul className="divide-y divide-[var(--v-border)]">
            {scenarios.map((s) => {
              const last = latestRun.get(s.id);
              return (
                <li key={s.id} className="flex items-start justify-between gap-3 py-3">
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-2">
                      {s.code && <span className="font-mono text-[11px] text-[var(--v-text-subtle)]">{s.code}</span>}
                      <p className="font-medium text-[var(--v-text)]">{s.title}</p>
                      <Badge tone="info">{EVAL_CATEGORY_LABELS[s.category]}</Badge>
                      <Badge tone={SEVERITY_TONE[s.severity]}>{EVAL_SEVERITY_LABELS[s.severity]}</Badge>
                      {last ? (
                        <Badge tone={RESULT_TONE[last.result]}>آخر: {EVAL_RUN_RESULT_LABELS[last.result]}</Badge>
                      ) : (
                        <Badge tone="neutral">لم تُشغَّل</Badge>
                      )}
                    </div>
                    {s.description && <p className="mt-1 text-xs text-[var(--v-text-secondary)]">{s.description}</p>}
                    {s.expectedResult && <p className="mt-1 text-[11px] text-[var(--v-text-subtle)]"><b>المتوقّع:</b> {s.expectedResult}</p>}
                    {s.steps.length > 0 && <p className="mt-1 text-[11px] text-[var(--v-text-subtle)]">{s.steps.length} خطوات</p>}
                  </div>
                  {canWrite && (
                    <div className="flex shrink-0 flex-wrap gap-1">
                      <Button size="sm" variant="ghost" icon={<PlayCircle size={14} />} onClick={() => setRunningFor(s)}>تشغيل</Button>
                      <Button size="sm" variant="ghost" icon={<Pencil size={14} />} onClick={() => setEditing(s)}>تعديل</Button>
                      <Button
                        size="sm"
                        variant="ghost"
                        loading={deriveLoadingId === s.id}
                        onClick={() => openDerivePreview(s.id)}
                        title="يشتق متطلب/قصة/AC مسودّة من السيناريو، مربوطة به تلقائيًا."
                      >
                        إنشاء المسودات الناقصة
                      </Button>
                      <Button size="sm" variant="ghost" icon={<Trash2 size={14} />}
                        onClick={() => { if (!confirm(`حذف "${s.title}"؟`)) return; run(() => deleteScenarioAction(projectId, s.id), "تم الحذف"); }}>حذف</Button>
                    </div>
                  )}
                </li>
              );
            })}
          </ul>
        )}
      </Card>

      <Card>
        <Header title={`سجل التشغيلات (${runs.length})`} />
        {runs.length === 0 ? (
          <EmptyState title="لا تشغيلات بعد" description="سجّل نتيجة تشغيل لكل سيناريو." />
        ) : (
          <ul className="divide-y divide-[var(--v-border)]">
            {runs.slice(0, 20).map((r) => {
              const scen = scenarios.find((s) => s.id === r.scenarioId);
              return (
                <li key={r.id} className="flex items-start justify-between gap-3 py-2">
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <Badge tone={RESULT_TONE[r.result]}>{EVAL_RUN_RESULT_LABELS[r.result]}</Badge>
                      <p className="text-sm font-medium text-[var(--v-text)]">{scen?.title ?? "(محذوف)"}</p>
                      <span className="text-[11px] text-[var(--v-text-subtle)]">{new Date(r.runAt).toLocaleString("ar-EG")}</span>
                    </div>
                    {r.actualResult && <p className="mt-1 text-xs text-[var(--v-text-secondary)]"><b>الفعلي:</b> {r.actualResult}</p>}
                    {r.environment && <p className="text-[11px] text-[var(--v-text-subtle)]">بيئة: {r.environment}</p>}
                  </div>
                  {canWrite && (
                    <Button size="sm" variant="ghost" icon={<Trash2 size={12} />}
                      onClick={() => { if (!confirm("حذف هذا التشغيل؟")) return; run(() => deleteRunAction(projectId, r.id), "تم الحذف"); }}>حذف</Button>
                  )}
                </li>
              );
            })}
          </ul>
        )}
      </Card>

      <ScenarioDialog
        key={editing?.id ?? (creating ? "new" : "closed")}
        open={creating || editing !== null}
        onClose={() => { setCreating(false); setEditing(null); }}
        item={editing}
        stories={stories} flows={flows}
        onSave={(input) => {
          if (editing) run(() => updateScenarioAction(projectId, editing.id, input), "تم التحديث");
          else run(() => createScenarioAction(projectId, input), "تم الإنشاء");
          setCreating(false); setEditing(null);
        }}
      />

      <RunDialog
        key={runningFor?.id ?? "closed-run"}
        open={runningFor !== null}
        scenario={runningFor}
        onClose={() => setRunningFor(null)}
        onSave={(input) => {
          if (!runningFor) return;
          run(() => recordRunAction(projectId, { scenarioId: runningFor.id, ...input }), "تم تسجيل النتيجة");
          setRunningFor(null);
        }}
      />
      {/* Scenario Derivation Preview Modal */}
      {derivePreview && (
        <Modal open={true} onClose={() => setDerivePreview(null)} maxWidth="max-w-lg">
          <div className="space-y-4 p-6" dir="rtl">
            <div>
              <h2 className="text-lg font-semibold text-[var(--v-text)]">مسودات مقترحة من السيناريو</h2>
              <p className="mt-1 text-xs text-[var(--v-text-muted)]">
                سيتم إنشاء العناصر الجديدة كـ Draft فقط، ومربوطة بالسيناريو تلقائيًا. الحقول الناقصة تُملأ بـ [Needs Input].
              </p>
            </div>

            <DerivePreviewSection title="متطلبات" items={derivePreview.plan.toCreate.requirements.map((r) => r.title)} existingCount={derivePreview.plan.existing.requirements.length} />
            <DerivePreviewSection title="قصص مستخدم" items={derivePreview.plan.toCreate.stories.map((s) => s.title)} existingCount={derivePreview.plan.existing.stories.length} />
            <DerivePreviewSection title="معايير قبول" items={derivePreview.plan.toCreate.acs.map((a) => a.title)} existingCount={derivePreview.plan.existing.acs.length} />

            <div className="flex justify-end gap-2 pt-1">
              <Button variant="ghost" onClick={() => setDerivePreview(null)} disabled={pending}>إلغاء</Button>
              <Button
                variant="primary"
                onClick={confirmDeriveApply}
                loading={pending}
                disabled={
                  derivePreview.plan.toCreate.requirements.length === 0 &&
                  derivePreview.plan.toCreate.stories.length === 0 &&
                  derivePreview.plan.toCreate.acs.length === 0
                }
              >
                تأكيد الإنشاء
              </Button>
            </div>
          </div>
        </Modal>
      )}

      {/* From-Stories Preview Modal */}
      {fromStoriesPreview && (
        <Modal open={true} onClose={() => setFromStoriesPreview(null)} maxWidth="max-w-lg">
          <div className="space-y-4 p-6" dir="rtl">
            <div>
              <h2 className="text-lg font-semibold text-[var(--v-text)]">
                <span className="inline-flex items-center gap-1.5"><Wand2 size={16} /> توليد سيناريوهات من القصص</span>
              </h2>
              <p className="mt-1 text-xs text-[var(--v-text-muted)]">
                سيتم إنشاء <b className="text-[var(--v-primary)]">{fromStoriesPreview.toCreate.length}</b> سيناريو تقييم كمسودّات
                مرتبطة بالقصص التالية. كل سيناريو <b>draft</b> — قابل للتعديل قبل الاعتماد.
              </p>
            </div>

            {fromStoriesPreview.toCreate.length === 0 ? (
              <div className="rounded-[var(--v-radius-md)] border border-dashed border-[var(--v-border)] p-3 text-center text-xs text-[var(--v-text-muted)]">
                لا توجد قصص معتمَدة بحاجة إلى سيناريو.
              </div>
            ) : (
              <ul className="max-h-80 space-y-1.5 overflow-y-auto rounded-[var(--v-radius-md)] border border-[var(--v-border)] bg-[var(--v-surface)] p-3">
                {fromStoriesPreview.toCreate.map((d) => (
                  <li key={d.linkedStoryId} className="text-[11px] leading-relaxed">
                    <div className="flex flex-wrap items-center gap-1.5">
                      {d.storyCode && <span className="font-mono text-[10px] text-[var(--v-text-subtle)]">{d.storyCode}</span>}
                      <span className="font-medium text-[var(--v-text)]">{d.storyTitle}</span>
                      <Badge tone={SEVERITY_TONE[d.suggestedSeverity]}>{EVAL_SEVERITY_LABELS[d.suggestedSeverity]}</Badge>
                    </div>
                    <p className="text-[var(--v-text-secondary)]">← {d.suggestedTitle} ({d.suggestedSteps.length} خطوات)</p>
                  </li>
                ))}
              </ul>
            )}

            {fromStoriesPreview.skipped.length > 0 && (
              <p className="text-[11px] text-[var(--v-text-muted)]">
                تم تخطّي <b>{fromStoriesPreview.skipped.length}</b> قصة (إما غير معتمدة أو لها سيناريو أصلًا).
              </p>
            )}

            <div className="flex justify-end gap-2 pt-1">
              <Button variant="ghost" onClick={() => setFromStoriesPreview(null)} disabled={pending}>إلغاء</Button>
              <Button
                variant="primary"
                onClick={confirmFromStoriesApply}
                loading={pending}
                disabled={fromStoriesPreview.toCreate.length === 0}
              >
                تأكيد الإنشاء
              </Button>
            </div>
          </div>
        </Modal>
      )}

      {pending && <span className="sr-only">جارٍ الحفظ...</span>}
    </div>
  );
}

function DerivePreviewSection({ title, items, existingCount }: { title: string; items: string[]; existingCount: number }) {
  return (
    <div className="rounded-[var(--v-radius-md)] border border-[var(--v-border)] bg-[var(--v-surface)] p-3">
      <p className="text-xs font-semibold text-[var(--v-text)]">
        {title} — سيُنشأ: <b className="text-[var(--v-primary)]">{items.length}</b>
        {existingCount > 0 && <span className="text-[var(--v-text-muted)]"> · موجودة سابقًا: {existingCount}</span>}
      </p>
      {items.length > 0 && (
        <ul className="mt-2 list-disc space-y-0.5 pr-4 text-[11px] text-[var(--v-text-secondary)]">
          {items.map((t, i) => <li key={i}>{t}</li>)}
        </ul>
      )}
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
function Check({ ok, label, actual }: { ok: boolean; label: string; actual: string }) {
  return (
    <li className="flex items-center justify-between rounded-[var(--v-radius-md)] border border-[var(--v-border)] bg-[var(--v-surface)] px-3 py-2 text-sm">
      <span className="flex items-center gap-1.5">
        {ok ? <CheckCircle2 size={14} className="text-[var(--v-green)]" /> : <XCircle size={14} className="text-[var(--v-red)]" />}
        {label}
      </span>
      <Badge tone={ok ? "success" : "danger"}>{actual}</Badge>
    </li>
  );
}
function Field({ label, span = 1, children }: { label: string; span?: 1 | 2; children: React.ReactNode }) {
  return (
    <div className={span === 2 ? "sm:col-span-2" : ""}>
      <label className="mb-1 block text-xs text-[var(--v-text-secondary)]">{label}</label>{children}
    </div>
  );
}

function ScenarioDialog({
  open, onClose, item, stories, flows, onSave,
}: {
  open: boolean; onClose: () => void; item: EvaluationScenarioRow | null;
  stories: UserStoryRow[]; flows: UserFlowRow[];
  onSave: (input: {
    code: string; title: string; description: string; category: EvalCategory; severity: EvalSeverity;
    preconditions: string; steps: EvalStep[]; expectedResult: string;
    linkedStoryId: string | null; linkedFlowId: string | null; tags: string;
  }) => void;
}) {
  const [code, setCode] = useState(item?.code ?? "");
  const [title, setTitle] = useState(item?.title ?? "");
  const [description, setDescription] = useState(item?.description ?? "");
  const [category, setCategory] = useState<EvalCategory>(item?.category ?? "usability");
  const [severity, setSeverity] = useState<EvalSeverity>(item?.severity ?? "medium");
  const [preconditions, setPreconditions] = useState(item?.preconditions ?? "");
  const [expectedResult, setExpectedResult] = useState(item?.expectedResult ?? "");
  const [steps, setSteps] = useState<EvalStep[]>(item?.steps ?? []);
  const [linkedStoryId, setLinkedStoryId] = useState(item?.linkedStoryId ?? "");
  const [linkedFlowId, setLinkedFlowId] = useState(item?.linkedFlowId ?? "");
  const [tags, setTags] = useState(item?.tags.join(", ") ?? "");

  function addStep() { setSteps((s) => [...s, { order: s.length + 1, action: "" }]); }
  function updateStep(i: number, action: string) { setSteps((s) => s.map((st, idx) => idx === i ? { ...st, action } : st)); }
  function removeStep(i: number) { setSteps((s) => s.filter((_, idx) => idx !== i).map((st, idx) => ({ ...st, order: idx + 1 }))); }

  return (
    <Modal open={open} onClose={onClose} maxWidth="max-w-2xl">
      <div className="space-y-4 p-6">
        <h2 className="text-lg font-semibold text-[var(--v-text)]">{item ? "تعديل سيناريو" : "سيناريو جديد"}</h2>
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <Field label="الكود"><Input value={code} onChange={(e) => setCode(e.target.value)} placeholder="EVAL-001" /></Field>
          <Field label="الفئة">
            <Select value={category} onChange={(e) => setCategory(e.target.value as EvalCategory)}>
              {NEW_EVAL_CATEGORIES.map((c) => <option key={c} value={c}>{EVAL_CATEGORY_LABELS[c]}</option>)}
            </Select>
          </Field>
          <Field label="العنوان *" span={2}><Input value={title} onChange={(e) => setTitle(e.target.value)} placeholder="اختبار اعتماد طلب الشراء" /></Field>
          <Field label="الخطورة">
            <Select value={severity} onChange={(e) => setSeverity(e.target.value as EvalSeverity)}>
              {EVAL_SEVERITIES.map((s) => <option key={s} value={s}>{EVAL_SEVERITY_LABELS[s]}</option>)}
            </Select>
          </Field>
          <Field label="القصة المرتبطة">
            <Select value={linkedStoryId} onChange={(e) => setLinkedStoryId(e.target.value)}>
              <option value="">— بلا —</option>
              {stories.map((s) => <option key={s.id} value={s.id}>{s.title}</option>)}
            </Select>
          </Field>
          <Field label="السيناريو المرتبط" span={2}>
            <Select value={linkedFlowId} onChange={(e) => setLinkedFlowId(e.target.value)}>
              <option value="">— بلا —</option>
              {flows.map((f) => <option key={f.id} value={f.id}>{f.name}</option>)}
            </Select>
          </Field>
          <Field label="الوصف" span={2}><Textarea value={description} onChange={(e) => setDescription(e.target.value)} rows={2} /></Field>
          <Field label="الشروط المسبقة" span={2}><Textarea value={preconditions} onChange={(e) => setPreconditions(e.target.value)} rows={2} /></Field>
          <Field label="النتيجة المتوقّعة" span={2}><Textarea value={expectedResult} onChange={(e) => setExpectedResult(e.target.value)} rows={2} /></Field>
        </div>

        <div>
          <div className="mb-2 flex items-center justify-between">
            <p className="text-sm font-semibold text-[var(--v-text)]">الخطوات ({steps.length})</p>
            <Button size="sm" variant="secondary" icon={<Plus size={14} />} onClick={addStep}>خطوة</Button>
          </div>
          <ul className="space-y-2">
            {steps.map((step, i) => (
              <li key={i} className="flex items-center gap-2 rounded-[var(--v-radius-md)] border border-[var(--v-border)] bg-[var(--v-surface)] p-2">
                <span className="font-mono text-xs text-[var(--v-text-subtle)]">#{step.order}</span>
                <Input value={step.action} onChange={(e) => updateStep(i, e.target.value)} placeholder="الفعل" />
                <Button size="sm" variant="ghost" icon={<Trash2 size={12} />} onClick={() => removeStep(i)}>حذف</Button>
              </li>
            ))}
          </ul>
        </div>

        <Field label="وسوم" span={2}><Input value={tags} onChange={(e) => setTags(e.target.value)} placeholder="approval, workflow" /></Field>

        <div className="flex justify-end gap-2">
          <Button variant="ghost" onClick={onClose}>إلغاء</Button>
          <Button variant="primary" onClick={() => onSave({
            code, title, description, category, severity, preconditions,
            steps, expectedResult,
            linkedStoryId: linkedStoryId || null, linkedFlowId: linkedFlowId || null, tags,
          })}>حفظ</Button>
        </div>
      </div>
    </Modal>
  );
}

function RunDialog({
  open, onClose, scenario, onSave,
}: {
  open: boolean; onClose: () => void; scenario: EvaluationScenarioRow | null;
  onSave: (input: { result: EvalRunResult; actualResult: string; environment: string; notes: string }) => void;
}) {
  const [result, setResult] = useState<EvalRunResult>("pass");
  const [actualResult, setActualResult] = useState("");
  const [environment, setEnvironment] = useState("");
  const [notes, setNotes] = useState("");

  return (
    <Modal open={open} onClose={onClose} maxWidth="max-w-md">
      <div className="space-y-4 p-6">
        <h2 className="text-lg font-semibold text-[var(--v-text)]">
          <span className="inline-flex items-center gap-1.5"><Target size={16} /> تسجيل تشغيل</span>
        </h2>
        {scenario && (
          <p className="rounded-[var(--v-radius-md)] bg-[var(--v-primary-tint)] p-2 text-xs text-[var(--v-primary)]">
            السيناريو: <b>{scenario.title}</b>
          </p>
        )}
        <Field label="النتيجة *">
          <Select value={result} onChange={(e) => setResult(e.target.value as EvalRunResult)}>
            {EVAL_RUN_RESULTS.map((r) => <option key={r} value={r}>{EVAL_RUN_RESULT_LABELS[r]}</option>)}
          </Select>
        </Field>
        <Field label="النتيجة الفعلية"><Textarea value={actualResult} onChange={(e) => setActualResult(e.target.value)} rows={2} placeholder="ما اللي حصل بالفعل؟" /></Field>
        <Field label="البيئة"><Input value={environment} onChange={(e) => setEnvironment(e.target.value)} placeholder="staging / production" /></Field>
        <Field label="ملاحظات"><Textarea value={notes} onChange={(e) => setNotes(e.target.value)} rows={2} /></Field>
        <div className="flex justify-end gap-2">
          <Button variant="ghost" onClick={onClose}>إلغاء</Button>
          <Button variant="primary" onClick={() => onSave({ result, actualResult, environment, notes })}>تسجيل</Button>
        </div>
      </div>
    </Modal>
  );
}
