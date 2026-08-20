/**
 * NEXVORA Sector Standards — Client Change Requests + Impact Analysis
 * Data Access (0124، المرحلة ب)
 * ============================================================================
 * Server-only. القراءة عبر authenticated client (RLS SELECT).
 * الكتابة عبر service client (RBAC مطبّق في server actions).
 * نفس نمط business-rules-service.ts بالضبط.
 */
import "server-only";
import { createClient } from "@/lib/supabase/server";
import { createServiceClient } from "@/lib/supabase/service";
import type {
  ChangeRequestRow,
  ChangeRequestStatus,
  ChangeImpactRow,
  ImpactStatus,
  CreateChangeRequestInput,
} from "./change-request-types";

// ---------------------------------------------------------------------------
// Mappers
// ---------------------------------------------------------------------------
type DbChangeRequest = {
  id: string;
  project_id: string;
  type: "add" | "modify" | "remove";
  title: string;
  description: string;
  source_type: string | null;
  source_id: string | null;
  status: ChangeRequestStatus;
  created_by: string | null;
  created_at: string;
  updated_at: string;
};

function mapChangeRequest(r: DbChangeRequest): ChangeRequestRow {
  return {
    id: r.id,
    projectId: r.project_id,
    type: r.type,
    title: r.title,
    description: r.description,
    sourceType: r.source_type,
    sourceId: r.source_id,
    status: r.status,
    createdBy: r.created_by,
    createdAt: r.created_at,
    updatedAt: r.updated_at,
  };
}

type DbChangeImpact = {
  id: string;
  change_request_id: string;
  artifact_type: string;
  artifact_id: string | null;
  artifact_label: string;
  impact_type: "add" | "modify" | "remove";
  reason: string;
  proposed_change: Record<string, unknown>;
  dependencies: string[];
  missing_information: string;
  status: ImpactStatus;
  created_at: string;
};

function mapChangeImpact(r: DbChangeImpact): ChangeImpactRow {
  return {
    id: r.id,
    changeRequestId: r.change_request_id,
    artifactType: r.artifact_type,
    artifactId: r.artifact_id,
    artifactLabel: r.artifact_label,
    impactType: r.impact_type,
    reason: r.reason,
    proposedChange: r.proposed_change ?? {},
    dependencies: Array.isArray(r.dependencies) ? r.dependencies : [],
    missingInformation: r.missing_information,
    status: r.status,
    createdAt: r.created_at,
  };
}

// ---------------------------------------------------------------------------
// Change Requests
// ---------------------------------------------------------------------------
export async function listChangeRequests(projectId: string): Promise<ChangeRequestRow[]> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("client_change_requests")
    .select("*")
    .eq("project_id", projectId)
    .order("created_at", { ascending: false });
  if (error) throw error;
  return (data as DbChangeRequest[]).map(mapChangeRequest);
}

export async function getChangeRequest(id: string): Promise<ChangeRequestRow | null> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("client_change_requests")
    .select("*")
    .eq("id", id)
    .maybeSingle();
  if (error) throw error;
  return data ? mapChangeRequest(data as DbChangeRequest) : null;
}

export async function createChangeRequest(
  projectId: string,
  input: CreateChangeRequestInput,
  actorId: string | null
): Promise<ChangeRequestRow> {
  const trimmedTitle = input.title.trim();
  if (!trimmedTitle) throw new Error("عنوان طلب التغيير مطلوب.");

  const svc = createServiceClient();
  const { data, error } = await svc
    .from("client_change_requests")
    .insert({
      project_id: projectId,
      type: input.type,
      title: trimmedTitle,
      description: input.description ?? "",
      source_type: input.sourceType ?? null,
      source_id: input.sourceId ?? null,
      created_by: actorId,
    })
    .select("*")
    .single();
  if (error) throw error;
  return mapChangeRequest(data as DbChangeRequest);
}

export async function updateChangeRequestStatus(
  id: string,
  status: ChangeRequestStatus
): Promise<ChangeRequestRow> {
  const svc = createServiceClient();
  const { data, error } = await svc
    .from("client_change_requests")
    .update({ status })
    .eq("id", id)
    .select("*")
    .single();
  if (error) throw error;
  return mapChangeRequest(data as DbChangeRequest);
}

export async function deleteChangeRequest(id: string): Promise<void> {
  const svc = createServiceClient();
  const { error } = await svc.from("client_change_requests").delete().eq("id", id);
  if (error) throw error;
}

// ---------------------------------------------------------------------------
// Change Impacts
// ---------------------------------------------------------------------------
export async function listChangeImpacts(changeRequestId: string): Promise<ChangeImpactRow[]> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("change_impacts")
    .select("*")
    .eq("change_request_id", changeRequestId)
    .order("created_at", { ascending: true });
  if (error) throw error;
  return (data as DbChangeImpact[]).map(mapChangeImpact);
}

export interface CreateChangeImpactInput {
  artifactType: string;
  artifactId: string | null;
  artifactLabel: string;
  impactType: "add" | "modify" | "remove";
  reason: string;
  proposedChange: Record<string, unknown>;
  dependencies: string[];
  missingInformation: string;
}

/**
 * يُدرج دفعة أثر تحليل — تُستخدم فقط من impact-analysis-pipeline.ts بعد
 * التحقق من رد الذكاء الاصطناعي. كل صف بيتسجّل بحالة 'proposed' دايمًا
 * (الحالة الوحيدة الممكنة لأثر لسه ما اتراجعش بشريًا).
 */
export async function createChangeImpacts(
  changeRequestId: string,
  impacts: CreateChangeImpactInput[]
): Promise<ChangeImpactRow[]> {
  if (impacts.length === 0) return [];
  const svc = createServiceClient();
  const { data, error } = await svc
    .from("change_impacts")
    .insert(
      impacts.map((i) => ({
        change_request_id: changeRequestId,
        artifact_type: i.artifactType,
        artifact_id: i.artifactId,
        artifact_label: i.artifactLabel,
        impact_type: i.impactType,
        reason: i.reason,
        proposed_change: i.proposedChange,
        dependencies: i.dependencies,
        missing_information: i.missingInformation,
        status: "proposed",
      }))
    )
    .select("*");
  if (error) throw error;
  return (data as DbChangeImpact[]).map(mapChangeImpact);
}

export async function updateChangeImpactStatus(
  impactId: string,
  status: ImpactStatus
): Promise<ChangeImpactRow> {
  const svc = createServiceClient();
  const { data, error } = await svc
    .from("change_impacts")
    .update({ status })
    .eq("id", impactId)
    .select("*")
    .single();
  if (error) throw error;
  return mapChangeImpact(data as DbChangeImpact);
}
