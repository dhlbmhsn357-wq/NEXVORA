"use client";

import { useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Sparkles, ThumbsUp, ThumbsDown, Clock, MessageCircle, History, Wand2, Link2 } from "lucide-react";
import Card from "@/components/ui/Card";
import Badge, { type BadgeTone } from "@/components/ui/Badge";
import Button from "@/components/ui/Button";
import Modal from "@/components/ui/Modal";
import EmptyState from "@/components/ui/EmptyState";
import { toast } from "@/components/ui/Toaster";
import {
  setRecommendationStatusAction,
  generateRecommendationsAction,
  getRecommendationVersionsAction,
} from "./organizational-intelligence-actions";
import {
  RECOMMENDATION_CATEGORY_LABELS,
  RECOMMENDATION_LEVEL_LABELS,
  RECOMMENDATION_STATUS_LABELS,
} from "@/lib/organizational-intelligence/recommendation-labels";
import type { ProjectRecommendation, RecommendationDependency, RecommendationStatus, RecommendationVersion } from "@/lib/types/database";

const PRIORITY_GROUPS = ["critical", "high", "medium", "low"] as const;
const PRIORITY_LABELS: Record<string, string> = { critical: "حرجة", high: "عالية", medium: "متوسطة", low: "منخفضة" };
const PRIORITY_TONE: Record<string, BadgeTone> = { critical: "danger", high: "warning", medium: "info", low: "neutral" };
/** لون شريط الأولوية (accent) — يوحّد المسح البصري لبطاقات التوصيات. */
const PRIORITY_ACCENT: Record<string, string> = { critical: "var(--v-red)", high: "var(--v-amber)", medium: "var(--v-info)", low: "var(--v-border-strong)" };

/**
 * تبويب مستقل لتوصيات Cross-Project Intelligence + شبكة المعرفة (Phase
 * 4) — كان جزء من تبويب "الذكاء التنظيمي" في الآخر، لكن التوصيات دي
 * قرارات بتخص مراجعة المشروع نفسه (قبول/رفض/تأجيل/نقاش) فمكانها
 * الطبيعي جنب Project Brain مباشرة مش آخر الصفحة. "الذكاء التنظيمي"
 * فضل فيه AI Product Advisor وذاكرة القرارات فقط — راجع
 * organizational-intelligence-panel.tsx.
 */
export default function SmartRecommendationsPanel({
  projectId,
  recommendations,
  dependencies,
  canManage,
}: {
  projectId: string;
  recommendations: ProjectRecommendation[];
  dependencies: RecommendationDependency[];
  canManage: boolean;
}) {
  const [isPending, startAction] = useTransition();
  const router = useRouter();
  const [isGenerating, setIsGenerating] = useState(false);
  const [priorityFilter, setPriorityFilter] = useState<string | null>(null);
  const [categoryFilter, setCategoryFilter] = useState<string | null>(null);
  const [decidingId, setDecidingId] = useState<string | null>(null);
  const [decisionReason, setDecisionReason] = useState("");
  const [pendingDecisionStatus, setPendingDecisionStatus] = useState<RecommendationStatus | null>(null);
  const [historyId, setHistoryId] = useState<string | null>(null);
  const [historyVersions, setHistoryVersions] = useState<RecommendationVersion[]>([]);
  const [historyLoading, setHistoryLoading] = useState(false);

  const byId = useMemo(() => new Map(recommendations.map((r) => [r.id, r])), [recommendations]);

  const openRecommendations = useMemo(() => {
    return recommendations
      .filter((r) => r.status === "suggested")
      .filter((r) => !priorityFilter || r.priority === priorityFilter)
      .filter((r) => !categoryFilter || r.category === categoryFilter);
  }, [recommendations, priorityFilter, categoryFilter]);

  const resolvedRecommendations = recommendations.filter((r) => r.status !== "suggested");
  const categories = useMemo(() => [...new Set(recommendations.map((r) => r.category))], [recommendations]);

  function dependencyTitlesFor(recommendationId: string): string[] {
    return dependencies
      .filter((d) => d.recommendation_id === recommendationId)
      .map((d) => byId.get(d.depends_on_recommendation_id)?.recommendation)
      .filter((t): t is string => !!t);
  }

  function openDecision(id: string, status: RecommendationStatus) {
    if (status === "accepted" || status === "dismissed") {
      // قبول/رفض السريعين ما يحتاجوش سبب إلزامي
      startAction(async () => {
        const r = await setRecommendationStatusAction(projectId, id, status);
        if (!r.ok) toast.error(r.message ?? "فشلت العملية.");
      });
      return;
    }
    setDecidingId(id);
    setPendingDecisionStatus(status);
    setDecisionReason("");
  }

  function submitDecision() {
    if (!decidingId || !pendingDecisionStatus) return;
    if (!decisionReason.trim()) {
      toast.error("اكتب السبب.");
      return;
    }
    const id = decidingId;
    const status = pendingDecisionStatus;
    const reason = decisionReason;
    setDecidingId(null);
    setPendingDecisionStatus(null);
    startAction(async () => {
      const r = await setRecommendationStatusAction(projectId, id, status, reason);
      if (!r.ok) toast.error(r.message ?? "فشلت العملية.");
    });
  }

  async function openHistory(id: string) {
    setHistoryId(id);
    setHistoryLoading(true);
    const r = await getRecommendationVersionsAction(id);
    setHistoryLoading(false);
    if (!r.ok) {
      toast.error(r.message);
      setHistoryVersions([]);
      return;
    }
    setHistoryVersions(r.versions);
  }

  async function handleGenerate() {
    setIsGenerating(true);
    toast.success("جاري توليد التوصيات — بياخد حوالي دقيقة، سيب الصفحة مفتوحة.");
    const r = await generateRecommendationsAction(projectId);
    setIsGenerating(false);
    if (r.status === "error") {
      toast.error(r.message);
      return;
    }
    if (r.status === "skipped") {
      // سبب حقيقي واضح بدل صمت — مثلاً: مفيش تحليل اكتشاف مكتمل بعد.
      toast.error(r.message);
      return;
    }
    toast.success(`تم توليد ${r.generated} توصية.`);
    router.refresh();
  }

  return (
    <div className="space-y-4">
      <Card padding="md">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <p className="flex items-center gap-2 text-sm font-semibold text-[var(--v-text)]">
            <Sparkles size={16} className="text-[var(--v-info)]" /> توصيات ذكية (Cross-Project + شبكة المعرفة)
          </p>
          {canManage && (
            <Button variant="outline" size="sm" icon={<Wand2 size={13} />} onClick={handleGenerate} disabled={isGenerating}>
              {isGenerating ? "جاري التوليد..." : "توليد توصيات"}
            </Button>
          )}
        </div>

        {recommendations.length > 0 && (
          <div className="mt-3 flex flex-wrap items-center gap-1.5">
            <FilterChip active={priorityFilter === null} onClick={() => setPriorityFilter(null)} label="كل الأولويات" />
            {PRIORITY_GROUPS.map((p) => (
              <FilterChip key={p} active={priorityFilter === p} onClick={() => setPriorityFilter(priorityFilter === p ? null : p)} label={PRIORITY_LABELS[p]} />
            ))}
            {categories.length > 1 && (
              <>
                <span className="mx-1 h-4 w-px bg-[var(--v-border)]" />
                <FilterChip active={categoryFilter === null} onClick={() => setCategoryFilter(null)} label="كل الفئات" />
                {categories.map((c) => (
                  <FilterChip key={c} active={categoryFilter === c} onClick={() => setCategoryFilter(categoryFilter === c ? null : c)} label={RECOMMENDATION_CATEGORY_LABELS[c] ?? c} />
                ))}
              </>
            )}
          </div>
        )}
      </Card>

      {openRecommendations.length === 0 ? (
        <Card padding="lg">
          <EmptyState
            title="لا توجد توصيات معلّقة"
            description="بتتولّد تلقائيًا عند اعتماد Project Brain (من مشاريع سابقة مشابهة أو تحليل شبكة المعرفة)، أو يدويًا بزر «توليد توصيات» فوق — مفيش توصية بدون دليل."
          />
        </Card>
      ) : (
        <div className="space-y-2">
          {openRecommendations.map((r) => (
            <RecommendationCard
              key={r.id}
              r={r}
              canManage={canManage}
              isPending={isPending}
              dependsOnTitles={dependencyTitlesFor(r.id)}
              onDecide={(status) => openDecision(r.id, status)}
              onHistory={() => openHistory(r.id)}
            />
          ))}
        </div>
      )}

      {resolvedRecommendations.length > 0 && (
        <details className="rounded-[var(--v-radius-lg)] border border-[var(--v-border)]">
          <summary className="cursor-pointer px-4 py-2.5 text-sm font-medium text-[var(--v-text-secondary)]">
            توصيات محسومة ({resolvedRecommendations.length})
          </summary>
          <div className="space-y-2 p-3 pt-0">
            {resolvedRecommendations.map((r) => (
              <RecommendationCard
                key={r.id}
                r={r}
                canManage={false}
                isPending={false}
                dependsOnTitles={dependencyTitlesFor(r.id)}
                onDecide={() => {}}
                onHistory={() => openHistory(r.id)}
              />
            ))}
          </div>
        </details>
      )}

      {/* Modal السبب — للتأجيل/النقاش (إلزامي) */}
      <Modal open={decidingId !== null} onClose={() => setDecidingId(null)}>
        <div className="p-4">
          <p className="mb-2 text-sm font-semibold text-[var(--v-text)]">
            {pendingDecisionStatus ? `سبب: ${RECOMMENDATION_STATUS_LABELS[pendingDecisionStatus]}` : ""}
          </p>
          <textarea
            className="w-full rounded-[var(--v-radius-md)] border border-[var(--v-border)] bg-[var(--v-surface)] p-2 text-sm text-[var(--v-text)]"
            rows={3}
            value={decisionReason}
            onChange={(e) => setDecisionReason(e.target.value)}
            placeholder="اكتب السبب هنا..."
          />
          <div className="mt-3 flex justify-end gap-2">
            <Button variant="outline" size="sm" onClick={() => setDecidingId(null)}>
              إلغاء
            </Button>
            <Button variant="primary" size="sm" onClick={submitDecision}>
              تأكيد
            </Button>
          </div>
        </div>
      </Modal>

      {/* Modal سجل النسخ */}
      <Modal open={historyId !== null} onClose={() => setHistoryId(null)}>
        <div className="p-4">
          <p className="mb-3 flex items-center gap-2 text-sm font-semibold text-[var(--v-text)]">
            <History size={15} /> سجل النسخ
          </p>
          {historyLoading ? (
            <p className="text-xs text-[var(--v-text-muted)]">جاري التحميل...</p>
          ) : historyVersions.length === 0 ? (
            <p className="text-xs text-[var(--v-text-muted)]">لا يوجد سجل.</p>
          ) : (
            <div className="max-h-80 space-y-2 overflow-y-auto">
              {historyVersions.map((v) => (
                <div key={v.id} className="rounded-[var(--v-radius-md)] border border-[var(--v-border)] p-2">
                  <div className="flex items-center justify-between">
                    <span className="font-mono-plex text-[11px] text-[var(--v-text-subtle)]">v{v.version}</span>
                    <span className="text-[11px] text-[var(--v-text-muted)]">{new Date(v.created_at).toLocaleString("ar-EG")}</span>
                  </div>
                  <p className="mt-1 text-xs text-[var(--v-text-secondary)]">{v.change_reason || "—"}</p>
                </div>
              ))}
            </div>
          )}
        </div>
      </Modal>
    </div>
  );
}

function FilterChip({ active, onClick, label }: { active: boolean; onClick: () => void; label: string }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`rounded-full px-2.5 py-1 text-[11px] font-medium transition-colors ${
        active
          ? "bg-[var(--v-primary)] text-white"
          : "bg-[var(--v-surface-muted)] text-[var(--v-text-muted)] hover:text-[var(--v-text)]"
      }`}
    >
      {label}
    </button>
  );
}

function RecommendationCard({
  r,
  canManage,
  isPending,
  dependsOnTitles,
  onDecide,
  onHistory,
}: {
  r: ProjectRecommendation;
  canManage: boolean;
  isPending: boolean;
  dependsOnTitles: string[];
  onDecide: (status: RecommendationStatus) => void;
  onHistory: () => void;
}) {
  return (
    <div
      className="rounded-[var(--v-radius-md)] border border-[var(--v-border)] p-3 transition-shadow hover:shadow-[var(--v-shadow-sm)]"
      style={r.priority ? { borderRightWidth: 3, borderRightColor: PRIORITY_ACCENT[r.priority] ?? "var(--v-border-strong)" } : undefined}
    >
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex flex-wrap items-center gap-1.5">
          <Badge tone="primary">{RECOMMENDATION_CATEGORY_LABELS[r.category] ?? r.category}</Badge>
          {r.priority && <Badge tone={PRIORITY_TONE[r.priority] ?? "neutral"}>{RECOMMENDATION_LEVEL_LABELS[r.priority] ?? r.priority}</Badge>}
          {r.status !== "suggested" && <Badge tone="neutral">{RECOMMENDATION_STATUS_LABELS[r.status] ?? r.status}</Badge>}
          <span className="text-[11px] tabular-nums text-[var(--v-text-muted)]">ثقة {r.confidence_score}%</span>
          {r.evidence_source === "knowledge_graph" && <span className="text-[11px] text-[var(--v-info)]">من شبكة المعرفة</span>}
          {r.evidence_source === "both" && <span className="text-[11px] text-[var(--v-info)]">دليل مزدوج</span>}
        </div>
        <div className="flex items-center gap-1.5">
          <Button variant="ghost" size="sm" onClick={onHistory} title="سجل النسخ">
            <History size={13} />
          </Button>
          {canManage && (
            <>
              <Button variant="outline" size="sm" onClick={() => onDecide("accepted")} disabled={isPending}>
                <ThumbsUp size={13} /> قبول
              </Button>
              <Button variant="outline" size="sm" onClick={() => onDecide("dismissed")} disabled={isPending}>
                <ThumbsDown size={13} /> رفض
              </Button>
              <Button variant="outline" size="sm" onClick={() => onDecide("postponed")} disabled={isPending}>
                <Clock size={13} /> تأجيل
              </Button>
              <Button variant="outline" size="sm" onClick={() => onDecide("needs_discussion")} disabled={isPending}>
                <MessageCircle size={13} /> نقاش
              </Button>
            </>
          )}
        </div>
      </div>
      <p className="mt-2 text-sm font-medium text-[var(--v-text)]">{r.recommendation}</p>
      {r.rationale && <p className="mt-1 text-xs text-[var(--v-text-secondary)]">{r.rationale}</p>}
      {r.expected_benefits && <p className="mt-1 text-xs text-[var(--v-green)]">الفائدة: {r.expected_benefits}</p>}
      {r.affected_modules.length > 0 && (
        <p className="mt-1 text-[11px] text-[var(--v-text-muted)]">الوحدات المتأثرة: {r.affected_modules.join("، ")}</p>
      )}
      {(r.supporting_project_ids.length > 0 || r.supporting_knowledge_node_ids.length > 0) && (
        <p className="mt-1 text-[11px] text-[var(--v-text-subtle)]">
          مصدر التوصية:
          {r.supporting_project_ids.length > 0 && ` ${r.supporting_project_ids.length} مشروع سابق`}
          {r.supporting_project_ids.length > 0 && r.supporting_knowledge_node_ids.length > 0 && "، "}
          {r.supporting_knowledge_node_ids.length > 0 && ` ${r.supporting_knowledge_node_ids.length} عنصر معرفة`}
        </p>
      )}
      {dependsOnTitles.length > 0 && (
        <p className="mt-1.5 flex items-start gap-1 text-[11px] text-[var(--v-amber)]">
          <Link2 size={12} className="mt-0.5 shrink-0" /> يتطلب أولًا: {dependsOnTitles.join("، ")}
        </p>
      )}
    </div>
  );
}
