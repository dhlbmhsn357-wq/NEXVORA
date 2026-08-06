"use client";

import { useEffect, useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Wand2, BookOpen, ShieldCheck } from "lucide-react";
import Card from "@/components/ui/Card";
import Badge, { type BadgeTone } from "@/components/ui/Badge";
import Button from "@/components/ui/Button";
import EmptyState from "@/components/ui/EmptyState";
import { startAdvisorAnalysisAction } from "./organizational-intelligence-actions";
import type { DecisionMemoryEntry, KnowledgeExtractionJob, ProductAdvisorAnalysis } from "@/lib/types/database";
import type { ProductAdvisorResult } from "@/lib/ai/validation/organizational-intelligence";

const OUTCOME_TONE: Record<string, BadgeTone> = { succeeded: "success", failed: "danger", unknown: "neutral" };
const OUTCOME_LABEL: Record<string, string> = { succeeded: "نجح", failed: "فشل", unknown: "غير معروف" };

function AdvisorSection({ result }: { result: ProductAdvisorResult }) {
  const groups: Array<{ title: string; items: string[]; tone: BadgeTone }> = [
    { title: "نقاط القوة", items: result.strengths, tone: "success" },
    { title: "نقاط الضعف", items: result.weaknesses, tone: "danger" },
    { title: "فرص لم تُستغل", items: result.missing_opportunities, tone: "info" },
    { title: "مخاطر محتملة", items: result.risks, tone: "warning" },
    { title: "ملاحظات قابلية التوسع", items: result.scalability_notes, tone: "neutral" },
    { title: "ملاحظات قابلية الصيانة", items: result.maintainability_notes, tone: "neutral" },
  ];

  return (
    <div className="mt-4 space-y-4">
      {groups
        .filter((g) => g.items.length > 0)
        .map((g) => (
          <div key={g.title}>
            <p className="mb-1.5 text-xs font-semibold text-[var(--v-text)]">{g.title}</p>
            <ul className="space-y-1">
              {g.items.map((item, i) => (
                <li key={i} className="flex items-start gap-1.5 text-xs text-[var(--v-text-secondary)]">
                  <Badge tone={g.tone}>•</Badge>
                  <span>{item}</span>
                </li>
              ))}
            </ul>
          </div>
        ))}
      {(result.business_impact || result.technical_impact) && (
        <div className="grid gap-3 sm:grid-cols-2">
          {result.business_impact && (
            <div className="rounded-[var(--v-radius-md)] bg-[var(--v-surface)] p-3">
              <p className="mb-1 text-xs font-semibold text-[var(--v-text)]">الأثر على العمل</p>
              <p className="text-xs text-[var(--v-text-secondary)]">{result.business_impact}</p>
            </div>
          )}
          {result.technical_impact && (
            <div className="rounded-[var(--v-radius-md)] bg-[var(--v-surface)] p-3">
              <p className="mb-1 text-xs font-semibold text-[var(--v-text)]">الأثر التقني</p>
              <p className="text-xs text-[var(--v-text-secondary)]">{result.technical_impact}</p>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

export default function OrganizationalIntelligencePanel({
  projectId,
  decisionMemory,
  extractionJob,
  advisorAnalysis,
}: {
  projectId: string;
  decisionMemory: DecisionMemoryEntry[];
  extractionJob: KnowledgeExtractionJob | null;
  advisorAnalysis: ProductAdvisorAnalysis | null;
}) {
  const router = useRouter();
  const [startError, setStartError] = useState<string | null>(null);
  const [isStarting, startTransition] = useTransition();
  const lastRefreshAtRef = useRef(0);
  const rootRef = useRef<HTMLDivElement>(null);

  const isGenerating = advisorAnalysis?.status === "generating";

  function runAdvisor() {
    setStartError(null);
    startTransition(async () => {
      const result = await startAdvisorAnalysisAction(projectId);
      if (result.status === "error") setStartError(result.message);
      router.refresh();
    });
  }

  // التحليل بقى Background Job مُخزَّن (كان قبل كده نداء متزامن نتيجته
  // بتضيع فور تغيير التبويب أو الـ Refresh) — نفس منطق الـ Polling
  // المُصلَّح في Engineering QA: فاصل معقول + حد أدنى بين التحديثات +
  // توقف لو التبويب مش ظاهر، بدل تحديث الصفحة كاملة كل ثانية.
  useEffect(() => {
    if (!isGenerating) return;
    const MIN_REFRESH_INTERVAL_MS = 4000;
    const id = setInterval(() => {
      if (document.visibilityState === "hidden") return;
      if (rootRef.current && rootRef.current.offsetParent === null) return;
      const now = Date.now();
      if (now - lastRefreshAtRef.current < MIN_REFRESH_INTERVAL_MS) return;
      lastRefreshAtRef.current = now;
      router.refresh();
    }, 5000);
    return () => clearInterval(id);
  }, [isGenerating, router]);

  const advisorResult = advisorAnalysis?.status === "ready" ? (advisorAnalysis.result as ProductAdvisorResult) : null;
  const advisorFailedMessage = advisorAnalysis?.status === "failed" ? advisorAnalysis.last_error : null;

  return (
    <div ref={rootRef} className="space-y-6">
      <Card padding="md">
        <div className="flex items-center justify-between">
          <p className="flex items-center gap-2 text-sm font-semibold text-[var(--v-text)]">
            <Wand2 size={16} className="text-[var(--v-primary)]" /> AI Product Advisor
          </p>
          <Button variant="primary" size="sm" onClick={runAdvisor} loading={isStarting || isGenerating}>
            تحليل استشاري للـ Brain الحالي
          </Button>
        </div>
        {startError && <p className="mt-2 text-xs text-[var(--v-red)]">{startError}</p>}
        {advisorFailedMessage && <p className="mt-2 text-xs text-[var(--v-red)]">{advisorFailedMessage}</p>}
        {advisorResult && <AdvisorSection result={advisorResult} />}
        {advisorAnalysis?.status === "ready" && (
          <p className="mt-3 text-[11px] text-[var(--v-text-muted)]">
            آخر تحليل: {new Date(advisorAnalysis.completed_at ?? advisorAnalysis.updated_at).toLocaleString("ar-EG")}
          </p>
        )}
      </Card>

      <Card padding="md">
        <p className="mb-3 flex items-center gap-2 text-sm font-semibold text-[var(--v-text)]">
          <BookOpen size={16} className="text-[var(--v-amber)]" /> ذاكرة القرارات (Decision Memory)
        </p>
        {decisionMemory.length === 0 ? (
          <EmptyState title="لا توجد قرارات مسجّلة بعد" description="بتُستخرج من Project Brain عند أرشفة المشروع." />
        ) : (
          <div className="space-y-2">
            {decisionMemory.map((d) => (
              <div key={d.id} className="rounded-[var(--v-radius-md)] border border-[var(--v-border)] p-3">
                <div className="flex items-center justify-between gap-2">
                  <p className="text-sm font-medium text-[var(--v-text)]">{d.decision_title}</p>
                  <Badge tone={OUTCOME_TONE[d.outcome]}>{OUTCOME_LABEL[d.outcome]}</Badge>
                </div>
                {d.question && <p className="mt-1 text-xs text-[var(--v-text-muted)]">{d.question}</p>}
                {d.rationale && <p className="mt-1 text-xs text-[var(--v-text-secondary)]">{d.rationale}</p>}
              </div>
            ))}
          </div>
        )}
      </Card>

      {extractionJob && (
        <Card padding="md">
          <p className="mb-2 flex items-center gap-2 text-sm font-semibold text-[var(--v-text)]">
            <ShieldCheck size={16} className="text-[var(--v-green)]" /> استخراج المعرفة التنظيمية
          </p>
          <p className="text-xs text-[var(--v-text-secondary)]">
            الحالة: <Badge tone={extractionJob.status === "ready" ? "success" : extractionJob.status === "failed" ? "danger" : "info"}>{extractionJob.status}</Badge>
            {extractionJob.status === "ready" && ` — تم استخراج ${extractionJob.extracted_count} عنصر معرفة جديد.`}
            {extractionJob.status === "failed" && extractionJob.last_error && ` — ${extractionJob.last_error}`}
          </p>
        </Card>
      )}
    </div>
  );
}
