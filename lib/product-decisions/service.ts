/**
 * NEXVORA Product Decisions Register — Data Access (0107)
 * قراءة عبر RLS (authenticated) — كتابة عبر service client (RBAC في الأكشنز).
 */
import "server-only";
import { createClient } from "@/lib/supabase/server";
import { createServiceClient } from "@/lib/supabase/service";
import type {
  ProductDecisionItemRow, ItemType, ItemStatus, ItemPriority,
} from "./types";

type DbRow = {
  id: string; project_id: string; item_type: ItemType; title: string;
  description: string; status: ItemStatus; priority: ItemPriority;
  owner_id: string | null; due_date: string | null; impact: string;
  mitigation: string; resolution: string; decision_date: string | null;
  linked_requirement_id: string | null; linked_story_id: string | null;
  linked_scope_item_id: string | null; stage_key: string | null;
  created_by: string | null; created_at: string; updated_at: string;
};

function mapRow(r: DbRow): ProductDecisionItemRow {
  return {
    id: r.id, projectId: r.project_id, itemType: r.item_type, title: r.title,
    description: r.description, status: r.status, priority: r.priority,
    ownerId: r.owner_id, dueDate: r.due_date, impact: r.impact,
    mitigation: r.mitigation, resolution: r.resolution, decisionDate: r.decision_date,
    linkedRequirementId: r.linked_requirement_id, linkedStoryId: r.linked_story_id,
    linkedScopeItemId: r.linked_scope_item_id, stageKey: r.stage_key,
    createdBy: r.created_by, createdAt: r.created_at, updatedAt: r.updated_at,
  };
}

export interface ListItemsFilters {
  itemType?: ItemType;
  status?: ItemStatus;
  stageKey?: string;
}

export async function listItems(
  projectId: string, filters: ListItemsFilters = {},
): Promise<ProductDecisionItemRow[]> {
  const supabase = await createClient();
  let q = supabase.from("product_decisions_register").select("*").eq("project_id", projectId);
  if (filters.itemType) q = q.eq("item_type", filters.itemType);
  if (filters.status) q = q.eq("status", filters.status);
  if (filters.stageKey) q = q.eq("stage_key", filters.stageKey);
  const { data, error } = await q.order("created_at", { ascending: false });
  if (error) throw error;
  return (data as DbRow[]).map(mapRow);
}

export interface CreateItemInput {
  itemType: ItemType;
  title: string;
  description?: string;
  status?: ItemStatus;
  priority?: ItemPriority;
  ownerId?: string | null;
  dueDate?: string | null;
  impact?: string;
  mitigation?: string;
  resolution?: string;
  decisionDate?: string | null;
  linkedRequirementId?: string | null;
  linkedStoryId?: string | null;
  linkedScopeItemId?: string | null;
  stageKey?: string | null;
}

export async function createItem(
  projectId: string, input: CreateItemInput, createdBy: string | null,
): Promise<ProductDecisionItemRow> {
  const svc = createServiceClient();
  const { data, error } = await svc.from("product_decisions_register").insert({
    project_id: projectId,
    item_type: input.itemType,
    title: input.title,
    description: input.description ?? "",
    status: input.status ?? "open",
    priority: input.priority ?? "medium",
    owner_id: input.ownerId ?? null,
    due_date: input.dueDate ?? null,
    impact: input.impact ?? "",
    mitigation: input.mitigation ?? "",
    resolution: input.resolution ?? "",
    decision_date: input.decisionDate ?? null,
    linked_requirement_id: input.linkedRequirementId ?? null,
    linked_story_id: input.linkedStoryId ?? null,
    linked_scope_item_id: input.linkedScopeItemId ?? null,
    stage_key: input.stageKey ?? null,
    created_by: createdBy,
  }).select("*").single();
  if (error) throw error;
  return mapRow(data as DbRow);
}

export type UpdateItemPatch = Partial<CreateItemInput>;

export async function updateItem(id: string, patch: UpdateItemPatch): Promise<ProductDecisionItemRow> {
  const svc = createServiceClient();
  const db: Record<string, unknown> = {};
  if (patch.itemType !== undefined) db.item_type = patch.itemType;
  if (patch.title !== undefined) db.title = patch.title;
  if (patch.description !== undefined) db.description = patch.description;
  if (patch.status !== undefined) db.status = patch.status;
  if (patch.priority !== undefined) db.priority = patch.priority;
  if (patch.ownerId !== undefined) db.owner_id = patch.ownerId;
  if (patch.dueDate !== undefined) db.due_date = patch.dueDate;
  if (patch.impact !== undefined) db.impact = patch.impact;
  if (patch.mitigation !== undefined) db.mitigation = patch.mitigation;
  if (patch.resolution !== undefined) db.resolution = patch.resolution;
  if (patch.decisionDate !== undefined) db.decision_date = patch.decisionDate;
  if (patch.linkedRequirementId !== undefined) db.linked_requirement_id = patch.linkedRequirementId;
  if (patch.linkedStoryId !== undefined) db.linked_story_id = patch.linkedStoryId;
  if (patch.linkedScopeItemId !== undefined) db.linked_scope_item_id = patch.linkedScopeItemId;
  if (patch.stageKey !== undefined) db.stage_key = patch.stageKey;
  const { data, error } = await svc.from("product_decisions_register").update(db).eq("id", id).select("*").single();
  if (error) throw error;
  return mapRow(data as DbRow);
}

export async function deleteItem(id: string): Promise<void> {
  const svc = createServiceClient();
  const { error } = await svc.from("product_decisions_register").delete().eq("id", id);
  if (error) throw error;
}

export async function setStatus(id: string, status: ItemStatus): Promise<ProductDecisionItemRow> {
  return updateItem(id, { status });
}

export async function assign(id: string, ownerId: string | null): Promise<ProductDecisionItemRow> {
  return updateItem(id, { ownerId });
}

export async function link(
  id: string,
  target: { requirementId?: string | null; storyId?: string | null; scopeItemId?: string | null },
): Promise<ProductDecisionItemRow> {
  const patch: UpdateItemPatch = {};
  if (target.requirementId !== undefined) patch.linkedRequirementId = target.requirementId;
  if (target.storyId !== undefined) patch.linkedStoryId = target.storyId;
  if (target.scopeItemId !== undefined) patch.linkedScopeItemId = target.scopeItemId;
  return updateItem(id, patch);
}

export async function getItem(id: string): Promise<ProductDecisionItemRow | null> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("product_decisions_register").select("*").eq("id", id).maybeSingle();
  if (error) throw error;
  return data ? mapRow(data as DbRow) : null;
}
