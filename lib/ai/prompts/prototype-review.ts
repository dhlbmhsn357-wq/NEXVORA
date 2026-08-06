import type { PRD } from "@/lib/types/database";
import type { RepoFile } from "@/lib/github/repo-reader";

function formatPRDContext(prd: PRD): string {
  return `## User Stories (يوجد بالضبط ${prd.user_stories.length} — راجع كل واحدة، ممنوع تجاوز أي واحدة)
${prd.user_stories.map((s, i) => `${i + 1}. ${s.role}, ${s.want}, ${s.benefit}`).join("\n")}

## Acceptance Criteria (يوجد بالضبط ${prd.acceptance_criteria.length} — راجع كل واحد، ممنوع تجاوز أي واحد)
${prd.acceptance_criteria.map((c, i) => `${i + 1}. Given ${c.given} When ${c.when} Then ${c.then}`).join("\n")}

## Functional Requirements
${prd.functional_requirements.map((f) => `- ${f}`).join("\n")}

## Non-Functional Requirements
${prd.non_functional_requirements.map((f) => `- ${f}`).join("\n")}

## Out of Scope (لو الكود نفّذ حاجة من هنا، ده Scope Creep)
${prd.out_of_scope.map((o) => `- ${o}`).join("\n")}`;
}

function formatRepoFiles(files: RepoFile[]): string {
  return files
    .map((f) => `### File: ${f.path}\n\`\`\`\n${f.content}\n\`\`\``)
    .join("\n\n");
}

const STRICT_RULES = `قواعد صارمة:
- أرجع الكائن JSON فقط، من غير أي شرح أو مقدمة أو خاتمة أو Markdown code fences.
- راجع كل User Story وكل Acceptance Criterion المذكورين فوق — بدون استثناء أي عنصر.
- لأي عنصر بحالة implemented أو partially_implemented أو implemented_differently: evidence إلزامي (مصفوفة فيها عنصر واحد على الأقل بـ file محدد على الأقل، وfunction_or_component وline لو أمكن تحديدهم من الكود).
- لأي عنصر بحالة not_implemented: evidence يكون null (مفيش دليل لأنه مش موجود).
- لا تصدر أي حكم من غير الرجوع فعليًا لمحتوى الملفات المرفقة تحت — الحكم لازم يكون مبني على الكود الفعلي، مش تخمين.
- missing_features: أي Functional/Non-Functional Requirement من PRD مش منفذ خالص.
- scope_creep: أي حاجة موجودة في الكود بس مذكورة في Out of Scope أو مش موجودة في PRD خالص.
- كل النصوص بالإنجليزية.`;

/**
 * Prompt مراجعة الـ Prototype — يقارن الكود الفعلي (ملفات الـ Repo)
 * بمتطلبات PRD المعتمد فقط. لا يعتمد على وصف يدوي ولا Screenshots.
 */
export function buildPrototypeReviewPrompt(prd: PRD, files: RepoFile[]): string {
  return `أنت Senior Technical Reviewer بتقارن الكود الفعلي الموجود في Repository حقيقي بمتطلبات PRD معتمد، وتصدر تقرير فجوات (Gap Report) دقيق ومبني على أدلة حقيقية من الكود.

# متطلبات PRD
${formatPRDContext(prd)}

# ملفات الكود المصدري (${files.length} ملف)
${formatRepoFiles(files)}

## المطلوب منك بالضبط
أرجع **JSON فقط** بالشكل التالي بالضبط (7 مفاتيح بالضبط، بدون أي مفتاح إضافي):

{
  "user_stories": [
    { "story": "نص الـ Story", "status": "implemented|partially_implemented|implemented_differently|not_implemented", "evidence": [{ "file": "path/to/file.ts", "function_or_component": "ComponentName", "line": 12 }], "gap": "وصف الفجوة لو موجودة، أو null" }
  ],
  "acceptance_criteria_results": [
    { "criterion": "نص المعيار", "status": "...", "evidence": [...], "gap": "..." }
  ],
  "missing_features": ["..."],
  "scope_creep": ["..."],
  "non_functional_gaps": ["..."],
  "unresolved_risks": ["..."],
  "recommendation_summary": "ملخص توصية عملي من فقرة أو فقرتين"
}

${STRICT_RULES}`;
}
