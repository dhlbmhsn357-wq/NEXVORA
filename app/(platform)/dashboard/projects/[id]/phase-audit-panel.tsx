"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import Badge, { type BadgeTone } from "@/components/ui/Badge";
import Input from "@/components/ui/Input";
import Select from "@/components/ui/Select";
import { canDispatchNow, beginDispatch, endDispatch } from "@/lib/ai/client-dispatch-gate";
import type { AuditFindingSeverity } from "@/lib/types/database";
import { useBackgroundRefresh } from "@/lib/ui/use-background-refresh";

/**
 * تسلسل إطلاق المحاور بقى عالميًا عبر كل لوحات التدقيق (مش لكل لوحة
 * لوحدها) — البوابة المشتركة lib/ai/client-dispatch-gate بتضمن إطلاق
 * واحد كل GLOBAL_MIN_DISPATCH_INTERVAL_MS في المشروع كله، فحتى لو 7
 * محركات تدقيق شغّالين في نفس الوقت مايضربوش نافذة حصة Gemini بالدقيقة
 * (RPM) دفعة واحدة. من غير التسلسل ده كانت كل لوحة تطلق مستقلة =
 * نداءات Gemini متوازية تستنفد الحصة المشتركة فورًا.
 */

export interface PhaseAuditReviewLite {
  id: string;
  version: number;
  status: string;
  last_error: string | null;
  is_incremental: boolean;
  files_analyzed_count: number;
  files_reused_count: number;
  created_at: string;
}

export interface PhaseAuditCategoryLite<C extends string> {
  category_key: C;
  status: string;
  score: number | null;
  summary: string;
  last_error: string | null;
  updated_at: string;
}

export interface PhaseAuditFindingLite<C extends string> {
  id: string;
  category_key: C;
  finding_key: string;
  severity: AuditFindingSeverity;
  title: string;
  description: string;
  impact: string;
  file_path: string;
  component_name: string | null;
  function_name: string | null;
  line_start: number | null;
  line_end: number | null;
  code_snippet: string;
  root_cause: string;
  attack_scenario: string;
  recommended_fix: string;
  patch_suggestion: string;
  validation_steps: string[];
  reference_links: string[];
  confidence_score: number;
  carried_over: boolean;
}

export interface PhaseAuditFileLite {
  id: string;
  file_path: string;
  file_status: string;
  findings_count: number;
}

export interface PhaseAuditCompareResult<C extends string> {
  ok: boolean;
  message?: string;
  comparison?: {
    added: PhaseAuditFindingLite<C>[];
    fixed: PhaseAuditFindingLite<C>[];
    remaining: PhaseAuditFindingLite<C>[];
    scoreDiff: number;
  };
  oldScore?: number;
  newScore?: number;
}

const SEVERITY_LABELS: Record<AuditFindingSeverity, string> = {
  critical: "Critical",
  high: "High",
  medium: "Medium",
  low: "Low",
  info: "Info",
};

const SEVERITY_TONE: Record<AuditFindingSeverity, BadgeTone> = {
  critical: "danger",
  high: "warning",
  medium: "info",
  low: "neutral",
  info: "neutral",
};

const SEVERITY_ORDER: AuditFindingSeverity[] = ["critical", "high", "medium", "low", "info"];

/** لون شريط خطورة الـ Finding (accent) — يوحّد المسح البصري عبر كل فئات المراجعة. */
const SEVERITY_ACCENT: Record<AuditFindingSeverity, string> = {
  critical: "var(--v-red)",
  high: "var(--v-amber)",
  medium: "var(--v-info)",
  low: "var(--v-border-strong)",
  info: "var(--v-border-strong)",
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

interface PhaseAuditPanelProps<C extends string> {
  projectId: string;
  categoryKeys: readonly C[];
  categoryLabels: Record<C, string>;
  scoreLabels: Record<string, string>;
  overallScoreKey: string;
  reviews: (PhaseAuditReviewLite & { scoreSummary: Record<string, number> | null })[];
  currentReview: (PhaseAuditReviewLite & { scoreSummary: Record<string, number> | null }) | null;
  categories: PhaseAuditCategoryLite<C>[];
  findings: PhaseAuditFindingLite<C>[];
  files: PhaseAuditFileLite[];
  staleLockMs: number;
  runCategoryAction: (projectId: string, reviewId: string, categoryKey: C, isRetry: boolean) => Promise<{ status: string }>;
  compareAction: (oldReviewId: string, newReviewId: string) => Promise<PhaseAuditCompareResult<C>>;
}

/**
 * لوحة تدقيق عامة بالمحور (Category-Based Audit) — مشتركة بين Security
 * Audit Engine وDatabase Integrity Engine (Phase 12.3). نفس شكل UI بالضبط
 * (بطاقات محاور، Score Dashboard، File Explorer، Issue Explorer، مقارنة
 * نسخ) — بدل ما يتكرر نفس الـ ~300 سطر مرتين لمحركين متطابقين هيكليًا.
 */
export default function PhaseAuditPanel<C extends string>({
  projectId,
  categoryKeys,
  categoryLabels,
  scoreLabels,
  overallScoreKey,
  reviews,
  currentReview,
  categories,
  findings,
  files,
  staleLockMs,
  runCategoryAction,
  compareAction,
}: PhaseAuditPanelProps<C>) {
  const router = useRouter();
  const [retrying, setRetrying] = useState<C | null>(null);
  const [now, setNow] = useState<number | null>(null);
  const triggeringRef = useRef(false);

  const [search, setSearch] = useState("");
  const [severityFilter, setSeverityFilter] = useState<string>("all");
  const [categoryFilter, setCategoryFilter] = useState<string>("all");
  const [sortBy, setSortBy] = useState<"severity" | "file">("severity");
  const [expandedFinding, setExpandedFinding] = useState<string | null>(null);

  const [compareOldId, setCompareOldId] = useState("");
  const [compareNewId, setCompareNewId] = useState("");
  const [compareResult, setCompareResult] = useState<PhaseAuditCompareResult<C> | null>(null);
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

  useEffect(() => {
    if (!currentReview || currentReview.status !== "generating" || categories.length === 0) return;
    if (triggeringRef.current) return;

    const nextPending = categories.find((c) => c.status === "pending" && !categories.some((x) => x.status === "generating"));
    if (nextPending) {
      // البوابة العالمية: تسلسل عبر كل لوحات التدقيق (مش لكل لوحة لوحدها).
      if (!canDispatchNow()) return;
      triggeringRef.current = true;
      beginDispatch();
      runCategoryAction(projectId, currentReview.id, nextPending.category_key, false).finally(() => {
        triggeringRef.current = false;
        endDispatch();
        router.refresh();
      });
      return;
    }

    const stuck = categories.find((c) => c.status === "generating" && now !== null && now - new Date(c.updated_at).getTime() > staleLockMs);
    if (!stuck) return;
    if (!canDispatchNow()) return;
    triggeringRef.current = true;
    beginDispatch();
    runCategoryAction(projectId, currentReview.id, stuck.category_key, false).finally(() => {
      triggeringRef.current = false;
      endDispatch();
      router.refresh();
    });
  }, [currentReview, categories, projectId, router, now, staleLockMs, runCategoryAction]);

  async function retryCategory(categoryKey: C) {
    if (!currentReview) return;
    setRetrying(categoryKey);
    await runCategoryAction(projectId, currentReview.id, categoryKey, true);
    setRetrying(null);
    router.refresh();
  }

  async function runCompare() {
    if (!compareOldId || !compareNewId || compareOldId === compareNewId) return;
    setComparing(true);
    setCompareResult(await compareAction(compareOldId, compareNewId));
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
      sortBy === "severity" ? SEVERITY_ORDER.indexOf(a.severity) - SEVERITY_ORDER.indexOf(b.severity) : a.file_path.localeCompare(b.file_path)
    );
  }, [findings, severityFilter, categoryFilter, search, sortBy]);

  if (!currentReview) {
    return <p className="text-xs text-[var(--v-text-muted)]">لسه مفيش مراجعة لهذا المحور — هتُنشأ تلقائيًا أول ما تبدأ هذه المرحلة.</p>;
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-2 text-xs text-[var(--v-text-muted)]">
        <Badge>مراجعة رقم {currentReview.version}</Badge>
        {currentReview.is_incremental && <Badge tone="info">تحليل تدريجي (Incremental)</Badge>}
        <span>
          {currentReview.files_analyzed_count} ملف اتحلل حديثًا · {currentReview.files_reused_count} Finding منقول من مراجعة سابقة
        </span>
        {currentReview.status === "failed" && currentReview.last_error && <span className="text-[var(--v-red)]">{currentReview.last_error}</span>}
      </div>

      <div className="grid grid-cols-1 gap-2 sm:grid-cols-2 lg:grid-cols-4">
        {categoryKeys.map((key) => {
          const c = categories.find((x) => x.category_key === key);
          if (!c) return null;
          const stuck = c.status === "generating" && now !== null && now - new Date(c.updated_at).getTime() > staleLockMs;
          const canRetry = c.status === "failed" || stuck;
          const tone: BadgeTone = c.status === "ready" ? "success" : stuck || c.status === "failed" ? "danger" : c.status === "generating" ? "warning" : "neutral";
          const label = c.status === "ready" ? "جاهز" : stuck ? "توقّف" : c.status === "generating" ? "جاري…" : c.status === "failed" ? "فشل" : "في الانتظار";
          return (
            <div key={key} className="rounded-[var(--v-radius-md)] border border-[var(--v-border)] bg-[var(--v-bg)] px-3 py-2">
              <div className="flex items-center justify-between gap-2">
                <span className="text-xs font-medium text-[var(--v-text)]">{categoryLabels[key]}</span>
                <div className="flex items-center gap-1.5">
                  {c.score !== null && <span className="text-[11px] font-semibold" style={{ color: scoreTone(c.score) }}>{c.score}</span>}
                  <Badge tone={tone}>{label}</Badge>
                </div>
              </div>
              {c.status === "failed" && c.last_error && <p className="mt-1 text-[11px] text-[var(--v-red)]">{c.last_error}</p>}
              {stuck && <p className="mt-1 text-[11px] text-[var(--v-red)]">توقّف من غير سبب واضح — جرّب إعادة المحاولة.</p>}
              {canRetry && (
                <button type="button" onClick={() => retryCategory(key)} disabled={retrying === key} className="mt-1.5 text-[11px] font-medium text-[var(--v-primary)] hover:underline disabled:opacity-50">
                  {retrying === key ? "جاري إعادة المحاولة…" : "إعادة المحاولة"}
                </button>
              )}
            </div>
          );
        })}
      </div>

      {currentReview.status === "ready" && currentReview.scoreSummary && (
        <>
          <div>
            <p className="mb-2 text-sm font-semibold text-[var(--v-text)]">Score Summary</p>
            <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-5">
              {Object.entries(currentReview.scoreSummary).map(([key, value]) => (
                <div
                  key={key}
                  className={`rounded-[var(--v-radius-lg)] border p-3 text-center ${key === overallScoreKey ? "border-[var(--v-primary)]" : "border-[var(--v-border)]"} bg-[var(--v-bg)]`}
                >
                  <p className="font-display text-2xl" style={{ color: scoreTone(value) }}>{value}</p>
                  <p className="mt-1 text-[11px] text-[var(--v-text-muted)]">{scoreLabels[key] ?? key}</p>
                </div>
              ))}
            </div>
          </div>

          <FileExplorer files={files} />

          <div>
            <p className="mb-2 text-sm font-semibold text-[var(--v-text)]">
              Issue Explorer ({filteredFindings.length} من {findings.length})
            </p>
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
                {categoryKeys.map((c) => (
                  <option key={c} value={c}>{categoryLabels[c]}</option>
                ))}
              </Select>
              <Select value={sortBy} onChange={(e) => setSortBy(e.target.value as "severity" | "file")}>
                <option value="severity">ترتيب حسب الخطورة</option>
                <option value="file">ترتيب حسب الملف</option>
              </Select>
            </div>
            <div className="space-y-2">
              {filteredFindings.length === 0 && <p className="text-xs text-[var(--v-text-muted)]">مفيش Findings مطابقة للفلاتر الحالية.</p>}
              {filteredFindings.map((f) => (
                <FindingCard
                  key={f.id}
                  finding={f}
                  categoryLabel={categoryLabels[f.category_key]}
                  expanded={expandedFinding === f.id}
                  onToggle={() => setExpandedFinding(expandedFinding === f.id ? null : f.id)}
                />
              ))}
            </div>
          </div>
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
          {compareResult?.ok && compareResult.comparison && (
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
        <p className="mb-2 text-sm font-semibold text-[var(--v-text)]">تاريخ المراجعات ({reviews.length})</p>
        <div className="space-y-1.5">
          {reviews.map((r) => (
            <div key={r.id} className="flex items-center justify-between rounded-[var(--v-radius-md)] border border-[var(--v-border)] bg-[var(--v-bg)] px-3 py-2 text-xs">
              <span className="text-[var(--v-text)]">مراجعة رقم {r.version}</span>
              <Badge tone={r.status === "ready" ? "success" : r.status === "failed" ? "danger" : "warning"}>{r.status}</Badge>
              {r.scoreSummary && <span className="text-[var(--v-text-muted)]">{r.scoreSummary[overallScoreKey]}/100</span>}
              <span className="text-[var(--v-text-muted)]">{new Date(r.created_at).toLocaleString("ar-EG")}</span>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

function FileExplorer({ files }: { files: PhaseAuditFileLite[] }) {
  const [search, setSearch] = useState("");
  const filtered = files.filter((f) => f.file_path.toLowerCase().includes(search.trim().toLowerCase()));

  return (
    <div>
      <p className="mb-2 text-sm font-semibold text-[var(--v-text)]">File Explorer ({files.length})</p>
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
              <Badge tone={f.file_status === "added" ? "success" : f.file_status === "modified" ? "info" : "neutral"}>{FILE_STATUS_LABELS[f.file_status]}</Badge>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

function FindingCard<C extends string>({
  finding,
  categoryLabel,
  expanded,
  onToggle,
}: {
  finding: PhaseAuditFindingLite<C>;
  categoryLabel: string;
  expanded: boolean;
  onToggle: () => void;
}) {
  return (
    <div
      className="rounded-[var(--v-radius-lg)] border border-[var(--v-border)] bg-[var(--v-bg)] p-3 transition-shadow hover:shadow-[var(--v-shadow-sm)]"
      style={{ borderRightWidth: 3, borderRightColor: SEVERITY_ACCENT[finding.severity] }}
    >
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div className="flex items-center gap-2">
          <Badge tone={SEVERITY_TONE[finding.severity]}>{SEVERITY_LABELS[finding.severity]}</Badge>
          <Badge>{categoryLabel}</Badge>
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
          {finding.attack_scenario && (
            <p className="text-xs text-[var(--v-text)]"><span className="font-bold">سيناريو الاستغلال/الفشل:</span> {finding.attack_scenario}</p>
          )}
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
          {finding.reference_links.length > 0 && (
            <div dir="ltr" className="text-left text-[11px] text-[var(--v-text-muted)]">
              References: {finding.reference_links.join(", ")}
            </div>
          )}
          <p className="text-[11px] text-[var(--v-text-muted)]">درجة الثقة: {finding.confidence_score}%</p>
        </div>
      )}
    </div>
  );
}
