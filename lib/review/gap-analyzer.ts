import type { GapReport } from "@/lib/types/database";

/**
 * طبقة Gap Analyzer — حساب حتمي (مش تخمين AI) لنسبة الإنجاز وحالة
 * المراجعة الإجمالية، اعتمادًا على نتائج Acceptance Criteria فقط.
 */

function effectiveStatus(item: { ai_status: string; pm_override: { status: string } | null }) {
  return item.pm_override?.status ?? item.ai_status;
}

export function calculateCompletionPercentage(report: GapReport): number {
  const total = report.acceptance_criteria_results.length;
  if (total === 0) return 0;

  const implemented = report.acceptance_criteria_results.filter(
    (c) => effectiveStatus(c) === "implemented"
  ).length;

  return Math.round((implemented / total) * 100);
}

export function calculateOverallStatus(
  report: GapReport,
  completionPercentage: number
): "ready" | "needs_changes" | "blocked" {
  if (report.missing_features.length > 0 || completionPercentage < 50) {
    return "blocked";
  }
  if (completionPercentage === 100 && report.unresolved_risks.length === 0) {
    return "ready";
  }
  return "needs_changes";
}
