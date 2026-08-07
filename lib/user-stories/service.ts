/**
 * NEXVORA User Stories + AC — Data Access (P7)
 * ============================================
 * Server-only. القراءة عبر authenticated client (RLS SELECT).
 * الكتابة عبر service client (RBAC مطبّق في server actions).
 */
import "server-only";
import { createClient } from "@/lib/supabase/server";
import { createServiceClient } from "@/lib/supabase/service";
import type {
  UserStoryRow, AcceptanceCriterionRow, StoryStatus, RiskLevel, AcStatus,
} from "./types";

// ---------------------------------------------------------------------------
// Mappers
// ---------------------------------------------------------------------------
type DbStory = {
  id: string; project_id: string; code: string | null; title: string;
  as_a: string; i_want: string; so_that: string; narrative_extra: string;
  status: StoryStatus; story_points: number | null; business_value: number;
  risk_level: RiskLevel;
  linked_persona_id: string | null; linked_flow_id: string | null; linked_requirement_id: string | null;
  tags: string[];
  created_at: string; updated_at: string; created_by: string | null;
};
function mapStory(r: DbStory): UserStoryRow {
  return {
    id: r.id, projectId: r.project_id, code: r.code, title: r.title,
    asA: r.as_a, iWant: r.i_want, soThat: r.so_that, narrativeExtra: r.narrative_extra,
    status: r.status, storyPoints: r.story_points, businessValue: r.business_value,
    riskLevel: r.risk_level,
    linkedPersonaId: r.linked_persona_id, linkedFlowId: r.linked_flow_id, linkedRequirementId: r.linked_requirement_id,
    tags: r.tags ?? [],
    createdAt: r.created_at, updatedAt: r.updated_at, createdBy: r.created_by,
  };
}

type DbAc = {
  id: string; user_story_id: string; project_id: string; order_index: number;
  title: string; given_clause: string; when_clause: string; then_clause: string;
  and_conditions: string[]; status: AcStatus; notes: string;
  created_at: string; updated_at: string; created_by: string | null;
};
function mapAc(r: DbAc): AcceptanceCriterionRow {
  return {
    id: r.id, userStoryId: r.user_story_id, projectId: r.project_id,
    orderIndex: r.order_index, title: r.title,
    givenClause: r.given_clause, whenClause: r.when_clause, thenClause: r.then_clause,
    andConditions: r.and_conditions ?? [], status: r.status, notes: r.notes,
    createdAt: r.created_at, updatedAt: r.updated_at, createdBy: r.created_by,
  };
}

// ---------------------------------------------------------------------------
// Stories
// ---------------------------------------------------------------------------
export async function listStories(projectId: string): Promise<UserStoryRow[]> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("user_stories").select("*").eq("project_id", projectId)
    .order("status", { ascending: true })
    .order("created_at", { ascending: false });
  if (error) throw error;
  return (data as DbStory[]).map(mapStory);
}

export interface StoryInput {
  code?: string | null;
  title: string;
  asA?: string; iWant?: string; soThat?: string;
  narrativeExtra?: string;
  status?: StoryStatus;
  storyPoints?: number | null;
  businessValue?: number;
  riskLevel?: RiskLevel;
  linkedPersonaId?: string | null;
  linkedFlowId?: string | null;
  linkedRequirementId?: string | null;
  tags?: string[];
}

export async function createStory(projectId: string, input: StoryInput, createdBy: string | null): Promise<UserStoryRow> {
  const svc = createServiceClient();
  const { data, error } = await svc.from("user_stories").insert({
    project_id: projectId,
    code: input.code ?? null, title: input.title,
    as_a: input.asA ?? "", i_want: input.iWant ?? "", so_that: input.soThat ?? "",
    narrative_extra: input.narrativeExtra ?? "",
    status: input.status ?? "draft",
    story_points: input.storyPoints ?? null,
    business_value: input.businessValue ?? 50,
    risk_level: input.riskLevel ?? "medium",
    linked_persona_id: input.linkedPersonaId ?? null,
    linked_flow_id: input.linkedFlowId ?? null,
    linked_requirement_id: input.linkedRequirementId ?? null,
    tags: input.tags ?? [],
    created_by: createdBy,
  }).select("*").single();
  if (error) throw error;
  return mapStory(data as DbStory);
}

export async function updateStory(id: string, patch: Partial<StoryInput>): Promise<UserStoryRow> {
  const svc = createServiceClient();
  const db: Record<string, unknown> = {};
  if (patch.code !== undefined) db.code = patch.code;
  if (patch.title !== undefined) db.title = patch.title;
  if (patch.asA !== undefined) db.as_a = patch.asA;
  if (patch.iWant !== undefined) db.i_want = patch.iWant;
  if (patch.soThat !== undefined) db.so_that = patch.soThat;
  if (patch.narrativeExtra !== undefined) db.narrative_extra = patch.narrativeExtra;
  if (patch.status !== undefined) db.status = patch.status;
  if (patch.storyPoints !== undefined) db.story_points = patch.storyPoints;
  if (patch.businessValue !== undefined) db.business_value = patch.businessValue;
  if (patch.riskLevel !== undefined) db.risk_level = patch.riskLevel;
  if (patch.linkedPersonaId !== undefined) db.linked_persona_id = patch.linkedPersonaId;
  if (patch.linkedFlowId !== undefined) db.linked_flow_id = patch.linkedFlowId;
  if (patch.linkedRequirementId !== undefined) db.linked_requirement_id = patch.linkedRequirementId;
  if (patch.tags !== undefined) db.tags = patch.tags;
  const { data, error } = await svc.from("user_stories").update(db).eq("id", id).select("*").single();
  if (error) throw error;
  return mapStory(data as DbStory);
}

export async function deleteStory(id: string): Promise<void> {
  const svc = createServiceClient();
  const { error } = await svc.from("user_stories").delete().eq("id", id);
  if (error) throw error;
}

// ---------------------------------------------------------------------------
// Acceptance Criteria
// ---------------------------------------------------------------------------
export async function listAcceptanceCriteria(projectId: string): Promise<AcceptanceCriterionRow[]> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("acceptance_criteria").select("*").eq("project_id", projectId)
    .order("user_story_id", { ascending: true })
    .order("order_index", { ascending: true });
  if (error) throw error;
  return (data as DbAc[]).map(mapAc);
}

export interface AcInput {
  userStoryId: string;
  orderIndex?: number;
  title?: string;
  givenClause?: string;
  whenClause?: string;
  thenClause?: string;
  andConditions?: string[];
  status?: AcStatus;
  notes?: string;
}

export async function createAc(projectId: string, input: AcInput, createdBy: string | null): Promise<AcceptanceCriterionRow> {
  const svc = createServiceClient();
  const { data, error } = await svc.from("acceptance_criteria").insert({
    user_story_id: input.userStoryId,
    project_id: projectId,
    order_index: input.orderIndex ?? 1,
    title: input.title ?? "",
    given_clause: input.givenClause ?? "",
    when_clause: input.whenClause ?? "",
    then_clause: input.thenClause ?? "",
    and_conditions: input.andConditions ?? [],
    status: input.status ?? "draft",
    notes: input.notes ?? "",
    created_by: createdBy,
  }).select("*").single();
  if (error) throw error;
  return mapAc(data as DbAc);
}

export async function updateAc(id: string, patch: Partial<Omit<AcInput, "userStoryId">>): Promise<AcceptanceCriterionRow> {
  const svc = createServiceClient();
  const db: Record<string, unknown> = {};
  if (patch.orderIndex !== undefined) db.order_index = patch.orderIndex;
  if (patch.title !== undefined) db.title = patch.title;
  if (patch.givenClause !== undefined) db.given_clause = patch.givenClause;
  if (patch.whenClause !== undefined) db.when_clause = patch.whenClause;
  if (patch.thenClause !== undefined) db.then_clause = patch.thenClause;
  if (patch.andConditions !== undefined) db.and_conditions = patch.andConditions;
  if (patch.status !== undefined) db.status = patch.status;
  if (patch.notes !== undefined) db.notes = patch.notes;
  const { data, error } = await svc.from("acceptance_criteria").update(db).eq("id", id).select("*").single();
  if (error) throw error;
  return mapAc(data as DbAc);
}

export async function deleteAc(id: string): Promise<void> {
  const svc = createServiceClient();
  const { error } = await svc.from("acceptance_criteria").delete().eq("id", id);
  if (error) throw error;
}

/**
 * أعلى order_index موجود لقصة معيّنة — للـ UI ليعرف الرقم التالي.
 */
export async function nextAcOrderIndex(userStoryId: string): Promise<number> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("acceptance_criteria")
    .select("order_index")
    .eq("user_story_id", userStoryId)
    .order("order_index", { ascending: false })
    .limit(1);
  if (error) throw error;
  const max = data?.[0]?.order_index ?? 0;
  return max + 1;
}
