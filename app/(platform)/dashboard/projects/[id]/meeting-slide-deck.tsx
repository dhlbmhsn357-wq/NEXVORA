"use client";

import { useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import {
  ChevronRight,
  ChevronLeft,
  Building2,
  FileText,
  AlertTriangle,
  Target,
  Workflow,
  ArrowRightLeft,
  Users,
  Boxes,
  MonitorSmartphone,
  Network,
  CalendarClock,
  ShieldAlert,
  HelpCircle,
  GitPullRequestArrow,
  FlagTriangleRight,
  Pencil,
  Sparkles,
  Check,
  X,
} from "lucide-react";
import Badge, { type BadgeTone } from "@/components/ui/Badge";
import Button from "@/components/ui/Button";
import { toast } from "@/components/ui/Toaster";
import {
  editMeetingPresentationSlide,
  regenerateMeetingPresentationSlide,
} from "./meeting-presentation-actions";
import { SLIDE_LABELS_AR } from "@/lib/ai/prompts/meeting-presentation";
import type {
  MeetingPresentationSlideKey,
  MeetingPresentationSlides,
  PriorityLevel,
  SeverityLevel,
} from "@/lib/types/database";

export const SLIDE_ORDER: MeetingPresentationSlideKey[] = [
  "cover",
  "executive_summary",
  "business_problem",
  "business_goals",
  "current_workflow",
  "future_workflow",
  "actors",
  "modules",
  "screens",
  "architecture",
  "timeline",
  "risks",
  "open_questions",
  "client_decisions",
  "final_summary",
];

export const SLIDE_LABELS = SLIDE_LABELS_AR;

const SLIDE_ICONS: Record<MeetingPresentationSlideKey, React.ElementType> = {
  cover: Building2,
  executive_summary: FileText,
  business_problem: AlertTriangle,
  business_goals: Target,
  current_workflow: Workflow,
  future_workflow: ArrowRightLeft,
  actors: Users,
  modules: Boxes,
  screens: MonitorSmartphone,
  architecture: Network,
  timeline: CalendarClock,
  risks: ShieldAlert,
  open_questions: HelpCircle,
  client_decisions: GitPullRequestArrow,
  final_summary: FlagTriangleRight,
};

const SEVERITY_TONE: Record<SeverityLevel, BadgeTone> = { low: "info", medium: "warning", high: "danger", critical: "danger" };
const SEVERITY_LABEL: Record<SeverityLevel, string> = { low: "منخفضة", medium: "متوسطة", high: "عالية", critical: "حرجة" };
const PRIORITY_TONE: Record<PriorityLevel, BadgeTone> = { low: "neutral", medium: "info", high: "danger" };
const PRIORITY_LABEL: Record<PriorityLevel, string> = { low: "منخفضة", medium: "متوسطة", high: "عالية" };

/* ---------------------------- Chart primitives --------------------------- */

function ProgressRing({ percent, size = 108 }: { percent: number; size?: number }) {
  const stroke = 8;
  const radius = (size - stroke) / 2;
  const circumference = 2 * Math.PI * radius;
  const offset = circumference - (Math.max(0, Math.min(100, percent)) / 100) * circumference;
  return (
    <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} className="shrink-0">
      <circle cx={size / 2} cy={size / 2} r={radius} fill="none" stroke="var(--v-border)" strokeWidth={stroke} />
      <circle
        cx={size / 2}
        cy={size / 2}
        r={radius}
        fill="none"
        stroke="var(--v-primary)"
        strokeWidth={stroke}
        strokeDasharray={circumference}
        strokeDashoffset={offset}
        strokeLinecap="round"
        transform={`rotate(-90 ${size / 2} ${size / 2})`}
        style={{ transition: "stroke-dashoffset 0.6s ease" }}
      />
      <text x="50%" y="50%" textAnchor="middle" dy="0.35em" className="fill-[var(--v-text)] text-lg font-bold">
        {Math.round(percent)}%
      </text>
    </svg>
  );
}

function ProgressBar({ percent }: { percent: number }) {
  return (
    <div className="h-1.5 w-full overflow-hidden rounded-full bg-[var(--v-surface)]">
      <div
        className="h-full rounded-full bg-[var(--v-primary)] transition-all duration-500"
        style={{ width: `${Math.max(0, Math.min(100, percent))}%` }}
      />
    </div>
  );
}

function FlowSteps({ steps }: { steps: { title: string; description: string }[] }) {
  if (steps.length === 0) return <EmptyNote />;
  return (
    <div className="flex flex-col gap-2 sm:flex-row sm:items-stretch sm:gap-1">
      {steps.map((s, i) => (
        <div key={i} className="flex flex-1 items-center gap-1">
          <div className="flex-1 rounded-[var(--v-radius-md)] border border-[var(--v-border)] bg-[var(--v-surface)] p-3">
            <div className="mb-1 flex h-6 w-6 items-center justify-center rounded-full bg-[var(--v-primary)] text-xs font-bold text-white">
              {i + 1}
            </div>
            <p className="text-sm font-semibold text-[var(--v-text)]">{s.title}</p>
            <p className="mt-1 text-xs text-[var(--v-text-secondary)]">{s.description}</p>
          </div>
          {i < steps.length - 1 && (
            <ChevronLeft size={18} className="hidden shrink-0 text-[var(--v-text-muted)] sm:block rtl:rotate-180" />
          )}
        </div>
      ))}
    </div>
  );
}

function EmptyNote() {
  return <p className="text-xs text-[var(--v-text-muted)]">لم يُحدَّد بعد.</p>;
}

/* ------------------------------ Slide bodies ------------------------------ */

function CoverBody({ c }: { c: NonNullable<MeetingPresentationSlides["cover"]> }) {
  return (
    <div className="flex flex-col items-center gap-6 py-6 text-center">
      <div className="flex h-20 w-20 items-center justify-center rounded-2xl bg-[var(--v-primary)] text-2xl font-bold text-white">
        {c.project_name.slice(0, 2)}
      </div>
      <div>
        <h2 className="font-display text-2xl font-bold text-[var(--v-text)]">{c.project_name}</h2>
        <p className="mt-1 text-sm text-[var(--v-text-secondary)]">{c.client_name}</p>
      </div>
      <ProgressRing percent={c.progress_percent} />
      <div className="flex flex-wrap items-center justify-center gap-2">
        <Badge tone="primary">{c.current_phase}</Badge>
        <Badge tone="info">{c.status}</Badge>
      </div>
      <div className="grid grid-cols-2 gap-4 text-xs text-[var(--v-text-muted)]">
        <p>مسؤول المشروع: <span className="text-[var(--v-text)]">{c.pm_name}</span></p>
        <p>الموعد: <span className="text-[var(--v-text)]">{c.meeting_date ?? "غير محدد"}</span></p>
      </div>
    </div>
  );
}

function ExecutiveSummaryBody({ c }: { c: NonNullable<MeetingPresentationSlides["executive_summary"]> }) {
  return (
    <div className="space-y-4">
      <p className="text-sm leading-relaxed text-[var(--v-text-secondary)]">{c.summary}</p>
      {c.key_points.length > 0 && (
        <ul className="space-y-1.5">
          {c.key_points.map((p, i) => (
            <li key={i} className="flex items-start gap-2 text-sm text-[var(--v-text)]">
              <Sparkles size={14} className="mt-0.5 shrink-0 text-[var(--v-primary)]" /> {p}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

function BusinessProblemBody({ c }: { c: NonNullable<MeetingPresentationSlides["business_problem"]> }) {
  return (
    <div className="space-y-4">
      <p className="text-sm text-[var(--v-text-secondary)]">{c.problem_statement}</p>
      {c.timeline.length > 0 && (
        <div className="flex flex-wrap gap-2">
          {c.timeline.map((t, i) => (
            <Badge key={i} tone="neutral">
              {t.date ? `${t.date} — ` : ""}
              {t.label}
            </Badge>
          ))}
        </div>
      )}
      {c.pain_points.length > 0 && (
        <div className="grid gap-2 sm:grid-cols-2">
          {c.pain_points.map((p, i) => (
            <div key={i} className="flex items-center justify-between rounded-[var(--v-radius-sm)] border border-[var(--v-border)] px-3 py-2">
              <span className="text-sm text-[var(--v-text)]">{p.title}</span>
              <Badge tone={SEVERITY_TONE[p.severity]}>{SEVERITY_LABEL[p.severity]}</Badge>
            </div>
          ))}
        </div>
      )}
      <div className="rounded-[var(--v-radius-md)] bg-[var(--v-surface)] p-3">
        <p className="mb-1 text-xs font-semibold text-[var(--v-text)]">الأثر على العمل</p>
        <p className="text-xs text-[var(--v-text-secondary)]">{c.business_impact}</p>
      </div>
    </div>
  );
}

function BusinessGoalsBody({ c }: { c: NonNullable<MeetingPresentationSlides["business_goals"]> }) {
  return (
    <div className="space-y-4">
      <div className="space-y-3">
        {c.goals.map((g, i) => (
          <div key={i}>
            <div className="mb-1 flex items-center justify-between gap-2">
              <span className="text-sm font-medium text-[var(--v-text)]">{g.title}</span>
              <Badge tone={PRIORITY_TONE[g.priority]}>{PRIORITY_LABEL[g.priority]}</Badge>
            </div>
            <ProgressBar percent={g.progress_percent} />
            <p className="mt-1 text-xs text-[var(--v-text-muted)]">{g.expected_outcome}</p>
          </div>
        ))}
        {c.goals.length === 0 && <EmptyNote />}
      </div>
      {c.kpis.length > 0 && (
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
          {c.kpis.map((k, i) => (
            <div key={i} className="rounded-[var(--v-radius-md)] border border-[var(--v-border)] p-2 text-center">
              <p className="text-[11px] text-[var(--v-text-muted)]">{k.name}</p>
              <p className="text-sm font-bold text-[var(--v-primary)]">{k.target}</p>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function ActorsBody({ c }: { c: NonNullable<MeetingPresentationSlides["actors"]> }) {
  if (c.actors.length === 0) return <EmptyNote />;
  return (
    <div className="grid gap-3 sm:grid-cols-2">
      {c.actors.map((a, i) => (
        <div key={i} className="rounded-[var(--v-radius-md)] border border-[var(--v-border)] p-3">
          <p className="mb-2 text-sm font-semibold text-[var(--v-text)]">{a.name}</p>
          {a.responsibilities.length > 0 && (
            <p className="text-xs text-[var(--v-text-secondary)]"><span className="text-[var(--v-text-muted)]">المسؤوليات: </span>{a.responsibilities.join("، ")}</p>
          )}
          {a.permissions.length > 0 && (
            <p className="mt-1 text-xs text-[var(--v-text-secondary)]"><span className="text-[var(--v-text-muted)]">الصلاحيات: </span>{a.permissions.join("، ")}</p>
          )}
          {a.pain_points.length > 0 && (
            <p className="mt-1 text-xs text-[var(--v-red)]"><span className="text-[var(--v-text-muted)]">نقاط الألم: </span>{a.pain_points.join("، ")}</p>
          )}
        </div>
      ))}
    </div>
  );
}

function ModulesBody({ c }: { c: NonNullable<MeetingPresentationSlides["modules"]> }) {
  if (c.modules.length === 0) return <EmptyNote />;
  return (
    <div className="grid gap-2 sm:grid-cols-2">
      {c.modules.map((m, i) => (
        <div key={i} className="rounded-[var(--v-radius-md)] border border-[var(--v-border)] p-3">
          <div className="mb-1 flex items-center justify-between gap-2">
            <span className="text-sm font-semibold text-[var(--v-text)]">{m.name}</span>
            <div className="flex gap-1">
              <Badge tone={PRIORITY_TONE[m.priority]}>{PRIORITY_LABEL[m.priority]}</Badge>
              <Badge tone="neutral">{m.complexity}</Badge>
            </div>
          </div>
          <p className="text-xs text-[var(--v-text-secondary)]">{m.purpose}</p>
          {m.dependencies.length > 0 && (
            <p className="mt-1 text-[11px] text-[var(--v-text-muted)]">يعتمد على: {m.dependencies.join("، ")}</p>
          )}
        </div>
      ))}
    </div>
  );
}

function ScreensBody({ c }: { c: NonNullable<MeetingPresentationSlides["screens"]> }) {
  if (c.screens.length === 0) return <EmptyNote />;
  return (
    <div className="grid gap-2 sm:grid-cols-3">
      {c.screens.map((s, i) => (
        <div key={i} className="rounded-[var(--v-radius-md)] border border-[var(--v-border)] bg-[var(--v-surface)] p-3">
          <div className="mb-2 flex h-16 items-center justify-center rounded-[var(--v-radius-sm)] border border-dashed border-[var(--v-border)]">
            <MonitorSmartphone size={20} className="text-[var(--v-text-muted)]" />
          </div>
          <p className="text-sm font-semibold text-[var(--v-text)]">{s.name}</p>
          <p className="mt-1 text-xs text-[var(--v-text-secondary)]">{s.goal}</p>
          {s.functions.length > 0 && (
            <ul className="mt-1.5 space-y-0.5">
              {s.functions.map((f, j) => (
                <li key={j} className="text-[11px] text-[var(--v-text-muted)]">• {f}</li>
              ))}
            </ul>
          )}
        </div>
      ))}
    </div>
  );
}

function ArchitectureBody({ c }: { c: NonNullable<MeetingPresentationSlides["architecture"]> }) {
  const layers: { label: string; value: string }[] = [
    { label: "Frontend", value: c.frontend },
    { label: "Backend", value: c.backend },
    { label: "Database", value: c.database },
    { label: "Storage", value: c.storage },
    { label: "Authentication", value: c.authentication },
  ];
  return (
    <div className="space-y-2">
      {layers.map((l) => (
        <div key={l.label} className="flex items-center gap-3 rounded-[var(--v-radius-md)] border border-[var(--v-border)] p-3">
          <Badge tone="primary">{l.label}</Badge>
          <span className="text-sm text-[var(--v-text-secondary)]">{l.value}</span>
        </div>
      ))}
      {c.integrations.length > 0 && (
        <div className="flex flex-wrap gap-1.5 pt-1">
          {c.integrations.map((it, i) => (
            <Badge key={i} tone="neutral">{it}</Badge>
          ))}
        </div>
      )}
    </div>
  );
}

function TimelineBody({ c }: { c: NonNullable<MeetingPresentationSlides["timeline"]> }) {
  if (c.milestones.length === 0) return <EmptyNote />;
  return (
    <div className="space-y-3">
      {c.milestones.map((m, i) => (
        <div key={i} className="flex items-center gap-3">
          <div className="flex h-3 w-3 shrink-0 rounded-full bg-[var(--v-primary)]" />
          <div className="flex-1">
            <div className="flex items-center justify-between gap-2">
              <p className="text-sm font-medium text-[var(--v-text)]">{m.title}</p>
              <span className="text-[11px] text-[var(--v-text-muted)]">{m.date ?? "غير محدد"}</span>
            </div>
            <ProgressBar percent={m.progress_percent} />
          </div>
        </div>
      ))}
    </div>
  );
}

const RISK_LEVELS: PriorityLevel[] = ["high", "medium", "low"];

function RisksBody({ c }: { c: NonNullable<MeetingPresentationSlides["risks"]> }) {
  if (c.risks.length === 0) return <EmptyNote />;
  return (
    <div className="overflow-x-auto">
      <div className="grid min-w-[420px] grid-cols-[80px_repeat(3,1fr)] gap-1 text-center text-[11px]">
        <div />
        {RISK_LEVELS.map((p) => (
          <div key={p} className="pb-1 font-semibold text-[var(--v-text-muted)]">احتمالية {PRIORITY_LABEL[p]}</div>
        ))}
        {RISK_LEVELS.map((impact) => (
          <>
            <div key={`label-${impact}`} className="flex items-center justify-center font-semibold text-[var(--v-text-muted)]">
              أثر {PRIORITY_LABEL[impact]}
            </div>
            {RISK_LEVELS.map((prob) => {
              const cellRisks = c.risks.filter((r) => r.impact === impact && r.probability === prob);
              const intensity = impact === "high" && prob === "high" ? "bg-[var(--v-red)]/20" : impact === "low" && prob === "low" ? "bg-[var(--v-green)]/10" : "bg-[var(--v-amber)]/10";
              return (
                <div key={`${impact}-${prob}`} className={`min-h-14 rounded-[var(--v-radius-sm)] border border-[var(--v-border)] p-1 ${intensity}`}>
                  {cellRisks.map((r, i) => (
                    <p key={i} className="text-[10px] text-[var(--v-text)]">{r.title}</p>
                  ))}
                </div>
              );
            })}
          </>
        ))}
      </div>
      <div className="mt-3 space-y-1.5">
        {c.risks.map((r, i) => (
          <p key={i} className="text-xs text-[var(--v-text-secondary)]"><span className="font-medium text-[var(--v-text)]">{r.title}:</span> {r.mitigation}</p>
        ))}
      </div>
    </div>
  );
}

function OpenQuestionsBody({ c }: { c: NonNullable<MeetingPresentationSlides["open_questions"]> }) {
  const [openIndex, setOpenIndex] = useState<number | null>(0);
  if (c.questions.length === 0) return <EmptyNote />;
  return (
    <div className="space-y-1.5">
      {c.questions.map((q, i) => (
        <div key={i} className="rounded-[var(--v-radius-sm)] border border-[var(--v-border)]">
          <button
            type="button"
            onClick={() => setOpenIndex(openIndex === i ? null : i)}
            className="flex w-full items-center justify-between p-2.5 text-right text-sm font-medium text-[var(--v-text)]"
          >
            {q.question}
            <span className="text-xs text-[var(--v-text-muted)]">{openIndex === i ? "▲" : "▼"}</span>
          </button>
          {openIndex === i && <p className="border-t border-[var(--v-border)] p-2.5 text-xs text-[var(--v-text-secondary)]">{q.context}</p>}
        </div>
      ))}
    </div>
  );
}

function ClientDecisionsBody({ c }: { c: NonNullable<MeetingPresentationSlides["client_decisions"]> }) {
  if (c.decisions.length === 0) return <EmptyNote />;
  return (
    <div className="space-y-3">
      {c.decisions.map((d, i) => (
        <div key={i} className="flex gap-3">
          <div className="flex flex-col items-center">
            <div className="h-2.5 w-2.5 rounded-full bg-[var(--v-green)]" />
            {i < c.decisions.length - 1 && <div className="mt-1 w-px flex-1 bg-[var(--v-border)]" />}
          </div>
          <div className="pb-3">
            <div className="flex items-center gap-2">
              <p className="text-sm font-medium text-[var(--v-text)]">{d.decision}</p>
              {d.date && <span className="text-[11px] text-[var(--v-text-muted)]">{d.date}</span>}
            </div>
            <p className="mt-0.5 text-xs text-[var(--v-text-secondary)]">{d.rationale}</p>
          </div>
        </div>
      ))}
    </div>
  );
}

function FinalSummaryBody({ c }: { c: NonNullable<MeetingPresentationSlides["final_summary"]> }) {
  return (
    <div className="space-y-4">
      {c.next_steps.length > 0 && (
        <div>
          <p className="mb-1.5 text-xs font-semibold text-[var(--v-text)]">الخطوات القادمة</p>
          <ul className="space-y-1">
            {c.next_steps.map((s, i) => (
              <li key={i} className="flex items-start gap-2 text-sm text-[var(--v-text-secondary)]">
                <Check size={14} className="mt-0.5 shrink-0 text-[var(--v-green)]" /> {s}
              </li>
            ))}
          </ul>
        </div>
      )}
      {c.meeting_objectives.length > 0 && (
        <div>
          <p className="mb-1.5 text-xs font-semibold text-[var(--v-text)]">أهداف الاجتماع</p>
          <ul className="space-y-1">
            {c.meeting_objectives.map((s, i) => (
              <li key={i} className="text-sm text-[var(--v-text-secondary)]">• {s}</li>
            ))}
          </ul>
        </div>
      )}
      {c.closing_note && <p className="rounded-[var(--v-radius-md)] bg-[var(--v-surface)] p-3 text-sm text-[var(--v-text)]">{c.closing_note}</p>}
    </div>
  );
}

export function renderSlideBody(key: MeetingPresentationSlideKey, content: MeetingPresentationSlides[typeof key]) {
  if (!content) return <p className="py-8 text-center text-sm text-[var(--v-text-muted)]">لسه معندهاش محتوى.</p>;
  switch (key) {
    case "cover":
      return <CoverBody c={content as NonNullable<MeetingPresentationSlides["cover"]>} />;
    case "executive_summary":
      return <ExecutiveSummaryBody c={content as NonNullable<MeetingPresentationSlides["executive_summary"]>} />;
    case "business_problem":
      return <BusinessProblemBody c={content as NonNullable<MeetingPresentationSlides["business_problem"]>} />;
    case "business_goals":
      return <BusinessGoalsBody c={content as NonNullable<MeetingPresentationSlides["business_goals"]>} />;
    case "current_workflow":
      return <FlowSteps steps={(content as NonNullable<MeetingPresentationSlides["current_workflow"]>).steps} />;
    case "future_workflow": {
      const c = content as NonNullable<MeetingPresentationSlides["future_workflow"]>;
      return (
        <div className="space-y-3">
          <FlowSteps steps={c.steps} />
          {c.improvements.length > 0 && (
            <div className="rounded-[var(--v-radius-md)] bg-[var(--v-green)]/10 p-3">
              <p className="mb-1 text-xs font-semibold text-[var(--v-text)]">التحسينات المتوقعة</p>
              <ul className="space-y-0.5">
                {c.improvements.map((im, i) => (
                  <li key={i} className="text-xs text-[var(--v-text-secondary)]">• {im}</li>
                ))}
              </ul>
            </div>
          )}
        </div>
      );
    }
    case "actors":
      return <ActorsBody c={content as NonNullable<MeetingPresentationSlides["actors"]>} />;
    case "modules":
      return <ModulesBody c={content as NonNullable<MeetingPresentationSlides["modules"]>} />;
    case "screens":
      return <ScreensBody c={content as NonNullable<MeetingPresentationSlides["screens"]>} />;
    case "architecture":
      return <ArchitectureBody c={content as NonNullable<MeetingPresentationSlides["architecture"]>} />;
    case "timeline":
      return <TimelineBody c={content as NonNullable<MeetingPresentationSlides["timeline"]>} />;
    case "risks":
      return <RisksBody c={content as NonNullable<MeetingPresentationSlides["risks"]>} />;
    case "open_questions":
      return <OpenQuestionsBody c={content as NonNullable<MeetingPresentationSlides["open_questions"]>} />;
    case "client_decisions":
      return <ClientDecisionsBody c={content as NonNullable<MeetingPresentationSlides["client_decisions"]>} />;
    case "final_summary":
      return <FinalSummaryBody c={content as NonNullable<MeetingPresentationSlides["final_summary"]>} />;
    default:
      return null;
  }
}

/* -------------------------------- Deck shell ------------------------------- */

export default function MeetingSlideDeck({
  projectId,
  presentationId,
  slides,
  disabled,
}: {
  projectId: string;
  presentationId: string;
  slides: MeetingPresentationSlides;
  disabled: boolean;
}) {
  const [index, setIndex] = useState(0);
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState("");
  const [saving, setSaving] = useState(false);
  const [regenerating, setRegenerating] = useState(false);
  const [error, setError] = useState("");

  const slideKey = SLIDE_ORDER[index];
  const Icon = SLIDE_ICONS[slideKey];
  const content = slides[slideKey];

  function goTo(next: number) {
    setEditing(false);
    setError("");
    setIndex(Math.max(0, Math.min(SLIDE_ORDER.length - 1, next)));
  }

  function startEdit() {
    setDraft(JSON.stringify(content ?? {}, null, 2));
    setError("");
    setEditing(true);
  }

  async function handleSave() {
    let parsed: unknown;
    try {
      parsed = JSON.parse(draft);
    } catch {
      setError("الصيغة مش JSON صالح.");
      return;
    }
    setSaving(true);
    setError("");
    const r = await editMeetingPresentationSlide(projectId, presentationId, slideKey, parsed);
    setSaving(false);
    if (!r.ok) {
      setError(r.message ?? "فشل الحفظ.");
      return;
    }
    setEditing(false);
  }

  async function handleRegenerate() {
    setRegenerating(true);
    const r = await regenerateMeetingPresentationSlide(projectId, presentationId, slideKey);
    setRegenerating(false);
    if (r.status === "error") toast.error(r.message);
    else if (r.status === "success") toast.success("تم تحديث الشريحة");
  }

  return (
    <div className="w-full">
      {/* شريط التنقل + النقاط */}
      <div className="mb-3 flex items-center justify-between gap-2">
        <Button variant="outline" size="sm" onClick={() => goTo(index - 1)} disabled={index === 0}>
          <ChevronRight size={14} /> السابقة
        </Button>
        <div className="flex flex-wrap items-center justify-center gap-1">
          {SLIDE_ORDER.map((k, i) => (
            <button
              key={k}
              type="button"
              title={SLIDE_LABELS[k]}
              onClick={() => goTo(i)}
              className={`h-1.5 rounded-full transition-all ${i === index ? "w-5 bg-[var(--v-primary)]" : "w-1.5 bg-[var(--v-border)] hover:bg-[var(--v-text-muted)]"}`}
            />
          ))}
        </div>
        <Button variant="outline" size="sm" onClick={() => goTo(index + 1)} disabled={index === SLIDE_ORDER.length - 1}>
          التالية <ChevronLeft size={14} />
        </Button>
      </div>

      {/* الشريحة نفسها */}
      <div className="w-full overflow-hidden rounded-[var(--v-radius-lg)] border border-[var(--v-border)] bg-[var(--v-bg)] shadow-sm">
        <div className="flex items-center justify-between border-b border-[var(--v-border)] p-4">
          <span className="flex items-center gap-2 text-sm font-semibold text-[var(--v-text)]">
            <Icon size={16} className="text-[var(--v-primary)]" /> {SLIDE_LABELS[slideKey]}
          </span>
          <span className="text-[11px] tabular-nums text-[var(--v-text-muted)]">
            {index + 1} / {SLIDE_ORDER.length}
          </span>
        </div>

        <div className="min-h-[220px] p-5">
          <AnimatePresence mode="wait">
            <motion.div
              key={slideKey}
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -8 }}
              transition={{ duration: 0.2 }}
            >
              {!editing ? (
                renderSlideBody(slideKey, content)
              ) : (
                <div className="space-y-2">
                  <textarea
                    value={draft}
                    onChange={(e) => setDraft(e.target.value)}
                    rows={12}
                    dir="ltr"
                    className="w-full rounded-[var(--v-radius-sm)] border border-[var(--v-border)] bg-[var(--v-bg)] px-3 py-2 text-left text-xs text-[var(--v-text)] outline-none focus:border-[var(--v-primary)]"
                  />
                  {error && <p className="text-xs text-[var(--v-red)]">{error}</p>}
                </div>
              )}
            </motion.div>
          </AnimatePresence>
        </div>

        <div className="flex items-center gap-2 border-t border-[var(--v-border)] p-3">
          {!editing ? (
            <>
              <Button variant="outline" size="sm" onClick={startEdit} disabled={disabled}>
                <Pencil size={13} /> تعديل
              </Button>
              <Button variant="outline" size="sm" onClick={handleRegenerate} disabled={disabled || regenerating}>
                <Sparkles size={13} /> {regenerating ? "جاري إعادة التوليد…" : "إعادة توليد بالذكاء الاصطناعي"}
              </Button>
            </>
          ) : (
            <>
              <Button variant="primary" size="sm" onClick={handleSave} loading={saving}>
                <Check size={13} /> حفظ
              </Button>
              <Button variant="outline" size="sm" onClick={() => setEditing(false)} disabled={saving}>
                <X size={13} /> إلغاء
              </Button>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
