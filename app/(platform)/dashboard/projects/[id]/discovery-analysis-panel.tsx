"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import {
  Loader2,
  RefreshCw,
  AlertCircle,
  Sparkles,
  ChevronDown,
  ChevronUp,
  Info,
  Printer,
} from "lucide-react";
import Card from "@/components/ui/Card";
import Button from "@/components/ui/Button";
import Badge from "@/components/ui/Badge";
import Tooltip from "@/components/ui/Tooltip";
import EmptyState from "@/components/ui/EmptyState";
import { toast } from "@/components/ui/Toaster";
import { rerunDiscoveryAnalysis } from "./discovery-analysis-actions";
import {
  ANALYSIS_SECTIONS,
  SECTION_LABELS,
  type AnalysisSectionKey,
  type DiscoveryAnalysisOutput,
  type DiscoveryAnalysisRow,
  type EvidenceRef,
  type SectionConfidence,
} from "@/lib/discovery-analysis/types";

const PRIORITY_LABELS: Record<string, string> = {
  high: "عالية",
  medium: "متوسطة",
  low: "منخفضة",
};
const PRIORITY_TONE: Record<string, "danger" | "warning" | "neutral"> = {
  high: "danger",
  medium: "warning",
  low: "neutral",
};

function fmtStatus(status: DiscoveryAnalysisRow["status"]) {
  const map: Record<DiscoveryAnalysisRow["status"], { label: string; tone: "neutral" | "info" | "success" | "danger" | "warning" }> = {
    pending: { label: "بانتظار البدء", tone: "neutral" },
    running: { label: "قيد التحليل…", tone: "info" },
    completed: { label: "تم التحليل", tone: "success" },
    failed: { label: "فشل", tone: "danger" },
  };
  return map[status];
}

function confidenceTone(score: number): "success" | "warning" | "danger" {
  if (score >= 75) return "success";
  if (score >= 50) return "warning";
  return "danger";
}

function ConfidenceBadge({ confidence }: { confidence: SectionConfidence }) {
  return (
    <Tooltip label={confidence.reason ?? `ثقة ${confidence.score}%`}>
      <span
        className={`inline-flex cursor-help items-center gap-1 rounded-full px-2 py-0.5 text-[10px] font-medium ${
          confidenceTone(confidence.score) === "success"
            ? "bg-[var(--v-green)]/10 text-[var(--v-green)]"
            : confidenceTone(confidence.score) === "warning"
              ? "bg-[var(--v-amber)]/10 text-[var(--v-amber)]"
              : "bg-[var(--v-red)]/10 text-[var(--v-red)]"
        }`}
      >
        ثقة {confidence.score}%
      </span>
    </Tooltip>
  );
}

function EvidenceChips({ items }: { items: EvidenceRef[] }) {
  if (!items || items.length === 0) return null;
  return (
    <div className="mt-1.5 flex flex-wrap gap-1">
      {items.map((e, i) => (
        <Tooltip key={i} label={`${e.question_label}: "${e.quote}"`}>
          <span className="inline-flex cursor-help items-center gap-1 rounded-[var(--v-radius-sm)] bg-[var(--v-surface)] px-1.5 py-0.5 text-[10px] text-[var(--v-text-subtle)]">
            <Info size={10} /> دليل
          </span>
        </Tooltip>
      ))}
    </div>
  );
}

function SectionCard({
  title,
  confidence,
  children,
}: {
  title: string;
  confidence: SectionConfidence;
  children: React.ReactNode;
}) {
  const [open, setOpen] = useState(true);
  return (
    <Card padding="md" animate={false}>
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="flex w-full items-center justify-between gap-2 text-start"
      >
        <div className="flex items-center gap-2">
          <p className="text-sm font-semibold text-[var(--v-text)]">{title}</p>
          <ConfidenceBadge confidence={confidence} />
        </div>
        {open ? <ChevronUp size={15} className="text-[var(--v-text-muted)]" /> : <ChevronDown size={15} className="text-[var(--v-text-muted)]" />}
      </button>
      {open && <div className="mt-3 space-y-2">{children}</div>}
    </Card>
  );
}

// ============================================================
// Renderers لكل قسم من الـ 17 قسمًا
// ============================================================

function renderExecutiveSummary(o: DiscoveryAnalysisOutput) {
  const s = o.executive_summary;
  return (
    <SectionCard title={SECTION_LABELS.executive_summary} confidence={s.confidence}>
      <p className="text-sm leading-relaxed text-[var(--v-text)] whitespace-pre-wrap">{s.summary}</p>
      <EvidenceChips items={s.evidence} />
    </SectionCard>
  );
}

function renderBusinessModel(o: DiscoveryAnalysisOutput) {
  const s = o.business_model;
  return (
    <SectionCard title={SECTION_LABELS.business_model} confidence={s.confidence}>
      <SubField label="نظرة عامة" value={s.overview} />
      <SubField label="كيف يعمل" value={s.how_it_works} />
      <SubField label="كيف يحقق القيمة" value={s.value_delivery} />
      <SubField label="المستخدمون" value={s.users_description} />
      <EvidenceChips items={s.evidence} />
    </SectionCard>
  );
}
function SubField({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <p className="text-[11px] font-semibold text-[var(--v-text-subtle)]">{label}</p>
      <p className="mt-0.5 text-sm text-[var(--v-text)]">{value}</p>
    </div>
  );
}

function renderStakeholders(o: DiscoveryAnalysisOutput) {
  const s = o.stakeholders;
  return (
    <SectionCard title={SECTION_LABELS.stakeholders} confidence={s.confidence}>
      {s.items.length === 0 && <EmptyRow />}
      {s.items.map((it, i) => (
        <ItemRow key={i}>
          <div className="flex items-center gap-2">
            <span className="text-sm font-medium text-[var(--v-text)]">{it.name}</span>
            <Badge tone={PRIORITY_TONE[it.influence]}>تأثير {PRIORITY_LABELS[it.influence]}</Badge>
          </div>
          <p className="text-xs text-[var(--v-text-muted)]">{it.role}</p>
          <EvidenceChips items={it.evidence} />
        </ItemRow>
      ))}
    </SectionCard>
  );
}

function renderBusinessGoals(o: DiscoveryAnalysisOutput) {
  const s = o.business_goals;
  return (
    <SectionCard title={SECTION_LABELS.business_goals} confidence={s.confidence}>
      {s.items.length === 0 && <EmptyRow />}
      {s.items.map((it, i) => (
        <ItemRow key={i}>
          <div className="flex items-start justify-between gap-2">
            <p className="text-sm text-[var(--v-text)]">{it.goal}</p>
            <Badge tone={PRIORITY_TONE[it.priority]}>{PRIORITY_LABELS[it.priority]}</Badge>
          </div>
          <EvidenceChips items={it.evidence} />
        </ItemRow>
      ))}
    </SectionCard>
  );
}

function renderFunctionalReq(o: DiscoveryAnalysisOutput) {
  const s = o.functional_requirements;
  return (
    <SectionCard title={SECTION_LABELS.functional_requirements} confidence={s.confidence}>
      {s.items.length === 0 && <EmptyRow />}
      {s.items.map((it, i) => (
        <ItemRow key={i}>
          <p className="text-sm text-[var(--v-text)]">{it.statement}</p>
          <EvidenceChips items={it.evidence} />
        </ItemRow>
      ))}
    </SectionCard>
  );
}

function renderNonFunctional(o: DiscoveryAnalysisOutput) {
  const s = o.non_functional_requirements;
  const groups: [string, typeof s.performance][] = [
    ["الأداء", s.performance],
    ["الأمان", s.security],
    ["التوسّع", s.scalability],
    ["الإتاحة", s.availability],
    ["إمكانية الوصول", s.accessibility],
    ["الامتثال", s.compliance],
  ];
  return (
    <SectionCard title={SECTION_LABELS.non_functional_requirements} confidence={s.confidence}>
      {groups.map(([label, items]) => (
        <div key={label} className="border-b border-[var(--v-border)] pb-2 last:border-b-0">
          <p className="mb-1 text-[11px] font-semibold text-[var(--v-text-subtle)]">{label}</p>
          {items.length === 0 ? (
            <p className="text-xs text-[var(--v-text-subtle)]">لم يُذكر.</p>
          ) : (
            items.map((it, i) => (
              <ItemRow key={i}>
                <p className="text-sm text-[var(--v-text)]">{it.statement}</p>
                <EvidenceChips items={it.evidence} />
              </ItemRow>
            ))
          )}
        </div>
      ))}
    </SectionCard>
  );
}

function renderRisks(o: DiscoveryAnalysisOutput) {
  const s = o.risks;
  return (
    <SectionCard title={SECTION_LABELS.risks} confidence={s.confidence}>
      {s.items.length === 0 && <EmptyRow />}
      {s.items.map((it, i) => (
        <ItemRow key={i}>
          <div className="flex items-start justify-between gap-2">
            <p className="text-sm font-medium text-[var(--v-text)]">{it.risk}</p>
            <div className="flex shrink-0 gap-1">
              <Badge tone={PRIORITY_TONE[it.likelihood]}>احتمال {PRIORITY_LABELS[it.likelihood]}</Badge>
              <Badge tone={PRIORITY_TONE[it.impact]}>تأثير {PRIORITY_LABELS[it.impact]}</Badge>
            </div>
          </div>
          <p className="text-xs text-[var(--v-text-muted)]">السبب: {it.cause}</p>
          <EvidenceChips items={it.evidence} />
        </ItemRow>
      ))}
    </SectionCard>
  );
}

function renderAssumptions(o: DiscoveryAnalysisOutput) {
  const s = o.assumptions;
  return (
    <SectionCard title={SECTION_LABELS.assumptions} confidence={s.confidence}>
      {s.items.length === 0 && <EmptyRow />}
      {s.items.map((it, i) => (
        <ItemRow key={i}>
          <p className="text-sm text-[var(--v-text)]">{it.statement}</p>
          <p className="text-xs text-[var(--v-text-muted)]">لماذا: {it.reason}</p>
          <EvidenceChips items={it.evidence} />
        </ItemRow>
      ))}
    </SectionCard>
  );
}

function renderMissing(o: DiscoveryAnalysisOutput) {
  const s = o.missing_information;
  return (
    <SectionCard title={SECTION_LABELS.missing_information} confidence={s.confidence}>
      {s.items.length === 0 && <EmptyRow />}
      {s.items.map((it, i) => (
        <ItemRow key={i}>
          <div className="flex items-start justify-between gap-2">
            <p className="text-sm text-[var(--v-text)]">{it.info}</p>
            <Badge tone={PRIORITY_TONE[it.impact]}>تأثير {PRIORITY_LABELS[it.impact]}</Badge>
          </div>
          <p className="text-xs text-[var(--v-text-muted)]">{it.reason}</p>
        </ItemRow>
      ))}
    </SectionCard>
  );
}

function renderSuggestions(
  o: DiscoveryAnalysisOutput,
  key: "suggested_features" | "suggested_integrations"
) {
  const s = o[key];
  return (
    <SectionCard title={SECTION_LABELS[key]} confidence={s.confidence}>
      {s.items.length === 0 && <EmptyRow />}
      {s.items.map((it, i) => (
        <ItemRow key={i}>
          <div className="flex items-start justify-between gap-2">
            <p className="text-sm font-medium text-[var(--v-text)]">{it.title}</p>
            <Badge tone={PRIORITY_TONE[it.priority]}>{PRIORITY_LABELS[it.priority]}</Badge>
          </div>
          <p className="text-xs text-[var(--v-text-muted)]">{it.rationale}</p>
          <EvidenceChips items={it.evidence} />
        </ItemRow>
      ))}
    </SectionCard>
  );
}

function renderRoles(o: DiscoveryAnalysisOutput) {
  const s = o.suggested_user_roles;
  return (
    <SectionCard title={SECTION_LABELS.suggested_user_roles} confidence={s.confidence}>
      {s.items.length === 0 && <EmptyRow />}
      {s.items.map((it, i) => (
        <ItemRow key={i}>
          <p className="text-sm font-medium text-[var(--v-text)]">{it.role}</p>
          <ul className="ms-4 list-disc text-xs text-[var(--v-text-muted)]">
            {it.responsibilities.map((r, j) => (
              <li key={j}>{r}</li>
            ))}
          </ul>
          <EvidenceChips items={it.evidence} />
        </ItemRow>
      ))}
    </SectionCard>
  );
}

function renderKPIs(o: DiscoveryAnalysisOutput) {
  const s = o.suggested_kpis;
  return (
    <SectionCard title={SECTION_LABELS.suggested_kpis} confidence={s.confidence}>
      {s.items.length === 0 && <EmptyRow />}
      {s.items.map((it, i) => (
        <ItemRow key={i}>
          <p className="text-sm font-medium text-[var(--v-text)]">{it.name}</p>
          <p className="text-xs text-[var(--v-text-muted)]">
            الهدف: <span className="font-mono-plex">{it.target_or_direction}</span> · مرتبط بـ {it.goal_link}
          </p>
          <EvidenceChips items={it.evidence} />
        </ItemRow>
      ))}
    </SectionCard>
  );
}

function renderUserStories(o: DiscoveryAnalysisOutput) {
  const s = o.suggested_user_stories;
  return (
    <SectionCard title={SECTION_LABELS.suggested_user_stories} confidence={s.confidence}>
      {s.items.length === 0 && <EmptyRow />}
      {s.items.map((it, i) => (
        <ItemRow key={i}>
          <div className="flex items-start justify-between gap-2">
            <p className="text-sm text-[var(--v-text)]">
              <span className="font-medium">{it.role}</span>، أريد أن {it.want}، حتى {it.benefit}.
            </p>
            <Badge tone={PRIORITY_TONE[it.priority]}>{PRIORITY_LABELS[it.priority]}</Badge>
          </div>
          <EvidenceChips items={it.evidence} />
        </ItemRow>
      ))}
    </SectionCard>
  );
}

function renderScope(o: DiscoveryAnalysisOutput) {
  const s = o.suggested_project_scope;
  return (
    <SectionCard title={SECTION_LABELS.suggested_project_scope} confidence={s.confidence}>
      <div className="grid gap-3 sm:grid-cols-2">
        <div>
          <p className="mb-1 text-[11px] font-semibold text-[var(--v-green)]">داخل النطاق</p>
          {s.in_scope.length === 0 && <EmptyRow />}
          {s.in_scope.map((it, i) => (
            <ItemRow key={i}>
              <p className="text-sm text-[var(--v-text)]">{it.statement}</p>
              <EvidenceChips items={it.evidence} />
            </ItemRow>
          ))}
        </div>
        <div>
          <p className="mb-1 text-[11px] font-semibold text-[var(--v-red)]">خارج النطاق</p>
          {s.out_of_scope.length === 0 && <EmptyRow />}
          {s.out_of_scope.map((it, i) => (
            <ItemRow key={i}>
              <p className="text-sm text-[var(--v-text)]">{it.statement}</p>
              <EvidenceChips items={it.evidence} />
            </ItemRow>
          ))}
        </div>
      </div>
    </SectionCard>
  );
}

function renderRoadmap(o: DiscoveryAnalysisOutput) {
  const s = o.suggested_roadmap;
  return (
    <SectionCard title={SECTION_LABELS.suggested_roadmap} confidence={s.confidence}>
      {s.phases.length === 0 && <EmptyRow />}
      {s.phases.map((p, i) => (
        <ItemRow key={i}>
          <p className="text-sm font-semibold text-[var(--v-primary)]">{p.phase}</p>
          <p className="text-sm text-[var(--v-text)]">{p.description}</p>
          {p.deliverables.length > 0 && (
            <ul className="ms-4 mt-1 list-disc text-xs text-[var(--v-text-muted)]">
              {p.deliverables.map((d, j) => (
                <li key={j}>{d}</li>
              ))}
            </ul>
          )}
          <EvidenceChips items={p.evidence} />
        </ItemRow>
      ))}
    </SectionCard>
  );
}

function renderMeetingQuestions(o: DiscoveryAnalysisOutput) {
  const s = o.meeting_questions;
  return (
    <SectionCard title={SECTION_LABELS.meeting_questions} confidence={s.confidence}>
      {s.items.length === 0 && <EmptyRow />}
      {s.items.map((it, i) => (
        <ItemRow key={i}>
          <div className="flex items-start justify-between gap-2">
            <p className="text-sm text-[var(--v-text)]">{it.question}</p>
            <Badge tone={PRIORITY_TONE[it.priority]}>{PRIORITY_LABELS[it.priority]}</Badge>
          </div>
          <p className="text-xs text-[var(--v-text-muted)]">{it.reason}</p>
        </ItemRow>
      ))}
    </SectionCard>
  );
}

function ItemRow({ children }: { children: React.ReactNode }) {
  return (
    <div className="rounded-[var(--v-radius-md)] border border-[var(--v-border)] bg-[var(--v-bg-soft)] p-2.5">
      {children}
    </div>
  );
}
function EmptyRow() {
  return <p className="text-xs text-[var(--v-text-subtle)]">لا توجد عناصر مسجّلة.</p>;
}

const SECTION_RENDERERS: Record<AnalysisSectionKey, (o: DiscoveryAnalysisOutput) => React.ReactNode> = {
  executive_summary: renderExecutiveSummary,
  business_model: renderBusinessModel,
  stakeholders: renderStakeholders,
  business_goals: renderBusinessGoals,
  functional_requirements: renderFunctionalReq,
  non_functional_requirements: renderNonFunctional,
  risks: renderRisks,
  assumptions: renderAssumptions,
  missing_information: renderMissing,
  suggested_features: (o) => renderSuggestions(o, "suggested_features"),
  suggested_integrations: (o) => renderSuggestions(o, "suggested_integrations"),
  suggested_user_roles: renderRoles,
  suggested_kpis: renderKPIs,
  suggested_user_stories: renderUserStories,
  suggested_project_scope: renderScope,
  suggested_roadmap: renderRoadmap,
  meeting_questions: renderMeetingQuestions,
};

// ============================================================
// المكوّن الرئيسي
// ============================================================

export default function DiscoveryAnalysisPanel({
  projectId,
  analysis,
  isAdmin,
}: {
  projectId: string;
  analysis: DiscoveryAnalysisRow | null;
  isAdmin: boolean;
}) {
  const router = useRouter();
  const [rerunning, setRerunning] = useState(false);
  // لحظة أول render — كافية لحكم "عالق ولا لأ" (الصفحة بتتعمل refresh مع كل تحديث).
  const [renderedAt] = useState(() => Date.now());

  async function handleRerun() {
    setRerunning(true);
    const result = await rerunDiscoveryAnalysis(projectId);
    setRerunning(false);
    if (!result.ok) {
      toast.error(result.message ?? "فشل بدء التحليل.");
      return;
    }
    toast.success("تم بدء تحليل جديد — استنى شوية");
    router.refresh();
  }

  // لا يوجد تحليل بعد
  if (!analysis) {
    return (
      <Card padding="lg">
        <EmptyState
          icon={<Sparkles size={28} />}
          title="لسه ما اتعملش تحليل للمشروع"
          description={
            isAdmin
              ? "التحليل بيبدأ تلقائيًا لما العميل يرسل نموذج الاكتشاف، أو تقدر تشغّله يدويًا دلوقتي."
              : "التحليل بيبدأ تلقائيًا بعد إرسال نموذج الاكتشاف."
          }
          primaryAction={
            isAdmin
              ? { label: rerunning ? "جاري…" : "شغّل التحليل الآن", onClick: handleRerun, loading: rerunning }
              : undefined
          }
        />
      </Card>
    );
  }

  const status = fmtStatus(analysis.status);

  // تنفيذ عالق: قيد التنفيذ/الطابور لكن عدّى عليه أكتر من 12 دقيقة —
  // العملية اللي كانت بتنفّذه غالبًا ماتت (إعادة نشر). نظهر زر إعادة
  // التحليل عشان السيرفر يفكّه تلقائيًّا ويبدأ جديد (STALE_RUN self-heal).
  const isActiveRun = analysis.status === "running" || analysis.status === "pending";
  const runAnchor = analysis.started_at ?? analysis.created_at;
  const isStaleRun =
    isActiveRun && renderedAt - new Date(runAnchor).getTime() > 12 * 60_000;

  return (
    <div className="space-y-4">
      {/* الترويسة */}
      <Card padding="md">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <div className="flex items-center gap-2">
              <Sparkles size={16} className="text-[var(--v-primary)]" />
              <p className="text-sm font-semibold text-[var(--v-text)]">تحليل الاكتشاف</p>
              <Badge tone={status.tone}>{status.label}</Badge>
              {analysis.version > 0 && (
                <span className="font-mono-plex text-[11px] text-[var(--v-text-subtle)]">
                  v{analysis.version}
                </span>
              )}
            </div>
            <p className="mt-1 text-[11px] text-[var(--v-text-subtle)]">
              {analysis.finished_at
                ? `اكتمل: ${new Date(analysis.finished_at).toLocaleString("ar-EG")}`
                : analysis.started_at
                  ? `بدأ: ${new Date(analysis.started_at).toLocaleString("ar-EG")}`
                  : "لم يبدأ بعد"}
              {analysis.execution_ms ? ` · مدّة ${Math.round(analysis.execution_ms / 1000)}ث` : ""}
              {analysis.total_tokens ? ` · ${analysis.total_tokens} tokens` : ""}
              {analysis.estimated_cost_usd ? ` · $${Number(analysis.estimated_cost_usd).toFixed(4)}` : ""}
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            {analysis.status === "completed" && (
              <Button
                variant="ghost"
                size="sm"
                icon={<Printer size={13} />}
                onClick={() => window.open(`/analysis-print/${projectId}`, "_blank")}
              >
                طباعة / تصدير PDF
              </Button>
            )}
            {isAdmin && (!isActiveRun || isStaleRun) && (
              <Button
                variant="outline"
                size="sm"
                icon={rerunning ? <Loader2 size={13} className="animate-spin" /> : <RefreshCw size={13} />}
                onClick={handleRerun}
                disabled={rerunning}
              >
                إعادة التحليل
              </Button>
            )}
          </div>
        </div>
      </Card>

      {/* حالة التحليل */}
      {(analysis.status === "pending" || analysis.status === "running") && (
        <Card padding="md">
          <div className="flex items-center gap-2 text-sm text-[var(--v-text-secondary)]">
            <Loader2 size={16} className="animate-spin text-[var(--v-primary)]" />
            <span>
              {isStaleRun
                ? "التنفيذ واخد وقت أطول من الطبيعي — غالبًا انقطع. اضغط «إعادة التحليل» فوق وهيتفكّ تلقائيًّا ويبدأ من جديد."
                : `${analysis.status === "pending" ? "في الطابور…" : "جاري التحليل عبر AI…"} تقدر تكمّل شغلك، الصفحة هتتحدّث تلقائيًا لما يخلص (اعمل refresh لو حبيت).`}
            </span>
          </div>
        </Card>
      )}

      {analysis.status === "failed" && (
        <Card padding="md">
          <div className="flex items-start gap-2">
            <AlertCircle size={18} className="mt-0.5 shrink-0 text-[var(--v-red)]" />
            <div className="flex-1">
              <p className="text-sm font-semibold text-[var(--v-red)]">فشل التحليل</p>
              <p className="mt-1 text-xs text-[var(--v-text-muted)]">
                {analysis.error_message ?? "خطأ غير معروف."}
                {analysis.error_code ? ` (${analysis.error_code})` : ""}
              </p>
            </div>
          </div>
        </Card>
      )}

      {/* الأقسام السبعة عشر */}
      {analysis.status === "completed" && analysis.output && (
        <div className="space-y-3">
          {ANALYSIS_SECTIONS.map((key) => (
            <div key={key}>{SECTION_RENDERERS[key](analysis.output as DiscoveryAnalysisOutput)}</div>
          ))}
        </div>
      )}
    </div>
  );
}
