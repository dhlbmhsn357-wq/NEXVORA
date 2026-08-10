/**
 * NEXVORA Product Definition — Data Access (P6)
 * =============================================
 * Server-only. القراءة عبر authenticated client (RLS SELECT).
 * الكتابة عبر service client (RBAC مطبّق في server actions).
 */
import "server-only";
import { createClient } from "@/lib/supabase/server";
import { createServiceClient } from "@/lib/supabase/service";
import type {
  PersonaRow, UserFlowRow, RequirementRow, FlowStep,
  FlowType, MoscowPriority, RequirementStatus, RequirementType,
} from "./types";
import { generateAndInsertWithRetry } from "@/lib/coding/code-service";

// ---------------------------------------------------------------------------
// Row mappers
// ---------------------------------------------------------------------------
type DbPersona = {
  id: string; project_id: string; name: string; role: string; segment: string;
  jobs_to_be_done: string; goals: string; pains: string; channels: string[];
  tech_savviness: number; notes: string; is_primary: boolean;
  created_at: string; updated_at: string; created_by: string | null;
};
function mapPersona(r: DbPersona): PersonaRow {
  return {
    id: r.id, projectId: r.project_id, name: r.name, role: r.role, segment: r.segment,
    jobsToBeDone: r.jobs_to_be_done, goals: r.goals, pains: r.pains, channels: r.channels ?? [],
    techSavviness: r.tech_savviness, notes: r.notes, isPrimary: r.is_primary,
    createdAt: r.created_at, updatedAt: r.updated_at, createdBy: r.created_by,
  };
}

type DbFlow = {
  id: string; project_id: string; persona_id: string | null; name: string;
  description: string; flow_type: FlowType; trigger_event: string; success_outcome: string;
  steps: FlowStep[]; notes: string;
  created_at: string; updated_at: string; created_by: string | null;
};
function mapFlow(r: DbFlow): UserFlowRow {
  return {
    id: r.id, projectId: r.project_id, personaId: r.persona_id, name: r.name,
    description: r.description, flowType: r.flow_type, triggerEvent: r.trigger_event,
    successOutcome: r.success_outcome, steps: Array.isArray(r.steps) ? r.steps : [],
    notes: r.notes,
    createdAt: r.created_at, updatedAt: r.updated_at, createdBy: r.created_by,
  };
}

type DbReq = {
  id: string; project_id: string; code: string | null; title: string; description: string;
  requirement_type: RequirementType; priority: MoscowPriority; status: RequirementStatus;
  rationale: string; acceptance_hint: string; effort_estimate: string;
  linked_persona_id: string | null; linked_flow_id: string | null; tags: string[];
  created_at: string; updated_at: string; created_by: string | null;
};
function mapReq(r: DbReq): RequirementRow {
  return {
    id: r.id, projectId: r.project_id, code: r.code, title: r.title, description: r.description,
    requirementType: r.requirement_type, priority: r.priority, status: r.status,
    rationale: r.rationale, acceptanceHint: r.acceptance_hint, effortEstimate: r.effort_estimate,
    linkedPersonaId: r.linked_persona_id, linkedFlowId: r.linked_flow_id, tags: r.tags ?? [],
    createdAt: r.created_at, updatedAt: r.updated_at, createdBy: r.created_by,
  };
}

// ---------------------------------------------------------------------------
// Personas
// ---------------------------------------------------------------------------
export async function listPersonas(projectId: string): Promise<PersonaRow[]> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("product_personas").select("*").eq("project_id", projectId)
    .order("is_primary", { ascending: false })
    .order("created_at", { ascending: false });
  if (error) throw error;
  return (data as DbPersona[]).map(mapPersona);
}

export interface PersonaInput {
  name: string; role?: string; segment?: string;
  jobsToBeDone?: string; goals?: string; pains?: string;
  channels?: string[]; techSavviness?: number; notes?: string; isPrimary?: boolean;
}

export async function createPersona(
  projectId: string, input: PersonaInput, createdBy: string | null
): Promise<PersonaRow> {
  const svc = createServiceClient();
  const { data, error } = await svc.from("product_personas").insert({
    project_id: projectId, name: input.name, role: input.role ?? "",
    segment: input.segment ?? "", jobs_to_be_done: input.jobsToBeDone ?? "",
    goals: input.goals ?? "", pains: input.pains ?? "",
    channels: input.channels ?? [], tech_savviness: input.techSavviness ?? 50,
    notes: input.notes ?? "", is_primary: input.isPrimary ?? false,
    created_by: createdBy,
  }).select("*").single();
  if (error) throw error;
  return mapPersona(data as DbPersona);
}

export async function updatePersona(id: string, patch: Partial<PersonaInput>): Promise<PersonaRow> {
  const svc = createServiceClient();
  const db: Record<string, unknown> = {};
  if (patch.name !== undefined) db.name = patch.name;
  if (patch.role !== undefined) db.role = patch.role;
  if (patch.segment !== undefined) db.segment = patch.segment;
  if (patch.jobsToBeDone !== undefined) db.jobs_to_be_done = patch.jobsToBeDone;
  if (patch.goals !== undefined) db.goals = patch.goals;
  if (patch.pains !== undefined) db.pains = patch.pains;
  if (patch.channels !== undefined) db.channels = patch.channels;
  if (patch.techSavviness !== undefined) db.tech_savviness = patch.techSavviness;
  if (patch.notes !== undefined) db.notes = patch.notes;
  if (patch.isPrimary !== undefined) db.is_primary = patch.isPrimary;
  const { data, error } = await svc.from("product_personas").update(db).eq("id", id).select("*").single();
  if (error) throw error;
  return mapPersona(data as DbPersona);
}

export async function deletePersona(id: string): Promise<void> {
  const svc = createServiceClient();
  const { error } = await svc.from("product_personas").delete().eq("id", id);
  if (error) throw error;
}

// ---------------------------------------------------------------------------
// User Flows
// ---------------------------------------------------------------------------
export async function listFlows(projectId: string): Promise<UserFlowRow[]> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("user_flows").select("*").eq("project_id", projectId)
    .order("flow_type", { ascending: true })
    .order("created_at", { ascending: false });
  if (error) throw error;
  return (data as DbFlow[]).map(mapFlow);
}

export interface FlowInput {
  personaId?: string | null; name: string; description?: string;
  flowType?: FlowType; triggerEvent?: string; successOutcome?: string;
  steps?: FlowStep[]; notes?: string;
}

export async function createFlow(
  projectId: string, input: FlowInput, createdBy: string | null
): Promise<UserFlowRow> {
  const svc = createServiceClient();
  const { data, error } = await svc.from("user_flows").insert({
    project_id: projectId, persona_id: input.personaId ?? null, name: input.name,
    description: input.description ?? "", flow_type: input.flowType ?? "primary",
    trigger_event: input.triggerEvent ?? "", success_outcome: input.successOutcome ?? "",
    steps: input.steps ?? [], notes: input.notes ?? "",
    created_by: createdBy,
  }).select("*").single();
  if (error) throw error;
  return mapFlow(data as DbFlow);
}

export async function updateFlow(id: string, patch: Partial<FlowInput>): Promise<UserFlowRow> {
  const svc = createServiceClient();
  const db: Record<string, unknown> = {};
  if (patch.personaId !== undefined) db.persona_id = patch.personaId;
  if (patch.name !== undefined) db.name = patch.name;
  if (patch.description !== undefined) db.description = patch.description;
  if (patch.flowType !== undefined) db.flow_type = patch.flowType;
  if (patch.triggerEvent !== undefined) db.trigger_event = patch.triggerEvent;
  if (patch.successOutcome !== undefined) db.success_outcome = patch.successOutcome;
  if (patch.steps !== undefined) db.steps = patch.steps;
  if (patch.notes !== undefined) db.notes = patch.notes;
  const { data, error } = await svc.from("user_flows").update(db).eq("id", id).select("*").single();
  if (error) throw error;
  return mapFlow(data as DbFlow);
}

export async function deleteFlow(id: string): Promise<void> {
  const svc = createServiceClient();
  const { error } = await svc.from("user_flows").delete().eq("id", id);
  if (error) throw error;
}

// ---------------------------------------------------------------------------
// Requirements
// ---------------------------------------------------------------------------
export async function listRequirements(projectId: string): Promise<RequirementRow[]> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("product_requirements").select("*").eq("project_id", projectId)
    .order("priority", { ascending: true })
    .order("created_at", { ascending: false });
  if (error) throw error;
  return (data as DbReq[]).map(mapReq);
}

export interface RequirementInput {
  code?: string | null; title: string; description?: string;
  requirementType?: RequirementType; priority?: MoscowPriority; status?: RequirementStatus;
  rationale?: string; acceptanceHint?: string; effortEstimate?: string;
  linkedPersonaId?: string | null; linkedFlowId?: string | null; tags?: string[];
}

export async function createRequirement(
  projectId: string, input: RequirementInput, createdBy: string | null
): Promise<RequirementRow> {
  const svc = createServiceClient();
  const baseRow = (code: string | null) => ({
    project_id: projectId, code, title: input.title,
    description: input.description ?? "",
    requirement_type: input.requirementType ?? "functional",
    priority: input.priority ?? "should",
    status: input.status ?? "draft",
    rationale: input.rationale ?? "", acceptance_hint: input.acceptanceHint ?? "",
    effort_estimate: input.effortEstimate ?? "",
    linked_persona_id: input.linkedPersonaId ?? null,
    linked_flow_id: input.linkedFlowId ?? null,
    tags: input.tags ?? [],
    created_by: createdBy,
  });
  if (input.code) {
    const { data, error } = await svc.from("product_requirements").insert(baseRow(input.code)).select("*").single();
    if (error) throw error;
    return mapReq(data as DbReq);
  }
  const row = await generateAndInsertWithRetry<DbReq>(svc, "product_requirements", projectId, (c) => baseRow(c));
  return mapReq(row);
}

export async function updateRequirement(id: string, patch: Partial<RequirementInput>): Promise<RequirementRow> {
  const svc = createServiceClient();
  const db: Record<string, unknown> = {};
  if (patch.code !== undefined) db.code = patch.code;
  if (patch.title !== undefined) db.title = patch.title;
  if (patch.description !== undefined) db.description = patch.description;
  if (patch.requirementType !== undefined) db.requirement_type = patch.requirementType;
  if (patch.priority !== undefined) db.priority = patch.priority;
  if (patch.status !== undefined) db.status = patch.status;
  if (patch.rationale !== undefined) db.rationale = patch.rationale;
  if (patch.acceptanceHint !== undefined) db.acceptance_hint = patch.acceptanceHint;
  if (patch.effortEstimate !== undefined) db.effort_estimate = patch.effortEstimate;
  if (patch.linkedPersonaId !== undefined) db.linked_persona_id = patch.linkedPersonaId;
  if (patch.linkedFlowId !== undefined) db.linked_flow_id = patch.linkedFlowId;
  if (patch.tags !== undefined) db.tags = patch.tags;
  const { data, error } = await svc.from("product_requirements").update(db).eq("id", id).select("*").single();
  if (error) throw error;
  return mapReq(data as DbReq);
}

export async function deleteRequirement(id: string): Promise<void> {
  const svc = createServiceClient();
  const { error } = await svc.from("product_requirements").delete().eq("id", id);
  if (error) throw error;
}
