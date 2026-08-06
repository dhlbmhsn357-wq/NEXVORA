import type { PromptTemplate } from "./types";

export const generalTemplate: PromptTemplate = {
  toolName: "General",
  toolGuidance: `هذا البرومت عام، مش موجّه لأداة محددة — لازم يكون مفهوم وقابل للتنفيذ من أي أداة بناء تطبيقات بالذكاء الاصطناعي (Claude Code, v0, Lovable, Cursor, أو غيرهم).

اكتب التعليمات بشكل مستقل عن أي أداة معينة:
- وضّح الافتراضات التقنية بالكامل (Framework, Language) في Technical Context بدل الاعتماد على معرفة ضمنية بأداة محددة.
- تجنّب أي مصطلحات خاصة بأداة واحدة بعينها.`,
};
