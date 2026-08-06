import type { PRD } from "@/lib/types/database";

/**
 * طبقة Export — تنسيق بيانات PRD لأشكال قابلة للمشاركة (Markdown،
 * ومستند HTML مُعدّ للطباعة/PDF). منطق تنسيق خالص، بدون أي استدعاء AI
 * أو قراءة/كتابة قاعدة بيانات.
 */
export function formatPRDAsMarkdown(projectName: string, prd: PRD): string {
  const lines: string[] = [];

  lines.push(`# PRD — ${projectName}`);
  lines.push(`_نسخة ${prd.version} · آخر تحديث: ${new Date(prd.updated_at).toLocaleString("ar-EG")}_`);
  lines.push("");

  lines.push("## نظرة عامة");
  lines.push(prd.overview || "—");
  lines.push("");

  lines.push("## بيان المشكلة");
  lines.push(prd.problem_statement || "—");
  lines.push("");

  lines.push("## الأهداف");
  lines.push(...bulletList(prd.goals));
  lines.push("");

  lines.push("## خارج النطاق");
  lines.push(...bulletList(prd.out_of_scope));
  lines.push("");

  lines.push("## المستخدمون المستهدفون");
  lines.push(...bulletList(prd.target_users));
  lines.push("");

  lines.push("## قصص المستخدم");
  if (prd.user_stories.length === 0) lines.push("—");
  for (const s of prd.user_stories) {
    lines.push(`- ${s.role}، ${s.want}، ${s.benefit}`);
  }
  lines.push("");

  lines.push("## معايير القبول");
  if (prd.acceptance_criteria.length === 0) lines.push("—");
  for (const c of prd.acceptance_criteria) {
    lines.push(`- **Given** ${c.given} **When** ${c.when} **Then** ${c.then}`);
  }
  lines.push("");

  lines.push("## المتطلبات الوظيفية");
  lines.push(...bulletList(prd.functional_requirements));
  lines.push("");

  lines.push("## المتطلبات غير الوظيفية");
  lines.push(...bulletList(prd.non_functional_requirements));
  lines.push("");

  lines.push("## المخاطر والافتراضات");
  lines.push(...bulletList(prd.risks_assumptions));
  lines.push("");

  lines.push("## مؤشرات النجاح");
  lines.push(...bulletList(prd.success_metrics));

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
