"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { runPrototypeReview, overrideReviewItem, getReviewVersions } from "./review-actions";
import { formatReviewAsMarkdown, downloadMarkdown } from "@/lib/review/export";
import { ClipboardCheck } from "lucide-react";
import CompareModalShell from "@/components/ui/CompareModalShell";
import Badge from "@/components/ui/Badge";
import AiBadge from "@/components/ui/AiBadge";
import Button from "@/components/ui/Button";
import Card from "@/components/ui/Card";
import EmptyState from "@/components/ui/EmptyState";
import type {
  AcceptanceCriterionReview,
  ImplementationStatus,
  PrototypeReview,
  PrototypeReviewVersion,
  UserStoryReview,
} from "@/lib/types/database";
import { useBackgroundRefresh } from "@/lib/ui/use-background-refresh";

const statusLabels: Record<ImplementationStatus, string> = {
  implemented: "منفّذ",
  partially_implemented: "منفّذ جزئيًا",
  implemented_differently: "منفّذ بطريقة مختلفة",
  not_implemented: "غير منفّذ",
};

const statusColors: Record<ImplementationStatus, string> = {
  implemented: "text-[var(--v-green)] bg-[var(--v-green)]/10",
  partially_implemented: "text-[var(--v-amber)] bg-[var(--v-amber)]/10",
  implemented_differently: "text-[var(--v-amber)] bg-[var(--v-amber)]/10",
  not_implemented: "text-[var(--v-red)] bg-[var(--v-red)]/10",
};

const overallStatusLabels: Record<string, string> = {
  ready: "جاهز (Ready)",
  needs_changes: "محتاج تعديلات (Needs Changes)",
  blocked: "موقوف (Blocked)",
};

const overallStatusColors: Record<string, string> = {
  ready: "text-[var(--v-green)] bg-[var(--v-green)]/10",
  needs_changes: "text-[var(--v-amber)] bg-[var(--v-amber)]/10",
  blocked: "text-[var(--v-red)] bg-[var(--v-red)]/10",
};

function effectiveStatus(item: UserStoryReview | AcceptanceCriterionReview): ImplementationStatus {
  return item.pm_override?.status ?? item.ai_status;
}

export default function ReviewPanel({
  projectId,
  projectName,
  review,
  currentPrdVersion,
}: {
  projectId: string;
  projectName: string;
  review: PrototypeReview | null;
  currentPrdVersion: number | null;
}) {
  const router = useRouter();
  const [repoUrl, setRepoUrl] = useState(review?.repo_url ?? "");
  const [repoRef, setRepoRef] = useState("main");
  // submitting: بس لحظة استدعاء الـ Server Action نفسه (أقل من ثانية —
  // الـ Action بترجع فورًا "started" وتسيب التنفيذ الفعلي للخلفية)، مش
  // طول مدة المراجعة كلها. لو ربطنا تعطيل الزرار بحالة الـ DB نفسها
  // ("reviewing") بدل كده، وJob مات لأي سبب من غير ما يحدّث الحالة،
  // الزرار كان هيفضل معطّل للأبد ومفيش طريقة للمستخدم يعيد المحاولة —
  // حتى بعد ما الـ Stale-Lock Reclaim يسمح بيها على مستوى السيرفر.
  const [submitting, setSubmitting] = useState(false);
  const [message, setMessage] = useState("");
  const [showCompare, setShowCompare] = useState(false);
  const [versions, setVersions] = useState<PrototypeReviewVersion[]>([]);
  const [loadingVersions, setLoadingVersions] = useState(false);
  const [compareA, setCompareA] = useState<number | null>(null);
  const [compareB, setCompareB] = useState<number | null>(null);

  // isProcessing: تلميح معلوماتي بس (Skeleton + رسالة "شغّالة في
  // الخلفية") — مش بيتحكم في تعطيل الزرار.
  const isProcessing = review?.sync_status === "reviewing";
  const hasReport = !!(review && review.version > 0);

  const displayMessage = message || (review?.sync_status === "failed" ? review.last_error ?? "" : "");

  const isOutdated =
    hasReport &&
    review &&
    currentPrdVersion !== null &&
    review.reviewed_prd_version !== currentPrdVersion;

  // تحديث دوري مُجمَّع: منسّق واحد لكل الصفحة بدل مؤقّت لكل لوحة، بيقف
  // لما التبويب يكون مخفي وبيبطّل خالص لو المهمة اتعلّقت.
  useBackgroundRefresh(review?.sync_status === "reviewing");

  async function handleRun() {
    if (!repoUrl.trim()) {
      setMessage("لازم تدخل رابط الـ Repository أولاً.");
      return;
    }
    setSubmitting(true);
    setMessage("");
    const result = await runPrototypeReview(projectId, repoUrl.trim(), repoRef.trim());
    setSubmitting(false);
    if (result.status === "already_reviewing") {
      setMessage("فيه مراجعة شغالة بالفعل، استنى تخلص.");
    }
    // "started" → المراجعة بدأت في الخلفية؛ الـ Polling هيلتقط النتيجة.
    router.refresh();
  }

  async function handleOverride(
    itemKind: "user_stories" | "acceptance_criteria_results",
    index: number,
    status: ImplementationStatus
  ) {
    await overrideReviewItem(projectId, itemKind, index, status, "");
    router.refresh();
  }

  async function handleOpenCompare() {
    setShowCompare(true);
    setLoadingVersions(true);
    const v = await getReviewVersions(projectId);
    setVersions(v);
    if (v.length >= 2) {
      setCompareA(v[1].version);
      setCompareB(v[0].version);
    }
    setLoadingVersions(false);
  }

  function handleExport() {
    if (!review) return;
    downloadMarkdown(`Review-${projectName}.md`, formatReviewAsMarkdown(projectName, review));
  }

  return (
    <div>
      <Card padding="md" className="mb-4">
        <p className="mb-3 text-sm font-semibold text-[var(--v-text)]">تشغيل مراجعة جديدة</p>
        <div className="flex flex-col gap-2 sm:flex-row">
          <input
            value={repoUrl}
            onChange={(e) => setRepoUrl(e.target.value)}
            placeholder="https://github.com/owner/repo"
            dir="ltr"
            className="flex-1 rounded-[var(--v-radius-md)] border border-[var(--v-border)] bg-[var(--v-bg)] px-3 py-2 text-sm text-[var(--v-text)] outline-none focus:border-[var(--v-primary)]"
          />
          <input
            value={repoRef}
            onChange={(e) => setRepoRef(e.target.value)}
            placeholder="main"
            dir="ltr"
            className="w-full rounded-[var(--v-radius-md)] border border-[var(--v-border)] bg-[var(--v-bg)] px-3 py-2 text-sm text-[var(--v-text)] outline-none focus:border-[var(--v-primary)] sm:w-32"
          />
          <Button variant="primary" onClick={handleRun} loading={submitting}>
            Run Review
          </Button>
        </div>
        {isProcessing && (
          <p className="mt-2 text-xs text-[var(--v-amber)]" aria-live="polite">
            المراجعة شغّالة في الخلفية (بنقرا الكود فعليًا من GitHub ونحلله) — تقدر تسيب الصفحة وترجع، مش
            هتضيع. ممكن تاخد لحد كام دقيقة لو الكوتة مزدحمة. لو فضلت شغّالة أكتر من 6 دقايق، اضغط Run
            Review تاني وهيتم اعتبارها متوقفة وإعادة تشغيلها من جديد.
          </p>
        )}
        {displayMessage && <p className="mt-2 text-xs text-[var(--v-red)]">{displayMessage}</p>}
      </Card>

      {isProcessing && !hasReport && (
        <div className="space-y-2">
          <div className="h-4 w-full animate-pulse rounded bg-[var(--v-surface)]" />
          <div className="h-4 w-3/4 animate-pulse rounded bg-[var(--v-surface)]" />
          <div className="h-4 w-1/2 animate-pulse rounded bg-[var(--v-surface)]" />
        </div>
      )}

      {!hasReport && !isProcessing && (
        <div>
          <EmptyState
            icon={<ClipboardCheck size={28} />}
            title="أكمل النموذج الأولي ودليل التقييم قبل بدء المراجعة"
            description="لازم PRD معتمد + Prototype Studio جاهز + دليل التقييم متاح، وبعدين حط رابط الـ Repository واضغط Run Review."
          />
          <div className="mt-3 flex flex-wrap justify-center gap-2">
            <a
              className="rounded-[var(--v-radius-md)] border border-[var(--v-border)] px-3 py-1.5 text-xs text-[var(--v-text-secondary)] hover:border-[var(--v-primary)] hover:text-[var(--v-primary)]"
              href={`/dashboard/projects/${projectId}?tab=prototypeStudio`}
            >
              الذهاب إلى Prototype Studio
            </a>
            <a
              className="rounded-[var(--v-radius-md)] border border-[var(--v-border)] px-3 py-1.5 text-xs text-[var(--v-text-secondary)] hover:border-[var(--v-primary)] hover:text-[var(--v-primary)]"
              href={`/dashboard/projects/${projectId}?tab=evaluation`}
            >
              الذهاب إلى دليل التقييم
            </a>
          </div>
        </div>
      )}

      {hasReport && review && (
        <div className="space-y-4">
          <div className="flex flex-wrap items-center gap-2 text-xs">
            <span
              className={`rounded-full px-3 py-1.5 font-bold ${overallStatusColors[review.overall_status]}`}
            >
              {overallStatusLabels[review.overall_status]}
            </span>
            <Badge>{review.completion_percentage}% مكتمل</Badge>
            <AiBadge />
            <Badge>نسخة {review.version}</Badge>
            <span dir="ltr">
              <Badge>{review.repo_ref.slice(0, 8)}</Badge>
            </span>
            {isOutdated && <Badge tone="warning">Review Outdated</Badge>}
            <div className="mr-auto flex gap-2">
              <Button variant="outline" size="sm" onClick={handleOpenCompare}>
                Compare Reviews
              </Button>
              <Button variant="outline" size="sm" onClick={handleExport}>
                Export Markdown
              </Button>
              <Link
                href={`/prototype-review-print/${projectId}`}
                target="_blank"
                className="rounded-[var(--v-radius-md)] border border-[var(--v-border)] px-4 py-2 text-sm font-medium text-[var(--v-text)] transition hover:border-[var(--v-primary)]"
              >
                Export PDF
              </Link>
            </div>
          </div>

          <div>
            <p className="mb-2 text-xs font-semibold text-[var(--v-text-muted)]">User Stories</p>
            <div className="space-y-2">
              {review.gap_report.user_stories.map((s, i) => (
                <div key={i} className="rounded-[var(--v-radius-lg)] border border-[var(--v-border)] bg-[var(--v-bg)] p-3">
                  <div className="flex items-start justify-between gap-2">
                    <p className="text-sm text-[var(--v-text)]">{s.story}</p>
                    <span
                      className={`shrink-0 rounded-full px-2 py-0.5 text-[10px] font-medium ${statusColors[effectiveStatus(s)]}`}
                    >
                      {statusLabels[effectiveStatus(s)]}
                      {s.pm_override && " (PM)"}
                    </span>
                  </div>
                  {s.ai_evidence && (
                    <p dir="ltr" className="mt-2 text-left text-[11px] text-[var(--v-text-muted)]">
                      Evidence:{" "}
                      {s.ai_evidence
                        .map((e) => `${e.file}${e.line ? `:${e.line}` : ""}`)
                        .join(", ")}
                    </p>
                  )}
                  {s.ai_gap && <p className="mt-1 text-xs text-[var(--v-text-secondary)]">{s.ai_gap}</p>}
                  <OverrideControl
                    current={effectiveStatus(s)}
                    onChange={(status) => handleOverride("user_stories", i, status)}
                  />
                </div>
              ))}
            </div>
          </div>

          <div>
            <p className="mb-2 text-xs font-semibold text-[var(--v-text-muted)]">Acceptance Criteria</p>
            <div className="space-y-2">
              {review.gap_report.acceptance_criteria_results.map((c, i) => (
                <div key={i} className="rounded-[var(--v-radius-lg)] border border-[var(--v-border)] bg-[var(--v-bg)] p-3">
                  <div className="flex items-start justify-between gap-2">
                    <p className="text-sm text-[var(--v-text)]">{c.criterion}</p>
                    <span
                      className={`shrink-0 rounded-full px-2 py-0.5 text-[10px] font-medium ${statusColors[effectiveStatus(c)]}`}
                    >
                      {statusLabels[effectiveStatus(c)]}
                      {c.pm_override && " (PM)"}
                    </span>
                  </div>
                  {c.ai_evidence && (
                    <p dir="ltr" className="mt-2 text-left text-[11px] text-[var(--v-text-muted)]">
                      Evidence:{" "}
                      {c.ai_evidence
                        .map((e) => `${e.file}${e.line ? `:${e.line}` : ""}`)
                        .join(", ")}
                    </p>
                  )}
                  {c.ai_gap && <p className="mt-1 text-xs text-[var(--v-text-secondary)]">{c.ai_gap}</p>}
                  <OverrideControl
                    current={effectiveStatus(c)}
                    onChange={(status) => handleOverride("acceptance_criteria_results", i, status)}
                  />
                </div>
              ))}
            </div>
          </div>

          <GapSection title="Missing Features" items={review.gap_report.missing_features} tone="red" />
          <GapSection title="Scope Creep" items={review.gap_report.scope_creep} tone="amber" />
          <GapSection title="Non-Functional Gaps" items={review.gap_report.non_functional_gaps} tone="amber" />
          <GapSection title="Unresolved Risks" items={review.gap_report.unresolved_risks} tone="red" />

          <div className="rounded-[var(--v-radius-lg)] border border-[var(--v-border)] bg-[var(--v-surface)] p-3">
            <p className="mb-1 text-xs font-semibold text-[var(--v-text)]">Recommendation</p>
            <p className="text-sm text-[var(--v-text-secondary)]">{review.gap_report.recommendation_summary}</p>
          </div>
        </div>
      )}

      {showCompare && (
        <ReviewCompareModal
          versions={versions}
          loading={loadingVersions}
          compareA={compareA}
          compareB={compareB}
          setCompareA={setCompareA}
          setCompareB={setCompareB}
          onClose={() => setShowCompare(false)}
        />
      )}
    </div>
  );
}

function OverrideControl({
  current,
  onChange,
}: {
  current: ImplementationStatus;
  onChange: (status: ImplementationStatus) => void;
}) {
  return (
    <div className="mt-2 flex items-center gap-2">
      <label className="text-[10px] text-[var(--v-text-muted)]">تعديل الحالة يدويًا (PM Override):</label>
      <select
        value={current}
        onChange={(e) => onChange(e.target.value as ImplementationStatus)}
        className="rounded-[var(--v-radius-sm)] border border-[var(--v-border)] bg-[var(--v-bg)] px-2 py-1 text-[10px] text-[var(--v-text)]"
      >
        {(Object.keys(statusLabels) as ImplementationStatus[]).map((s) => (
          <option key={s} value={s}>
            {statusLabels[s]}
          </option>
        ))}
      </select>
    </div>
  );
}

function GapSection({
  title,
  items,
  tone,
}: {
  title: string;
  items: string[];
  tone: "red" | "amber";
}) {
  const toneClass = tone === "red" ? "text-[var(--v-red)]" : "text-[var(--v-amber)]";
  return (
    <div>
      <p className={`mb-2 text-xs font-semibold ${toneClass}`}>{title}</p>
      {items.length === 0 ? (
        <p className="text-xs text-[var(--v-text-muted)]">—</p>
      ) : (
        <ul className="list-disc space-y-1 pr-5 text-sm text-[var(--v-text)]">
          {items.map((item, i) => (
            <li key={i}>{item}</li>
          ))}
        </ul>
      )}
    </div>
  );
}

function ReviewCompareModal({
  versions,
  loading,
  compareA,
  compareB,
  setCompareA,
  setCompareB,
  onClose,
}: {
  versions: PrototypeReviewVersion[];
  loading: boolean;
  compareA: number | null;
  compareB: number | null;
  setCompareA: (v: number) => void;
  setCompareB: (v: number) => void;
  onClose: () => void;
}) {
  return (
    <CompareModalShell
      title="مقارنة المراجعات"
      needMoreLabel="محتاج مراجعتين على الأقل للمقارنة."
      versions={versions}
      loading={loading}
      compareA={compareA}
      compareB={compareB}
      setCompareA={setCompareA}
      setCompareB={setCompareB}
      onClose={onClose}
      optionLabel={(v) => `مراجعة ${v.version} (${v.completion_percentage}%)`}
    >
      {(versionA, versionB) => {
        const gapsA = new Set([
          ...(versionA.gap_report?.missing_features ?? []),
          ...(versionA.gap_report?.unresolved_risks ?? []),
        ]);
        const gapsB = new Set([
          ...(versionB.gap_report?.missing_features ?? []),
          ...(versionB.gap_report?.unresolved_risks ?? []),
        ]);
        const resolved = [...gapsA].filter((g) => !gapsB.has(g));
        const newGaps = [...gapsB].filter((g) => !gapsA.has(g));

        return (
          <div className="space-y-3 text-sm">
            <p className="text-[var(--v-text)]">
              نسبة الإنجاز: {versionA.completion_percentage}% ← {versionB.completion_percentage}%
            </p>
            <div>
              <p className="mb-1 text-xs font-semibold text-[var(--v-green)]">فجوات اتحلّت</p>
              {resolved.length === 0 ? (
                <p className="text-xs text-[var(--v-text-muted)]">—</p>
              ) : (
                <ul className="list-disc space-y-1 pr-5 text-xs text-[var(--v-text)]">
                  {resolved.map((g, i) => (
                    <li key={i}>{g}</li>
                  ))}
                </ul>
              )}
            </div>
            <div>
              <p className="mb-1 text-xs font-semibold text-[var(--v-red)]">فجوات جديدة</p>
              {newGaps.length === 0 ? (
                <p className="text-xs text-[var(--v-text-muted)]">—</p>
              ) : (
                <ul className="list-disc space-y-1 pr-5 text-xs text-[var(--v-text)]">
                  {newGaps.map((g, i) => (
                    <li key={i}>{g}</li>
                  ))}
                </ul>
              )}
            </div>
          </div>
        );
      }}
    </CompareModalShell>
  );
}
