"use client";

/**
 * NEXVORA Traceability Panel (P8)
 * ===============================
 * تبويب "الأدلة والربط" — يظهر لما product_mode مفعّل.
 * ملخّص تغطية الأدلة عبر كل Requirements/Stories/AC للمشروع + زر EvidenceButton
 * لكل عنصر بلا تعديل بانلات P6/P7 القائمة.
 */
import { useMemo, useState } from "react";
import Card from "@/components/ui/Card";
import Badge, { type BadgeTone } from "@/components/ui/Badge";
import EmptyState from "@/components/ui/EmptyState";
import { GitBranch, Layers, ListChecks, ShieldCheck, Search } from "lucide-react";
import type { RequirementRow } from "@/lib/product-definition/types";
import type { UserStoryRow, AcceptanceCriterionRow } from "@/lib/user-stories/types";
import type { MarketResearchItem, ProblemValidationItem } from "@/lib/market-research/types";
import type { EvidenceLinkRow } from "@/lib/evidence/types";
import { countBySource, summarizeCoverage, deriveEvidenceHealth } from "@/lib/evidence/derive";
import EvidenceButton from "./evidence-button";

export interface TraceabilityPanelProps {
  projectId: string;
  requirements: RequirementRow[];
  stories: UserStoryRow[];
  acs: AcceptanceCriterionRow[];
  marketResearch: MarketResearchItem[];
  problemValidation: ProblemValidationItem[];
  evidenceLinks: EvidenceLinkRow[];
  canWrite: boolean;
}

type SourceKind = "requirement" | "user_story" | "acceptance_criterion";
const SOURCE_LABELS: Record<SourceKind, string> = {
  requirement: "متطلبات",
  user_story: "قصص",
  acceptance_criterion: "معايير قبول",
};
const QUALITY_TONE: Record<"poor" | "acceptable" | "healthy", BadgeTone> = {
  poor: "danger", acceptable: "warning", healthy: "success",
};

export default function TraceabilityPanel(props: TraceabilityPanelProps) {
  const {
    projectId, requirements, stories, acs,
    marketResearch, problemValidation, evidenceLinks, canWrite,
  } = props;

  const [filter, setFilter] = useState("");
  const [selectedKind, setSelectedKind] = useState<SourceKind | "all">("all");

  const reqCounts = useMemo(() => countBySource(evidenceLinks, "requirement"), [evidenceLinks]);
  const storyCounts = useMemo(() => countBySource(evidenceLinks, "user_story"), [evidenceLinks]);
  const acCounts = useMemo(() => countBySource(evidenceLinks, "acceptance_criterion"), [evidenceLinks]);

  const reqCoverage = useMemo(
    () => summarizeCoverage(requirements.map((r) => r.id), evidenceLinks, "requirement"),
    [requirements, evidenceLinks],
  );
  const storyCoverage = useMemo(
    () => summarizeCoverage(stories.map((s) => s.id), evidenceLinks, "user_story"),
    [stories, evidenceLinks],
  );
  const acCoverage = useMemo(
    () => summarizeCoverage(acs.map((a) => a.id), evidenceLinks, "acceptance_criterion"),
    [acs, evidenceLinks],
  );
  const health = useMemo(() => deriveEvidenceHealth(evidenceLinks), [evidenceLinks]);

  const q = filter.trim().toLowerCase();
  const showReq = selectedKind === "all" || selectedKind === "requirement";
  const showStory = selectedKind === "all" || selectedKind === "user_story";
  const showAc = selectedKind === "all" || selectedKind === "acceptance_criterion";

  const filteredReq = showReq
    ? requirements.filter((r) => !q || r.title.toLowerCase().includes(q) || (r.code ?? "").toLowerCase().includes(q))
    : [];
  const filteredStories = showStory
    ? stories.filter((s) => !q || s.title.toLowerCase().includes(q) || (s.code ?? "").toLowerCase().includes(q))
    : [];
  const storyById = useMemo(() => new Map(stories.map((s) => [s.id, s])), [stories]);
  const filteredAcs = showAc
    ? acs.filter((a) => {
        if (!q) return true;
        const parentTitle = storyById.get(a.userStoryId)?.title ?? "";
        return a.title.toLowerCase().includes(q) ||
               a.givenClause.toLowerCase().includes(q) ||
               parentTitle.toLowerCase().includes(q);
      })
    : [];

  const noData = requirements.length === 0 && stories.length === 0 && acs.length === 0;

  return (
    <div className="space-y-6">
      {/* Overview stats */}
      <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
        <StatTile icon={<ShieldCheck size={16} />} label="إجمالي الروابط" value={`${evidenceLinks.length}`} />
        <StatTile icon={<ListChecks size={16} />} label="تغطية المتطلبات" value={`${reqCoverage.coveragePercent}%`} sub={`${reqCoverage.covered}/${reqCoverage.totalSources}`} tone={reqCoverage.coveragePercent >= 70 ? "success" : reqCoverage.coveragePercent >= 40 ? "warning" : "danger"} />
        <StatTile icon={<Layers size={16} />} label="تغطية القصص" value={`${storyCoverage.coveragePercent}%`} sub={`${storyCoverage.covered}/${storyCoverage.totalSources}`} tone={storyCoverage.coveragePercent >= 70 ? "success" : storyCoverage.coveragePercent >= 40 ? "warning" : "danger"} />
        <StatTile icon={<GitBranch size={16} />} label="جودة الأدلة" value={`${health.noteRatio}%`} sub={`${health.linksWithNote}/${health.totalLinks} بشرح`} tone={QUALITY_TONE[health.quality]} />
      </div>

      {/* Filters */}
      <Card>
        <div className="mb-4 flex flex-wrap items-center gap-3">
          <div className="relative flex-1">
            <Search size={14} className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-[var(--v-text-subtle)]" />
            <input
              type="search"
              value={filter}
              onChange={(e) => setFilter(e.target.value)}
              placeholder="ابحث بالعنوان أو الكود…"
              className="h-9 w-full rounded-[var(--v-radius-md)] border border-[var(--v-border)] bg-[var(--v-surface)] pe-9 ps-3 text-sm text-[var(--v-text)] outline-none placeholder:text-[var(--v-text-subtle)] focus-visible:border-[var(--v-primary)]"
            />
          </div>
          <div className="flex gap-1">
            {(["all", "requirement", "user_story", "acceptance_criterion"] as const).map((k) => (
              <button
                key={k}
                type="button"
                onClick={() => setSelectedKind(k)}
                className={`rounded-[var(--v-radius-md)] px-2 py-1 text-xs transition ${
                  selectedKind === k
                    ? "bg-[var(--v-primary)] text-white"
                    : "border border-[var(--v-border)] text-[var(--v-text-secondary)] hover:border-[var(--v-primary)]"
                }`}
              >
                {k === "all" ? "الكل" : SOURCE_LABELS[k]}
              </button>
            ))}
          </div>
        </div>

        {noData ? (
          <EmptyState
            title="لا عناصر لتتبّعها بعد"
            description="أضف Requirements في تبويب &quot;تعريف المنتج&quot; أو Stories/AC في تبويب &quot;القصص والقبول&quot; لتظهر هنا."
          />
        ) : (
          <div className="space-y-6">
            {/* Requirements */}
            {showReq && (
              <TraceGroup title={`المتطلبات (${filteredReq.length}/${requirements.length})`} coverage={reqCoverage.coveragePercent}>
                {filteredReq.length === 0
                  ? <EmptyLine label={q ? "لا نتائج مطابقة" : "لا متطلبات مسجّلة"} />
                  : filteredReq.map((r) => (
                    <TraceRow
                      key={r.id}
                      code={r.code ?? ""}
                      title={r.title}
                      subtitle={r.description}
                      count={reqCounts.get(r.id) ?? 0}
                      button={
                        <EvidenceButton
                          projectId={projectId}
                          sourceType="requirement"
                          sourceId={r.id}
                          linkCount={reqCounts.get(r.id) ?? 0}
                          marketResearch={marketResearch}
                          problemValidation={problemValidation}
                          canWrite={canWrite}
                        />
                      }
                    />
                  ))}
              </TraceGroup>
            )}

            {/* Stories */}
            {showStory && (
              <TraceGroup title={`القصص (${filteredStories.length}/${stories.length})`} coverage={storyCoverage.coveragePercent}>
                {filteredStories.length === 0
                  ? <EmptyLine label={q ? "لا نتائج مطابقة" : "لا قصص مسجّلة"} />
                  : filteredStories.map((s) => (
                    <TraceRow
                      key={s.id}
                      code={s.code ?? ""}
                      title={s.title}
                      subtitle={s.iWant}
                      count={storyCounts.get(s.id) ?? 0}
                      button={
                        <EvidenceButton
                          projectId={projectId}
                          sourceType="user_story"
                          sourceId={s.id}
                          linkCount={storyCounts.get(s.id) ?? 0}
                          marketResearch={marketResearch}
                          problemValidation={problemValidation}
                          canWrite={canWrite}
                        />
                      }
                    />
                  ))}
              </TraceGroup>
            )}

            {/* Acceptance Criteria */}
            {showAc && (
              <TraceGroup title={`معايير القبول (${filteredAcs.length}/${acs.length})`} coverage={acCoverage.coveragePercent}>
                {filteredAcs.length === 0
                  ? <EmptyLine label={q ? "لا نتائج مطابقة" : "لا معايير قبول مسجّلة"} />
                  : filteredAcs.map((a) => {
                    const parent = storyById.get(a.userStoryId);
                    return (
                      <TraceRow
                        key={a.id}
                        code={`#${a.orderIndex}`}
                        title={a.title || (a.givenClause ? `Given ${a.givenClause.slice(0, 40)}` : "معيار بدون عنوان")}
                        subtitle={parent ? `تابع لـ: ${parent.title}` : ""}
                        count={acCounts.get(a.id) ?? 0}
                        button={
                          <EvidenceButton
                            projectId={projectId}
                            sourceType="acceptance_criterion"
                            sourceId={a.id}
                            linkCount={acCounts.get(a.id) ?? 0}
                            marketResearch={marketResearch}
                            problemValidation={problemValidation}
                            canWrite={canWrite}
                          />
                        }
                      />
                    );
                  })}
              </TraceGroup>
            )}
          </div>
        )}
      </Card>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Sub-components
// ---------------------------------------------------------------------------
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

function TraceGroup({ title, coverage, children }: { title: string; coverage: number; children: React.ReactNode }) {
  return (
    <div>
      <div className="mb-2 flex items-center justify-between gap-2 border-b border-[var(--v-border)] pb-1">
        <h4 className="text-sm font-semibold text-[var(--v-text)]">{title}</h4>
        <Badge tone={coverage >= 70 ? "success" : coverage >= 40 ? "warning" : "danger"}>تغطية {coverage}%</Badge>
      </div>
      <ul className="space-y-1.5">{children}</ul>
    </div>
  );
}

function TraceRow({ code, title, subtitle, count, button }: { code: string; title: string; subtitle?: string; count: number; button: React.ReactNode }) {
  return (
    <li className={`flex items-start justify-between gap-3 rounded-[var(--v-radius-md)] px-3 py-2 text-sm ${count > 0 ? "bg-[var(--v-surface)]" : "border border-dashed border-[var(--v-border)]"}`}>
      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-center gap-2">
          {code && <span className="font-mono text-[11px] text-[var(--v-text-subtle)]">{code}</span>}
          <p className="font-medium text-[var(--v-text)]">{title}</p>
        </div>
        {subtitle && <p className="mt-0.5 truncate text-xs text-[var(--v-text-secondary)]">{subtitle}</p>}
      </div>
      <div className="shrink-0">{button}</div>
    </li>
  );
}

function EmptyLine({ label }: { label: string }) {
  return <li className="rounded-[var(--v-radius-md)] border border-dashed border-[var(--v-border)] p-2 text-center text-xs text-[var(--v-text-muted)]">{label}</li>;
}
