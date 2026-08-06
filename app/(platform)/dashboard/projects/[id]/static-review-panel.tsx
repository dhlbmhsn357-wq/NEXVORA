"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { runStaticReviewCategory, compareStaticReviewVersions, type CompareReviewsResult } from "./static-review-actions";
import { findNextCategoryToTrigger, findStuckGeneratingCategory, STALE_LOCK_MS } from "@/lib/static-review/next-category";
import Badge, { type BadgeTone } from "@/components/ui/Badge";
import Input from "@/components/ui/Input";
import Select from "@/components/ui/Select";
import type {
  StaticReview,
  StaticReviewCategory,
  StaticReviewCategoryKey,
  StaticReviewFile,
  StaticReviewFinding,
  StaticFindingSeverity,
} from "@/lib/types/database";
import { useBackgroundRefresh } from "@/lib/ui/use-background-refresh";

const CATEGORY_LABELS: Record<StaticReviewCategoryKey, string> = {
  architecture: "Architecture",
  clean_code: "Clean Code",
  solid: "SOLID",
  dry_kiss: "DRY / KISS",
  ai_code_smell: "AI Code Smell",
  naming: "Naming",
  documentation: "Documentation",
};

const SEVERITY_LABELS: Record<StaticFindingSeverity, string> = {
  critical: "Critical",
  high: "High",
  medium: "Medium",
  low: "Low",
  info: "Info",
};

const SEVERITY_TONE: Record<StaticFindingSeverity, BadgeTone> = {
  critical: "danger",
  high: "warning",
  medium: "info",
  low: "neutral",
  info: "neutral",
};

const SEVERITY_ORDER: StaticFindingSeverity[] = ["critical", "high", "medium", "low", "info"];

const SCORE_LABELS: Record<string, string> = {
  architecture: "Architecture",
  maintainability: "Maintainability",
  readability: "Readability",
  solid: "SOLID",
  dry: "DRY",
  naming: "Naming",
  documentation: "Documentation",
  ai_code_quality: "AI Code Quality",
  technical_debt: "Technical Debt",
  overall_static_score: "Overall Static Score",
};

const FILE_STATUS_LABELS: Record<string, string> = {
  added: "جديد",
  modified: "مُعدَّل",
  unchanged: "بدون تغيير",
  removed: "مشال",
};

function scoreTone(value: number): string {
  if (value >= 75) return "var(--v-green)";
  if (value >= 50) return "var(--v-amber)";
  return "var(--v-red)";
}

interface StaticReviewPanelProps {
  projectId: string;
  reviews: StaticReview[];
  currentReview: StaticReview | null;
  categories: StaticReviewCategory[];
  findings: StaticReviewFinding[];
  files: StaticReviewFile[];
}

/**
 * Static Architecture Review Engine (Phase 12.2) — أول محرك مراجعة
 * هندسية حقيقي داخل Engineering QA. مدمجة كتفاصيل قابلة للتوسيع تحت
 * مرحلة "Static Code Audit" — نفس نمط Client-driven auto-chain
 * المستخدم في Engineering Audit بالظبط، بس هنا بيغذّي مرحلة EQA
 * الأكبر (عبر eqa-bridge.ts) بدل ما يكون مستقل تمامًا.
 */
export default function StaticReviewPanel({ projectId, reviews, currentReview, categories, findings, files }: StaticReviewPanelProps) {
  const router = useRouter();
  const [retrying, setRetrying] = useState<StaticReviewCategoryKey | null>(null);
  const [now, setNow] = useState<number | null>(null);
  const triggeringRef = useRef(false);

  const [search, setSearch] = useState("");
  const [severityFilter, setSeverityFilter] = useState<string>("all");
  const [categoryFilter, setCategoryFilter] = useState<string>("all");
  const [sortBy, setSortBy] = useState<"severity" | "file">("severity");
  const [expandedFinding, setExpandedFinding] = useState<string | null>(null);

  const [compareOldId, setCompareOldId] = useState("");
  const [compareNewId, setCompareNewId] = useState("");
  const [compareResult, setCompareResult] = useState<CompareReviewsResult | null>(null);
  const [comparing, setComparing] = useState(false);

  const isProcessing = currentReview?.status === "generating";

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setNow(Date.now());
    const id = setInterval(() => setNow(Date.now()), 4000);
    return () => clearInterval(id);
  }, []);

  // تحديث دوري مُجمَّع: منسّق واحد لكل الصفحة بدل مؤقّت لكل لوحة، بيقف
  // لما التبويب يكون مخفي وبيبطّل خالص لو المهمة اتعلّقت.
  useBackgroundRefresh(isProcessing);

  // Auto-chain: يشغّل المحور التالي تلقائيًا، ويعيد تشغيل أي محور عالق
  // (Generating من غير تحديث لمدة أطول من STALE_LOCK_MS) — نفس النمط
  // اللي اتصلح بيه Engineering Audit.
  useEffect(() => {
    if (!currentReview || currentReview.status !== "generating" || categories.length === 0) return;
    if (triggeringRef.current) return;

    const next = findNextCategoryToTrigger(categories);
    if (next) {
      triggeringRef.current = true;
      runStaticReviewCategory(projectId, currentReview.id, next.category_key, false).finally(() => {
        triggeringRef.current = false;
        router.refresh();
      });
      return;
    }

    const stuck = findStuckGeneratingCategory(categories, Date.now(), STALE_LOCK_MS);
    if (!stuck) return;
    triggeringRef.current = true;
    runStaticReviewCategory(projectId, currentReview.id, stuck.category_key, false).finally(() => {
      triggeringRef.current = false;
      router.refresh();
    });
  }, [currentReview, categories, projectId, router]);

  async function retryCategory(categoryKey: StaticReviewCategoryKey) {
    if (!currentReview) return;
    setRetrying(categoryKey);
    await runStaticReviewCategory(projectId, currentReview.id, categoryKey, true);
    setRetrying(null);
    router.refresh();
  }

  async function runCompare() {
    if (!compareOldId || !compareNewId || compareOldId === compareNewId) return;
    setComparing(true);
    const result = await compareStaticReviewVersions(compareOldId, compareNewId);
    setCompareResult(result);
    setComparing(false);
  }

  const filteredFindings = useMemo(() => {
    let list = findings;
    if (severityFilter !== "all") list = list.filter((f) => f.severity === severityFilter);
    if (categoryFilter !== "all") list = list.filter((f) => f.category_key === categoryFilter);
    if (search.trim()) {
      const q = search.trim().toLowerCase();
      list = list.filter((f) => f.title.toLowerCase().includes(q) || f.file_path.toLowerCase().includes(q));
    }
    return [...list].sort((a, b) =>
      sortBy === "severity"
        ? SEVERITY_ORDER.indexOf(a.severity) - SEVERITY_ORDER.indexOf(b.severity)
        : a.file_path.localeCompare(b.file_path)
    );
  }, [findings, severityFilter, categoryFilter, search, sortBy]);

  if (!currentReview) {
    return <p className="text-xs text-[var(--v-text-muted)]">لسه مفيش مراجعة Static Architecture Review لهذا المشروع — هتُنشأ تلقائيًا أول ما تبدأ مرحلة Static Code Audit.</p>;
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-2 text-xs text-[var(--v-text-muted)]">
        <Badge>مراجعة رقم {currentReview.version}</Badge>
        {currentReview.is_incremental && <Badge tone="info">تحليل تدريجي (Incremental)</Badge>}
        <span>
          {currentReview.files_analyzed_count} ملف اتحلل حديثًا · {currentReview.files_reused_count} Finding منقول من مراجعة سابقة
        </span>
        {currentReview.status === "failed" && currentReview.last_error && (
          <span className="text-[var(--v-red)]">{currentReview.last_error}</span>
        )}
      </div>

      <div className="grid grid-cols-1 gap-2 sm:grid-cols-2 lg:grid-cols-4">
        {categories.map((c) => {
          const stuck = c.status === "generating" && now !== null && now - new Date(c.updated_at).getTime() > STALE_LOCK_MS;
          const canRetry = c.status === "failed" || stuck;
          const tone: BadgeTone = c.status === "ready" ? "success" : stuck || c.status === "failed" ? "danger" : c.status === "generating" ? "warning" : "neutral";
          const label = c.status === "ready" ? "جاهز" : stuck ? "توقّف" : c.status === "generating" ? "جاري…" : c.status === "failed" ? "فشل" : "في الانتظار";
          return (
            <div key={c.category_key} className="rounded-[var(--v-radius-md)] border border-[var(--v-border)] bg-[var(--v-bg)] px-3 py-2">
              <div className="flex items-center justify-between gap-2">
                <span className="text-xs font-medium text-[var(--v-text)]">{CATEGORY_LABELS[c.category_key]}</span>
                <div className="flex items-center gap-1.5">
                  {c.score !== null && <span className="text-[11px] font-semibold" style={{ color: scoreTone(c.score) }}>{c.score}</span>}
                  <Badge tone={tone}>{label}</Badge>
                </div>
              </div>
              {c.status === "failed" && c.last_error && <p className="mt-1 text-[11px] text-[var(--v-red)]">{c.last_error}</p>}
              {stuck && <p className="mt-1 text-[11px] text-[var(--v-red)]">توقّف من غير سبب واضح — جرّب إعادة المحاولة.</p>}
              {canRetry && (
                <button
                  type="button"
                  onClick={() => retryCategory(c.category_key)}
                  disabled={retrying === c.category_key}
                  className="mt-1.5 text-[11px] font-medium text-[var(--v-primary)] hover:underline disabled:opacity-50"
                >
                  {retrying === c.category_key ? "جاري إعادة المحاولة…" : "إعادة المحاولة"}
                </button>
              )}
            </div>
          );
        })}
      </div>

      {currentReview.status === "ready" && currentReview.score_summary && (
        <>
          <ScoreDashboard scores={currentReview.score_summary as unknown as Record<string, number>} />
          <FileExplorer files={files} />
          <IssueExplorer
            findings={filteredFindings}
            totalCount={findings.length}
            search={search}
            setSearch={setSearch}
            severityFilter={severityFilter}
            setSeverityFilter={setSeverityFilter}
            categoryFilter={categoryFilter}
            setCategoryFilter={setCategoryFilter}
            sortBy={sortBy}
            setSortBy={setSortBy}
            expandedFinding={expandedFinding}
            setExpandedFinding={setExpandedFinding}
          />
        </>
      )}

      {reviews.length > 1 && (
        <div className="rounded-[var(--v-radius-lg)] border border-[var(--v-border)] bg-[var(--v-bg)] p-3">
          <p className="mb-2 text-sm font-semibold text-[var(--v-text)]">مقارنة مراجعتين (Versioning)</p>
          <div className="flex flex-col gap-2 sm:flex-row">
            <Select value={compareOldId} onChange={(e) => setCompareOldId(e.target.value)}>
              <option value="">المراجعة القديمة</option>
              {reviews.filter((r) => r.status === "ready").map((r) => (
                <option key={r.id} value={r.id}>مراجعة رقم {r.version}</option>
              ))}
            </Select>
            <Select value={compareNewId} onChange={(e) => setCompareNewId(e.target.value)}>
              <option value="">المراجعة الجديدة</option>
              {reviews.filter((r) => r.status === "ready").map((r) => (
                <option key={r.id} value={r.id}>مراجعة رقم {r.version}</option>
              ))}
            </Select>
            <button
              type="button"
              onClick={runCompare}
              disabled={comparing || !compareOldId || !compareNewId}
              className="rounded-[var(--v-radius-md)] border border-[var(--v-border)] px-4 py-2 text-sm font-medium text-[var(--v-text)] transition hover:border-[var(--v-primary)] disabled:opacity-50"
            >
              {comparing ? "جاري المقارنة…" : "قارن"}
            </button>
          </div>
          {compareResult && !compareResult.ok && <p className="mt-2 text-xs text-[var(--v-red)]">{compareResult.message}</p>}
          {compareResult && compareResult.ok && (
            <div className="mt-3 grid grid-cols-2 gap-2 text-xs sm:grid-cols-4">
              <div className="rounded-[var(--v-radius-md)] border border-[var(--v-border)] p-2 text-center">
                <p className="font-display text-lg text-[var(--v-red)]">{compareResult.comparison.added.length}</p>
                <p className="text-[var(--v-text-muted)]">Issues Added</p>
              </div>
              <div className="rounded-[var(--v-radius-md)] border border-[var(--v-border)] p-2 text-center">
                <p className="font-display text-lg text-[var(--v-green)]">{compareResult.comparison.fixed.length}</p>
                <p className="text-[var(--v-text-muted)]">Issues Fixed</p>
              </div>
              <div className="rounded-[var(--v-radius-md)] border border-[var(--v-border)] p-2 text-center">
                <p className="font-display text-lg text-[var(--v-text)]">{compareResult.comparison.remaining.length}</p>
                <p className="text-[var(--v-text-muted)]">Issues Remaining</p>
              </div>
              <div className="rounded-[var(--v-radius-md)] border border-[var(--v-border)] p-2 text-center">
                <p className="font-display text-lg" style={{ color: compareResult.comparison.scoreDiff >= 0 ? "var(--v-green)" : "var(--v-red)" }}>
                  {compareResult.comparison.scoreDiff >= 0 ? "+" : ""}
                  {compareResult.comparison.scoreDiff}
                </p>
                <p className="text-[var(--v-text-muted)]">Score Diff</p>
              </div>
            </div>
          )}
        </div>
      )}

      <div>
        <p className="mb-2 text-sm font-semibold text-[var(--v-text)]">تاريخ مراجعات Static Review ({reviews.length})</p>
        <div className="space-y-1.5">
          {reviews.map((r) => (
            <div key={r.id} className="flex items-center justify-between rounded-[var(--v-radius-md)] border border-[var(--v-border)] bg-[var(--v-bg)] px-3 py-2 text-xs">
              <span className="text-[var(--v-text)]">مراجعة رقم {r.version}</span>
              <Badge tone={r.status === "ready" ? "success" : r.status === "failed" ? "danger" : "warning"}>{r.status}</Badge>
              {r.score_summary && <span className="text-[var(--v-text-muted)]">{(r.score_summary as unknown as Record<string, number>).overall_static_score}/100</span>}
              <span className="text-[var(--v-text-muted)]">{new Date(r.created_at).toLocaleString("ar-EG")}</span>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

function ScoreDashboard({ scores }: { scores: Record<string, number> }) {
  const entries = Object.entries(scores);
  return (
    <div>
      <p className="mb-2 text-sm font-semibold text-[var(--v-text)]">Score Summary</p>
      <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-5">
        {entries.map(([key, value]) => (
          <div key={key} className="rounded-[var(--v-radius-lg)] border border-[var(--v-border)] bg-[var(--v-bg)] p-3 text-center">
            <p className="font-display text-2xl" style={{ color: scoreTone(value) }}>{value}</p>
            <p className="mt-1 text-[11px] text-[var(--v-text-muted)]">{SCORE_LABELS[key] ?? key}</p>
          </div>
        ))}
      </div>
    </div>
  );
}

function FileExplorer({ files }: { files: StaticReviewFile[] }) {
  const [search, setSearch] = useState("");
  const filtered = files.filter((f) => f.file_path.toLowerCase().includes(search.trim().toLowerCase()));

  return (
    <div>
      <div className="mb-2 flex items-center justify-between">
        <p className="text-sm font-semibold text-[var(--v-text)]">File Explorer ({files.length})</p>
      </div>
      <div className="mb-2">
        <Input placeholder="ابحث باسم الملف…" value={search} onChange={(e) => setSearch(e.target.value)} dir="ltr" />
      </div>
      <div className="max-h-64 overflow-y-auto rounded-[var(--v-radius-lg)] border border-[var(--v-border)]">
        {filtered.length === 0 && <p className="p-3 text-xs text-[var(--v-text-muted)]">مفيش ملفات مطابقة.</p>}
        {filtered.map((f) => (
          <div key={f.id} dir="ltr" className="flex items-center justify-between border-b border-[var(--v-border)] px-3 py-1.5 text-xs last:border-b-0">
            <span className="text-[var(--v-text)]">{f.file_path}</span>
            <div className="flex items-center gap-2">
              {f.findings_count > 0 && <span className="text-[var(--v-text-muted)]">{f.findings_count} Finding</span>}
              <Badge tone={f.file_status === "added" ? "success" : f.file_status === "modified" ? "info" : "neutral"}>
                {FILE_STATUS_LABELS[f.file_status]}
              </Badge>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

function IssueExplorer({
  findings,
  totalCount,
  search,
  setSearch,
  severityFilter,
  setSeverityFilter,
  categoryFilter,
  setCategoryFilter,
  sortBy,
  setSortBy,
  expandedFinding,
  setExpandedFinding,
}: {
  findings: StaticReviewFinding[];
  totalCount: number;
  search: string;
  setSearch: (v: string) => void;
  severityFilter: string;
  setSeverityFilter: (v: string) => void;
  categoryFilter: string;
  setCategoryFilter: (v: string) => void;
  sortBy: "severity" | "file";
  setSortBy: (v: "severity" | "file") => void;
  expandedFinding: string | null;
  setExpandedFinding: (v: string | null) => void;
}) {
  return (
    <div>
      <p className="mb-2 text-sm font-semibold text-[var(--v-text)]">Issue Explorer ({findings.length} من {totalCount})</p>
      <div className="mb-3 grid grid-cols-1 gap-2 sm:grid-cols-4">
        <Input placeholder="ابحث بالعنوان أو الملف…" value={search} onChange={(e) => setSearch(e.target.value)} />
        <Select value={severityFilter} onChange={(e) => setSeverityFilter(e.target.value)}>
          <option value="all">كل درجات الخطورة</option>
          {SEVERITY_ORDER.map((s) => (
            <option key={s} value={s}>{SEVERITY_LABELS[s]}</option>
          ))}
        </Select>
        <Select value={categoryFilter} onChange={(e) => setCategoryFilter(e.target.value)}>
          <option value="all">كل المحاور</option>
          {(Object.keys(CATEGORY_LABELS) as StaticReviewCategoryKey[]).map((c) => (
            <option key={c} value={c}>{CATEGORY_LABELS[c]}</option>
          ))}
        </Select>
        <Select value={sortBy} onChange={(e) => setSortBy(e.target.value as "severity" | "file")}>
          <option value="severity">ترتيب حسب الخطورة</option>
          <option value="file">ترتيب حسب الملف</option>
        </Select>
      </div>
      <div className="space-y-2">
        {findings.length === 0 && <p className="text-xs text-[var(--v-text-muted)]">مفيش Findings مطابقة للفلاتر الحالية.</p>}
        {findings.map((f) => (
          <FindingCard key={f.id} finding={f} expanded={expandedFinding === f.id} onToggle={() => setExpandedFinding(expandedFinding === f.id ? null : f.id)} />
        ))}
      </div>
    </div>
  );
}

function FindingCard({ finding, expanded, onToggle }: { finding: StaticReviewFinding; expanded: boolean; onToggle: () => void }) {
  return (
    <div className="rounded-[var(--v-radius-lg)] border border-[var(--v-border)] bg-[var(--v-bg)] p-3">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div className="flex items-center gap-2">
          <Badge tone={SEVERITY_TONE[finding.severity]}>{SEVERITY_LABELS[finding.severity]}</Badge>
          <Badge>{CATEGORY_LABELS[finding.category_key]}</Badge>
          <span className="text-sm font-semibold text-[var(--v-text)]">{finding.title}</span>
          {finding.carried_over && <span className="text-[10px] text-[var(--v-text-muted)]">(منقول من مراجعة سابقة)</span>}
        </div>
        <button type="button" onClick={onToggle} className="text-xs text-[var(--v-primary)] hover:underline">
          {expanded ? "إخفاء التفاصيل" : "عرض التفاصيل"}
        </button>
      </div>
      <p dir="ltr" className="mt-1 text-left text-[11px] text-[var(--v-text-muted)]">
        {finding.file_path}
        {finding.line_start ? `:${finding.line_start}${finding.line_end && finding.line_end !== finding.line_start ? `-${finding.line_end}` : ""}` : ""}
        {finding.function_name ? ` — ${finding.function_name}()` : ""}
        {finding.component_name ? ` — <${finding.component_name}/>` : ""}
      </p>

      {expanded && (
        <div className="mt-3 space-y-2">
          <pre dir="ltr" className="overflow-auto rounded-[var(--v-radius-md)] bg-[var(--v-surface)] p-2 text-left text-[11px] leading-relaxed text-[var(--v-text)] whitespace-pre-wrap">
            {finding.code_snippet}
          </pre>
          <p className="text-xs text-[var(--v-text)]"><span className="font-bold">الوصف:</span> {finding.description}</p>
          <p className="text-xs text-[var(--v-text)]"><span className="font-bold">الأثر:</span> {finding.impact}</p>
          <p className="text-xs text-[var(--v-text)]"><span className="font-bold">السبب الجذري:</span> {finding.root_cause}</p>
          <p className="text-xs text-[var(--v-text)]"><span className="font-bold">الحل المقترح:</span> {finding.recommended_fix}</p>
          {finding.patch_suggestion && (
            <pre dir="ltr" className="overflow-auto rounded-[var(--v-radius-md)] bg-[var(--v-surface)] p-2 text-left text-[11px] leading-relaxed text-[var(--v-text)] whitespace-pre-wrap">
              {finding.patch_suggestion}
            </pre>
          )}
          {finding.validation_steps.length > 0 && (
            <div className="text-xs text-[var(--v-text)]">
              <span className="font-bold">خطوات التحقق:</span>
              <ul className="mt-1 list-disc ps-4">
                {finding.validation_steps.map((step, i) => <li key={i}>{step}</li>)}
              </ul>
            </div>
          )}
          <p className="text-[11px] text-[var(--v-text-muted)]">درجة الثقة: {finding.confidence_score}%</p>
        </div>
      )}
    </div>
  );
}
