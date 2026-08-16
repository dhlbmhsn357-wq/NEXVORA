/**
 * NEXVORA Product Definition — Business Rules Data Access
 * =========================================================
 * Server-only. القراءة عبر authenticated client (RLS SELECT).
 * الكتابة عبر service client (RBAC مطبّق في server actions).
 */
import "server-only";
import { createClient } from "@/lib/supabase/server";
import { createServiceClient } from "@/lib/supabase/service";
import type { BusinessRuleRow, BusinessRuleEnforcementPoint } from "./business-rules-types";

type DbBusinessRule = {
  id: string;
  project_id: string;
  title: string;
  trigger_condition: string;
  threshold_value: string;
  on_violation: string;
  enforcement_point: BusinessRuleEnforcementPoint;
  linked_flow_id: string | null;
  linked_persona_id: string | null;
  notes: string;
  created_at: string;
  updated_at: string;
  created_by: string | null;
};

export function mapBusinessRule(r: DbBusinessRule): BusinessRuleRow {
  return {
    id: r.id,
    projectId: r.project_id,
    title: r.title,
    triggerCondition: r.trigger_condition,
    thresholdValue: r.threshold_value,
    onViolation: r.on_violation,
    enforcementPoint: r.enforcement_point,
    linkedFlowId: r.linked_flow_id,
    linkedPersonaId: r.linked_persona_id,
    notes: r.notes,
    createdAt: r.created_at,
    updatedAt: r.updated_at,
    createdBy: r.created_by,
  };
}

export async function listBusinessRules(projectId: string): Promise<BusinessRuleRow[]> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("business_rules")
    .select("*")
    .eq("project_id", projectId)
    .order("created_at", { ascending: false });
  if (error) throw error;
  return (data as DbBusinessRule[]).map(mapBusinessRule);
}

export interface BusinessRuleInput {
  title: string;
  triggerCondition?: string;
  thresholdValue?: string;
  onViolation?: string;
  enforcementPoint?: BusinessRuleEnforcementPoint;
  linkedFlowId?: string | null;
  linkedPersonaId?: string | null;
  notes?: string;
}

export async function createBusinessRule(
  projectId: string,
  input: BusinessRuleInput,
  createdBy: string | null
): Promise<BusinessRuleRow> {
  const svc = createServiceClient();
  const { data, error } = await svc
    .from("business_rules")
    .insert({
      project_id: projectId,
      title: input.title,
      trigger_condition: input.triggerCondition ?? "",
      threshold_value: input.thresholdValue ?? "",
      on_violation: input.onViolation ?? "",
      enforcement_point: input.enforcementPoint ?? "server",
      linked_flow_id: input.linkedFlowId ?? null,
      linked_persona_id: input.linkedPersonaId ?? null,
      notes: input.notes ?? "",
      created_by: createdBy,
    })
    .select("*")
    .single();
  if (error) throw error;
  return mapBusinessRule(data as DbBusinessRule);
}

export async function updateBusinessRule(
  id: string,
  patch: Partial<BusinessRuleInput>
): Promise<BusinessRuleRow> {
  const svc = createServiceClient();
  const db: Record<string, unknown> = {};
  if (patch.title !== undefined) db.title = patch.title;
  if (patch.triggerCondition !== undefined) db.trigger_condition = patch.triggerCondition;
  if (patch.thresholdValue !== undefined) db.threshold_value = patch.thresholdValue;
  if (patch.onViolation !== undefined) db.on_violation = patch.onViolation;
  if (patch.enforcementPoint !== undefined) db.enforcement_point = patch.enforcementPoint;
  if (patch.linkedFlowId !== undefined) db.linked_flow_id = patch.linkedFlowId;
  if (patch.linkedPersonaId !== undefined) db.linked_persona_id = patch.linkedPersonaId;
  if (patch.notes !== undefined) db.notes = patch.notes;
  const { data, error } = await svc.from("business_rules").update(db).eq("id", id).select("*").single();
  if (error) throw error;
  return mapBusinessRule(data as DbBusinessRule);
}

export async function deleteBusinessRule(id: string): Promise<void> {
  const svc = createServiceClient();
  const { error } = await svc.from("business_rules").delete().eq("id", id);
  if (error) throw error;
}
