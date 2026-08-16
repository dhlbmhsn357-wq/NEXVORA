/**
 * NEXVORA Product Definition — State Machines Data Access (0122)
 * =================================================================
 * Server-only. القراءة عبر authenticated client (RLS SELECT).
 * الكتابة عبر service client (RBAC مطبّق في server actions).
 * نفس نمط business-rules-service.ts بالضبط.
 */
import "server-only";
import { createClient } from "@/lib/supabase/server";
import { createServiceClient } from "@/lib/supabase/service";
import type { StateMachineRow, StateMachineTransition } from "./state-machine-types";

type DbStateMachine = {
  id: string;
  project_id: string;
  name: string;
  description: string;
  states: string[];
  transitions: StateMachineTransition[];
  linked_persona_id: string | null;
  linked_flow_id: string | null;
  notes: string;
  created_at: string;
  updated_at: string;
  created_by: string | null;
};

export function mapStateMachine(r: DbStateMachine): StateMachineRow {
  return {
    id: r.id,
    projectId: r.project_id,
    name: r.name,
    description: r.description,
    states: r.states ?? [],
    transitions: r.transitions ?? [],
    linkedPersonaId: r.linked_persona_id,
    linkedFlowId: r.linked_flow_id,
    notes: r.notes,
    createdAt: r.created_at,
    updatedAt: r.updated_at,
    createdBy: r.created_by,
  };
}

export async function listStateMachines(projectId: string): Promise<StateMachineRow[]> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("state_machines")
    .select("*")
    .eq("project_id", projectId)
    .order("created_at", { ascending: false });
  if (error) throw error;
  return (data as DbStateMachine[]).map(mapStateMachine);
}

export interface StateMachineInput {
  name: string;
  description?: string;
  states?: string[];
  transitions?: StateMachineTransition[];
  linkedPersonaId?: string | null;
  linkedFlowId?: string | null;
  notes?: string;
}

export async function createStateMachine(
  projectId: string,
  input: StateMachineInput,
  createdBy: string | null
): Promise<StateMachineRow> {
  const svc = createServiceClient();
  const { data, error } = await svc
    .from("state_machines")
    .insert({
      project_id: projectId,
      name: input.name,
      description: input.description ?? "",
      states: input.states ?? [],
      transitions: input.transitions ?? [],
      linked_persona_id: input.linkedPersonaId ?? null,
      linked_flow_id: input.linkedFlowId ?? null,
      notes: input.notes ?? "",
      created_by: createdBy,
    })
    .select("*")
    .single();
  if (error) throw error;
  return mapStateMachine(data as DbStateMachine);
}

export async function updateStateMachine(
  id: string,
  patch: Partial<StateMachineInput>
): Promise<StateMachineRow> {
  const svc = createServiceClient();
  const db: Record<string, unknown> = {};
  if (patch.name !== undefined) db.name = patch.name;
  if (patch.description !== undefined) db.description = patch.description;
  if (patch.states !== undefined) db.states = patch.states;
  if (patch.transitions !== undefined) db.transitions = patch.transitions;
  if (patch.linkedPersonaId !== undefined) db.linked_persona_id = patch.linkedPersonaId;
  if (patch.linkedFlowId !== undefined) db.linked_flow_id = patch.linkedFlowId;
  if (patch.notes !== undefined) db.notes = patch.notes;
  const { data, error } = await svc.from("state_machines").update(db).eq("id", id).select("*").single();
  if (error) throw error;
  return mapStateMachine(data as DbStateMachine);
}

export async function deleteStateMachine(id: string): Promise<void> {
  const svc = createServiceClient();
  const { error } = await svc.from("state_machines").delete().eq("id", id);
  if (error) throw error;
}
