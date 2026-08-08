/**
 * NEXVORA Stage Assignments — Data Access (0107)
 */
import "server-only";
import { createClient } from "@/lib/supabase/server";
import { createServiceClient } from "@/lib/supabase/service";
import type { StageAssignmentRow, StageAssignmentStatus, StageKey } from "./types";

type DbRow = {
  project_id: string; stage_key: StageKey;
  owner_id: string | null; reviewer_id: string | null;
  due_date: string | null; status: StageAssignmentStatus; notes: string;
  created_at: string; updated_at: string;
};

function mapRow(r: DbRow): StageAssignmentRow {
  return {
    projectId: r.project_id, stageKey: r.stage_key,
    ownerId: r.owner_id, reviewerId: r.reviewer_id,
    dueDate: r.due_date, status: r.status, notes: r.notes,
    createdAt: r.created_at, updatedAt: r.updated_at,
  };
}

export async function listAssignments(projectId: string): Promise<StageAssignmentRow[]> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("project_stage_assignments").select("*").eq("project_id", projectId)
    .order("stage_key", { ascending: true });
  if (error) throw error;
  return (data as DbRow[]).map(mapRow);
}

export interface StageAssignmentPatch {
  ownerId?: string | null;
  reviewerId?: string | null;
  dueDate?: string | null;
  status?: StageAssignmentStatus;
  notes?: string;
}

export async function upsertAssignment(
  projectId: string, stageKey: StageKey, patch: StageAssignmentPatch,
): Promise<StageAssignmentRow> {
  const svc = createServiceClient();
  const row: Record<string, unknown> = {
    project_id: projectId,
    stage_key: stageKey,
  };
  if (patch.ownerId !== undefined) row.owner_id = patch.ownerId;
  if (patch.reviewerId !== undefined) row.reviewer_id = patch.reviewerId;
  if (patch.dueDate !== undefined) row.due_date = patch.dueDate;
  if (patch.status !== undefined) row.status = patch.status;
  if (patch.notes !== undefined) row.notes = patch.notes;
  const { data, error } = await svc.from("project_stage_assignments")
    .upsert(row, { onConflict: "project_id,stage_key" })
    .select("*").single();
  if (error) throw error;
  return mapRow(data as DbRow);
}

export async function setStatus(
  projectId: string, stageKey: StageKey, status: StageAssignmentStatus,
): Promise<StageAssignmentRow> {
  return upsertAssignment(projectId, stageKey, { status });
}
