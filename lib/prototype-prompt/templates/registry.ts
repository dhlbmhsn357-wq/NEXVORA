import type { PromptTemplate } from "./types";
import { claudeCodeTemplate } from "./claude-code";
import { v0Template } from "./v0";
import { lovableTemplate } from "./lovable";
import { generalTemplate } from "./general";

/**
 * Template Manager — المكان الوحيد المسموح فيه بربط اسم أداة بقالبها.
 * لإضافة أداة جديدة: أنشئ ملفها هنا وسجّلها في الخريطة دي بس — من غير
 * أي تعديل في Prompt Generation Engine.
 */
const templates: Record<string, PromptTemplate> = {
  claude_code: claudeCodeTemplate,
  v0: v0Template,
  lovable: lovableTemplate,
  general: generalTemplate,
};

export function getTemplate(targetTool: string): PromptTemplate {
  return templates[targetTool] ?? templates.general;
}

export function listAvailableTools(): Array<{ value: string; label: string }> {
  return Object.entries(templates).map(([value, t]) => ({ value, label: t.toolName }));
}
