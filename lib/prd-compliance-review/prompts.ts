import type { PrdComplianceReviewCategoryKey, PRD } from "@/lib/types/database";
import type { RepoFile } from "@/lib/github/repo-reader";
import { buildPhaseCategoryPrompt } from "@/lib/ai/prompts/phase-audit-shared";

const PERSONA = "أنت Product Manager تقني بتراجع مدى التزام الكود الفعلي بمستند PRD المعتمد للمشروع، مبنية على أدلة حقيقية 100% لمحور واحد بس.";

function bulletList(items: string[]): string {
  return items.length > 0 ? items.map((i) => `- ${i}`).join("\n") : "(لا يوجد أي بند مذكور في PRD لهذا الجزء)";
}

/**
 * على عكس باقي محاور Engineering QA، المحور هنا محتاج محتوى PRD نفسه
 * كمرجع للمقارنة — مش الكود بس. كل محور بيقرأ الجزء المرتبط بيه فقط
 * من PRD (بدل PRD كامل) عشان الـ Prompt يفضل مركّز على نطاقه.
 */
const CATEGORY_GUIDANCE: Record<PrdComplianceReviewCategoryKey, { title: string; focus: (prd: PRD) => string }> = {
  functional_requirements_coverage: {
    title: "Functional Requirements Coverage Audit",
    focus: (prd) =>
      `قارن المتطلبات الوظيفية التالية من PRD بالكود الفعلي، ودوّر على أي متطلب مذكور في PRD ومفيش أي دليل فعلي في الكود إنه اتنفّذ:\n\n${bulletList(prd.functional_requirements)}`,
  },
  non_functional_requirements: {
    title: "Non-Functional Requirements Audit",
    focus: (prd) =>
      `قارن المتطلبات غير الوظيفية التالية من PRD (أداء، أمان، قابلية توسع، إلخ) بالكود الفعلي، ودوّر على أي متطلب مفيش دليل حقيقي في الكود إنه اتراعى:\n\n${bulletList(prd.non_functional_requirements)}`,
  },
  scope_adherence: {
    title: "Scope Adherence Audit",
    focus: (prd) =>
      `راجع الكود الفعلي مقابل نطاق المشروع المعتمد في PRD — الأهداف المطلوبة وحدود النطاق (خارج النطاق صراحةً):\n\n## الأهداف\n${bulletList(prd.goals)}\n\n## خارج النطاق صراحةً (Out of Scope)\n${bulletList(prd.out_of_scope)}\n\nدوّر تحديدًا على أي كود بيطبّق ميزة مذكورة صراحةً كـ "خارج النطاق" في PRD (Scope Creep) — ده أخطر Finding ممكن هنا.`,
  },
  acceptance_criteria: {
    title: "Acceptance Criteria Audit",
    focus: (prd) =>
      `قارن معايير القبول (Acceptance Criteria بصيغة Given/When/Then) التالية من PRD بسلوك الكود الفعلي، ودوّر على أي معيار مفيش دليل حقيقي في الكود إنه اتحقق:\n\n${bulletList(prd.acceptance_criteria.map((c) => `Given ${c.given}, When ${c.when}, Then ${c.then}`))}`,
  },
};

export function buildPrdComplianceCategoryPrompt(
  categoryKey: PrdComplianceReviewCategoryKey,
  files: RepoFile[],
  fileTree: string[],
  isIncremental: boolean,
  prd: PRD
): string {
  const guidance = CATEGORY_GUIDANCE[categoryKey];
  return buildPhaseCategoryPrompt({
    persona: PERSONA,
    categoryTitle: guidance.title,
    categoryFocus: guidance.focus(prd),
    files,
    fileTree: categoryKey === "scope_adherence" ? fileTree : undefined,
    fileTreeLabel: "شجرة ملفات المشروع القابلة للمراجعة",
    isIncremental,
  });
}
