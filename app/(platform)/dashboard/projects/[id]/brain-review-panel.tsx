"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import {
  CheckCircle2,
  XCircle,
  Circle,
  MessageSquareWarning,
  Play,
  ShieldCheck,
  AlertTriangle,
  ChevronDown,
  ChevronUp,
  Sparkles,
  Gauge,
  MessageCircle,
  Link2,
  RefreshCw,
  History,
} from "lucide-react";
import Card from "@/components/ui/Card";
import Button from "@/components/ui/Button";
import Badge, { type BadgeTone } from "@/components/ui/Badge";
import Modal from "@/components/ui/Modal";
import Tooltip from "@/components/ui/Tooltip";
import EmptyState from "@/components/ui/EmptyState";
import { toast } from "@/components/ui/Toaster";
import {
  BRAIN_SECTIONS,
  BRAIN_SECTION_LABELS,
  type BrainDocumentRow,
  type BrainSectionKey,
} from "@/lib/brain-v2/types";
import {
  REVIEW_STATE_LABELS,
  type SectionReviewState,
} from "@/lib/brain-v2/review-types";
import {
  computeReadinessScore,
  checkApprovalGate,
} from "@/lib/brain-v2/readiness";
import { computeReviewProgress } from "@/lib/brain-v2/review-objects";
import { REVIEW_OBJECT_STATE_LABELS, REVIEW_ISSUE_TYPE_LABELS, REVIEW_ISSUE_SEVERITY_LABELS } from "@/lib/brain-v2/review-labels";
import { approveBrainDraft, rejectBrainDraft } from "./brain-v2-actions";
import {
  startReviewAction,
  reviewSectionAction,
  requestBrainChangesAction,
  runBrainReviewValidationAction,
} from "./brain-review-actions";
import { setReviewObjectStateAction, addReviewCommentAction, setCommentResolvedAction } from "./brain-review-objects-actions";
import BrainOpenItemsPanel from "./brain-open-items-panel";
import { RECOMMENDATION_CATEGORY_LABELS } from "@/lib/organizational-intelligence/recommendation-labels";
import type {
  ProjectRecommendation,
  BrainReviewObject,
  BrainReviewObjectDependency,
  BrainReviewObjectState,
  BrainReviewComment,
  BrainReviewValidationReport,
  BrainReviewEvent,
} from "@/lib/types/database";

// ============================================================
// المكوّن الرئيسي
// ============================================================

export default function BrainReviewPanel({
  projectId,
  document,
  confidenceThreshold,
  isAdmin,
  recommendations,
  reviewObjects,
  reviewDependencies,
  reviewComments,
  latestValidationReport,
  reviewEvents,
}: {
  projectId: string;
  document: BrainDocumentRow | null;
  confidenceThreshold: number;
  isAdmin: boolean;
  recommendations: ProjectRecommendation[];
  reviewObjects: BrainReviewObject[];
  reviewDependencies: BrainReviewObjectDependency[];
  reviewComments: BrainReviewComment[];
  latestValidationReport: BrainReviewValidationReport | null;
  reviewEvents: BrainReviewEvent[];
}) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [rejecting, setRejecting] = useState(false);
  const [requestingChanges, setRequestingChanges] = useState(false);
  const [reason, setReason] = useState("");

  if (!document) {
    return (
      <Card padding="lg">
        <EmptyState
          icon={<ShieldCheck size={28} />}
          title="لا يوجد Brain للمراجعة بعد"
          description="بعد نجاح Discovery Analysis، هيتبني Draft هنا للمراجعة."
        />
      </Card>
    );
  }

  // local bind — بحيث الـ closures جوّه الـ callbacks ما تحتاجش null check
  const doc = document;
  const content = doc.content;
  const reviews = doc.section_reviews ?? {};
  const missingDispositions = doc.missing_info_dispositions ?? {};
  const assumptionDispositions = doc.assumption_dispositions ?? {};

  const readiness = computeReadinessScore({
    completeness: doc.completeness_score,
    content,
    sectionReviews: reviews,
    missingInfoDispositions: missingDispositions,
    assumptionDispositions,
  });
  const suggestedRecommendations = recommendations.filter((r) => r.status === "suggested");
  const acceptedRecommendations = recommendations.filter((r) => r.status === "accepted");
  const reviewProgress = computeReviewProgress(reviewObjects);
  const criticalIssues = (latestValidationReport?.issues ?? []).filter((i) => i.severity === "critical" || i.severity === "high");
  const gate = checkApprovalGate({
    content,
    sectionReviews: reviews,
    missingInfoDispositions: missingDispositions,
    assumptionDispositions,
    pendingRecommendationsCount: suggestedRecommendations.length,
    pendingReviewObjectsCount: reviewProgress.blockingCount,
    criticalValidationIssuesCount: criticalIssues.length,
    needsRevalidationCount: reviewProgress.needsRevalidationCount,
  });

  const canReview = doc.status === "draft" || doc.status === "in_review";
  const canApprove = isAdmin && doc.status === "in_review" && gate.canApprove;

  async function run(fn: () => Promise<{ ok: boolean; message?: string }>, ok: string) {
    setBusy(true);
    const r = await fn();
    setBusy(false);
    if (!r.ok) {
      toast.error(r.message ?? "فشلت العملية.");
      return;
    }
    toast.success(ok);
    router.refresh();
  }

  async function handleReject() {
    if (!reason.trim()) {
      toast.error("اكتب سبب الرفض.");
      return;
    }
    setBusy(true);
    const r = await rejectBrainDraft(doc.id, projectId, reason);
    setBusy(false);
    if (!r.ok) {
      toast.error(r.message);
      return;
    }
    toast.success("تم رفض النسخة");
    setRejecting(false);
    setReason("");
    router.refresh();
  }

  async function handleRequestChanges() {
    if (!reason.trim()) {
      toast.error("اكتب سبب طلب التعديل.");
      return;
    }
    setBusy(true);
    const r = await requestBrainChangesAction({
      documentId: doc.id,
      projectId,
      reason,
    });
    setBusy(false);
    if (!r.ok) {
      toast.error(r.message);
      return;
    }
    toast.success("تم طلب التعديل — تم إنشاء Draft جديد");
    setRequestingChanges(false);
    setReason("");
    router.refresh();
  }

  return (
    <div className="space-y-4">
      {/* بطاقة الترويسة — الحالة + Readiness + الأزرار */}
      <Card padding="md">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="min-w-0 flex-1">
            <div className="flex flex-wrap items-center gap-2">
              <ShieldCheck size={16} className="text-[var(--v-primary)]" />
              <p className="text-sm font-semibold text-[var(--v-text)]">مراجعة Project Brain</p>
              <Badge tone={statusTone(doc.status)}>{statusLabel(doc.status)}</Badge>
              <span className="font-mono-plex text-[11px] text-[var(--v-text-subtle)]">
                v{doc.version}
              </span>
            </div>
            <div className="mt-2 flex flex-wrap items-center gap-2">
              <ReadinessBadge score={readiness.score} />
              <Metric label="اكتمال" value={`${readiness.completeness}%`} />
              <Metric label="أقسام مُعتمدة" value={`${readiness.sectionApprovalPct}%`} />
              <Metric label="معلومات ناقصة" value={`${readiness.missingInfoResolvedPct}%`} />
              <Metric label="افتراضات" value={`${readiness.assumptionsReviewedPct}%`} />
            </div>
            {doc.changes_requested_reason && (
              <p className="mt-2 rounded-[var(--v-radius-md)] border border-[var(--v-amber)]/40 bg-[var(--v-amber)]/8 px-2 py-1 text-xs text-[var(--v-text)]">
                <MessageSquareWarning size={12} className="inline align-middle" /> طلب تعديل سابق:{" "}
                {doc.changes_requested_reason}
              </p>
            )}
          </div>

          <div className="flex flex-wrap items-center gap-2">
            {canReview && doc.status === "draft" && (
              <Button
                variant="primary"
                size="sm"
                icon={<Play size={13} />}
                onClick={() => run(() => startReviewAction(doc.id, projectId), "بدأت المراجعة")}
                disabled={busy}
              >
                ابدأ المراجعة
              </Button>
            )}
            {isAdmin && doc.status === "in_review" && (
              <>
                <Button
                  variant="success"
                  size="sm"
                  icon={<CheckCircle2 size={14} />}
                  onClick={() => run(() => approveBrainDraft(doc.id, projectId), "تم الاعتماد")}
                  disabled={busy || !canApprove}
                >
                  اعتماد
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  icon={<MessageSquareWarning size={14} />}
                  onClick={() => setRequestingChanges(true)}
                  disabled={busy}
                >
                  طلب تعديل
                </Button>
                <Button
                  variant="danger"
                  size="sm"
                  icon={<XCircle size={14} />}
                  onClick={() => setRejecting(true)}
                  disabled={busy}
                >
                  رفض
                </Button>
              </>
            )}
          </div>
        </div>
      </Card>

      {/* Executive Dashboard — Phase 5 */}
      <ExecutiveDashboard
        projectId={projectId}
        documentId={doc.id}
        report={latestValidationReport}
        progress={reviewProgress}
        criticalIssues={criticalIssues}
        events={reviewEvents}
        canReview={canReview}
      />

      {/* Approval Checklist */}
      <ApprovalChecklist gate={gate} />

      {/* التوصيات الذكية المقبولة — لازم تتراجع مع الـ Brain نفسه، مش عزل بينهم */}
      <AcceptedRecommendationsSection accepted={acceptedRecommendations} pendingCount={suggestedRecommendations.length} />

      {/* مراجعة كل عنصر معرفة على حدة — Phase 5 */}
      <ReviewObjectsSection
        projectId={projectId}
        documentId={doc.id}
        objects={reviewObjects}
        dependencies={reviewDependencies}
        comments={reviewComments}
        canReview={canReview}
      />

      {/* Sections Review Grid */}
      <div className="space-y-3">
        {BRAIN_SECTIONS.map((key) => (
          <SectionReviewCard
            key={key}
            projectId={projectId}
            documentId={doc.id}
            sectionKey={key}
            confidence={content[key].meta.confidence}
            confidenceReason={content[key].meta.confidence_reason}
            confidenceThreshold={confidenceThreshold}
            currentState={reviews[key]?.state}
            canReview={canReview}
          />
        ))}
      </div>

      {/* البنود المفتوحة (معلومات ناقصة + افتراضات) — نفس المكوّن
          المستخدم في Project Brain، عشان الحسم يبقى بواجهة واحدة. */}
      <BrainOpenItemsPanel
        projectId={projectId}
        documentId={doc.id}
        content={content}
        missingDispositions={missingDispositions}
        assumptionDispositions={assumptionDispositions}
        canReview={canReview}
        editable={doc.status === "draft" || doc.status === "in_review"}
      />

      {/* Modals */}
      <Modal open={rejecting} onClose={() => setRejecting(false)}>
        <div className="space-y-3">
          <p className="text-sm font-semibold text-[var(--v-text)]">رفض النسخة</p>
          <p className="text-xs text-[var(--v-text-muted)]">
            الـ Draft هيتحفظ بحالة «مرفوض» بدون أن يُكتب فوق النسخة المعتمدة.
          </p>
          <textarea
            value={reason}
            onChange={(e) => setReason(e.target.value)}
            rows={3}
            placeholder="اكتب سبب الرفض (إجباري)…"
            className="w-full rounded-[var(--v-radius-md)] border border-[var(--v-border)] bg-[var(--v-bg)] px-3 py-2 text-sm outline-none focus:border-[var(--v-primary)]"
          />
          <div className="flex justify-end gap-2">
            <Button variant="ghost" onClick={() => setRejecting(false)}>
              إلغاء
            </Button>
            <Button variant="danger" loading={busy} onClick={handleReject}>
              تأكيد الرفض
            </Button>
          </div>
        </div>
      </Modal>

      <Modal open={requestingChanges} onClose={() => setRequestingChanges(false)}>
        <div className="space-y-3">
          <p className="text-sm font-semibold text-[var(--v-text)]">طلب تعديلات</p>
          <p className="text-xs text-[var(--v-text-muted)]">
            هيتنشئ Draft جديد نسخة من الحالي عشان يتم تعديله. الوثيقة الحالية هتفضل مؤرشفة.
          </p>
          <textarea
            value={reason}
            onChange={(e) => setReason(e.target.value)}
            rows={3}
            placeholder="اكتب المطلوب تعديله (إجباري)…"
            className="w-full rounded-[var(--v-radius-md)] border border-[var(--v-border)] bg-[var(--v-bg)] px-3 py-2 text-sm outline-none focus:border-[var(--v-primary)]"
          />
          <div className="flex justify-end gap-2">
            <Button variant="ghost" onClick={() => setRequestingChanges(false)}>
              إلغاء
            </Button>
            <Button variant="primary" loading={busy} onClick={handleRequestChanges}>
              إنشاء Draft للتعديل
            </Button>
          </div>
        </div>
      </Modal>
    </div>
  );
}

// ============================================================
// Approval Checklist
// ============================================================

function ApprovalChecklist({
  gate,
}: {
  gate: { canApprove: boolean; blockers: string[] };
}) {
  if (gate.canApprove) {
    return (
      <Card padding="md">
        <div className="flex items-center gap-2 text-sm text-[var(--v-green)]">
          <CheckCircle2 size={16} />
          <span>كل الشروط مستوفاة — جاهز للاعتماد.</span>
        </div>
      </Card>
    );
  }
  return (
    <Card padding="md">
      <div className="flex items-start gap-2">
        <AlertTriangle size={16} className="mt-0.5 shrink-0 text-[var(--v-amber)]" />
        <div className="flex-1">
          <p className="text-sm font-semibold text-[var(--v-text)]">قبل الاعتماد لازم:</p>
          <ul className="mt-1 space-y-0.5">
            {gate.blockers.map((b, i) => (
              <li key={i} className="text-xs text-[var(--v-text-muted)]">
                • {b}
              </li>
            ))}
          </ul>
        </div>
      </div>
    </Card>
  );
}

// ============================================================
// التوصيات الذكية المقبولة — للمراجعة جنب الـ Brain (بلا إجراءات، القرار مكانه smartRecommendations)
// ============================================================

function AcceptedRecommendationsSection({
  accepted,
  pendingCount,
}: {
  accepted: ProjectRecommendation[];
  pendingCount: number;
}) {
  if (accepted.length === 0 && pendingCount === 0) return null;
  return (
    <Card padding="md">
      <p className="mb-2 flex items-center gap-2 text-sm font-semibold text-[var(--v-text)]">
        <Sparkles size={15} className="text-[var(--v-info)]" /> التوصيات الذكية المقبولة ({accepted.length})
      </p>
      {pendingCount > 0 && (
        <p className="mb-2 text-xs text-[var(--v-amber)]">
          فيه {pendingCount} توصية لسه بانتظار قرار — راجعها في تبويب &quot;التوصيات الذكية&quot; قبل الاعتماد.
        </p>
      )}
      {accepted.length === 0 ? (
        <p className="text-xs text-[var(--v-text-muted)]">لا توجد توصيات مقبولة بعد.</p>
      ) : (
        <div className="space-y-2">
          {accepted.map((r) => (
            <div key={r.id} className="rounded-[var(--v-radius-md)] border border-[var(--v-border)] p-2.5">
              <div className="flex items-center gap-2">
                <Badge tone="primary">{RECOMMENDATION_CATEGORY_LABELS[r.category] ?? r.category}</Badge>
                {r.priority && <span className="text-[11px] text-[var(--v-text-muted)]">أولوية: {r.priority}</span>}
              </div>
              <p className="mt-1.5 text-sm font-medium text-[var(--v-text)]">{r.recommendation}</p>
            </div>
          ))}
        </div>
      )}
    </Card>
  );
}

// ============================================================
// Executive Dashboard — Phase 5
// ============================================================

function ScoreGauge({ label, score }: { label: string; score: number | null }) {
  const tone = score === null ? "text-[var(--v-text-subtle)]" : score >= 75 ? "text-[var(--v-green)]" : score >= 50 ? "text-[var(--v-amber)]" : "text-[var(--v-red)]";
  return (
    <div className="flex-1 rounded-[var(--v-radius-md)] border border-[var(--v-border)] p-2.5 text-center">
      <p className={`font-mono-plex text-lg font-bold ${tone}`}>{score === null ? "—" : `${score}%`}</p>
      <p className="mt-0.5 text-[10px] text-[var(--v-text-muted)]">{label}</p>
    </div>
  );
}

function ExecutiveDashboard({
  projectId,
  documentId,
  report,
  progress,
  criticalIssues,
  events,
  canReview,
}: {
  projectId: string;
  documentId: string;
  report: BrainReviewValidationReport | null;
  progress: ReturnType<typeof computeReviewProgress>;
  criticalIssues: BrainReviewValidationReport["issues"];
  events: BrainReviewEvent[];
  canReview: boolean;
}) {
  const router = useRouter();
  const [running, setRunning] = useState(false);
  const [showTimeline, setShowTimeline] = useState(false);

  async function handleRevalidate() {
    setRunning(true);
    const r = await runBrainReviewValidationAction(documentId, projectId);
    setRunning(false);
    if (!r.ok) {
      toast.error(r.message);
      return;
    }
    toast.success("جاري إعادة التحقّق — النتيجة هتظهر بعد لحظات.");
    router.refresh();
  }

  const coveragePct = progress.total === 0 ? 100 : Math.round(((progress.total - progress.blockingCount) / progress.total) * 100);

  return (
    <Card padding="md">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="flex items-center gap-2 text-sm font-semibold text-[var(--v-text)]">
          <Gauge size={16} className="text-[var(--v-primary)]" /> لوحة المراجعة التنفيذية
        </p>
        {canReview && (
          <Button variant="outline" size="sm" icon={<RefreshCw size={13} />} onClick={handleRevalidate} disabled={running}>
            {running ? "جاري التحقّق..." : "إعادة تحقّق"}
          </Button>
        )}
      </div>

      <div className="mt-3 flex flex-wrap gap-2">
        <ScoreGauge label="جاهزية العمل" score={report?.business_readiness ?? null} />
        <ScoreGauge label="جاهزية معمارية" score={report?.architecture_readiness ?? null} />
        <ScoreGauge label="جاهزية تقنية" score={report?.technical_readiness ?? null} />
        <ScoreGauge label="ثقة AI" score={report?.ai_confidence ?? null} />
        <ScoreGauge label="تغطية المراجعة" score={coveragePct} />
      </div>

      <div className="mt-3 flex flex-wrap gap-1.5">
        {(Object.keys(progress.byState) as BrainReviewObjectState[]).map((state) =>
          progress.byState[state] > 0 ? (
            <Badge key={state} tone={reviewObjectStateTone(state)}>
              {REVIEW_OBJECT_STATE_LABELS[state]}: {progress.byState[state]}
            </Badge>
          ) : null
        )}
        {progress.needsRevalidationCount > 0 && <Badge tone="warning">يحتاج إعادة تحقّق: {progress.needsRevalidationCount}</Badge>}
      </div>

      {criticalIssues.length > 0 && (
        <div className="mt-3 space-y-1.5">
          <p className="text-xs font-semibold text-[var(--v-red)]">مشاكل حرجة/عالية الخطورة ({criticalIssues.length})</p>
          {criticalIssues.map((issue, i) => (
            <div key={i} className="flex items-start gap-2 rounded-[var(--v-radius-md)] border border-[var(--v-red)]/30 bg-[var(--v-red)]/5 p-2">
              <AlertTriangle size={13} className="mt-0.5 shrink-0 text-[var(--v-red)]" />
              <div className="min-w-0 flex-1">
                <p className="text-xs font-medium text-[var(--v-text)]">
                  {REVIEW_ISSUE_TYPE_LABELS[issue.type] ?? issue.type} — {REVIEW_ISSUE_SEVERITY_LABELS[issue.severity]}
                </p>
                <p className="text-[11px] text-[var(--v-text-muted)]">{issue.description}</p>
              </div>
            </div>
          ))}
        </div>
      )}

      {report?.last_error && <p className="mt-2 text-[11px] text-[var(--v-amber)]">تحذير من آخر تحقّق: {report.last_error}</p>}

      {events.length > 0 && (
        <div className="mt-3">
          <button type="button" onClick={() => setShowTimeline((v) => !v)} className="flex items-center gap-1 text-xs text-[var(--v-text-muted)] hover:text-[var(--v-text)]">
            <History size={12} /> سجل النشاط ({events.length}) {showTimeline ? <ChevronUp size={12} /> : <ChevronDown size={12} />}
          </button>
          {showTimeline && (
            <div className="mt-2 max-h-64 space-y-1.5 overflow-y-auto border-r-2 border-[var(--v-border)] pr-3">
              {events.map((e) => (
                <div key={e.id} className="text-[11px] text-[var(--v-text-muted)]">
                  <span className="font-mono-plex text-[var(--v-text-subtle)]">{new Date(e.created_at).toLocaleString("ar-EG")}</span> — {eventLabel(e.event_type)}
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </Card>
  );
}

function eventLabel(t: BrainReviewEvent["event_type"]): string {
  const labels: Record<BrainReviewEvent["event_type"], string> = {
    object_reviewed: "تحديث مراجعة عنصر",
    comment_added: "تعليق جديد",
    comment_resolved: "تعليق تم حله",
    validation_run: "تشغيل تحقّق",
    gate_checked: "فحص بوابة الاعتماد",
    approved: "اعتماد",
    rejected: "رفض",
    changes_requested: "طلب تعديل",
    revalidation_triggered: "تفعيل إعادة تحقّق",
  };
  return labels[t] ?? t;
}

function reviewObjectStateTone(state: BrainReviewObjectState): BadgeTone {
  switch (state) {
    case "approved":
    case "approved_with_modification":
      return "success";
    case "pending_review":
      return "warning";
    case "needs_revision":
      return "warning";
    case "rejected":
    case "blocked":
      return "danger";
    case "deferred":
      return "neutral";
  }
}

// ============================================================
// مراجعة عناصر المعرفة الفردية — Phase 5
// ============================================================

function ReviewObjectsSection({
  projectId,
  documentId,
  objects,
  dependencies,
  comments,
  canReview,
}: {
  projectId: string;
  documentId: string;
  objects: BrainReviewObject[];
  dependencies: BrainReviewObjectDependency[];
  comments: BrainReviewComment[];
  canReview: boolean;
}) {
  const [sectionFilter, setSectionFilter] = useState<string | null>(null);
  const [search, setSearch] = useState("");
  const [expandedId, setExpandedId] = useState<string | null>(null);

  const sections = useMemo(() => [...new Set(objects.map((o) => o.section_key))], [objects]);
  const byId = useMemo(() => new Map(objects.map((o) => [o.id, o])), [objects]);
  const commentCountByObject = useMemo(() => {
    const m = new Map<string, number>();
    for (const c of comments) {
      if (!c.review_object_id) continue;
      m.set(c.review_object_id, (m.get(c.review_object_id) ?? 0) + 1);
    }
    return m;
  }, [comments]);

  const filtered = objects
    .filter((o) => !sectionFilter || o.section_key === sectionFilter)
    .filter((o) => !search.trim() || o.item_title.toLowerCase().includes(search.trim().toLowerCase()));

  function dependsOnTitlesFor(objectId: string): string[] {
    return dependencies
      .filter((d) => d.review_object_id === objectId)
      .map((d) => byId.get(d.depends_on_review_object_id)?.item_title)
      .filter((t): t is string => !!t);
  }

  if (objects.length === 0) return null;

  return (
    <Card padding="md">
      <p className="mb-2 flex items-center gap-2 text-sm font-semibold text-[var(--v-text)]">
        <ShieldCheck size={15} className="text-[var(--v-primary)]" /> مراجعة عناصر المعرفة الفردية ({objects.length})
      </p>
      <div className="mb-3 flex flex-wrap items-center gap-1.5">
        <input
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="بحث..."
          className="w-40 rounded-[var(--v-radius-md)] border border-[var(--v-border)] bg-[var(--v-surface)] px-2 py-1 text-xs text-[var(--v-text)] outline-none focus:border-[var(--v-primary)]"
        />
        <FilterChipBR active={sectionFilter === null} onClick={() => setSectionFilter(null)} label="كل الأقسام" />
        {sections.map((s) => (
          <FilterChipBR key={s} active={sectionFilter === s} onClick={() => setSectionFilter(sectionFilter === s ? null : s)} label={BRAIN_SECTION_LABELS[s as BrainSectionKey] ?? s} />
        ))}
      </div>
      <div className="space-y-2">
        {filtered.map((o) => (
          <ReviewObjectCard
            key={o.id}
            projectId={projectId}
            documentId={documentId}
            object={o}
            dependsOnTitles={dependsOnTitlesFor(o.id)}
            commentCount={commentCountByObject.get(o.id) ?? 0}
            comments={comments.filter((c) => c.review_object_id === o.id)}
            canReview={canReview}
            expanded={expandedId === o.id}
            onToggleExpand={() => setExpandedId(expandedId === o.id ? null : o.id)}
          />
        ))}
      </div>
    </Card>
  );
}

function FilterChipBR({ active, onClick, label }: { active: boolean; onClick: () => void; label: string }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`rounded-full px-2.5 py-1 text-[11px] font-medium transition-colors ${
        active ? "bg-[var(--v-primary)] text-white" : "bg-[var(--v-surface-muted)] text-[var(--v-text-muted)] hover:text-[var(--v-text)]"
      }`}
    >
      {label}
    </button>
  );
}

const REVIEW_ACTIONS: { state: BrainReviewObjectState; label: string; requiresReason: boolean }[] = [
  { state: "approved", label: "اعتماد", requiresReason: false },
  { state: "approved_with_modification", label: "اعتماد بتعديل", requiresReason: true },
  { state: "needs_revision", label: "يحتاج تعديل", requiresReason: true },
  { state: "rejected", label: "رفض", requiresReason: true },
  { state: "deferred", label: "تأجيل", requiresReason: true },
  { state: "blocked", label: "حظر", requiresReason: true },
];

function ReviewObjectCard({
  projectId,
  documentId,
  object,
  dependsOnTitles,
  commentCount,
  comments,
  canReview,
  expanded,
  onToggleExpand,
}: {
  projectId: string;
  documentId: string;
  object: BrainReviewObject;
  dependsOnTitles: string[];
  commentCount: number;
  comments: BrainReviewComment[];
  canReview: boolean;
  expanded: boolean;
  onToggleExpand: () => void;
}) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [pendingAction, setPendingAction] = useState<{ state: BrainReviewObjectState } | null>(null);
  const [reason, setReason] = useState("");
  const [commentBody, setCommentBody] = useState("");
  const [replyTo, setReplyTo] = useState<string | null>(null);

  function decide(state: BrainReviewObjectState, requiresReason: boolean) {
    if (requiresReason) {
      setPendingAction({ state });
      setReason("");
      return;
    }
    apply(state, null);
  }

  async function apply(state: BrainReviewObjectState, r: string | null) {
    setBusy(true);
    const res = await setReviewObjectStateAction(object.id, projectId, state, r);
    setBusy(false);
    if (!res.ok) {
      toast.error(res.message);
      return;
    }
    setPendingAction(null);
    toast.success("تم التحديث");
    router.refresh();
  }

  async function submitComment() {
    if (!commentBody.trim()) return;
    setBusy(true);
    const res = await addReviewCommentAction({
      documentId,
      projectId,
      reviewObjectId: object.id,
      parentCommentId: replyTo,
      body: commentBody,
    });
    setBusy(false);
    if (!res.ok) {
      toast.error(res.message);
      return;
    }
    setCommentBody("");
    setReplyTo(null);
    router.refresh();
  }

  async function toggleResolve(commentId: string, resolved: boolean) {
    const res = await setCommentResolvedAction(commentId, projectId, resolved);
    if (!res.ok) {
      toast.error(res.message);
      return;
    }
    router.refresh();
  }

  return (
    <div className="rounded-[var(--v-radius-md)] border border-[var(--v-border)] p-2.5">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex flex-wrap items-center gap-1.5">
          <Badge tone="primary">{BRAIN_SECTION_LABELS[object.section_key as BrainSectionKey] ?? object.section_key}</Badge>
          <Badge tone={reviewObjectStateTone(object.state)}>{REVIEW_OBJECT_STATE_LABELS[object.state]}</Badge>
          {object.needs_revalidation && (
            <Tooltip label={object.revalidation_reason ?? "المحتوى تغيّر"}>
              <span className="inline-flex cursor-help items-center gap-1 rounded-full bg-[var(--v-amber)]/10 px-2 py-0.5 text-[10px] font-medium text-[var(--v-amber)]">
                <AlertTriangle size={10} /> يحتاج إعادة تحقّق
              </span>
            </Tooltip>
          )}
        </div>
        <button type="button" onClick={onToggleExpand} className="flex items-center gap-1 text-[11px] text-[var(--v-text-muted)] hover:text-[var(--v-text)]">
          <MessageCircle size={12} /> {commentCount} {expanded ? <ChevronUp size={12} /> : <ChevronDown size={12} />}
        </button>
      </div>
      <p className="mt-1.5 text-sm font-medium text-[var(--v-text)]">{object.item_title}</p>
      {object.reason && <p className="mt-1 text-xs text-[var(--v-text-secondary)]">{object.reason}</p>}
      {dependsOnTitles.length > 0 && (
        <p className="mt-1.5 flex items-start gap-1 text-[11px] text-[var(--v-info)]">
          <Link2 size={12} className="mt-0.5 shrink-0" /> يعتمد على: {dependsOnTitles.join("، ")}
        </p>
      )}

      {canReview && (
        <div className="mt-2 flex flex-wrap gap-1.5">
          {REVIEW_ACTIONS.map((a) => (
            <button
              key={a.state}
              type="button"
              onClick={() => decide(a.state, a.requiresReason)}
              disabled={busy}
              className={`rounded-[var(--v-radius-md)] border px-2 py-1 text-[10px] font-medium disabled:opacity-50 ${
                object.state === a.state ? "border-[var(--v-primary)] bg-[var(--v-primary)]/10 text-[var(--v-primary)]" : "border-[var(--v-border)] text-[var(--v-text-muted)] hover:border-[var(--v-primary)]"
              }`}
            >
              {a.label}
            </button>
          ))}
        </div>
      )}

      {expanded && (
        <div className="mt-3 space-y-2 border-t border-[var(--v-border)] pt-2">
          {comments.length === 0 ? (
            <p className="text-[11px] text-[var(--v-text-subtle)]">لا توجد تعليقات بعد.</p>
          ) : (
            comments.map((c) => (
              <div key={c.id} className={`rounded-[var(--v-radius-md)] border p-2 ${c.is_resolved ? "border-[var(--v-border)] opacity-60" : "border-[var(--v-border)]"}`}>
                {c.parent_comment_id && <p className="text-[10px] text-[var(--v-text-subtle)]">↳ ردًا على تعليق سابق</p>}
                <p className="text-xs text-[var(--v-text)]">{c.body}</p>
                <div className="mt-1 flex items-center justify-between">
                  <span className="text-[10px] text-[var(--v-text-subtle)]">{new Date(c.created_at).toLocaleString("ar-EG")}</span>
                  <div className="flex items-center gap-2">
                    <button type="button" onClick={() => setReplyTo(c.id)} className="text-[10px] text-[var(--v-primary)]">
                      رد
                    </button>
                    <button type="button" onClick={() => toggleResolve(c.id, !c.is_resolved)} className="text-[10px] text-[var(--v-text-muted)]">
                      {c.is_resolved ? "إعادة فتح" : "حل"}
                    </button>
                  </div>
                </div>
              </div>
            ))
          )}
          <div className="flex items-center gap-1.5">
            {replyTo && (
              <button type="button" onClick={() => setReplyTo(null)} className="text-[10px] text-[var(--v-text-muted)]">
                إلغاء الرد ×
              </button>
            )}
            <input
              value={commentBody}
              onChange={(e) => setCommentBody(e.target.value)}
              placeholder={replyTo ? "اكتب ردًا..." : "أضف تعليقًا..."}
              className="flex-1 rounded-[var(--v-radius-md)] border border-[var(--v-border)] bg-[var(--v-surface)] px-2 py-1 text-xs text-[var(--v-text)] outline-none focus:border-[var(--v-primary)]"
              onKeyDown={(e) => e.key === "Enter" && submitComment()}
            />
            <Button variant="outline" size="sm" onClick={submitComment} disabled={busy || !commentBody.trim()}>
              إرسال
            </Button>
          </div>
        </div>
      )}

      <Modal open={pendingAction !== null} onClose={() => setPendingAction(null)}>
        <div className="p-4">
          <p className="mb-2 text-sm font-semibold text-[var(--v-text)]">{pendingAction ? REVIEW_ACTIONS.find((a) => a.state === pendingAction.state)?.label : ""} — السبب</p>
          <textarea
            className="w-full rounded-[var(--v-radius-md)] border border-[var(--v-border)] bg-[var(--v-surface)] p-2 text-sm text-[var(--v-text)]"
            rows={3}
            value={reason}
            onChange={(e) => setReason(e.target.value)}
            placeholder="اكتب السبب هنا..."
          />
          <div className="mt-3 flex justify-end gap-2">
            <Button variant="outline" size="sm" onClick={() => setPendingAction(null)}>
              إلغاء
            </Button>
            <Button
              variant="primary"
              size="sm"
              onClick={() => {
                if (!reason.trim()) {
                  toast.error("اكتب السبب.");
                  return;
                }
                if (pendingAction) apply(pendingAction.state, reason);
              }}
            >
              تأكيد
            </Button>
          </div>
        </div>
      </Modal>
    </div>
  );
}

// ============================================================
// Section Review Card
// ============================================================

function SectionReviewCard({
  projectId,
  documentId,
  sectionKey,
  confidence,
  confidenceReason,
  confidenceThreshold,
  currentState,
  canReview,
}: {
  projectId: string;
  documentId: string;
  sectionKey: BrainSectionKey;
  confidence: number;
  confidenceReason: string | null;
  confidenceThreshold: number;
  currentState: SectionReviewState | undefined;
  canReview: boolean;
}) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const belowThreshold = confidence < confidenceThreshold;

  async function setState(state: SectionReviewState) {
    setBusy(true);
    const r = await reviewSectionAction({
      documentId,
      projectId,
      sectionKey,
      state,
      reason: null,
    });
    setBusy(false);
    if (!r.ok) {
      toast.error(r.message);
      return;
    }
    toast.success("تم تحديث الحالة");
    router.refresh();
  }

  return (
    <Card padding="md" animate={false}>
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex flex-wrap items-center gap-2">
          <p className="text-sm font-medium text-[var(--v-text)]">
            {BRAIN_SECTION_LABELS[sectionKey]}
          </p>
          <Tooltip label={confidenceReason ?? `ثقة ${confidence}%`}>
            <span
              className={`inline-flex cursor-help items-center gap-1 rounded-full px-2 py-0.5 text-[10px] font-medium ${
                confidence >= 75
                  ? "bg-[var(--v-green)]/10 text-[var(--v-green)]"
                  : confidence >= 50
                    ? "bg-[var(--v-amber)]/10 text-[var(--v-amber)]"
                    : "bg-[var(--v-red)]/10 text-[var(--v-red)]"
              }`}
            >
              ثقة {confidence}%
            </span>
          </Tooltip>
          {belowThreshold && (
            <Tooltip label={`أقل من الحد (${confidenceThreshold}%) — يحتاج مراجعة يدوية`}>
              <span className="inline-flex cursor-help items-center gap-1 rounded-full bg-[var(--v-amber)]/10 px-2 py-0.5 text-[10px] font-medium text-[var(--v-amber)]">
                <AlertTriangle size={10} /> تحذير
              </span>
            </Tooltip>
          )}
          {currentState && (
            <Badge tone={reviewTone(currentState)}>{REVIEW_STATE_LABELS[currentState]}</Badge>
          )}
        </div>
        {canReview && (
          <div className="flex items-center gap-1">
            <ReviewBtn
              active={currentState === "approved"}
              tone="success"
              icon={<CheckCircle2 size={13} />}
              label="اعتماد"
              disabled={busy}
              onClick={() => setState("approved")}
            />
            <ReviewBtn
              active={currentState === "needs_review"}
              tone="warning"
              icon={<Circle size={13} />}
              label="يحتاج مراجعة"
              disabled={busy}
              onClick={() => setState("needs_review")}
            />
            <ReviewBtn
              active={currentState === "rejected"}
              tone="danger"
              icon={<XCircle size={13} />}
              label="رفض"
              disabled={busy}
              onClick={() => setState("rejected")}
            />
          </div>
        )}
      </div>
    </Card>
  );
}

function ReviewBtn({
  active,
  tone,
  icon,
  label,
  disabled,
  onClick,
}: {
  active: boolean;
  tone: "success" | "warning" | "danger";
  icon: React.ReactNode;
  label: string;
  disabled: boolean;
  onClick: () => void;
}) {
  const activeClass =
    tone === "success"
      ? "border-[var(--v-green)] bg-[var(--v-green)]/10 text-[var(--v-green)]"
      : tone === "warning"
        ? "border-[var(--v-amber)] bg-[var(--v-amber)]/10 text-[var(--v-amber)]"
        : "border-[var(--v-red)] bg-[var(--v-red)]/10 text-[var(--v-red)]";
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      className={`inline-flex items-center gap-1 rounded-[var(--v-radius-md)] border px-2.5 py-1.5 text-[11px] font-medium disabled:opacity-50 ${
        active ? activeClass : "border-[var(--v-border)] text-[var(--v-text-muted)] hover:border-[var(--v-primary)]"
      }`}
    >
      {icon} {label}
    </button>
  );
}

// ============================================================
// Helpers
// ============================================================

function Metric({ label, value }: { label: string; value: string }) {
  return (
    <span className="inline-flex items-center gap-1 rounded-[var(--v-radius-md)] border border-[var(--v-border)] bg-[var(--v-surface)] px-2 py-0.5 text-[10px] text-[var(--v-text-muted)]">
      {label}
      <b className="font-mono-plex text-[var(--v-text)]">{value}</b>
    </span>
  );
}

function ReadinessBadge({ score }: { score: number }) {
  const tone =
    score >= 75
      ? "bg-[var(--v-green)]/10 text-[var(--v-green)]"
      : score >= 50
        ? "bg-[var(--v-amber)]/10 text-[var(--v-amber)]"
        : "bg-[var(--v-red)]/10 text-[var(--v-red)]";
  return (
    <Tooltip label="جاهزية المشروع = دمج الاكتمال + مراجعة الأقسام + المعالجة">
      <span
        className={`inline-flex cursor-help items-center gap-1 rounded-full px-3 py-1 text-xs font-bold ${tone}`}
      >
        جاهزية {score}%
      </span>
    </Tooltip>
  );
}

function statusLabel(status: BrainDocumentRow["status"]): string {
  switch (status) {
    case "draft":
      return "مسودّة";
    case "in_review":
      return "قيد المراجعة";
    case "approved":
      return "معتمد";
    case "rejected":
      return "مرفوض";
    case "archived":
      return "مؤرشف";
  }
}
function statusTone(status: BrainDocumentRow["status"]): "warning" | "info" | "success" | "danger" | "neutral" {
  switch (status) {
    case "draft":
      return "warning";
    case "in_review":
      return "info";
    case "approved":
      return "success";
    case "rejected":
      return "danger";
    case "archived":
      return "neutral";
  }
}
function reviewTone(state: SectionReviewState): "success" | "warning" | "danger" {
  switch (state) {
    case "approved":
      return "success";
    case "needs_review":
      return "warning";
    case "rejected":
      return "danger";
  }
}
