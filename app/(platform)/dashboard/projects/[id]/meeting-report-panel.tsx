import { FileText } from "lucide-react";
import Tooltip from "@/components/ui/Tooltip";
import type { MeetingReportData } from "@/lib/meetings/report-service";

function confidenceTone(score: number): "success" | "warning" | "danger" {
  if (score >= 75) return "success";
  if (score >= 50) return "warning";
  return "danger";
}

function ConfidenceBadge({ score, evidence }: { score: number; evidence: string | null }) {
  const tone = confidenceTone(score);
  return (
    <Tooltip label={evidence ? `"${evidence}"` : `ثقة ${score}%`}>
      <span
        className={`inline-flex shrink-0 cursor-help items-center gap-1 rounded-full px-2 py-0.5 text-[10px] font-medium ${
          tone === "success"
            ? "bg-[var(--v-green)]/10 text-[var(--v-green)]"
            : tone === "warning"
              ? "bg-[var(--v-amber)]/10 text-[var(--v-amber)]"
              : "bg-[var(--v-red)]/10 text-[var(--v-red)]"
        }`}
      >
        {score}%
      </span>
    </Tooltip>
  );
}

function ReportSection({ title, items }: { title: string; items: { id: string; text: string; confidence_score: number; evidence_quote: string | null }[] }) {
  if (items.length === 0) return null;
  return (
    <div>
      <p className="mb-1.5 text-[11px] font-semibold text-[var(--v-text-muted)]">
        {title} ({items.length})
      </p>
      <div className="space-y-1">
        {items.map((item) => (
          <div key={item.id} className="flex items-start justify-between gap-2 rounded-[var(--v-radius-md)] bg-[var(--v-surface)] p-2 text-sm">
            <span className="text-[var(--v-text)]">{item.text}</span>
            <ConfidenceBadge score={item.confidence_score} evidence={item.evidence_quote} />
          </div>
        ))}
      </div>
    </div>
  );
}

/**
 * تقرير الاجتماع الغني — "زي Discovery Analysis" بالنص: 13 فئة منفصلة
 * كل واحدة بعناصرها ودرجات ثقتها ودليلها (Evidence Tooltip). المصدر
 * الجداول المُطبّعة (Migration 0050)، مش meeting_reviews القديمة.
 */
export default function MeetingReportPanel({ report }: { report: MeetingReportData }) {
  const totalItems =
    report.decisions.length +
    report.functionalRequirements.length +
    report.nonFunctionalRequirements.length +
    report.risks.length +
    report.questions.length +
    report.tasks.length +
    report.businessRules.length +
    report.painPoints.length +
    report.constraints.length +
    report.ideas.length +
    report.dependencies.length +
    report.conflicts.length +
    report.missingInformation.length;

  if (totalItems === 0) {
    return <p className="text-xs text-[var(--v-text-muted)]">لا يوجد تقرير غني بعد لهذا الاجتماع.</p>;
  }

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <p className="flex items-center gap-2 text-xs font-semibold text-[var(--v-text)]">
          <FileText size={14} className="text-[var(--v-primary)]" /> تقرير الاجتماع الذكي
        </p>
        {report.overallConfidence !== null && <ConfidenceBadge score={report.overallConfidence} evidence={null} />}
      </div>
      <ReportSection title="القرارات" items={report.decisions} />
      <ReportSection title="المتطلبات الوظيفية" items={report.functionalRequirements} />
      <ReportSection title="المتطلبات غير الوظيفية" items={report.nonFunctionalRequirements} />
      <ReportSection title="قواعد العمل" items={report.businessRules} />
      <ReportSection title="نقاط الألم" items={report.painPoints} />
      <ReportSection title="المخاطر" items={report.risks} />
      <ReportSection title="القيود" items={report.constraints} />
      <ReportSection title="الأسئلة المفتوحة" items={report.questions} />
      <ReportSection title="الأفكار" items={report.ideas} />
      <ReportSection title="المهام" items={report.tasks} />
      <ReportSection title="الاعتماديات" items={report.dependencies} />
      <ReportSection title="التعارضات" items={report.conflicts} />
      <ReportSection title="معلومات ناقصة" items={report.missingInformation} />
    </div>
  );
}
