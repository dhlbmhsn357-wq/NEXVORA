"use client";

/**
 * NEXVORA Research Panel (P5)
 * ============================
 * تبويب "البحث والتحقق" — يظهر داخل صفحة المشروع لما product_mode مفعّل.
 * قسمان أساسيان:
 *   1) البحث السوقي (Market Research)  — منافسون/اتجاهات/شرائح/تسعير
 *   2) التحقق من المشكلة (Problem Validation) — أدلة + مؤشر جاهزية
 */
import { useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Plus, Pencil, Trash2, TrendingUp, Search, ShieldCheck, AlertTriangle, ExternalLink } from "lucide-react";
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
  MARKET_RESEARCH_ITEM_TYPES, MARKET_RESEARCH_TYPE_LABELS,
  EVIDENCE_TYPES, EVIDENCE_TYPE_LABELS,
  CLASSIFICATION_LABELS, CONFIDENTIALITY_LABELS,
  EVIDENCE_ORIGIN_LABELS,
  type MarketResearchItem, type MarketResearchItemType,
  type ProblemValidationItem, type EvidenceType,
  type EvidenceOrigin,
} from "@/lib/market-research/types";
import {
  summarizeMarketResearch, summarizeProblemValidation,
  deriveValidationReadiness, classifyEvidenceQuality,
} from "@/lib/market-research/derive";
import {
  createMarketResearchAction, updateMarketResearchAction, deleteMarketResearchAction,
  createProblemValidationAction, updateProblemValidationAction, deleteProblemValidationAction,
  updateEvidenceOriginAction,
} from "./research-actions";

// ---------------------------------------------------------------------------
// Badge tones
// ---------------------------------------------------------------------------
const MR_TYPE_TONE: Record<MarketResearchItemType, BadgeTone> = {
  direct_competitor: "danger", indirect_competitor: "warning",
  market_trend: "info", user_segment: "primary", pricing_model: "success",
  swot: "neutral", other: "neutral",
};
const EV_TYPE_TONE: Record<EvidenceType, BadgeTone> = {
  user_interview: "primary", survey: "info", analytics_data: "success",
  recorded_session: "warning", direct_observation: "primary",
  internal_document: "neutral", support_ticket: "danger", other: "neutral",
};
const QUALITY_TONE: Record<"weak" | "moderate" | "strong", BadgeTone> = {
  weak: "danger", moderate: "warning", strong: "success",
};
const ORIGIN_TONE: Record<EvidenceOrigin, BadgeTone> = {
  verified_real: "success",
  unverified: "neutral",
  simulated: "warning",
};

export interface ResearchPanelProps {
  projectId: string;
  marketResearch: MarketResearchItem[];
  problemValidation: ProblemValidationItem[];
  canWrite: boolean;
  /** Owner/Admin only — لتغيير origin (verified_real / unverified / simulated). */
  canManageOrigin?: boolean;
  /** True لو المشروع mode='test' — يمنع رفع الدليل لـ verified_real في الـ UI. */
  isTestProject?: boolean;
}

export default function ResearchPanel(props: ResearchPanelProps) {
  const { projectId, marketResearch, problemValidation, canWrite, canManageOrigin = false, isTestProject = false } = props;
  const router = useRouter();
  const [pending, startTransition] = useTransition();

  const [editingMr, setEditingMr] = useState<MarketResearchItem | null>(null);
  const [creatingMr, setCreatingMr] = useState(false);
  const [editingPv, setEditingPv] = useState<ProblemValidationItem | null>(null);
  const [creatingPv, setCreatingPv] = useState(false);

  const mrSummary = useMemo(() => summarizeMarketResearch(marketResearch), [marketResearch]);
  const pvSummary = useMemo(() => summarizeProblemValidation(problemValidation), [problemValidation]);
  const readiness = useMemo(() => deriveValidationReadiness(problemValidation), [problemValidation]);

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
        <StatTile icon={<TrendingUp size={16} />} label="عناصر بحث سوقي" value={`${mrSummary.total}`} sub={mrSummary.avgConfidence ? `متوسط الثقة ${mrSummary.avgConfidence}%` : ""} />
        <StatTile icon={<Search size={16} />} label="منافسون مباشرون" value={`${mrSummary.directCompetitors}`} sub={`+ ${mrSummary.segments} شرائح`} />
        <StatTile icon={<ShieldCheck size={16} />} label="أدلة تحقّق" value={`${pvSummary.total}`} sub={pvSummary.distinctPainPoints ? `${pvSummary.distinctPainPoints} نقاط ألم` : ""} />
        <StatTile
          icon={<AlertTriangle size={16} />}
          label="جاهزية التحقّق"
          value={`${readiness.score}%`}
          tone={readiness.ready ? "success" : readiness.score >= 40 ? "warning" : "danger"}
        />
      </div>

      {/* Readiness checklist */}
      <Card>
        <SectionHeader title="مؤشر جاهزية التحقّق قبل تعريف المنتج" />
        <ul className="grid grid-cols-1 gap-2 md:grid-cols-2">
          <ReadinessCheck ok={readiness.checks.distinctPainPointsOk} label={`≥ 3 نقاط ألم مميّزة`} actual={`${readiness.breakdown.distinctPainPoints}`} />
          <ReadinessCheck ok={readiness.checks.minEvidenceOk} label={`≥ 5 أدلة`} actual={`${readiness.breakdown.totalEvidence}`} />
          <ReadinessCheck ok={readiness.checks.avgStrengthOk} label={`متوسط قوّة الأدلة ≥ 60`} actual={`${readiness.breakdown.avgStrength}`} />
          <ReadinessCheck ok={readiness.checks.diversityOk} label={`تنوّع أنواع الأدلة ≥ 3`} actual={`${readiness.breakdown.evidenceTypeCount}`} />
        </ul>
        {!readiness.ready && (
          <p className="mt-3 text-xs text-[var(--v-text-muted)]">
            الجاهزية الحالية {readiness.score}% — التوصية بلوغ 70% قبل الانتقال لـ Product Definition.
          </p>
        )}
      </Card>

      {/* Market Research */}
      <Card>
        <SectionHeader
          title={`البحث السوقي (${marketResearch.length})`}
          action={canWrite ? (
            <Button size="sm" variant="primary" icon={<Plus size={14} />} onClick={() => setCreatingMr(true)}>عنصر جديد</Button>
          ) : null}
        />
        {marketResearch.length === 0 ? (
          <EmptyState title="لا عناصر بحث سوقي بعد" description={canWrite ? "ابدأ بإضافة منافس، اتجاه، أو شريحة مستخدمين." : "لم تُسجَّل عناصر لهذا المشروع بعد."} />
        ) : (
          <ul className="divide-y divide-[var(--v-border)]">
            {marketResearch.map((m) => (
              <li key={m.id} className="flex items-start justify-between gap-3 py-3">
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <p className="font-medium text-[var(--v-text)]">{m.title}</p>
                    <Badge tone={MR_TYPE_TONE[m.itemType]}>{MARKET_RESEARCH_TYPE_LABELS[m.itemType]}</Badge>
                    <Badge tone="neutral">{CLASSIFICATION_LABELS[m.informationClass]}</Badge>
                    <Badge tone={m.confidentiality === "confidential" ? "danger" : m.confidentiality === "public" ? "success" : "info"}>{CONFIDENTIALITY_LABELS[m.confidentiality]}</Badge>
                    <span className="text-[11px] text-[var(--v-text-subtle)]">ثقة: {m.confidence}%</span>
                    <OriginControl
                      origin={m.origin}
                      canManage={canManageOrigin}
                      isTestProject={isTestProject}
                      onChange={(newOrigin) => runAction(
                        () => updateEvidenceOriginAction(projectId, "market_research", m.id, newOrigin),
                        "تم تحديث الأصل"
                      )}
                    />
                  </div>
                  {m.summary && <p className="mt-1 text-xs text-[var(--v-text-secondary)]">{m.summary}</p>}
                  {m.sourceUrl && (
                    <a href={m.sourceUrl} target="_blank" rel="noopener noreferrer" className="mt-1 inline-flex items-center gap-1 text-[11px] text-[var(--v-primary)] hover:underline">
                      <ExternalLink size={11} /> المصدر
                    </a>
                  )}
                </div>
                {canWrite && (
                  <div className="flex shrink-0 gap-1">
                    <Button size="sm" variant="ghost" icon={<Pencil size={14} />} onClick={() => setEditingMr(m)}>تعديل</Button>
                    <Button size="sm" variant="ghost" icon={<Trash2 size={14} />}
                      onClick={() => {
                        if (!confirm(`حذف "${m.title}"؟`)) return;
                        runAction(() => deleteMarketResearchAction(projectId, m.id), "تم الحذف");
                      }}>حذف</Button>
                  </div>
                )}
              </li>
            ))}
          </ul>
        )}
      </Card>

      {/* Problem Validation */}
      <Card>
        <SectionHeader
          title={`التحقق من المشكلة (${problemValidation.length})`}
          action={canWrite ? (
            <Button size="sm" variant="primary" icon={<Plus size={14} />} onClick={() => setCreatingPv(true)}>دليل جديد</Button>
          ) : null}
        />
        {problemValidation.length === 0 ? (
          <EmptyState title="لا أدلة تحقّق بعد" description={canWrite ? "أضف أوّل مقابلة/استبيان/بيانات تحليلية تدعم فرضيّة الألم." : "لم تُسجَّل أدلة لهذا المشروع بعد."} />
        ) : (
          <ul className="divide-y divide-[var(--v-border)]">
            {problemValidation.map((p) => {
              const q = classifyEvidenceQuality(p.strength);
              return (
                <li key={p.id} className="flex items-start justify-between gap-3 py-3">
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <p className="font-medium text-[var(--v-text)]">{p.title}</p>
                      <Badge tone={EV_TYPE_TONE[p.evidenceType]}>{EVIDENCE_TYPE_LABELS[p.evidenceType]}</Badge>
                      <Badge tone="neutral">{CLASSIFICATION_LABELS[p.informationClass]}</Badge>
                      <Badge tone={p.confidentiality === "confidential" ? "danger" : p.confidentiality === "public" ? "success" : "info"}>{CONFIDENTIALITY_LABELS[p.confidentiality]}</Badge>
                      <Badge tone={QUALITY_TONE[q]}>قوّة {p.strength}%</Badge>
                      <OriginControl
                        origin={p.origin}
                        canManage={canManageOrigin}
                        isTestProject={isTestProject}
                        onChange={(newOrigin) => runAction(
                          () => updateEvidenceOriginAction(projectId, "problem_validation", p.id, newOrigin),
                          "تم تحديث الأصل"
                        )}
                      />
                    </div>
                    <p className="mt-1 text-sm text-[var(--v-text-secondary)]">
                      <span className="text-[var(--v-text-muted)]">الألم:</span> {p.painPoint}
                    </p>
                    {p.quote && <p className="mt-1 border-r-2 border-[var(--v-border)] pr-2 text-xs italic text-[var(--v-text-subtle)]">&ldquo;{p.quote}&rdquo;</p>}
                    {(p.sourcePerson || p.sourceRole || p.sourceDate) && (
                      <p className="mt-1 text-[11px] text-[var(--v-text-subtle)]">
                        {p.sourcePerson}{p.sourceRole ? ` — ${p.sourceRole}` : ""}
                        {p.sourceDate ? ` · ${new Date(p.sourceDate).toLocaleDateString("ar-EG")}` : ""}
                      </p>
                    )}
                  </div>
                  {canWrite && (
                    <div className="flex shrink-0 gap-1">
                      <Button size="sm" variant="ghost" icon={<Pencil size={14} />} onClick={() => setEditingPv(p)}>تعديل</Button>
                      <Button size="sm" variant="ghost" icon={<Trash2 size={14} />}
                        onClick={() => {
                          if (!confirm(`حذف "${p.title}"؟`)) return;
                          runAction(() => deleteProblemValidationAction(projectId, p.id), "تم الحذف");
                        }}>حذف</Button>
                    </div>
                  )}
                </li>
              );
            })}
          </ul>
        )}
      </Card>

      {/* Modals */}
      <MrDialog
        key={editingMr?.id ?? (creatingMr ? "new-mr" : "closed-mr")}
        open={creatingMr || editingMr !== null}
        onClose={() => { setCreatingMr(false); setEditingMr(null); }}
        item={editingMr}
        onSave={(input) => {
          if (editingMr) runAction(() => updateMarketResearchAction(projectId, editingMr.id, input), "تم التحديث");
          else runAction(() => createMarketResearchAction(projectId, input), "تم الإنشاء");
          setCreatingMr(false); setEditingMr(null);
        }}
      />
      <PvDialog
        key={editingPv?.id ?? (creatingPv ? "new-pv" : "closed-pv")}
        open={creatingPv || editingPv !== null}
        onClose={() => { setCreatingPv(false); setEditingPv(null); }}
        item={editingPv}
        onSave={(input) => {
          if (editingPv) runAction(() => updateProblemValidationAction(projectId, editingPv.id, input), "تم التحديث");
          else runAction(() => createProblemValidationAction(projectId, input), "تم الإنشاء");
          setCreatingPv(false); setEditingPv(null);
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

function OriginControl({
  origin,
  canManage,
  isTestProject,
  onChange,
}: {
  origin: EvidenceOrigin;
  canManage: boolean;
  isTestProject: boolean;
  onChange: (o: EvidenceOrigin) => void;
}) {
  if (!canManage) {
    return <Badge tone={ORIGIN_TONE[origin]}>{EVIDENCE_ORIGIN_LABELS[origin]}</Badge>;
  }
  return (
    <span className="inline-flex items-center gap-1">
      <Badge tone={ORIGIN_TONE[origin]}>{EVIDENCE_ORIGIN_LABELS[origin]}</Badge>
      <select
        value={origin}
        onChange={(e) => onChange(e.target.value as EvidenceOrigin)}
        className="h-6 rounded border border-[var(--v-border)] bg-[var(--v-bg)] px-1 text-[10px] text-[var(--v-text)]"
        title={isTestProject ? "المشروع تجريبي — 'حقيقي' معطَّل." : "تغيير أصل الدليل"}
      >
        <option value="unverified">غير موثَّق</option>
        <option value="verified_real" disabled={isTestProject}>
          دليل حقيقي{isTestProject ? " (معطَّل — تجريبي)" : ""}
        </option>
        <option value="simulated">محاكاة</option>
      </select>
    </span>
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

function MrDialog({
  open, onClose, item, onSave,
}: {
  open: boolean; onClose: () => void; item: MarketResearchItem | null;
  onSave: (input: {
    itemType: MarketResearchItemType; title: string; summary: string;
    sourceUrl: string; sourceNotes: string; confidence: number; tags: string;
  }) => void;
}) {
  const [itemType, setItemType] = useState<MarketResearchItemType>(item?.itemType ?? "direct_competitor");
  const [title, setTitle] = useState(item?.title ?? "");
  const [summary, setSummary] = useState(item?.summary ?? "");
  const [sourceUrl, setSourceUrl] = useState(item?.sourceUrl ?? "");
  const [sourceNotes, setSourceNotes] = useState(item?.sourceNotes ?? "");
  const [confidence, setConfidence] = useState<number>(item?.confidence ?? 50);
  const [tags, setTags] = useState(item?.tags.join(", ") ?? "");

  return (
    <Modal open={open} onClose={onClose} maxWidth="max-w-lg">
      <div className="space-y-4 p-6">
        <h2 className="text-lg font-semibold text-[var(--v-text)]">{item ? "تعديل عنصر بحث" : "عنصر بحث جديد"}</h2>
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <Field label="النوع *">
            <Select value={itemType} onChange={(e) => setItemType(e.target.value as MarketResearchItemType)}>
              {MARKET_RESEARCH_ITEM_TYPES.map((t) => <option key={t} value={t}>{MARKET_RESEARCH_TYPE_LABELS[t]}</option>)}
            </Select>
          </Field>
          <Field label={`الثقة: ${confidence}%`}>
            <input type="range" min={0} max={100} step={5} value={confidence} onChange={(e) => setConfidence(Number(e.target.value))} className="w-full" />
          </Field>
          <Field label="العنوان *" span={2}><Input value={title} onChange={(e) => setTitle(e.target.value)} placeholder="مثلاً: SAP B1" /></Field>
          <Field label="ملخّص" span={2}><Textarea value={summary} onChange={(e) => setSummary(e.target.value)} rows={2} /></Field>
          <Field label="رابط المصدر"><Input value={sourceUrl} onChange={(e) => setSourceUrl(e.target.value)} placeholder="https://…" /></Field>
          <Field label="ملاحظات المصدر"><Input value={sourceNotes} onChange={(e) => setSourceNotes(e.target.value)} /></Field>
          <Field label="وسوم (مفصولة بفاصلة)" span={2}><Input value={tags} onChange={(e) => setTags(e.target.value)} placeholder="erp, saas, mena" /></Field>
        </div>
        <div className="flex justify-end gap-2 pt-2">
          <Button variant="ghost" onClick={onClose}>إلغاء</Button>
          <Button variant="primary" onClick={() => onSave({ itemType, title, summary, sourceUrl, sourceNotes, confidence, tags })}>حفظ</Button>
        </div>
      </div>
    </Modal>
  );
}

function PvDialog({
  open, onClose, item, onSave,
}: {
  open: boolean; onClose: () => void; item: ProblemValidationItem | null;
  onSave: (input: {
    evidenceType: EvidenceType; title: string; painPoint: string; quote: string;
    sourcePerson: string; sourceRole: string; sourceDate: string; supportingUrl: string;
    supportingNotes: string; strength: number; tags: string;
  }) => void;
}) {
  const [evidenceType, setEvidenceType] = useState<EvidenceType>(item?.evidenceType ?? "user_interview");
  const [title, setTitle] = useState(item?.title ?? "");
  const [painPoint, setPainPoint] = useState(item?.painPoint ?? "");
  const [quote, setQuote] = useState(item?.quote ?? "");
  const [sourcePerson, setSourcePerson] = useState(item?.sourcePerson ?? "");
  const [sourceRole, setSourceRole] = useState(item?.sourceRole ?? "");
  const [sourceDate, setSourceDate] = useState(item?.sourceDate?.slice(0, 10) ?? "");
  const [supportingUrl, setSupportingUrl] = useState(item?.supportingUrl ?? "");
  const [supportingNotes, setSupportingNotes] = useState(item?.supportingNotes ?? "");
  const [strength, setStrength] = useState<number>(item?.strength ?? 50);
  const [tags, setTags] = useState(item?.tags.join(", ") ?? "");

  return (
    <Modal open={open} onClose={onClose} maxWidth="max-w-lg">
      <div className="space-y-4 p-6">
        <h2 className="text-lg font-semibold text-[var(--v-text)]">{item ? "تعديل دليل" : "دليل تحقق جديد"}</h2>
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <Field label="نوع الدليل *">
            <Select value={evidenceType} onChange={(e) => setEvidenceType(e.target.value as EvidenceType)}>
              {EVIDENCE_TYPES.map((t) => <option key={t} value={t}>{EVIDENCE_TYPE_LABELS[t]}</option>)}
            </Select>
          </Field>
          <Field label={`قوّة الدليل: ${strength}%`}>
            <input type="range" min={0} max={100} step={5} value={strength} onChange={(e) => setStrength(Number(e.target.value))} className="w-full" />
          </Field>
          <Field label="العنوان *" span={2}><Input value={title} onChange={(e) => setTitle(e.target.value)} placeholder="مقابلة مع مدير المشتريات" /></Field>
          <Field label="نقطة الألم *" span={2}><Input value={painPoint} onChange={(e) => setPainPoint(e.target.value)} placeholder="بطء الاعتماد يعطّل التشغيل اليومي" /></Field>
          <Field label="اقتباس مباشر" span={2}><Textarea value={quote} onChange={(e) => setQuote(e.target.value)} rows={2} placeholder="&quot;نفضل تحت الإدارة اليدوية ساعة يوميًا…&quot;" /></Field>
          <Field label="اسم المصدر"><Input value={sourcePerson} onChange={(e) => setSourcePerson(e.target.value)} /></Field>
          <Field label="دور المصدر"><Input value={sourceRole} onChange={(e) => setSourceRole(e.target.value)} placeholder="مدير مشتريات" /></Field>
          <Field label="تاريخ المصدر"><Input type="date" value={sourceDate} onChange={(e) => setSourceDate(e.target.value)} /></Field>
          <Field label="رابط داعم"><Input value={supportingUrl} onChange={(e) => setSupportingUrl(e.target.value)} placeholder="https://…" /></Field>
          <Field label="ملاحظات داعمة" span={2}><Textarea value={supportingNotes} onChange={(e) => setSupportingNotes(e.target.value)} rows={2} /></Field>
          <Field label="وسوم" span={2}><Input value={tags} onChange={(e) => setTags(e.target.value)} placeholder="approval, workflow" /></Field>
        </div>
        <div className="flex justify-end gap-2 pt-2">
          <Button variant="ghost" onClick={onClose}>إلغاء</Button>
          <Button variant="primary" onClick={() => onSave({
            evidenceType, title, painPoint, quote, sourcePerson, sourceRole,
            sourceDate, supportingUrl, supportingNotes, strength, tags,
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
