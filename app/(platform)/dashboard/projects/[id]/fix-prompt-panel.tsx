import { Wrench } from "lucide-react";
import Card from "@/components/ui/Card";
import Badge from "@/components/ui/Badge";
import EmptyState from "@/components/ui/EmptyState";
import type { QaFixLoop, ExecutionTask } from "@/lib/types/database";

const STATUS_TONE: Record<QaFixLoop["status"], "success" | "danger" | "warning" | "primary"> = {
  fixed: "success",
  failed: "danger",
  max_attempts_reached: "danger",
  running: "warning",
};

const STATUS_LABEL: Record<QaFixLoop["status"], string> = {
  fixed: "تم الإصلاح",
  failed: "فشل الإصلاح",
  max_attempts_reached: "استُنفدت المحاولات",
  running: "جاري",
};

const QA_STAGE_LABEL: Record<QaFixLoop["qa_stage"], string> = {
  engineering_qa: "Engineering QA",
  accessibility_qa: "Accessibility QA",
};

/**
 * "Fix Prompt" مرحلة جديدة في الـ Workflow Engine — من غير أي جدول
 * جديد: بتعرض qa_fix_loops الموجودة أصلًا (AI Code Execution Engine،
 * Phase-ClaudeExec) وبرومبت الإصلاح المولّد فعليًا (fix_prompt) لكل
 * محاولة، بدل ما يفضل مدفون جوّه تبويب AI Code Execution بس.
 */
export default function FixPromptPanel({ qaFixLoops, executionTasks }: { qaFixLoops: QaFixLoop[]; executionTasks: ExecutionTask[] }) {
  const tasksById = new Map(executionTasks.map((t) => [t.id, t]));

  if (qaFixLoops.length === 0) {
    return (
      <Card padding="md">
        <EmptyState
          title="لا توجد برومبتات إصلاح بعد"
          description="بتتولّد تلقائيًا لو Engineering QA أو Accessibility QA طلعت Findings بخطورة تستوجب إصلاح، بعد تنفيذ AI Code Execution."
        />
      </Card>
    );
  }

  return (
    <Card padding="md">
      <p className="mb-3 flex items-center gap-2 text-sm font-semibold text-[var(--v-text)]">
        <Wrench size={16} className="text-[var(--v-warning)]" /> برومبتات الإصلاح المولّدة
      </p>
      <div className="space-y-3">
        {qaFixLoops.map((loop) => {
          const fixTask = loop.fix_task_id ? tasksById.get(loop.fix_task_id) : null;
          return (
            <div key={loop.id} className="rounded-[var(--v-radius-md)] border border-[var(--v-border)] p-3">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div className="flex items-center gap-2">
                  <Badge tone="primary">{QA_STAGE_LABEL[loop.qa_stage]}</Badge>
                  <span className="text-xs text-[var(--v-text-muted)]">محاولة {loop.attempt_number}</span>
                </div>
                <Badge tone={STATUS_TONE[loop.status]}>{STATUS_LABEL[loop.status]}</Badge>
              </div>
              {loop.findings_summary && <p className="mt-2 text-xs text-[var(--v-text-secondary)]">{loop.findings_summary}</p>}
              {loop.fix_prompt && (
                <pre className="mt-2 max-h-64 overflow-auto whitespace-pre-wrap rounded-[var(--v-radius-sm)] bg-[var(--v-surface-muted)] p-2.5 font-mono-plex text-[11px] text-[var(--v-text)]">
                  {loop.fix_prompt}
                </pre>
              )}
              {fixTask && (
                <p className="mt-2 text-xs text-[var(--v-text-muted)]">
                  مهمة التنفيذ: <span className="font-medium text-[var(--v-text)]">{fixTask.title}</span> — {fixTask.status}
                </p>
              )}
            </div>
          );
        })}
      </div>
    </Card>
  );
}
