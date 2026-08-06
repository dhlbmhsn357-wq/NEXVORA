"use client";

import { useEffect, useRef, useState, type ReactNode } from "react";
import { useRouter } from "next/navigation";
import { ClipboardCheck } from "lucide-react";
import {
  cancelEngineeringReview,
  createAndStartEngineeringReview,
  supersedeAndStartEngineeringReview,
  runEngineeringQAStage,
} from "./engineering-qa-actions";
import { findNextStageToRun, calculateReviewProgress, estimateRemainingSeconds } from "@/lib/engineering-qa/next-stage";
import { CONTINUABLE_STAGE_KEYS } from "@/lib/engineering-qa/continuable-stages";
import StaticReviewPanel from "./static-review-panel";
import PhaseAuditPanel from "./phase-audit-panel";
import SecurityAuditDashboard from "./security-audit-dashboard";
import ProductionValidationPanel from "./production-validation-panel";
import { runSecurityReviewCategory, compareSecurityReviewVersions } from "./security-review-actions";
import { runDatabaseReviewCategory, compareDatabaseReviewVersions } from "./database-review-actions";
import { runArchitectureReviewCategory, compareArchitectureReviewVersions } from "./architecture-review-actions";
import { runCodeQualityReviewCategory, compareCodeQualityReviewVersions } from "./code-quality-review-actions";
import { runPerformanceReviewCategory, comparePerformanceReviewVersions } from "./performance-review-actions";
import { runPrdComplianceReviewCategory, comparePrdComplianceReviewVersions } from "./prd-compliance-review-actions";
import { STALE_LOCK_MS as SECURITY_STALE_LOCK_MS } from "@/lib/security-review/next-category";
import { STALE_LOCK_MS as DATABASE_STALE_LOCK_MS } from "@/lib/database-review/next-category";
import { STALE_LOCK_MS as ARCHITECTURE_STALE_LOCK_MS } from "@/lib/architecture-review/next-category";
import { STALE_LOCK_MS as CODE_QUALITY_STALE_LOCK_MS } from "@/lib/code-quality-review/next-category";
import { STALE_LOCK_MS as PERFORMANCE_STALE_LOCK_MS } from "@/lib/performance-review/next-category";
import { STALE_LOCK_MS as PRD_COMPLIANCE_STALE_LOCK_MS } from "@/lib/prd-compliance-review/next-category";
import Badge, { type BadgeTone } from "@/components/ui/Badge";
import AiBadge from "@/components/ui/AiBadge";
import Button from "@/components/ui/Button";
import EmptyState from "@/components/ui/EmptyState";
import Modal from "@/components/ui/Modal";
import {
  SECURITY_REVIEW_CATEGORY_KEYS,
  DATABASE_REVIEW_CATEGORY_KEYS,
  type EngineeringCertificate,
  type EngineeringReview,
  type EngineeringReviewEvent,
  type EngineeringReviewStage,
  type EngineeringStageResult,
  type StaticReview,
  type StaticReviewCategory,
  type StaticReviewFinding,
  type StaticReviewFile,
  type SecurityReview,
  type SecurityReviewCategory,
  type SecurityReviewFinding,
  type SecurityReviewFile,
  type SecurityReviewCategoryKey,
  type DatabaseReview,
  type DatabaseReviewCategory,
  type DatabaseReviewFinding,
  type DatabaseReviewFile,
  type DatabaseReviewCategoryKey,
  ARCHITECTURE_REVIEW_CATEGORY_KEYS,
  type ArchitectureReview,
  type ArchitectureReviewCategory,
  type ArchitectureReviewFinding,
  type ArchitectureReviewFile,
  type ArchitectureReviewCategoryKey,
  CODE_QUALITY_REVIEW_CATEGORY_KEYS,
  type CodeQualityReview,
  type CodeQualityReviewCategory,
  type CodeQualityReviewFinding,
  type CodeQualityReviewFile,
  type CodeQualityReviewCategoryKey,
  PERFORMANCE_REVIEW_CATEGORY_KEYS,
  type PerformanceReview,
  type PerformanceReviewCategory,
  type PerformanceReviewFinding,
  type PerformanceReviewFile,
  type PerformanceReviewCategoryKey,
  PRD_COMPLIANCE_REVIEW_CATEGORY_KEYS,
  type PrdComplianceReview,
  type PrdComplianceReviewCategory,
  type PrdComplianceReviewFinding,
  type PrdComplianceReviewFile,
  type PrdComplianceReviewCategoryKey,
  type ValidationSession,
  type ValidationJourney,
  type ValidationCategory,
  type ValidationFinding,
} from "@/lib/types/database";

export interface ProductionValidationState {
  stagingUrl: string;
  sessions: ValidationSession[];
  currentSession: ValidationSession | null;
  journeys: ValidationJourney[];
  categories: ValidationCategory[];
  findings: ValidationFinding[];
}

export interface StaticReviewState {
  reviews: StaticReview[];
  currentReview: StaticReview | null;
  categories: StaticReviewCategory[];
  findings: StaticReviewFinding[];
  files: StaticReviewFile[];
}

export interface SecurityReviewState {
  reviews: SecurityReview[];
  currentReview: SecurityReview | null;
  categories: SecurityReviewCategory[];
  findings: SecurityReviewFinding[];
  files: SecurityReviewFile[];
}

export interface DatabaseReviewState {
  reviews: DatabaseReview[];
  currentReview: DatabaseReview | null;
  categories: DatabaseReviewCategory[];
  findings: DatabaseReviewFinding[];
  files: DatabaseReviewFile[];
}

export interface ArchitectureReviewState {
  reviews: ArchitectureReview[];
  currentReview: ArchitectureReview | null;
  categories: ArchitectureReviewCategory[];
  findings: ArchitectureReviewFinding[];
  files: ArchitectureReviewFile[];
}

export interface CodeQualityReviewState {
  reviews: CodeQualityReview[];
  currentReview: CodeQualityReview | null;
  categories: CodeQualityReviewCategory[];
  findings: CodeQualityReviewFinding[];
  files: CodeQualityReviewFile[];
}

export interface PerformanceReviewState {
  reviews: PerformanceReview[];
  currentReview: PerformanceReview | null;
  categories: PerformanceReviewCategory[];
  findings: PerformanceReviewFinding[];
  files: PerformanceReviewFile[];
}

export interface PrdComplianceReviewState {
  reviews: PrdComplianceReview[];
  currentReview: PrdComplianceReview | null;
  categories: PrdComplianceReviewCategory[];
  findings: PrdComplianceReviewFinding[];
  files: PrdComplianceReviewFile[];
}

const SECURITY_CATEGORY_LABELS: Record<SecurityReviewCategoryKey, string> = {
  authentication: "Authentication",
  authorization: "Authorization",
  rls: "Row Level Security",
  api_security: "API Security",
  input_validation: "Input Validation",
  secrets: "Secrets",
  environment: "Environment",
};

const SECURITY_SCORE_LABELS: Record<string, string> = {
  authentication: "Authentication",
  authorization: "Authorization",
  rls: "RLS",
  api_security: "API Security",
  secrets_management: "Secrets Management",
  configuration: "Configuration",
  overall_security_score: "Overall Security Score",
};

const DATABASE_CATEGORY_LABELS: Record<DatabaseReviewCategoryKey, string> = {
  database_structure: "Database Structure",
  query: "Query",
  migration: "Migration",
  data_integrity: "Data Integrity",
  storage: "Storage",
  logging: "Logging",
};

const DATABASE_SCORE_LABELS: Record<string, string> = {
  database_integrity: "Database Integrity",
  query_quality: "Query Quality",
  storage_security: "Storage Security",
  logging: "Logging",
  overall_database_score: "Overall Database Score",
};

const ARCHITECTURE_CATEGORY_LABELS: Record<ArchitectureReviewCategoryKey, string> = {
  layering: "Layering",
  coupling: "Coupling",
  scalability: "Scalability",
  module_boundaries: "Module Boundaries",
  dependency_management: "Dependency Management",
  api_design: "API Design",
};

const ARCHITECTURE_SCORE_LABELS: Record<string, string> = {
  layering: "Layering",
  coupling: "Coupling",
  scalability: "Scalability",
  module_boundaries: "Module Boundaries",
  dependency_management: "Dependency Management",
  api_design: "API Design",
  overall_architecture_score: "Overall Architecture Score",
};

const CODE_QUALITY_CATEGORY_LABELS: Record<CodeQualityReviewCategoryKey, string> = {
  readability: "Readability",
  duplication: "Duplication",
  error_handling: "Error Handling",
  testing_coverage: "Testing Coverage",
  naming_consistency: "Naming Consistency",
  complexity: "Complexity",
};

const CODE_QUALITY_SCORE_LABELS: Record<string, string> = {
  readability: "Readability",
  duplication: "Duplication",
  error_handling: "Error Handling",
  testing_coverage: "Testing Coverage",
  naming_consistency: "Naming Consistency",
  complexity: "Complexity",
  overall_code_quality_score: "Overall Code Quality Score",
};

const PERFORMANCE_CATEGORY_LABELS: Record<PerformanceReviewCategoryKey, string> = {
  query_performance: "Query Performance",
  bundle_size: "Bundle Size",
  caching: "Caching",
  render_performance: "Render Performance",
  n_plus_one: "N+1 Patterns",
  async_patterns: "Async Patterns",
};

const PERFORMANCE_SCORE_LABELS: Record<string, string> = {
  query_performance: "Query Performance",
  bundle_size: "Bundle Size",
  caching: "Caching",
  render_performance: "Render Performance",
  n_plus_one: "N+1 Patterns",
  async_patterns: "Async Patterns",
  overall_performance_score: "Overall Performance Score",
};

const PRD_COMPLIANCE_CATEGORY_LABELS: Record<PrdComplianceReviewCategoryKey, string> = {
  functional_requirements_coverage: "Functional Requirements Coverage",
  non_functional_requirements: "Non-Functional Requirements",
  scope_adherence: "Scope Adherence",
  acceptance_criteria: "Acceptance Criteria",
};

const PRD_COMPLIANCE_SCORE_LABELS: Record<string, string> = {
  functional_requirements_coverage: "Functional Requirements Coverage",
  non_functional_requirements: "Non-Functional Requirements",
  scope_adherence: "Scope Adherence",
  acceptance_criteria: "Acceptance Criteria",
  overall_prd_compliance_score: "Overall PRD Compliance Score",
};

const REVIEW_STATUS_LABELS: Record<string, string> = {
  pending: "في الانتظار",
  queued: "في قائمة التشغيل",
  running: "جاري التنفيذ",
  completed: "مكتملة",
  failed: "فشلت",
  cancelling: "جاري الإلغاء…",
  cancelled: "أُلغيت",
  needs_review: "محتاجة مراجعة",
  certified: "معتمدة (Certified)",
  rejected: "مرفوضة",
};

const REVIEW_STATUS_TONE: Record<string, BadgeTone> = {
  pending: "neutral",
  queued: "info",
  running: "warning",
  completed: "success",
  failed: "danger",
  cancelling: "warning",
  cancelled: "neutral",
  needs_review: "warning",
  certified: "success",
  rejected: "danger",
};

const STAGE_STATUS_LABELS: Record<string, string> = {
  pending: "في الانتظار",
  running: "جاري التنفيذ…",
  completed: "مكتملة",
  failed: "فشلت",
  cancelled: "أُلغيت",
};

const EVENT_LABELS: Record<string, string> = {
  review_created: "تم إنشاء المراجعة",
  review_started: "بدأ تنفيذ المراجعة",
  stage_started: "بدأت مرحلة",
  stage_finished: "انتهت مرحلة",
  stage_failed: "فشلت مرحلة",
  stage_retried: "أُعيدت محاولة مرحلة",
  stage_cancelled: "أُلغيت مرحلة",
  review_completed: "اكتملت المراجعة",
  review_cancelled: "أُلغيت المراجعة",
  review_superseded: "استُبدلت بمراجعة أحدث",
  certificate_generated: "تم إصدار شهادة",
};

/** يحوّل score_summary المُصمَّم بحقول محدّدة (SecurityScoreSummary/DatabaseScoreSummary) لشكل Record عام تقدر PhaseAuditPanel تتعامل معاه بدون ما تعرف شكل كل محرك تحديدًا. */
function withScoreSummary<T extends { score_summary: unknown }>(review: T): T & { scoreSummary: Record<string, number> | null } {
  return { ...review, scoreSummary: (review.score_summary as Record<string, number> | null) ?? null };
}

function formatDuration(seconds: number | null): string {
  if (seconds === null) return "—";
  if (seconds < 60) return `${seconds} ثانية`;
  const totalMinutes = Math.floor(seconds / 60);
  if (totalMinutes < 60) return `${totalMinutes} دقيقة`;
  const hours = Math.floor(totalMinutes / 60);
  const minutes = totalMinutes % 60;
  return minutes > 0 ? `${hours} ساعة و${minutes} دقيقة` : `${hours} ساعة`;
}

/**
 * لوحة Engineering QA — بنية تحتية بس (Phase 12.1)، كل المراحل التسعة
 * لسه Placeholder (مفيش منطق فحص فعلي). Props بتوصل جاهزة من
 * page.tsx (Server Component) — نفس نمط باقي لوحات المشروع.
 */
export default function EngineeringQAPanel({
  projectId,
  reviews,
  currentReview,
  stages,
  results,
  certificate,
  events,
  staticReview,
  securityReview,
  databaseReview,
  architectureReview,
  codeQualityReview,
  performanceReview,
  prdComplianceReview,
  productionValidation,
}: {
  projectId: string;
  reviews: EngineeringReview[];
  currentReview: EngineeringReview | null;
  stages: EngineeringReviewStage[];
  results: EngineeringStageResult[];
  certificate: EngineeringCertificate | null;
  events: EngineeringReviewEvent[];
  staticReview: StaticReviewState;
  securityReview: SecurityReviewState;
  databaseReview: DatabaseReviewState;
  architectureReview: ArchitectureReviewState;
  codeQualityReview: CodeQualityReviewState;
  performanceReview: PerformanceReviewState;
  prdComplianceReview: PrdComplianceReviewState;
  productionValidation: ProductionValidationState;
}) {
  const router = useRouter();
  const [repoUrl, setRepoUrl] = useState(currentReview?.repository_url ?? "");
  const [repoRef, setRepoRef] = useState(currentReview?.repository_branch || "main");
  const [submitting, setSubmitting] = useState(false);
  const [message, setMessage] = useState("");
  const [confirmSupersedeOpen, setConfirmSupersedeOpen] = useState(false);
  const triggeringRef = useRef(false);
  const lastRefreshAtRef = useRef(0);
  const rootRef = useRef<HTMLDivElement>(null);

  const isActive = currentReview?.review_status === "queued" || currentReview?.review_status === "running";
  const displayMessage = message || (currentReview?.review_status === "failed" ? currentReview.last_error ?? "" : "");

  // router.refresh() بيعيد تحميل صفحة المشروع كاملة (كل التبويبات التانية
  // معاها — Brain/PRD/Prototype/Handoff/...) مش بس Engineering QA، فهي
  // عملية تقيلة نسبيًا. المصدرين اللي بيستدعوها (البولينج الدوري +
  // الـ auto-chain بعد كل مرحلة) ممكن يتزامنوا ويعملوا نداءين فوق بعض،
  // فبنمرّ عبر الدالة دي عشان نضمن فاصل زمني أدنى بينهم ونقلل حمل السيرفر
  // وفرص الأخطاء العابرة الناتجة عن طلبات متراكبة.
  const MIN_REFRESH_INTERVAL_MS = 4000;
  function scheduleRefresh() {
    const now = Date.now();
    if (now - lastRefreshAtRef.current < MIN_REFRESH_INTERVAL_MS) return;
    lastRefreshAtRef.current = now;
    router.refresh();
  }

  useEffect(() => {
    if (!isActive) return;
    // 8 ثواني بدل 4 — المراحل بتاخد عشرات الثواني لدقايق، فمفيش داعي
    // لتحديث الصفحة كاملة كل 4 ثواني. بنوقف البولينج لو تبويب المتصفح
    // نفسه في الخلفية، أو لو تبويب "Engineering QA" ده نفسه مش التبويب
    // الظاهر حاليًا جوه صفحة المشروع (Tabs.tsx بيسيب كل التبويبات
    // Mounted جوّه DOM ومخفية بـ hidden بس، مش بيشيلها — فمن غير الفحص ده
    // البولينج كان هيفضل شغّال حتى لو المستخدم فاتح تبويب تاني تمامًا).
    const id = setInterval(() => {
      if (document.visibilityState === "hidden") return;
      if (rootRef.current && rootRef.current.offsetParent === null) return;
      scheduleRefresh();
    }, 8000);
    return () => clearInterval(id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isActive, router]);

  // Auto-chain: يشغّل المرحلة التالية تلقائيًا لما المراجعة "queued" أو
  // "running" — بالتسلسل عمدًا، ومنطق findNextStageToRun بيتوقف تلقائيًا
  // عند أول مرحلة فشلت (Retry يدوي مطلوب) بدل ما يكمّل زي إنه نجح.
  useEffect(() => {
    if (!currentReview || !isActive || stages.length === 0) return;
    if (triggeringRef.current) return;

    const next = findNextStageToRun(stages);
    if (next) {
      triggeringRef.current = true;
      runEngineeringQAStage(projectId, currentReview.id, next.stage_key, false).finally(() => {
        triggeringRef.current = false;
        scheduleRefresh();
      });
      return;
    }

    // مرحلة Continuable (زي static_code_audit) شغّالة حاليًا — مش "عالقة"،
    // ده انتظار طبيعي لمحرك فرعي مستقل (Static Review Engine) لسه بيشتغل.
    // findNextStageToRun فوق بيرجّع null لأي مرحلة "running"، فمن غيرها
    // كانت المرحلة دي مش هتكمّل أبدًا — لازم نعاود استدعاء run() بنفسنا.
    const runningContinuable = stages.find((s) => s.stage_status === "running" && CONTINUABLE_STAGE_KEYS.includes(s.stage_key));
    if (!runningContinuable) return;
    triggeringRef.current = true;
    runEngineeringQAStage(projectId, currentReview.id, runningContinuable.stage_key, false).finally(() => {
      triggeringRef.current = false;
      scheduleRefresh();
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [currentReview, isActive, stages, projectId, router]);

  async function handleStart() {
    if (!repoUrl.trim()) {
      setMessage("لازم تدخل رابط الـ Repository أولاً.");
      return;
    }
    // فيه مراجعة نشطة؟ اطلب تأكيد الاستبدال (Cancel & Supersede) بدل ما نرفض.
    if (isActive) {
      setConfirmSupersedeOpen(true);
      return;
    }
    setSubmitting(true);
    setMessage("");
    const result = await createAndStartEngineeringReview(projectId, repoUrl.trim(), repoRef.trim());
    setSubmitting(false);
    if (!result.ok) setMessage(result.message);
    router.refresh();
  }

  async function confirmSupersede() {
    setConfirmSupersedeOpen(false);
    setSubmitting(true);
    // رسائل انتقالية تفاؤلية: إلغاء الحالية ← بدء الجديدة
    setMessage("جاري إلغاء المراجعة الحالية…");
    const result = await supersedeAndStartEngineeringReview(projectId, repoUrl.trim(), repoRef.trim());
    setSubmitting(false);
    if (!result.ok) {
      setMessage(result.message);
    } else {
      setMessage("");
    }
    router.refresh();
  }

  async function handleCancel() {
    if (!currentReview) return;
    if (!window.confirm("متأكد إنك عايز تلغي المراجعة الحالية؟")) return;
    await cancelEngineeringReview(projectId, currentReview.id);
    router.refresh();
  }

  async function handleRetryStage(stageKey: string) {
    if (!currentReview) return;
    await runEngineeringQAStage(projectId, currentReview.id, stageKey, true);
    router.refresh();
  }

  const progress = calculateReviewProgress(stages);
  const etaSeconds = currentReview ? estimateRemainingSeconds(stages, progress.remainingStages) : null;

  return (
    <div ref={rootRef}>
      <div className="mb-4 rounded-[var(--v-radius-lg)] border border-[var(--v-border)] bg-[var(--v-bg)] p-4">
        <p className="mb-1 text-sm font-semibold text-[var(--v-text)]">تشغيل مراجعة هندسية جديدة</p>
        <p className="mb-3 text-[11px] text-[var(--v-text-muted)]">
          البنية التحتية لنظام Engineering QA — بوابة الاعتماد الأخيرة قبل اعتبار أي مشروع جاهزًا للإنتاج. مراحل
          الفحص الفعلية (Static/Security/Performance/...) هتتضاف في مراحل قادمة.
        </p>
        <div className="flex flex-col gap-2 sm:flex-row">
          <input
            value={repoUrl}
            onChange={(e) => setRepoUrl(e.target.value)}
            placeholder="https://github.com/owner/repo"
            dir="ltr"
            className="flex-1 rounded-[var(--v-radius-md)] border border-[var(--v-border)] bg-[var(--v-bg)] px-3 py-2 text-sm text-[var(--v-text)] outline-none transition-colors focus:border-[var(--v-primary)] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--v-primary)]"
          />
          <input
            value={repoRef}
            onChange={(e) => setRepoRef(e.target.value)}
            placeholder="main"
            dir="ltr"
            className="w-full rounded-[var(--v-radius-md)] border border-[var(--v-border)] bg-[var(--v-bg)] px-3 py-2 text-sm text-[var(--v-text)] outline-none transition-colors focus:border-[var(--v-primary)] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--v-primary)] sm:w-32"
          />
          <Button variant="primary" onClick={handleStart} loading={submitting}>
            Start New Review
          </Button>
        </div>
        {isActive && (
          <p className="mt-2 text-xs text-[var(--v-amber)]">
            فيه مراجعة نشطة بالفعل (رقم {currentReview?.review_number}) — لو بدأت مراجعة جديدة، هيتم إلغاء الحالية فورًا والبدء من الأول.
          </p>
        )}
        {displayMessage && <p className="mt-2 text-xs text-[var(--v-red)]">{displayMessage}</p>}
      </div>

      <Modal open={confirmSupersedeOpen} onClose={() => setConfirmSupersedeOpen(false)}>
        <div className="space-y-3">
          <p className="text-sm font-semibold text-[var(--v-text)]">بدء مراجعة Engineering QA جديدة؟</p>
          <p className="text-xs leading-relaxed text-[var(--v-text-secondary)]">
            فيه مراجعة شغّالة دلوقتي (رقم {currentReview?.review_number}). بدء مراجعة جديدة هيلغي الحالية نهائيًا ويبدأ من
            Stage 1. المراجعة الملغاة هتفضل في السجل (History) بحالة «ملغاة». الإجراء ده لا يمكن التراجع عنه.
          </p>
          <div className="flex justify-end gap-2 pt-1">
            <Button variant="ghost" onClick={() => setConfirmSupersedeOpen(false)}>
              إلغاء
            </Button>
            <Button variant="danger" onClick={confirmSupersede}>
              ابدأ مراجعة جديدة
            </Button>
          </div>
        </div>
      </Modal>

      {!currentReview && (
        <EmptyState
          icon={<ClipboardCheck size={28} />}
          title="لسه مفيش مراجعة هندسية لهذا المشروع"
          description="حط رابط الـ Repository واضغط Start New Review للبدء."
        />
      )}

      {currentReview && (
        <>
          <div className="mb-4 flex flex-wrap items-center gap-2 text-xs text-[var(--v-text-muted)]">
            <AiBadge />
            <Badge>مراجعة رقم {currentReview.review_number}</Badge>
            <Badge tone={REVIEW_STATUS_TONE[currentReview.review_status]}>
              {REVIEW_STATUS_LABELS[currentReview.review_status]}
            </Badge>
            <span>{progress.overallProgress}% مكتمل</span>
            {progress.currentStage && <span>المرحلة الحالية: {progress.currentStage.stage_name}</span>}
            {etaSeconds !== null && <span>الوقت المتبقي التقديري: {formatDuration(etaSeconds)}</span>}
            {isActive && (
              <Button variant="danger" size="sm" onClick={handleCancel}>
                Cancel Review
              </Button>
            )}
          </div>

          <div className="mb-4 h-2 w-full overflow-hidden rounded-full bg-[var(--v-surface)]">
            <div
              className="h-full rounded-full bg-[var(--v-primary)] transition-all"
              style={{ width: `${progress.overallProgress}%` }}
            />
          </div>

          <SecurityAuditDashboard securityReview={securityReview} databaseReview={databaseReview} events={events} />

          <div className="mb-6 space-y-2">
            {stages.map((stage) => (
              <StageCard
                key={stage.id}
                stage={stage}
                results={results}
                onRetry={() => handleRetryStage(stage.stage_key)}
                expandedContent={
                  stage.stage_key === "static_code_audit" ? (
                    <StaticReviewPanel projectId={projectId} {...staticReview} />
                  ) : stage.stage_key === "security_audit" ? (
                    <PhaseAuditPanel
                      projectId={projectId}
                      categoryKeys={SECURITY_REVIEW_CATEGORY_KEYS}
                      categoryLabels={SECURITY_CATEGORY_LABELS}
                      scoreLabels={SECURITY_SCORE_LABELS}
                      overallScoreKey="overall_security_score"
                      staleLockMs={SECURITY_STALE_LOCK_MS}
                      reviews={securityReview.reviews.map(withScoreSummary)}
                      currentReview={securityReview.currentReview ? withScoreSummary(securityReview.currentReview) : null}
                      categories={securityReview.categories}
                      findings={securityReview.findings}
                      files={securityReview.files}
                      runCategoryAction={runSecurityReviewCategory}
                      compareAction={compareSecurityReviewVersions}
                    />
                  ) : stage.stage_key === "database_audit" ? (
                    <PhaseAuditPanel
                      projectId={projectId}
                      categoryKeys={DATABASE_REVIEW_CATEGORY_KEYS}
                      categoryLabels={DATABASE_CATEGORY_LABELS}
                      scoreLabels={DATABASE_SCORE_LABELS}
                      overallScoreKey="overall_database_score"
                      staleLockMs={DATABASE_STALE_LOCK_MS}
                      reviews={databaseReview.reviews.map(withScoreSummary)}
                      currentReview={databaseReview.currentReview ? withScoreSummary(databaseReview.currentReview) : null}
                      categories={databaseReview.categories}
                      findings={databaseReview.findings}
                      files={databaseReview.files}
                      runCategoryAction={runDatabaseReviewCategory}
                      compareAction={compareDatabaseReviewVersions}
                    />
                  ) : stage.stage_key === "architecture_audit" ? (
                    <PhaseAuditPanel
                      projectId={projectId}
                      categoryKeys={ARCHITECTURE_REVIEW_CATEGORY_KEYS}
                      categoryLabels={ARCHITECTURE_CATEGORY_LABELS}
                      scoreLabels={ARCHITECTURE_SCORE_LABELS}
                      overallScoreKey="overall_architecture_score"
                      staleLockMs={ARCHITECTURE_STALE_LOCK_MS}
                      reviews={architectureReview.reviews.map(withScoreSummary)}
                      currentReview={architectureReview.currentReview ? withScoreSummary(architectureReview.currentReview) : null}
                      categories={architectureReview.categories}
                      findings={architectureReview.findings}
                      files={architectureReview.files}
                      runCategoryAction={runArchitectureReviewCategory}
                      compareAction={compareArchitectureReviewVersions}
                    />
                  ) : stage.stage_key === "code_quality_audit" ? (
                    <PhaseAuditPanel
                      projectId={projectId}
                      categoryKeys={CODE_QUALITY_REVIEW_CATEGORY_KEYS}
                      categoryLabels={CODE_QUALITY_CATEGORY_LABELS}
                      scoreLabels={CODE_QUALITY_SCORE_LABELS}
                      overallScoreKey="overall_code_quality_score"
                      staleLockMs={CODE_QUALITY_STALE_LOCK_MS}
                      reviews={codeQualityReview.reviews.map(withScoreSummary)}
                      currentReview={codeQualityReview.currentReview ? withScoreSummary(codeQualityReview.currentReview) : null}
                      categories={codeQualityReview.categories}
                      findings={codeQualityReview.findings}
                      files={codeQualityReview.files}
                      runCategoryAction={runCodeQualityReviewCategory}
                      compareAction={compareCodeQualityReviewVersions}
                    />
                  ) : stage.stage_key === "performance_audit" ? (
                    <PhaseAuditPanel
                      projectId={projectId}
                      categoryKeys={PERFORMANCE_REVIEW_CATEGORY_KEYS}
                      categoryLabels={PERFORMANCE_CATEGORY_LABELS}
                      scoreLabels={PERFORMANCE_SCORE_LABELS}
                      overallScoreKey="overall_performance_score"
                      staleLockMs={PERFORMANCE_STALE_LOCK_MS}
                      reviews={performanceReview.reviews.map(withScoreSummary)}
                      currentReview={performanceReview.currentReview ? withScoreSummary(performanceReview.currentReview) : null}
                      categories={performanceReview.categories}
                      findings={performanceReview.findings}
                      files={performanceReview.files}
                      runCategoryAction={runPerformanceReviewCategory}
                      compareAction={comparePerformanceReviewVersions}
                    />
                  ) : stage.stage_key === "prd_compliance_audit" ? (
                    <PhaseAuditPanel
                      projectId={projectId}
                      categoryKeys={PRD_COMPLIANCE_REVIEW_CATEGORY_KEYS}
                      categoryLabels={PRD_COMPLIANCE_CATEGORY_LABELS}
                      scoreLabels={PRD_COMPLIANCE_SCORE_LABELS}
                      overallScoreKey="overall_prd_compliance_score"
                      staleLockMs={PRD_COMPLIANCE_STALE_LOCK_MS}
                      reviews={prdComplianceReview.reviews.map(withScoreSummary)}
                      currentReview={prdComplianceReview.currentReview ? withScoreSummary(prdComplianceReview.currentReview) : null}
                      categories={prdComplianceReview.categories}
                      findings={prdComplianceReview.findings}
                      files={prdComplianceReview.files}
                      runCategoryAction={runPrdComplianceReviewCategory}
                      compareAction={comparePrdComplianceReviewVersions}
                    />
                  ) : stage.stage_key === "functional_audit" ? (
                    <ProductionValidationPanel
                      projectId={projectId}
                      stagingUrl={productionValidation.stagingUrl}
                      sessions={productionValidation.sessions}
                      currentSession={productionValidation.currentSession}
                      journeys={productionValidation.journeys}
                      categories={productionValidation.categories}
                      findings={productionValidation.findings}
                    />
                  ) : undefined
                }
              />
            ))}
          </div>

          <div className="mb-6">
            <p className="mb-2 text-sm font-semibold text-[var(--v-text)]">Latest Certificate</p>
            {certificate ? (
              <div className="rounded-[var(--v-radius-lg)] border border-[var(--v-border)] bg-[var(--v-bg)] p-3 text-xs text-[var(--v-text)]">
                <p>رقم الشهادة: {certificate.certificate_number ?? "—"}</p>
                <p>الحالة: {certificate.certification_status}</p>
                <p>الدرجة الكلية: {certificate.overall_score ?? "—"}</p>
              </div>
            ) : (
              <p className="text-xs text-[var(--v-text-muted)]">لا توجد شهادة بعد — هتُصدر بعد إضافة منطق التصديق في مرحلة قادمة.</p>
            )}
          </div>

          <div className="mb-6">
            <p className="mb-2 text-sm font-semibold text-[var(--v-text)]">Review Timeline</p>
            <div className="space-y-2">
              {events.length === 0 && <p className="text-xs text-[var(--v-text-muted)]">لا توجد أحداث بعد.</p>}
              {events.map((e) => (
                <div key={e.id} className="flex items-center justify-between rounded-[var(--v-radius-md)] border border-[var(--v-border)] bg-[var(--v-bg)] px-3 py-2 text-xs">
                  <span className="text-[var(--v-text)]">
                    {EVENT_LABELS[e.event_type] ?? e.event_type}
                    {e.stage_key && ` — ${e.stage_key}`}
                  </span>
                  <span className="text-[var(--v-text-muted)]">{new Date(e.created_at).toLocaleString("ar-EG")}</span>
                </div>
              ))}
            </div>
          </div>
        </>
      )}

      {reviews.length > 1 && (
        <div>
          <p className="mb-2 text-sm font-semibold text-[var(--v-text)]">Review History ({reviews.length})</p>
          <div className="space-y-2">
            {reviews.map((r) => (
              <div key={r.id} className="flex items-center justify-between rounded-[var(--v-radius-md)] border border-[var(--v-border)] bg-[var(--v-bg)] px-3 py-2 text-xs">
                <span className="text-[var(--v-text)]">مراجعة رقم {r.review_number}</span>
                <Badge tone={REVIEW_STATUS_TONE[r.review_status]}>{REVIEW_STATUS_LABELS[r.review_status]}</Badge>
                <span className="text-[var(--v-text-muted)]">{new Date(r.created_at).toLocaleString("ar-EG")}</span>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

function StageCard({
  stage,
  results,
  onRetry,
  expandedContent,
}: {
  stage: EngineeringReviewStage;
  results: EngineeringStageResult[];
  onRetry: () => void;
  expandedContent?: ReactNode;
}) {
  const [expanded, setExpanded] = useState(!!expandedContent);
  const result = results.find((r) => r.stage_id === stage.id);
  const tone: BadgeTone =
    stage.stage_status === "completed"
      ? "success"
      : stage.stage_status === "failed"
        ? "danger"
        : stage.stage_status === "running"
          ? "warning"
          : "neutral";

  return (
    <div className="rounded-[var(--v-radius-lg)] border border-[var(--v-border)] bg-[var(--v-bg)] p-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <span className="flex h-6 w-6 items-center justify-center rounded-full bg-[var(--v-primary)] text-[11px] font-bold text-white">
            {stage.execution_order}
          </span>
          <span className="text-sm font-semibold text-[var(--v-text)]">{stage.stage_name}</span>
          <Badge tone={tone}>{STAGE_STATUS_LABELS[stage.stage_status]}</Badge>
          {stage.retry_count > 0 && <span className="text-[11px] text-[var(--v-text-muted)]">({stage.retry_count} إعادة محاولة)</span>}
        </div>
        <div className="flex items-center gap-2">
          {expandedContent && (
            <button
              type="button"
              onClick={() => setExpanded((v) => !v)}
              className="text-xs font-medium text-[var(--v-primary)] hover:underline focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--v-primary)]"
            >
              {expanded ? "إخفاء التفاصيل" : "عرض التفاصيل"}
            </button>
          )}
          {(stage.stage_status === "failed" || stage.stage_status === "completed") && (
            <Button variant="outline" size="sm" onClick={onRetry}>
              {stage.stage_status === "failed" ? "Retry Stage" : "Re-run Stage"}
            </Button>
          )}
        </div>
      </div>
      {stage.last_error && stage.stage_status === "failed" && (
        <p className="mt-2 text-xs text-[var(--v-red)]">{stage.last_error}</p>
      )}
      {result && <p className="mt-2 text-xs text-[var(--v-text-secondary)]">{result.summary}</p>}
      {expanded && expandedContent && <div className="mt-3 border-t border-[var(--v-border)] pt-3">{expandedContent}</div>}
    </div>
  );
}
