import type { AssemblePromptInput, AssembledPrompt } from "./types";
import { buildRulesBlock } from "./rules-engine";
import { buildClaudeCodeWorkflowBlock } from "./claude-code-workflow";
import { getDefaultPersona } from "./profiles";

/**
 * Prompt Assembler — نقطة التركيب الموحّدة. أي مرحلة بتبني الـ stageBody
 * الخاص بيها (الـ Schema + تعليمات المرحلة) وبتسيب التركيب النهائي هنا:
 * [Persona] + [قواعد الجودة] + [Claude Workflow لو الهدف claude_code] +
 * [كتل السياق] + [body المرحلة]. بيرجّع النص + ميتاداتا للتتبّع/الـ Versioning.
 *
 * ممنوع تكرار منطق التركيب ده في أي مولّد — الكل يمرّ من هنا.
 */
export function assemblePrompt(input: AssemblePromptInput): AssembledPrompt {
  const { profile, stageBody, context } = input;
  const target = input.target ?? profile.defaultTarget;
  const persona = input.persona ?? getDefaultPersona(profile.id);

  const parts: string[] = [persona];

  const rulesBlock = buildRulesBlock(profile.ruleKeys);
  if (rulesBlock) parts.push(rulesBlock);

  const claudeInjected = target === "claude_code";
  if (claudeInjected) parts.push(buildClaudeCodeWorkflowBlock());

  const nonEmptyContext = context.filter((b) => b.content && b.content.trim().length > 0);
  if (nonEmptyContext.length > 0) {
    const ctxText = nonEmptyContext.map((b) => `## ${b.title}\n${b.content.trim()}`).join("\n\n");
    parts.push(ctxText);
  }

  parts.push(stageBody.trim());

  return {
    text: parts.join("\n\n"),
    metadata: {
      profile: profile.id,
      target,
      ruleKeys: profile.ruleKeys,
      claudeCodeWorkflowInjected: claudeInjected,
      contextBlockTitles: nonEmptyContext.map((b) => b.title),
    },
  };
}
