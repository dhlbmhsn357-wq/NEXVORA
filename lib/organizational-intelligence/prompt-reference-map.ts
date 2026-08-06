import { AITaskType } from "@/lib/ai/types";

/**
 * خريطة ثابتة (كود، مش Database) من نوع المهمة لمكان البرومبت الفعلي في
 * الكود. القرار المؤكّد لهذه المرحلة: البرومبتات نفسها تفضل TypeScript
 * ثابت — الاقتراحات بترجع لهنا كمرجع للمراجعة اليدوية بس، صفر تعديل تلقائي.
 */
export const PROMPT_REFERENCE_MAP: Partial<Record<AITaskType, string>> = {
  [AITaskType.PRD_GENERATION]: "lib/ai/prompts/prd-generation.ts:buildPRDGenerationPrompt",
  [AITaskType.DEVELOPER_HANDOFF_GENERATION]: "lib/ai/prompts/developer-handoff.ts:buildDeveloperHandoffGenerationPrompt",
  [AITaskType.PROTOTYPE_PROMPT_GENERATION]: "lib/ai/prompts/prototype-prompt-generation.ts:buildPrototypePromptGenerationPrompt",
  [AITaskType.CLIENT_PRESENTATION_GENERATION]: "lib/ai/prompts/client-presentation.ts:buildClientPresentationPrompt",
};

export const PROMPT_PURPOSE_MAP: Partial<Record<AITaskType, string>> = {
  [AITaskType.PRD_GENERATION]: "يحوّل Project Brain v2 المعتمد إلى PRD منظّم (متطلبات، معايير قبول، نطاق).",
  [AITaskType.DEVELOPER_HANDOFF_GENERATION]: "يحوّل PRD + Brain إلى تعليمات تسليم تقنية مفصّلة للمطورين.",
  [AITaskType.PROTOTYPE_PROMPT_GENERATION]: "يحوّل Project Brain v2 إلى برومبت توليد Prototype لأداة AI خارجية.",
  [AITaskType.CLIENT_PRESENTATION_GENERATION]: "يحوّل Project Brain v2 إلى عرض تقديمي (17 شريحة) للعميل.",
};
