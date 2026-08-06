import type { DeveloperHandoff, DeveloperHandoffSectionKey, GapReport } from "@/lib/types/database";
import { DEVELOPER_HANDOFF_SECTION_KEYS } from "@/lib/types/database";

/**
 * طبقة Export — تجميع الأقسام السبعة لمستند Markdown نهائي بعناوين
 * ثابتة ومضمونة الترتيب. منطق تنسيق خالص، بدون أي استدعاء AI أو قاعدة بيانات.
 */
export const sectionHeadings: Record<DeveloperHandoffSectionKey, string> = {
  project_overview: "Project Overview",
  repository_environment: "Repository & Environment",
  expected_behavior: "Expected Behavior",
  known_state: "Known State",
  review_focus_areas: "Review Focus Areas",
  bug_reporting_format: "Bug Reporting Format",
  review_acceptance_criteria: "Review Acceptance Criteria",
};

function bulletList(items: string[]): string {
  return items.length > 0 ? items.map((i) => `- ${i}`).join("\n") : "—";
}

function formatKnownState(report: GapReport): string {
  const lines: string[] = [];

  lines.push("### User Stories");
  for (const s of report.user_stories) {
    const status = s.pm_override?.status ?? s.ai_status;
    lines.push(`- **${s.story}** — ${status}${s.ai_gap ? ` (${s.ai_gap})` : ""}`);
  }

  lines.push("\n### Acceptance Criteria");
  for (const c of report.acceptance_criteria_results) {
    const status = c.pm_override?.status ?? c.ai_status;
    lines.push(`- **${c.criterion}** — ${status}${c.ai_gap ? ` (${c.ai_gap})` : ""}`);
  }

  lines.push("\n### Missing Features");
  lines.push(bulletList(report.missing_features));
  lines.push("\n### Scope Creep");
  lines.push(bulletList(report.scope_creep));
  lines.push("\n### Non-Functional Gaps");
  lines.push(bulletList(report.non_functional_gaps));
  lines.push("\n### Unresolved Risks");
  lines.push(bulletList(report.unresolved_risks));
  lines.push("\n### Recommendation (from latest Prototype Review)");
  lines.push(report.recommendation_summary || "—");

  return lines.join("\n");
}

function formatSection(key: DeveloperHandoffSectionKey, handoff: DeveloperHandoff): string {
  const content = handoff.package_content;

  switch (key) {
    case "project_overview":
      return content.project_overview.summary || "—";
    case "repository_environment": {
      const r = content.repository_environment;
      return [
        `- **Repository**: ${r.repo_url || "—"}`,
        `- **Branch/Commit**: ${r.repo_ref || "—"}`,
        "",
        "**Local Setup Steps**:",
        bulletList(r.setup_steps),
      ].join("\n");
    }
    case "expected_behavior":
      return bulletList(content.expected_behavior.items.map((i) => i.statement));
    case "known_state":
      return formatKnownState(content.known_state);
    case "review_focus_areas":
      return content.review_focus_areas.items
        .map((i) => `- **${i.area}** (${i.priority}) — ${i.reason}`)
        .join("\n");
    case "bug_reporting_format":
      return content.bug_reporting_format.template;
    case "review_acceptance_criteria":
      return bulletList(content.review_acceptance_criteria.items);
    default:
      return "—";
  }
}

export function assembleHandoffMarkdown(handoff: DeveloperHandoff): string {
  return DEVELOPER_HANDOFF_SECTION_KEYS.map(
    (key) => `# ${sectionHeadings[key]}\n\n${formatSection(key, handoff)}`
  ).join("\n\n");
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
