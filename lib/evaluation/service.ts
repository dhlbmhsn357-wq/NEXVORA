/**
 * NEXVORA Evaluation Guide — Data Access (P9)
 */
import "server-only";
import { createClient } from "@/lib/supabase/server";
import { createServiceClient } from "@/lib/supabase/service";
import type {
  EvaluationScenarioRow, EvaluationRunRow, EvalStep,
  EvalCategory, EvalSeverity, EvalRunResult,
} from "./types";

type DbScen = {
  id: string; project_id: string; code: string | null; title: string; description: string;
  category: EvalCategory; severity: EvalSeverity; preconditions: string;
  steps: EvalStep[]; expected_result: string;
  linked_story_id: string | null; linked_flow_id: string | null; tags: string[];
  created_at: string; updated_at: string; created_by: string | null;
};
function mapScen(r: DbScen): EvaluationScenarioRow {
  return {
    id: r.id, projectId: r.project_id, code: r.code, title: r.title, description: r.description,
    category: r.category, severity: r.severity, preconditions: r.preconditions,
    steps: Array.isArray(r.steps) ? r.steps : [],
    expectedResult: r.expected_result,
    linkedStoryId: r.linked_story_id, linkedFlowId: r.linked_flow_id, tags: r.tags ?? [],
    createdAt: r.created_at, updatedAt: r.updated_at, createdBy: r.created_by,
  };
}

type DbRun = {
  id: string; project_id: string; scenario_id: string; result: EvalRunResult;
  actual_result: string; environment: string; run_by: string | null;
  run_at: string; notes: string;
};
function mapRun(r: DbRun): EvaluationRunRow {
  return {
    id: r.id, projectId: r.project_id, scenarioId: r.scenario_id, result: r.result,
    actualResult: r.actual_result, environment: r.environment, runBy: r.run_by,
    runAt: r.run_at, notes: r.notes,
  };
}

// ---------- Scenarios ----------
export async function listScenarios(projectId: string): Promise<EvaluationScenarioRow[]> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("evaluation_scenarios").select("*").eq("project_id", projectId)
    .order("severity", { ascending: false }).order("created_at", { ascending: false });
  if (error) throw error;
  return (data as DbScen[]).map(mapScen);
}

export interface ScenarioInput {
  code?: string | null; title: string; description?: string;
  category?: EvalCategory; severity?: EvalSeverity; preconditions?: string;
  steps?: EvalStep[]; expectedResult?: string;
  linkedStoryId?: string | null; linkedFlowId?: string | null; tags?: string[];
}

export async function createScenario(projectId: string, input: ScenarioInput, createdBy: string | null): Promise<EvaluationScenarioRow> {
  const svc = createServiceClient();
  const { data, error } = await svc.from("evaluation_scenarios").insert({
    project_id: projectId, code: input.code ?? null, title: input.title,
    description: input.description ?? "",
    category: input.category ?? "functional",
    severity: input.severity ?? "medium",
    preconditions: input.preconditions ?? "",
    steps: input.steps ?? [],
    expected_result: input.expectedResult ?? "",
    linked_story_id: input.linkedStoryId ?? null,
    linked_flow_id: input.linkedFlowId ?? null,
    tags: input.tags ?? [],
    created_by: createdBy,
  }).select("*").single();
  if (error) throw error;
  return mapScen(data as DbScen);
}

export async function updateScenario(id: string, patch: Partial<ScenarioInput>): Promise<EvaluationScenarioRow> {
  const svc = createServiceClient();
  const db: Record<string, unknown> = {};
  if (patch.code !== undefined) db.code = patch.code;
  if (patch.title !== undefined) db.title = patch.title;
  if (patch.description !== undefined) db.description = patch.description;
  if (patch.category !== undefined) db.category = patch.category;
  if (patch.severity !== undefined) db.severity = patch.severity;
  if (patch.preconditions !== undefined) db.preconditions = patch.preconditions;
  if (patch.steps !== undefined) db.steps = patch.steps;
  if (patch.expectedResult !== undefined) db.expected_result = patch.expectedResult;
  if (patch.linkedStoryId !== undefined) db.linked_story_id = patch.linkedStoryId;
  if (patch.linkedFlowId !== undefined) db.linked_flow_id = patch.linkedFlowId;
  if (patch.tags !== undefined) db.tags = patch.tags;
  const { data, error } = await svc.from("evaluation_scenarios").update(db).eq("id", id).select("*").single();
  if (error) throw error;
  return mapScen(data as DbScen);
}

export async function deleteScenario(id: string): Promise<void> {
  const svc = createServiceClient();
  const { error } = await svc.from("evaluation_scenarios").delete().eq("id", id);
  if (error) throw error;
}

// ---------- Runs ----------
export async function listRuns(projectId: string): Promise<EvaluationRunRow[]> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("evaluation_runs").select("*").eq("project_id", projectId)
    .order("run_at", { ascending: false });
  if (error) throw error;
  return (data as DbRun[]).map(mapRun);
}

export interface RunInput {
  scenarioId: string;
  result: EvalRunResult;
  actualResult?: string;
  environment?: string;
  notes?: string;
}

export async function createRun(projectId: string, input: RunInput, runBy: string | null): Promise<EvaluationRunRow> {
  const svc = createServiceClient();
  const { data, error } = await svc.from("evaluation_runs").insert({
    project_id: projectId,
    scenario_id: input.scenarioId,
    result: input.result,
    actual_result: input.actualResult ?? "",
    environment: input.environment ?? "",
    notes: input.notes ?? "",
    run_by: runBy,
  }).select("*").single();
  if (error) throw error;
  return mapRun(data as DbRun);
}

export async function deleteRun(id: string): Promise<void> {
  const svc = createServiceClient();
  const { error } = await svc.from("evaluation_runs").delete().eq("id", id);
  if (error) throw error;
}
