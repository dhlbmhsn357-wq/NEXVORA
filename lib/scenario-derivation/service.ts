/**
 * NEXVORA Scenario Derivation Service
 * ===================================
 *
 * From an approved Evaluation Scenario, propose (and then create on demand)
 * Draft Requirements / User Stories / Acceptance Criteria that trace back to
 * the scenario via `derived_from_scenario_id` (migration 0109).
 *
 * Strictly deterministic — no AI. Fields the scenario doesn't provide are
 * filled with the `[Needs Input]` placeholder. Idempotent: running twice
 * skips items already derived from the same scenario (checked by
 * `derived_from_scenario_id` on each target table).
 */
import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import { createServiceClient } from "@/lib/supabase/service";
import { createClient } from "@/lib/supabase/server";
import { generateAndInsertWithRetry } from "@/lib/coding/code-service";

export const NEEDS_INPUT = "[Needs Input]";

export interface ScenarioDerivedPlan {
  scenarioId: string;
  toCreate: {
    requirements: Array<{ title: string; description: string }>;
    stories: Array<{ title: string; asA: string; iWant: string; soThat: string }>;
    acs: Array<{ title: string; given: string; when: string; then: string }>;
  };
  existing: {
    requirements: string[];
    stories: string[];
    acs: string[];
  };
}

interface ScenarioRow {
  id: string;
  project_id: string;
  title: string;
  description: string | null;
  preconditions: string | null;
  expected_result: string | null;
  steps: unknown;
  linked_story_id: string | null;
}

async function loadScenario(supabase: SupabaseClient, scenarioId: string): Promise<ScenarioRow> {
  const { data, error } = await supabase
    .from("evaluation_scenarios")
    .select("id, project_id, title, description, preconditions, expected_result, steps, linked_story_id")
    .eq("id", scenarioId)
    .single();
  if (error) throw error;
  return data as ScenarioRow;
}

async function listExistingDerived(
  supabase: SupabaseClient,
  table: "product_requirements" | "user_stories" | "acceptance_criteria",
  scenarioId: string,
): Promise<string[]> {
  const { data, error } = await supabase
    .from(table)
    .select("id")
    .eq("derived_from_scenario_id", scenarioId);
  if (error) throw error;
  return ((data ?? []) as Array<{ id: string }>).map((r) => r.id);
}

/**
 * Plan what would be created from a scenario. Idempotent — items already
 * derived from this scenario appear in `existing`, not `toCreate`.
 */
export async function planDerivedDrafts(scenarioId: string): Promise<ScenarioDerivedPlan> {
  const supabase = await createClient();
  const scenario = await loadScenario(supabase, scenarioId);
  const [existingReqs, existingStories, existingAcs] = await Promise.all([
    listExistingDerived(supabase, "product_requirements", scenarioId),
    listExistingDerived(supabase, "user_stories", scenarioId),
    listExistingDerived(supabase, "acceptance_criteria", scenarioId),
  ]);

  const title = scenario.title || NEEDS_INPUT;
  const description = scenario.description || NEEDS_INPUT;
  const expected = scenario.expected_result || NEEDS_INPUT;
  const precondition = scenario.preconditions || NEEDS_INPUT;
  const firstStep = Array.isArray(scenario.steps) && scenario.steps.length > 0
    ? String((scenario.steps[0] as { action?: string })?.action ?? NEEDS_INPUT)
    : NEEDS_INPUT;

  return {
    scenarioId,
    toCreate: {
      requirements: existingReqs.length > 0
        ? []
        : [{ title: `Requirement: ${title}`, description }],
      stories: existingStories.length > 0
        ? []
        : [{
            title: `Story: ${title}`,
            asA: NEEDS_INPUT,
            iWant: title,
            soThat: expected,
          }],
      acs: existingAcs.length > 0
        ? []
        : [{
            title: `AC: ${title}`,
            given: precondition,
            when: firstStep,
            then: expected,
          }],
    },
    existing: {
      requirements: existingReqs,
      stories: existingStories,
      acs: existingAcs,
    },
  };
}

export interface ApplyResult {
  createdIds: {
    requirements: string[];
    stories: string[];
    acs: string[];
  };
}

/**
 * Apply the plan: insert requirements/stories/AC as `status='draft'` with
 * `derived_from_scenario_id` set. Auto-generates codes via the shared
 * code-service. Idempotent — respects `existing` (skips creation).
 */
export async function applyDerivedDrafts(
  scenarioId: string,
  userId: string | null,
): Promise<ApplyResult> {
  const svc = createServiceClient();
  const plan = await planDerivedDrafts(scenarioId);
  const supabase = await createClient();
  const scenario = await loadScenario(supabase, scenarioId);

  const createdIds: ApplyResult["createdIds"] = { requirements: [], stories: [], acs: [] };

  for (const req of plan.toCreate.requirements) {
    const row = await generateAndInsertWithRetry<{ id: string }>(
      svc,
      "product_requirements",
      scenario.project_id,
      (code) => ({
        project_id: scenario.project_id,
        code,
        title: req.title,
        description: req.description,
        requirement_type: "functional",
        priority: "should",
        status: "draft",
        derived_from_scenario_id: scenarioId,
        created_by: userId,
      }),
    );
    createdIds.requirements.push(row.id);
  }

  let derivedStoryId: string | null = plan.existing.stories[0] ?? null;
  for (const story of plan.toCreate.stories) {
    const row = await generateAndInsertWithRetry<{ id: string }>(
      svc,
      "user_stories",
      scenario.project_id,
      (code) => ({
        project_id: scenario.project_id,
        code,
        title: story.title,
        as_a: story.asA,
        i_want: story.iWant,
        so_that: story.soThat,
        status: "draft",
        derived_from_scenario_id: scenarioId,
        created_by: userId,
      }),
    );
    createdIds.stories.push(row.id);
    derivedStoryId = row.id;
  }

  for (const ac of plan.toCreate.acs) {
    if (!derivedStoryId) {
      // AC requires a parent user_story_id — skip if we have nothing to link to.
      break;
    }
    const row = await generateAndInsertWithRetry<{ id: string }>(
      svc,
      "acceptance_criteria",
      scenario.project_id,
      (code) => ({
        project_id: scenario.project_id,
        user_story_id: derivedStoryId,
        code,
        order_index: 1,
        title: ac.title,
        given_clause: ac.given,
        when_clause: ac.when,
        then_clause: ac.then,
        status: "draft",
        derived_from_scenario_id: scenarioId,
        created_by: userId,
      }),
    );
    createdIds.acs.push(row.id);
  }

  return { createdIds };
}
