import type { GapReport, PrototypeReview, AcceptanceCriterionReview, UserStoryReview } from "@/lib/types/database";

const statusLabels: Record<string, string> = {
  implemented: "Implemented",
  partially_implemented: "Partially Implemented",
  implemented_differently: "Implemented Differently",
  not_implemented: "Not Implemented",
};

function effectiveStatus(item: UserStoryReview | AcceptanceCriterionReview): string {
  return item.pm_override?.status ?? item.ai_status;
}

function formatEvidence(item: UserStoryReview | AcceptanceCriterionReview): string {
  if (!item.ai_evidence || item.ai_evidence.length === 0) return "—";
  return item.ai_evidence
    .map((e) => `${e.file}${e.function_or_component ? ` (${e.function_or_component})` : ""}${e.line ? `:${e.line}` : ""}`)
    .join(", ");
}

/**
 * طبقة Export — تنسيق تقرير الفجوات لمستند Markdown قابل للمشاركة.
 * منطق تنسيق خالص، بدون أي استدعاء AI أو قاعدة بيانات.
 */
export function formatReviewAsMarkdown(projectName: string, review: PrototypeReview): string {
  const report: GapReport = review.gap_report;
  const lines: string[] = [];

  lines.push(`# Prototype Review — ${projectName}`);
  lines.push(
    `_نسخة ${review.version} · ${review.completion_percentage}% مكتمل · الحالة: ${review.overall_status} · ${new Date(review.updated_at).toLocaleString("ar-EG")}_`
  );
  lines.push(`_Repository: ${review.repo_url} @ ${review.repo_ref.slice(0, 8)}_`);
  lines.push("");

  lines.push("## User Stories");
  for (const s of report.user_stories) {
    lines.push(`### ${s.story}`);
    lines.push(`- **Status**: ${statusLabels[effectiveStatus(s)]}${s.pm_override ? " (PM Override)" : ""}`);
    lines.push(`- **Evidence**: ${formatEvidence(s)}`);
    if (s.ai_gap) lines.push(`- **Gap**: ${s.ai_gap}`);
    lines.push("");
  }

  lines.push("## Acceptance Criteria");
  for (const c of report.acceptance_criteria_results) {
    lines.push(`- **${c.criterion}** — ${statusLabels[effectiveStatus(c)]}${c.pm_override ? " (PM Override)" : ""}`);
    lines.push(`  - Evidence: ${formatEvidence(c)}`);
    if (c.ai_gap) lines.push(`  - Gap: ${c.ai_gap}`);
  }
  lines.push("");

  lines.push("## Missing Features");
  lines.push(...bulletList(report.missing_features));
  lines.push("");

  lines.push("## Scope Creep");
  lines.push(...bulletList(report.scope_creep));
  lines.push("");

  lines.push("## Non-Functional Gaps");
  lines.push(...bulletList(report.non_functional_gaps));
  lines.push("");

  lines.push("## Unresolved Risks");
  lines.push(...bulletList(report.unresolved_risks));
  lines.push("");

  lines.push("## Recommendation");
  lines.push(report.recommendation_summary || "—");

  return lines.join("\n");
}

function bulletList(items: string[]): string[] {
  return items.length > 0 ? items.map((i) => `- ${i}`) : ["—"];
}

export function downloadMarkdown(filename: string, content: string): void {
  const blob = new Blob([content], { type: "text/markdown;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
}
