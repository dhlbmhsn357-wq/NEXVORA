/**
 * Prototype Studio — Artifact Service
 * ===================================
 * إدارة الـ artifacts (context_pack, build_brief, codex_build_pack).
 * كل نوع بيتنسّخ (version) مستقل. أي artifact جديد يزيد version بمقدار 1
 * ضمن (project_id, artifact_type).
 */
import "server-only";
import { createClient } from "@/lib/supabase/server";
import { createServiceClient } from "@/lib/supabase/service";
import {
  DEFAULT_ARTIFACT_METADATA,
  type ArtifactMetadata,
  type ArtifactSource,
  type ArtifactStatus,
  type ArtifactType,
  type PrototypeStudioArtifactRow,
} from "./types";

interface DbRow {
  id: string;
  project_id: string;
  artifact_type: string;
  version: number;
  status: string;
  content_md: string;
  metadata: Partial<ArtifactMetadata> | null;
  source: string;
  created_by: string | null;
  created_at: string;
  approved_by: string | null;
  approved_at: string | null;
  notes: string;
}

function mapRow(r: DbRow): PrototypeStudioArtifactRow {
  return {
    id: r.id,
    projectId: r.project_id,
    artifactType: r.artifact_type as ArtifactType,
    version: r.version,
    status: r.status as ArtifactStatus,
    contentMd: r.content_md,
    metadata: { ...DEFAULT_ARTIFACT_METADATA, ...(r.metadata ?? {}) },
    source: r.source as ArtifactSource,
    createdBy: r.created_by,
    createdAt: r.created_at,
    approvedBy: r.approved_by,
    approvedAt: r.approved_at,
    notes: r.notes,
  };
}

async function nextVersion(
  supabase: ReturnType<typeof createServiceClient>,
  projectId: string,
  type: ArtifactType,
): Promise<number> {
  const { data, error } = await supabase
    .from("prototype_studio_artifacts")
    .select("version")
    .eq("project_id", projectId)
    .eq("artifact_type", type)
    .order("version", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (error) throw error;
  const current = ((data as { version?: number } | null)?.version) ?? 0;
  return current + 1;
}

export async function createArtifact(
  projectId: string,
  type: ArtifactType,
  contentMd: string,
  metadata: ArtifactMetadata,
  source: ArtifactSource,
  userId: string | null,
  notes = "",
  initialStatus: ArtifactStatus = "draft",
): Promise<PrototypeStudioArtifactRow> {
  const supabase = createServiceClient();
  const version = await nextVersion(supabase, projectId, type);
  const { data, error } = await supabase
    .from("prototype_studio_artifacts")
    .insert({
      project_id: projectId,
      artifact_type: type,
      version,
      status: initialStatus,
      content_md: contentMd,
      metadata,
      source,
      created_by: userId,
      notes,
    })
    .select()
    .single();
  if (error) throw error;
  return mapRow(data as DbRow);
}

export async function listArtifacts(
  projectId: string,
  type?: ArtifactType,
): Promise<PrototypeStudioArtifactRow[]> {
  const supabase = await createClient();
  let query = supabase
    .from("prototype_studio_artifacts")
    .select("*")
    .eq("project_id", projectId)
    .order("artifact_type", { ascending: true })
    .order("version", { ascending: false });
  if (type) query = query.eq("artifact_type", type);
  const { data, error } = await query;
  if (error) throw error;
  return (data as DbRow[]).map(mapRow);
}

export async function getLatest(
  projectId: string,
  type: ArtifactType,
  statuses?: ArtifactStatus[],
): Promise<PrototypeStudioArtifactRow | null> {
  const supabase = await createClient();
  let query = supabase
    .from("prototype_studio_artifacts")
    .select("*")
    .eq("project_id", projectId)
    .eq("artifact_type", type)
    .order("version", { ascending: false })
    .limit(1);
  if (statuses && statuses.length > 0) query = query.in("status", statuses);
  const { data, error } = await query;
  if (error) throw error;
  const row = (data as DbRow[])[0];
  return row ? mapRow(row) : null;
}

export async function updateStatus(
  artifactId: string,
  status: ArtifactStatus,
  userId: string | null,
): Promise<PrototypeStudioArtifactRow> {
  const supabase = createServiceClient();
  const patch: Record<string, unknown> = { status };
  if (status === "approved") {
    patch.approved_by = userId;
    patch.approved_at = new Date().toISOString();
  }
  const { data, error } = await supabase
    .from("prototype_studio_artifacts")
    .update(patch)
    .eq("id", artifactId)
    .select()
    .single();
  if (error) throw error;
  return mapRow(data as DbRow);
}

/**
 * يعتمد artifact ويعلّم أي نسخ أقدم بنفس النوع في المشروع كـ superseded.
 */
export async function approve(
  artifactId: string,
  userId: string | null,
): Promise<PrototypeStudioArtifactRow> {
  const supabase = createServiceClient();
  const { data: target, error: e1 } = await supabase
    .from("prototype_studio_artifacts")
    .select("id, project_id, artifact_type")
    .eq("id", artifactId)
    .single();
  if (e1) throw e1;
  const row = target as { id: string; project_id: string; artifact_type: string };

  // Supersede prior approved of same type
  const { error: e2 } = await supabase
    .from("prototype_studio_artifacts")
    .update({ status: "superseded" })
    .eq("project_id", row.project_id)
    .eq("artifact_type", row.artifact_type)
    .neq("id", artifactId)
    .in("status", ["approved", "active"]);
  if (e2) throw e2;

  const { data, error: e3 } = await supabase
    .from("prototype_studio_artifacts")
    .update({
      status: "approved",
      approved_by: userId,
      approved_at: new Date().toISOString(),
    })
    .eq("id", artifactId)
    .select()
    .single();
  if (e3) throw e3;
  return mapRow(data as DbRow);
}
