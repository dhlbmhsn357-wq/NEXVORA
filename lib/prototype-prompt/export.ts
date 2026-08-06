import { PROTOTYPE_PROMPT_SECTION_KEYS } from "@/lib/types/database";
import type { PrototypePromptSectionKey, PrototypePromptSections } from "@/lib/types/database";
import { CODE_WRITING_STANDARDS_HEADING, CODE_WRITING_STANDARDS_BODY } from "./code-standards";

/**
 * طبقة Export — تجميع الأقسام الـ 15 لمستند Markdown نهائي بعناوين
 * ثابتة ومضمونة الترتيب (العناوين متحكم فيها هنا، مش من رد الـ AI).
 * منطق تنسيق خالص، بدون أي استدعاء AI أو قاعدة بيانات.
 */
export const sectionHeadings: Record<PrototypePromptSectionKey, string> = {
  context: "Context",
  project_goal: "Project Goal",
  technical_context: "Technical Context",
  required_features: "Required Features",
  functional_requirements: "Functional Requirements",
  user_stories: "User Stories",
  acceptance_criteria: "Acceptance Criteria",
  edge_cases: "Edge Cases",
  constraints: "Constraints",
  out_of_scope: "Out Of Scope",
  architecture_notes: "Architecture Notes",
  ui_guidelines: "UI Guidelines",
  code_quality_requirements: "Code Quality Requirements",
  testing_expectations: "Testing Expectations",
  definition_of_done: "Definition of Done",
};

export function assemblePromptMarkdown(sections: PrototypePromptSections): string {
  const generatedSections = PROTOTYPE_PROMPT_SECTION_KEYS.map(
    (key) => `# ${sectionHeadings[key]}\n\n${sections[key] || "—"}`
  );

  // قسم ثابت مش AI-generated، بيتضاف إجباريًا في أول كل برومت يتم
  // تجميعه (قبل تفاصيل التنفيذ الخاصة بالمشروع) — عشان يحكم كل سطر كود
  // هيتكتب بعده من البداية، مش يوصل كملاحظة أخيرة بعد فوات الأوان.
  const fixedStandardsSection = `# ${CODE_WRITING_STANDARDS_HEADING}\n\n${CODE_WRITING_STANDARDS_BODY}`;

  return [fixedStandardsSection, ...generatedSections].join("\n\n");
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
