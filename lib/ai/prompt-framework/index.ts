/**
 * Unified Prompt Framework (Prompt Intelligence Engine) — نقطة الدخول
 * الموحّدة لتوليد البرومبتات عبر كل مراحل VELORA. أي مرحلة بتولّد Prompt
 * لازم تستخدم هذا الـ Framework بدل ما تعرّف منطقها الخاص.
 */
export * from "./types";
export { getProfile, getDefaultPersona, allProfileIds } from "./profiles";
export { getRules, buildRulesBlock, allRuleKeys } from "./rules-engine";
export { buildClaudeCodeWorkflowBlock } from "./claude-code-workflow";
export { assemblePrompt } from "./assemble";
export { computePromptReadiness } from "./readiness";
export { buildContextResult, type ContextItem, type ContextBuildResult } from "./context-engine";
export { improvePrompt, type ImprovePromptResult } from "./improve-service";
export {
  persistPromptGeneration,
  getPromptHistory,
  getPromptGeneration,
  type PromptGenerationRow,
} from "./prompt-generation-service";
export { buildFrameworkPrompt, type BuildPromptResult } from "./facade";
