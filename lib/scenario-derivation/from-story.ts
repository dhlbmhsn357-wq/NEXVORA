/**
 * NEXVORA Scenario-from-Story — Data Access
 * =========================================
 * يشتق سيناريوهات تقييم مسوّدة (draft) من القصص المعتمدة (approved/in_dev/done)
 * اللي مالهاش سيناريو مرتبط بعد. Idempotent — تشغيله مرتين ما يُنشئش تكرار.
 *
 * لا AI — قوالب حتمية (اُنظر `from-story-derive.ts`).
 */
import "server-only";
import { listStories, listAcceptanceCriteria } from "@/lib/user-stories/service";
import { listScenarios, createScenario } from "@/lib/evaluation/service";
import type { UserStoryRow } from "@/lib/user-stories/types";
import {
  planScenariosFromInputs,
  planScenarioForSingleStory,
  type DerivedScenarioPlan,
} from "./from-story-derive";

export type { DerivedScenarioPlan, DerivedScenarioDraft } from "./from-story-derive";

/**
 * Preview — بدون كتابة. يستدعي المصادر ويبني الخطة.
 */
export async function planScenariosFromStories(projectId: string): Promise<DerivedScenarioPlan> {
  const [stories, scenarios, acs] = await Promise.all([
    listStories(projectId),
    listScenarios(projectId),
    listAcceptanceCriteria(projectId),
  ]);
  return planScenariosFromInputs(stories, scenarios, acs);
}

/**
 * Apply — يبني الخطة ثم يُنشئ الفعليات كسيناريوهات draft مربوطة بالقصة.
 * Idempotent: القصص اللي عندها سيناريو تُتجاهل.
 */
export async function applyScenariosFromStories(
  projectId: string,
  userId: string | null,
): Promise<{ created: number; skipped: number; createdIds: string[] }> {
  const plan = await planScenariosFromStories(projectId);
  const createdIds: string[] = [];
  for (const draft of plan.toCreate) {
    const row = await createScenario(
      projectId,
      {
        title: draft.suggestedTitle,
        description: draft.suggestedDescription,
        category: draft.suggestedCategory,
        severity: draft.suggestedSeverity,
        preconditions: draft.suggestedPreconditions,
        steps: draft.suggestedSteps,
        expectedResult: draft.suggestedExpectedResult,
        linkedStoryId: draft.linkedStoryId,
      },
      userId,
    );
    createdIds.push(row.id);
  }
  return {
    created: createdIds.length,
    skipped: plan.skipped.length,
    createdIds,
  };
}

/**
 * توليد سيناريو من قصة واحدة (زر لكل قصة في stories-panel).
 * Idempotent — لو القصة عندها سيناريو مسبقًا يرجع created:0.
 */
export async function applyScenarioForStory(
  projectId: string,
  story: UserStoryRow,
  userId: string | null,
): Promise<{ created: number; scenarioId: string | null }> {
  const [scenarios, acs] = await Promise.all([
    listScenarios(projectId),
    listAcceptanceCriteria(projectId),
  ]);
  const plan = planScenarioForSingleStory(story, scenarios, acs);
  if (plan.toCreate.length === 0) {
    return { created: 0, scenarioId: null };
  }
  const draft = plan.toCreate[0];
  const row = await createScenario(
    projectId,
    {
      title: draft.suggestedTitle,
      description: draft.suggestedDescription,
      category: draft.suggestedCategory,
      severity: draft.suggestedSeverity,
      preconditions: draft.suggestedPreconditions,
      steps: draft.suggestedSteps,
      expectedResult: draft.suggestedExpectedResult,
      linkedStoryId: draft.linkedStoryId,
    },
    userId,
  );
  return { created: 1, scenarioId: row.id };
}
