/**
 * NEXVORA Product Definition — System Messages Data Access
 * ==========================================================
 * Server-only. القراءة عبر authenticated client (RLS SELECT).
 * الكتابة عبر service client (RBAC مطبّق في server actions).
 */
import "server-only";
import { createClient } from "@/lib/supabase/server";
import { createServiceClient } from "@/lib/supabase/service";
import type { SystemMessageRow, SystemMessageType } from "./business-rules-types";

type DbSystemMessage = {
  id: string;
  project_id: string;
  event_name: string;
  message_type: SystemMessageType;
  message_text: string;
  linked_flow_id: string | null;
  linked_persona_id: string | null;
  notes: string;
  created_at: string;
  updated_at: string;
  created_by: string | null;
};

export function mapSystemMessage(r: DbSystemMessage): SystemMessageRow {
  return {
    id: r.id,
    projectId: r.project_id,
    eventName: r.event_name,
    messageType: r.message_type,
    messageText: r.message_text,
    linkedFlowId: r.linked_flow_id,
    linkedPersonaId: r.linked_persona_id,
    notes: r.notes,
    createdAt: r.created_at,
    updatedAt: r.updated_at,
    createdBy: r.created_by,
  };
}

export async function listSystemMessages(projectId: string): Promise<SystemMessageRow[]> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("system_messages")
    .select("*")
    .eq("project_id", projectId)
    .order("created_at", { ascending: false });
  if (error) throw error;
  return (data as DbSystemMessage[]).map(mapSystemMessage);
}

export interface SystemMessageInput {
  eventName: string;
  messageType?: SystemMessageType;
  messageText?: string;
  linkedFlowId?: string | null;
  linkedPersonaId?: string | null;
  notes?: string;
}

export async function createSystemMessage(
  projectId: string,
  input: SystemMessageInput,
  createdBy: string | null
): Promise<SystemMessageRow> {
  const svc = createServiceClient();
  const { data, error } = await svc
    .from("system_messages")
    .insert({
      project_id: projectId,
      event_name: input.eventName,
      message_type: input.messageType ?? "info",
      message_text: input.messageText ?? "",
      linked_flow_id: input.linkedFlowId ?? null,
      linked_persona_id: input.linkedPersonaId ?? null,
      notes: input.notes ?? "",
      created_by: createdBy,
    })
    .select("*")
    .single();
  if (error) throw error;
  return mapSystemMessage(data as DbSystemMessage);
}

export async function updateSystemMessage(
  id: string,
  patch: Partial<SystemMessageInput>
): Promise<SystemMessageRow> {
  const svc = createServiceClient();
  const db: Record<string, unknown> = {};
  if (patch.eventName !== undefined) db.event_name = patch.eventName;
  if (patch.messageType !== undefined) db.message_type = patch.messageType;
  if (patch.messageText !== undefined) db.message_text = patch.messageText;
  if (patch.linkedFlowId !== undefined) db.linked_flow_id = patch.linkedFlowId;
  if (patch.linkedPersonaId !== undefined) db.linked_persona_id = patch.linkedPersonaId;
  if (patch.notes !== undefined) db.notes = patch.notes;
  const { data, error } = await svc.from("system_messages").update(db).eq("id", id).select("*").single();
  if (error) throw error;
  return mapSystemMessage(data as DbSystemMessage);
}

export async function deleteSystemMessage(id: string): Promise<void> {
  const svc = createServiceClient();
  const { error } = await svc.from("system_messages").delete().eq("id", id);
  if (error) throw error;
}
