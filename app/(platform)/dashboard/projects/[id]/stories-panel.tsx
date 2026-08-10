"use client";

/**
 * NEXVORA Stories & Acceptance Criteria Panel (P7)
 * =================================================
 * تبويب "القصص والقبول" — يظهر لما product_mode مفعّل.
 * قسمان: قائمة القصص (مجمّعة حسب الحالة) + AC nested تحت كل قصة.
 */
import { useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Plus, Pencil, Trash2, CheckCircle2, XCircle, BookOpen, Target } from "lucide-react";
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
  STORY_STATUSES, STORY_STATUS_LABELS,
  RISK_LEVELS, RISK_LABELS, STORY_POINT_OPTIONS,
  AC_STATUSES, AC_STATUS_LABELS,
  type UserStoryRow, type AcceptanceCriterionRow,
  type StoryStatus, type RiskLevel, type AcStatus,
} from "@/lib/user-stories/types";
import type { PersonaRow, UserFlowRow, RequirementRow } from "@/lib/product-definition/types";
import {
  summarizeStories, summarizeAcceptance, deriveStoriesReadiness,
  scoreStoryInvest, validateGherkin,
} from "@/lib/user-stories/derive";
import {
  createStoryAction, updateStoryAction, deleteStoryAction,
  createAcAction, updateAcAction, deleteAcAction,
} from "./stories-actions";

// ---------------------------------------------------------------------------
// Tones
// ---------------------------------------------------------------------------
const STORY_STATUS_TONE: Record<StoryStatus, BadgeTone> = {
  draft: "neutral", in_review: "info", approved: "primary",
  in_dev: "warning", done: "success", archived: "neutral",
};
const RISK_TONE: Record<RiskLevel, BadgeTone> = {
  low: "success", medium: "warning", high: "danger",
};
const AC_STATUS_TONE: Record<AcStatus, BadgeTone> = {
  draft: "neutral", approved: "primary", verified: "success", failed: "danger",
};

export interface StoriesPanelProps {
  projectId: string;
  stories: UserStoryRow[];
  acs: AcceptanceCriterionRow[];
  personas: PersonaRow[];
  flows: UserFlowRow[];
  requirements: RequirementRow[];
  canWrite: boolean;
}

export default function StoriesPanel(props: StoriesPanelProps) {
  const { projectId, stories, acs, personas, flows, requirements, canWrite } = props;
  const router = useRouter();
  const [pending, startTransition] = useTransition();

  const [editingStory, setEditingStory] = useState<UserStoryRow | null>(null);
  const [creatingStory, setCreatingStory] = useState(false);
  const [editingAc, setEditingAc] = useState<AcceptanceCriterionRow | null>(null);
  const [creatingAcForStory, setCreatingAcForStory] = useState<string | null>(null);
  const [expanded, setExpanded] = useState<Set<string>>(() => new Set(stories.map((s) => s.id)));
  // فلترة القصص لعرض غير المغطّاة بمعايير القبول (AC) فقط — يفعّلها زر
  // "عرض القصص غير المغطّاة" في ويدجت التغطية.
  const [showUncoveredOnly, setShowUncoveredOnly] = useState(false);

  const storyIds = useMemo(() => stories.map((s) => s.id), [stories]);
  const sSum = useMemo(() => summarizeStories(stories), [stories]);
  const acSum = useMemo(() => summarizeAcceptance(acs, storyIds), [acs, storyIds]);
  const readiness = useMemo(() => deriveStoriesReadiness(stories, acs), [stories, acs]);

  const acsByStory = useMemo(() => {
    const map = new Map<string, AcceptanceCriterionRow[]>();
    for (const a of acs) {
      const arr = map.get(a.userStoryId) ?? [];
      arr.push(a);
      map.set(a.userStoryId, arr);
    }
    return map;
  }, [acs]);

  function runAction<T>(fn: () => Promise<{ ok: true; data?: T } | { ok: false; message: string }>, okMsg: string) {
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
      {/* Header stats */}
      <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
        <StatTile icon={<BookOpen size={16} />} label="القصص" value={`${sSum.total}`} sub={`${sSum.byStatus.approved + sSum.byStatus.in_dev + sSum.byStatus.done} معتمدة`} />
        <StatTile icon={<Target size={16} />} label="نقاط القصة" value={`${sSum.totalPoints}`} sub={sSum.avgBusinessValue ? `قيمة معدل ${sSum.avgBusinessValue}` : ""} />
        <StatTile icon={<CheckCircle2 size={16} />} label="Acceptance Criteria" value={`${acSum.total}`} sub={`${acSum.storiesWithAcCount}/${sSum.total} قصص مغطّاة`} />
        <StatTile icon={<Target size={16} />} label="جاهزية القصص" value={`${readiness.score}%`} tone={readiness.ready ? "success" : readiness.score >= 40 ? "warning" : "danger"} />
      </div>

      {/* AC Coverage widget — تُقرأ من deriveStoriesReadiness (breakdown.acCoveragePercent). */}
      <Card>
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <p className="text-xs text-[var(--v-text-muted)]">تغطية معايير القبول</p>
            <p className="mt-0.5 text-sm text-[var(--v-text)]">
              معايير القبول: <b>{acSum.storiesWithAcCount}</b> من <b>{sSum.total}</b> قصة مغطّاة
              {" "}(<b className="font-mono-plex">{readiness.breakdown.acCoveragePercent}%</b>)
            </p>
          </div>
          <div className="flex items-center gap-2">
            <Badge tone={readiness.checks.acCoverageOk ? "success" : "warning"}>
              {readiness.checks.acCoverageOk ? "≥ 80% ✓" : "أقل من 80%"}
            </Badge>
            {sSum.total - acSum.storiesWithAcCount > 0 && (
              <Button
                size="sm"
                variant={showUncoveredOnly ? "primary" : "ghost"}
                onClick={() => setShowUncoveredOnly((v) => !v)}
              >
                {showUncoveredOnly
                  ? "عرض كل القصص"
                  : `عرض القصص غير المغطّاة (${sSum.total - acSum.storiesWithAcCount})`}
              </Button>
            )}
          </div>
        </div>
      </Card>

      {/* Readiness checklist */}
      <Card>
        <SectionHeader title="مؤشر جاهزية القصص قبل PRD" />
        <ul className="grid grid-cols-1 gap-2 md:grid-cols-2 lg:grid-cols-3">
          <ReadinessCheck ok={readiness.checks.minApprovedOk} label="≥ 3 قصص معتمدة" actual={`${readiness.breakdown.approvedStories}`} />
          <ReadinessCheck ok={readiness.checks.acCoverageOk} label="تغطية AC ≥ 80%" actual={`${readiness.breakdown.acCoveragePercent}%`} />
          <ReadinessCheck ok={readiness.checks.gherkinValidityOk} label="صحّة Gherkin ≥ 90%" actual={`${readiness.breakdown.gherkinValidityPercent}%`} />
          <ReadinessCheck ok={readiness.checks.avgInvestOk} label="متوسط INVEST ≥ 4/6" actual={`${readiness.breakdown.avgInvestScore}`} />
          <ReadinessCheck ok={readiness.checks.lowOrphansOk} label="Orphans ≤ 15%" actual={`${readiness.breakdown.orphanRatio}%`} />
        </ul>
        {!readiness.ready && (
          <p className="mt-3 text-xs text-[var(--v-text-muted)]">
            الجاهزية الحالية {readiness.score}% — التوصية بلوغ 70% قبل توليد PRD نهائي.
          </p>
        )}
      </Card>

      {/* Stories grouped by status */}
      <Card>
        <SectionHeader title={`القصص (${stories.length})`} action={canWrite ? <Button size="sm" variant="primary" icon={<Plus size={14} />} onClick={() => setCreatingStory(true)}>قصة جديدة</Button> : null} />
        {stories.length === 0 ? (
          <EmptyState title="لا قصص بعد" description={canWrite ? "ابدأ بأول قصة مبنيّة على متطلب من P6." : "لم تُسجَّل قصص بعد."} />
        ) : (
          <div className="space-y-4">
            {STORY_STATUSES.map((status) => {
              const items = stories
                .filter((s) => s.status === status)
                .filter((s) => !showUncoveredOnly || (acsByStory.get(s.id)?.length ?? 0) === 0);
              if (items.length === 0) return null;
              return (
                <div key={status}>
                  <div className="mb-2 flex items-center gap-2 border-b border-[var(--v-border)] pb-1">
                    <Badge tone={STORY_STATUS_TONE[status]}>{STORY_STATUS_LABELS[status]}</Badge>
                    <span className="text-[11px] text-[var(--v-text-subtle)]">{items.length}</span>
                  </div>
                  <ul className="space-y-2">
                    {items.map((s) => {
                      const storyAcs = acsByStory.get(s.id) ?? [];
                      const invest = scoreStoryInvest(s, storyAcs.length);
                      const isExpanded = expanded.has(s.id);
                      return (
                        <li key={s.id} className="rounded-[var(--v-radius-md)] border border-[var(--v-border)] bg-[var(--v-surface)] p-3">
                          {/* Story header */}
                          <div className="flex items-start justify-between gap-3">
                            <div className="min-w-0 flex-1">
                              <div className="flex flex-wrap items-center gap-2">
                                {s.code && <span className="font-mono text-[11px] text-[var(--v-text-subtle)]">{s.code}</span>}
                                <p className="font-medium text-[var(--v-text)]">{s.title}</p>
                                <Badge tone={RISK_TONE[s.riskLevel]}>{RISK_LABELS[s.riskLevel]}</Badge>
                                {s.storyPoints != null && <span className="rounded-full bg-[var(--v-primary-tint)] px-2 text-[11px] text-[var(--v-primary)]">SP {s.storyPoints}</span>}
                                <span className="text-[11px] text-[var(--v-text-subtle)]" title="INVEST score">INVEST {invest.score}/6</span>
                              </div>
                              {(s.asA || s.iWant || s.soThat) && (
                                <p className="mt-1 text-xs leading-relaxed text-[var(--v-text-secondary)]">
                                  <b>As a</b> {s.asA || "—"} · <b>I want</b> {s.iWant || "—"} · <b>so that</b> {s.soThat || "—"}
                                </p>
                              )}
                            </div>
                            <div className="flex shrink-0 gap-1">
                              <Button size="sm" variant="ghost" onClick={() => toggleExpanded(s.id)}>
                                {isExpanded ? "طيّ" : `AC (${storyAcs.length})`}
                              </Button>
                              {canWrite && (
                                <>
                                  <Button size="sm" variant="ghost" icon={<Pencil size={14} />} onClick={() => setEditingStory(s)}>تعديل</Button>
                                  <Button size="sm" variant="ghost" icon={<Trash2 size={14} />}
                                    onClick={() => { if (!confirm(`حذف "${s.title}"؟`)) return; runAction(() => deleteStoryAction(projectId, s.id), "تم الحذف"); }}>حذف</Button>
                                </>
                              )}
                            </div>
                          </div>

                          {/* AC nested */}
                          {isExpanded && (
                            <div className="mt-3 border-r border-dashed border-[var(--v-border)] pr-3">
                              <div className="mb-2 flex items-center justify-between">
                                <p className="text-[11px] font-semibold uppercase text-[var(--v-text-subtle)]">Acceptance Criteria</p>
                                {canWrite && (
                                  <Button size="sm" variant="secondary" icon={<Plus size={12} />} onClick={() => setCreatingAcForStory(s.id)}>AC جديد</Button>
                                )}
                              </div>
                              {storyAcs.length === 0 ? (
                                <p className="rounded-[var(--v-radius-md)] border border-dashed border-[var(--v-border)] p-2 text-center text-[11px] text-[var(--v-text-muted)]">
                                  لا معايير قبول بعد. القصة غير قابلة للاختبار حتى يُضاف على الأقل معيار واحد.
                                </p>
                              ) : (
                                <ul className="space-y-2">
                                  {storyAcs.map((a) => {
                                    const g = validateGherkin(a);
                                    return (
                                      <li key={a.id} className="rounded-[var(--v-radius-md)] border border-[var(--v-border)] bg-[var(--v-bg)] p-2">
                                        <div className="flex items-start justify-between gap-2">
                                          <div className="min-w-0 flex-1">
                                            <div className="flex flex-wrap items-center gap-1.5">
                                              <span className="font-mono text-[11px] text-[var(--v-text-subtle)]">#{a.orderIndex}</span>
                                              {a.title && <span className="text-xs font-medium text-[var(--v-text)]">{a.title}</span>}
                                              <Badge tone={AC_STATUS_TONE[a.status]}>{AC_STATUS_LABELS[a.status]}</Badge>
                                              {!g.ok && <Badge tone="danger">ناقص: {g.missing.join(", ")}</Badge>}
                                            </div>
                                            <div className="mt-1 space-y-0.5 text-[11px] leading-relaxed text-[var(--v-text-secondary)]">
                                              <p><b className="text-[var(--v-primary)]">Given</b> {a.givenClause || "—"}</p>
                                              <p><b className="text-[var(--v-primary)]">When</b> {a.whenClause || "—"}</p>
                                              <p><b className="text-[var(--v-primary)]">Then</b> {a.thenClause || "—"}</p>
                                              {a.andConditions.length > 0 && (
                                                <ul className="mt-1 space-y-0.5 pr-3">
                                                  {a.andConditions.map((c, i) => (
                                                    <li key={i}><b className="text-[var(--v-primary)]">And</b> {c}</li>
                                                  ))}
                                                </ul>
                                              )}
                                            </div>
                                          </div>
                                          {canWrite && (
                                            <div className="flex shrink-0 gap-1">
                                              <Button size="sm" variant="ghost" icon={<Pencil size={12} />} onClick={() => setEditingAc(a)}>تعديل</Button>
                                              <Button size="sm" variant="ghost" icon={<Trash2 size={12} />}
                                                onClick={() => { if (!confirm("حذف المعيار؟")) return; runAction(() => deleteAcAction(projectId, a.id), "تم الحذف"); }}>حذف</Button>
                                            </div>
                                          )}
                                        </div>
                                      </li>
                                    );
                                  })}
                                </ul>
                              )}
                            </div>
                          )}
                        </li>
                      );
                    })}
                  </ul>
                </div>
              );
            })}
          </div>
        )}
      </Card>

      {/* Modals */}
      <StoryDialog
        key={editingStory?.id ?? (creatingStory ? "new-story" : "closed-story")}
        open={creatingStory || editingStory !== null}
        onClose={() => { setCreatingStory(false); setEditingStory(null); }}
        item={editingStory}
        personas={personas} flows={flows} requirements={requirements}
        onSave={(input) => {
          if (editingStory) runAction(() => updateStoryAction(projectId, editingStory.id, input), "تم التحديث");
          else runAction(() => createStoryAction(projectId, input), "تم الإنشاء");
          setCreatingStory(false); setEditingStory(null);
        }}
      />
      <AcDialog
        key={editingAc?.id ?? (creatingAcForStory ? `new-ac-${creatingAcForStory}` : "closed-ac")}
        open={creatingAcForStory !== null || editingAc !== null}
        onClose={() => { setCreatingAcForStory(null); setEditingAc(null); }}
        item={editingAc}
        userStoryId={editingAc?.userStoryId ?? creatingAcForStory ?? ""}
        stories={stories}
        onSave={(input) => {
          if (editingAc) runAction(() => updateAcAction(projectId, editingAc.id, input), "تم التحديث");
          else runAction(() => createAcAction(projectId, { userStoryId: creatingAcForStory ?? "", ...input }), "تم الإنشاء");
          setCreatingAcForStory(null); setEditingAc(null);
        }}
      />
      {pending && <span className="sr-only">جارٍ الحفظ...</span>}
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
      <span className="flex items-center gap-1">
        {ok ? <CheckCircle2 size={14} className="text-[var(--v-green)]" /> : <XCircle size={14} className="text-[var(--v-red)]" />}
        <Badge tone={ok ? "success" : "danger"}>{actual}</Badge>
      </span>
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
// Story Dialog
// ---------------------------------------------------------------------------
function StoryDialog({
  open, onClose, item, personas, flows, requirements, onSave,
}: {
  open: boolean; onClose: () => void; item: UserStoryRow | null;
  personas: PersonaRow[]; flows: UserFlowRow[]; requirements: RequirementRow[];
  onSave: (input: {
    code: string; title: string; asA: string; iWant: string; soThat: string;
    narrativeExtra: string; status: StoryStatus; storyPoints: number | null;
    businessValue: number; riskLevel: RiskLevel;
    linkedPersonaId: string | null; linkedFlowId: string | null; linkedRequirementId: string | null;
    tags: string;
  }) => void;
}) {
  const [code, setCode] = useState(item?.code ?? "");
  const [title, setTitle] = useState(item?.title ?? "");
  const [asA, setAsA] = useState(item?.asA ?? "");
  const [iWant, setIWant] = useState(item?.iWant ?? "");
  const [soThat, setSoThat] = useState(item?.soThat ?? "");
  const [narrativeExtra, setNarrative] = useState(item?.narrativeExtra ?? "");
  const [status, setStatus] = useState<StoryStatus>(item?.status ?? "draft");
  const [storyPoints, setStoryPoints] = useState<string>(item?.storyPoints != null ? String(item.storyPoints) : "");
  const [businessValue, setBusinessValue] = useState<number>(item?.businessValue ?? 50);
  const [riskLevel, setRiskLevel] = useState<RiskLevel>(item?.riskLevel ?? "medium");
  const [linkedPersonaId, setLinkedPersona] = useState(item?.linkedPersonaId ?? "");
  const [linkedFlowId, setLinkedFlow] = useState(item?.linkedFlowId ?? "");
  const [linkedRequirementId, setLinkedRequirement] = useState(item?.linkedRequirementId ?? "");
  const [tags, setTags] = useState(item?.tags.join(", ") ?? "");

  return (
    <Modal open={open} onClose={onClose} maxWidth="max-w-2xl">
      <div className="space-y-4 p-6">
        <h2 className="text-lg font-semibold text-[var(--v-text)]">{item ? "تعديل قصة" : "قصة مستخدم جديدة"}</h2>
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <Field label="الكود"><Input value={code} onChange={(e) => setCode(e.target.value)} placeholder="US-001" /></Field>
          <Field label="الحالة">
            <Select value={status} onChange={(e) => setStatus(e.target.value as StoryStatus)}>
              {STORY_STATUSES.map((s) => <option key={s} value={s}>{STORY_STATUS_LABELS[s]}</option>)}
            </Select>
          </Field>
          <Field label="العنوان *" span={2}><Input value={title} onChange={(e) => setTitle(e.target.value)} placeholder="اعتماد طلب الشراء بضغطة" /></Field>
          <Field label="As a (كـ …)" span={2}><Input value={asA} onChange={(e) => setAsA(e.target.value)} placeholder="مدير المشتريات" /></Field>
          <Field label="I want (أريد …)" span={2}><Textarea value={iWant} onChange={(e) => setIWant(e.target.value)} rows={2} placeholder="اعتماد الطلب بضغطة زر واحدة من لوحة التنبيهات" /></Field>
          <Field label="So that (حتى …)" span={2}><Textarea value={soThat} onChange={(e) => setSoThat(e.target.value)} rows={2} placeholder="أوفّر وقت وأزيل خطوات يدوية" /></Field>
          <Field label="نقاط القصة">
            <Select value={storyPoints} onChange={(e) => setStoryPoints(e.target.value)}>
              <option value="">— بدون —</option>
              {STORY_POINT_OPTIONS.map((n) => <option key={n} value={String(n)}>{n}</option>)}
            </Select>
          </Field>
          <Field label={`قيمة العمل: ${businessValue}%`}>
            <input type="range" min={0} max={100} step={5} value={businessValue} onChange={(e) => setBusinessValue(Number(e.target.value))} className="w-full" />
          </Field>
          <Field label="مستوى المخاطر">
            <Select value={riskLevel} onChange={(e) => setRiskLevel(e.target.value as RiskLevel)}>
              {RISK_LEVELS.map((r) => <option key={r} value={r}>{RISK_LABELS[r]}</option>)}
            </Select>
          </Field>
          <Field label="Persona مرتبطة">
            <Select value={linkedPersonaId} onChange={(e) => setLinkedPersona(e.target.value)}>
              <option value="">— بلا —</option>
              {personas.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
            </Select>
          </Field>
          <Field label="Flow مرتبط">
            <Select value={linkedFlowId} onChange={(e) => setLinkedFlow(e.target.value)}>
              <option value="">— بلا —</option>
              {flows.map((f) => <option key={f.id} value={f.id}>{f.name}</option>)}
            </Select>
          </Field>
          <Field label="Requirement مرتبط">
            <Select value={linkedRequirementId} onChange={(e) => setLinkedRequirement(e.target.value)}>
              <option value="">— بلا —</option>
              {requirements.map((r) => <option key={r.id} value={r.id}>{r.title}</option>)}
            </Select>
          </Field>
          <Field label="ملاحظات إضافية" span={2}><Textarea value={narrativeExtra} onChange={(e) => setNarrative(e.target.value)} rows={2} /></Field>
          <Field label="وسوم" span={2}><Input value={tags} onChange={(e) => setTags(e.target.value)} placeholder="approval, workflow" /></Field>
        </div>
        <div className="flex justify-end gap-2 pt-2">
          <Button variant="ghost" onClick={onClose}>إلغاء</Button>
          <Button variant="primary" onClick={() => onSave({
            code, title, asA, iWant, soThat, narrativeExtra, status,
            storyPoints: storyPoints === "" ? null : Number(storyPoints),
            businessValue, riskLevel,
            linkedPersonaId: linkedPersonaId || null,
            linkedFlowId: linkedFlowId || null,
            linkedRequirementId: linkedRequirementId || null,
            tags,
          })}>حفظ</Button>
        </div>
      </div>
    </Modal>
  );
}

// ---------------------------------------------------------------------------
// AC Dialog
// ---------------------------------------------------------------------------
function AcDialog({
  open, onClose, item, userStoryId, stories, onSave,
}: {
  open: boolean; onClose: () => void; item: AcceptanceCriterionRow | null;
  userStoryId: string; stories: UserStoryRow[];
  onSave: (input: {
    title: string; givenClause: string; whenClause: string; thenClause: string;
    andConditions: string; status: AcStatus; notes: string;
  }) => void;
}) {
  const [title, setTitle] = useState(item?.title ?? "");
  const [givenClause, setGiven] = useState(item?.givenClause ?? "");
  const [whenClause, setWhen] = useState(item?.whenClause ?? "");
  const [thenClause, setThen] = useState(item?.thenClause ?? "");
  const [andConditions, setAnd] = useState(item?.andConditions.join("\n") ?? "");
  const [status, setStatus] = useState<AcStatus>(item?.status ?? "draft");
  const [notes, setNotes] = useState(item?.notes ?? "");

  const parentStory = stories.find((s) => s.id === userStoryId);

  return (
    <Modal open={open} onClose={onClose} maxWidth="max-w-lg">
      <div className="space-y-4 p-6">
        <h2 className="text-lg font-semibold text-[var(--v-text)]">{item ? "تعديل معيار قبول" : "معيار قبول جديد"}</h2>
        {parentStory && (
          <p className="rounded-[var(--v-radius-md)] bg-[var(--v-primary-tint)] p-2 text-xs text-[var(--v-primary)]">
            القصة: <b>{parentStory.title}</b>
          </p>
        )}
        <div className="grid grid-cols-1 gap-3">
          <Field label="العنوان (اختياري)"><Input value={title} onChange={(e) => setTitle(e.target.value)} placeholder="السيناريو الأساسي" /></Field>
          <Field label="Given (بفرض أن …) *"><Textarea value={givenClause} onChange={(e) => setGiven(e.target.value)} rows={2} placeholder="المستخدم مسجّل دخول ولديه طلب معلّق" /></Field>
          <Field label="When (لما …) *"><Textarea value={whenClause} onChange={(e) => setWhen(e.target.value)} rows={2} placeholder="يضغط زر «اعتماد»" /></Field>
          <Field label="Then (يفترض …) *"><Textarea value={thenClause} onChange={(e) => setThen(e.target.value)} rows={2} placeholder="تظهر رسالة نجاح ويتحدّث الطلب لـ Approved" /></Field>
          <Field label="And… (شرط لكل سطر)"><Textarea value={andConditions} onChange={(e) => setAnd(e.target.value)} rows={2} placeholder={"يُرسَل إشعار للمتقدّم\nيُسجَّل الحدث في السجل"} /></Field>
          <Field label="الحالة">
            <Select value={status} onChange={(e) => setStatus(e.target.value as AcStatus)}>
              {AC_STATUSES.map((s) => <option key={s} value={s}>{AC_STATUS_LABELS[s]}</option>)}
            </Select>
          </Field>
          <Field label="ملاحظات"><Textarea value={notes} onChange={(e) => setNotes(e.target.value)} rows={2} /></Field>
        </div>
        <div className="flex justify-end gap-2 pt-2">
          <Button variant="ghost" onClick={onClose}>إلغاء</Button>
          <Button variant="primary" onClick={() => onSave({ title, givenClause, whenClause, thenClause, andConditions, status, notes })}>حفظ</Button>
        </div>
      </div>
    </Modal>
  );
}
