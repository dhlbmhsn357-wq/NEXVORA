"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { ShieldCheck, ShieldAlert } from "lucide-react";
import {
  updateProjectStagingUrl,
  runValidationJourney,
  runValidationCategory,
  getValidationScreenshotSignedUrl,
} from "./production-validation-actions";
import { findNextValidationTask, findStuckJourney, findStuckCategory, STALE_LOCK_MS } from "@/lib/production-validation/next-task";
import { canDispatchNow, beginDispatch, endDispatch } from "@/lib/ai/client-dispatch-gate";
import Badge, { type BadgeTone } from "@/components/ui/Badge";
import Button from "@/components/ui/Button";
import EmptyState from "@/components/ui/EmptyState";
import type {
  ValidationCategory,
  ValidationCategoryKey,
  ValidationFinding,
  ValidationJourney,
  ValidationSession,
  AuditFindingSeverity,
} from "@/lib/types/database";
import { useBackgroundRefresh } from "@/lib/ui/use-background-refresh";

const CATEGORY_LABELS: Record<ValidationCategoryKey, string> = {
  journey_execution: "Journey Execution",
  responsive_validation: "Responsive Validation",
  accessibility_validation: "Accessibility Validation",
  visual_regression: "Visual Regression",
};

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

function scoreTone(value: number): string {
  if (value >= 75) return "var(--v-green)";
  if (value >= 50) return "var(--v-amber)";
  return "var(--v-red)";
}

export default function ProductionValidationPanel({
  projectId,
  stagingUrl: initialStagingUrl,
  sessions,
  currentSession,
  journeys,
  categories,
  findings,
}: {
  projectId: string;
  stagingUrl: string;
  sessions: ValidationSession[];
  currentSession: ValidationSession | null;
  journeys: ValidationJourney[];
  categories: ValidationCategory[];
  findings: ValidationFinding[];
}) {
  const router = useRouter();
  const [stagingUrl, setStagingUrl] = useState(initialStagingUrl);
  const [savingUrl, setSavingUrl] = useState(false);
  const [message, setMessage] = useState("");
  const [now, setNow] = useState<number | null>(null);
  const [expandedJourney, setExpandedJourney] = useState<string | null>(null);
  const [expandedFinding, setExpandedFinding] = useState<string | null>(null);
  const [screenshotUrls, setScreenshotUrls] = useState<Record<string, string | null>>({});
  const triggeringRef = useRef(false);

  const isProcessing = currentSession?.status === "generating";

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
    if (!currentSession || currentSession.status !== "generating") return;
    if (triggeringRef.current) return;

    const next = findNextValidationTask(journeys, categories);
    if (next) {
      // البوابة العالمية المشتركة: تسلسل مع باقي لوحات التدقيق.
      if (!canDispatchNow()) return;
      triggeringRef.current = true;
      beginDispatch();
      const promise = next.kind === "journey"
        ? runValidationJourney(projectId, currentSession.id, next.journey.journey_key, false)
        : runValidationCategory(projectId, currentSession.id, next.category.category_key, false);
      promise.finally(() => {
        triggeringRef.current = false;
        endDispatch();
        router.refresh();
      });
      return;
    }

    if (now !== null) {
      const stuckJourney = findStuckJourney(journeys, now, STALE_LOCK_MS);
      if (stuckJourney) {
        if (!canDispatchNow()) return;
        triggeringRef.current = true;
        beginDispatch();
        runValidationJourney(projectId, currentSession.id, stuckJourney.journey_key, false).finally(() => {
          triggeringRef.current = false;
          endDispatch();
          router.refresh();
        });
        return;
      }
      const stuckCategory = findStuckCategory(categories, now, STALE_LOCK_MS);
      if (stuckCategory) {
        if (!canDispatchNow()) return;
        triggeringRef.current = true;
        beginDispatch();
        runValidationCategory(projectId, currentSession.id, stuckCategory.category_key, false).finally(() => {
          triggeringRef.current = false;
          endDispatch();
          router.refresh();
        });
      }
    }
  }, [currentSession, journeys, categories, projectId, router, now]);

  async function saveStagingUrl() {
    setSavingUrl(true);
    const result = await updateProjectStagingUrl(projectId, stagingUrl);
    setSavingUrl(false);
    if (!result.ok) setMessage(result.message ?? "فشل الحفظ.");
    else setMessage("تم حفظ رابط Staging.");
    router.refresh();
  }

  async function retryJourney(journeyKey: string) {
    if (!currentSession) return;
    await runValidationJourney(projectId, currentSession.id, journeyKey, true);
    router.refresh();
  }

  async function retryCategory(categoryKey: ValidationCategoryKey) {
    if (!currentSession) return;
    await runValidationCategory(projectId, currentSession.id, categoryKey, true);
    router.refresh();
  }

  async function toggleFindingScreenshot(finding: ValidationFinding) {
    const willExpand = expandedFinding !== finding.id;
    setExpandedFinding(willExpand ? finding.id : null);
    if (willExpand && finding.screenshot_path && !(finding.id in screenshotUrls)) {
      const url = await getValidationScreenshotSignedUrl(finding.screenshot_path);
      setScreenshotUrls((prev) => ({ ...prev, [finding.id]: url }));
    }
  }

  const criticalCount = useMemo(() => findings.filter((f) => f.severity === "critical").length, [findings]);
  const highCount = useMemo(() => findings.filter((f) => f.severity === "high").length, [findings]);

  return (
    <div className="space-y-4">
      <div className="rounded-[var(--v-radius-lg)] border border-[var(--v-border)] bg-[var(--v-bg)] p-4">
        <p className="mb-1 text-sm font-semibold text-[var(--v-text)]">رابط Staging/Preview</p>
        <p className="mb-3 text-[11px] text-[var(--v-text-muted)]">
          Production Validation بيدوس فعليًا على النسخة دي بمتصفح Chromium حقيقي — ممنوع تحط رابط Production الفعلي هنا.
        </p>
        <div className="flex flex-col gap-2 sm:flex-row">
          <input
            value={stagingUrl}
            onChange={(e) => setStagingUrl(e.target.value)}
            placeholder="https://your-preview-deployment.vercel.app"
            dir="ltr"
            className="flex-1 rounded-[var(--v-radius-md)] border border-[var(--v-border)] bg-[var(--v-bg)] px-3 py-2 text-sm text-[var(--v-text)] outline-none transition-colors focus:border-[var(--v-primary)] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--v-primary)]"
          />
          <Button variant="secondary" onClick={saveStagingUrl} loading={savingUrl}>
            حفظ
          </Button>
        </div>
        {message && <p className="mt-2 text-xs text-[var(--v-text-muted)]">{message}</p>}
      </div>

      {!currentSession && (
        <EmptyState
          icon={<ShieldCheck size={28} />}
          title="لسه مفيش جلسة Production Validation لهذا المشروع"
          description="هتُنشأ تلقائيًا أول ما تبدأ مرحلة Functional Audit (Production Validation) في المراجعة الهندسية، بشرط وجود رابط Staging."
        />
      )}

      {currentSession && (
        <>
          {currentSession.status === "ready" && currentSession.production_ready !== null && (
            <div
              className={`flex items-center gap-3 rounded-[var(--v-radius-lg)] border p-4 ${
                currentSession.production_ready ? "border-[var(--v-green)] bg-[var(--v-green)]/10" : "border-[var(--v-red)] bg-[var(--v-red)]/10"
              }`}
            >
              {currentSession.production_ready ? <ShieldCheck size={22} className="text-[var(--v-green)]" /> : <ShieldAlert size={22} className="text-[var(--v-red)]" />}
              <div>
                <p className="text-sm font-bold text-[var(--v-text)]">{currentSession.production_ready ? "Production Ready" : "Not Ready"}</p>
                <p className="text-xs text-[var(--v-text-muted)]">{currentSession.production_ready_reason}</p>
              </div>
            </div>
          )}

          <div className="flex flex-wrap items-center gap-2 text-xs text-[var(--v-text-muted)]">
            <Badge>جلسة رقم {currentSession.version}</Badge>
            <Badge tone="info">Chromium فقط</Badge>
            <span>
              {currentSession.journeys_passed}/{currentSession.journeys_generated} رحلة نجحت
              {currentSession.journeys_flaky > 0 && ` · ${currentSession.journeys_flaky} Flaky`}
            </span>
            {criticalCount > 0 && <span className="text-[var(--v-red)]">{criticalCount} Critical</span>}
            {highCount > 0 && <span className="text-[var(--v-amber)]">{highCount} High</span>}
            {currentSession.status === "failed" && currentSession.last_error && <span className="text-[var(--v-red)]">{currentSession.last_error}</span>}
          </div>

          <div className="grid grid-cols-1 gap-2 sm:grid-cols-2 lg:grid-cols-4">
            {(Object.keys(CATEGORY_LABELS) as ValidationCategoryKey[]).map((key) => {
              const c = categories.find((x) => x.category_key === key);
              if (!c) return null;
              const stuck = c.status === "generating" && now !== null && now - new Date(c.updated_at).getTime() > STALE_LOCK_MS;
              const canRetry = c.status === "failed" || stuck;
              const tone: BadgeTone = c.status === "ready" ? "success" : stuck || c.status === "failed" ? "danger" : c.status === "generating" ? "warning" : "neutral";
              const label = c.status === "ready" ? "جاهز" : stuck ? "توقّف" : c.status === "generating" ? "جاري…" : c.status === "failed" ? "فشل" : "في الانتظار";
              return (
                <div key={key} className="rounded-[var(--v-radius-md)] border border-[var(--v-border)] bg-[var(--v-bg)] px-3 py-2">
                  <div className="flex items-center justify-between gap-2">
                    <span className="text-xs font-medium text-[var(--v-text)]">{CATEGORY_LABELS[key]}</span>
                    <div className="flex items-center gap-1.5">
                      {c.score !== null && <span className="text-[11px] font-semibold" style={{ color: scoreTone(c.score) }}>{c.score}</span>}
                      <Badge tone={tone}>{label}</Badge>
                    </div>
                  </div>
                  {c.status === "failed" && c.last_error && <p className="mt-1 text-[11px] text-[var(--v-red)]">{c.last_error}</p>}
                  {canRetry && (
                    <button type="button" onClick={() => retryCategory(key)} className="mt-1.5 text-[11px] font-medium text-[var(--v-primary)] hover:underline">
                      إعادة المحاولة
                    </button>
                  )}
                </div>
              );
            })}
          </div>

          <div>
            <p className="mb-2 text-sm font-semibold text-[var(--v-text)]">Journeys ({journeys.length})</p>
            <div className="space-y-2">
              {journeys.map((j) => {
                const stuck = j.status === "running" && j.started_at && now !== null && now - new Date(j.started_at).getTime() > STALE_LOCK_MS;
                const tone: BadgeTone = j.status === "passed" ? "success" : j.status === "failed" || stuck ? "danger" : j.status === "running" ? "warning" : "neutral";
                const label = j.status === "passed" ? "نجحت" : stuck ? "توقّفت" : j.status === "running" ? "جاري…" : j.status === "failed" ? "فشلت" : "في الانتظار";
                return (
                  <div key={j.id} className="rounded-[var(--v-radius-lg)] border border-[var(--v-border)] bg-[var(--v-bg)] p-3">
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <div className="flex items-center gap-2">
                        <span className="text-sm font-semibold text-[var(--v-text)]">{j.name}</span>
                        <Badge tone={tone}>{label}</Badge>
                        {j.is_flaky && <Badge tone="warning">Flaky</Badge>}
                        {j.retry_count > 0 && <span className="text-[11px] text-[var(--v-text-muted)]">({j.retry_count} إعادة محاولة)</span>}
                      </div>
                      <div className="flex items-center gap-2">
                        <button type="button" onClick={() => setExpandedJourney(expandedJourney === j.id ? null : j.id)} className="text-xs text-[var(--v-primary)] hover:underline">
                          {expandedJourney === j.id ? "إخفاء" : "التفاصيل"}
                        </button>
                        {(j.status === "failed" || stuck) && (
                          <Button variant="outline" size="sm" onClick={() => retryJourney(j.journey_key)}>
                            Retry
                          </Button>
                        )}
                      </div>
                    </div>
                    {j.last_error && j.status === "failed" && <p className="mt-1 text-xs text-[var(--v-red)]">{j.last_error}</p>}
                    {expandedJourney === j.id && (
                      <div className="mt-2 space-y-1">
                        <p className="text-[11px] text-[var(--v-text-muted)]">{j.goal}</p>
                        {j.steps.map((step, i) => (
                          <p key={i} className="text-[11px] text-[var(--v-text-secondary)]">
                            {i + 1}. {step.description}
                          </p>
                        ))}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          </div>

          <div>
            <p className="mb-2 text-sm font-semibold text-[var(--v-text)]">Findings ({findings.length})</p>
            <div className="space-y-2">
              {findings.length === 0 && <p className="text-xs text-[var(--v-text-muted)]">مفيش مشاكل حقيقية اتكتشفت.</p>}
              {findings.map((f) => (
                <div key={f.id} className="rounded-[var(--v-radius-lg)] border border-[var(--v-border)] bg-[var(--v-bg)] p-3">
                  <div className="flex flex-wrap items-start justify-between gap-2">
                    <div className="flex items-center gap-2">
                      <Badge tone={SEVERITY_TONE[f.severity]}>{SEVERITY_LABELS[f.severity]}</Badge>
                      <Badge>{CATEGORY_LABELS[f.category_key]}</Badge>
                      <span className="text-sm font-semibold text-[var(--v-text)]">{f.title}</span>
                      {f.occurrence_count > 1 && <span className="text-[10px] text-[var(--v-text-muted)]">(تكرر {f.occurrence_count} مرة)</span>}
                    </div>
                    <button type="button" onClick={() => toggleFindingScreenshot(f)} className="text-xs text-[var(--v-primary)] hover:underline">
                      {expandedFinding === f.id ? "إخفاء التفاصيل" : "عرض التفاصيل"}
                    </button>
                  </div>
                  {f.journey_name && <p className="mt-1 text-[11px] text-[var(--v-text-muted)]">الرحلة: {f.journey_name}</p>}

                  {expandedFinding === f.id && (
                    <div className="mt-3 space-y-2">
                      <p className="text-xs text-[var(--v-text)]"><span className="font-bold">الوصف:</span> {f.description}</p>
                      <p className="text-xs text-[var(--v-text)]"><span className="font-bold">الأثر:</span> {f.impact}</p>
                      <p className="text-xs text-[var(--v-text)]"><span className="font-bold">السبب الجذري:</span> {f.root_cause}</p>
                      <p className="text-xs text-[var(--v-text)]"><span className="font-bold">الحل المقترح:</span> {f.recommended_fix}</p>
                      {f.actual_result && (
                        <p dir="ltr" className="text-left text-[11px] text-[var(--v-text-muted)]">
                          Actual: {f.actual_result}
                        </p>
                      )}
                      {screenshotUrls[f.id] && (
                        // eslint-disable-next-line @next/next/no-img-element
                        <img src={screenshotUrls[f.id] ?? undefined} alt="Screenshot" className="max-w-full rounded-[var(--v-radius-md)] border border-[var(--v-border)]" />
                      )}
                      {f.console_logs.length > 0 && (
                        <pre dir="ltr" className="overflow-auto rounded-[var(--v-radius-md)] bg-[var(--v-surface)] p-2 text-left text-[11px] leading-relaxed text-[var(--v-text)] whitespace-pre-wrap">
                          {f.console_logs.join("\n")}
                        </pre>
                      )}
                      <p className="text-[11px] text-[var(--v-text-muted)]">
                        Browser: {f.browser} · درجة الثقة: {f.confidence_score}%
                      </p>
                    </div>
                  )}
                </div>
              ))}
            </div>
          </div>
        </>
      )}

      {sessions.length > 1 && (
        <div>
          <p className="mb-2 text-sm font-semibold text-[var(--v-text)]">Regression Trend ({sessions.length} جلسة)</p>
          <div className="flex flex-wrap gap-1.5">
            {[...sessions].reverse().map((s) => (
              <span
                key={s.id}
                className="rounded-[var(--v-radius-sm)] border border-[var(--v-border)] px-2 py-1 text-[11px]"
                style={{ color: s.score_summary ? scoreTone(s.score_summary.overall_score) : undefined }}
              >
                v{s.version}: {s.score_summary?.overall_score ?? "-"} {s.production_ready === true ? "✅" : s.production_ready === false ? "⛔" : ""}
              </span>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
