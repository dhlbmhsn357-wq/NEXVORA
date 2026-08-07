/**
 * NEXVORA Handoff Package + External Partners — Data Access (P12)
 */
import "server-only";
import { randomBytes } from "node:crypto";
import { createClient } from "@/lib/supabase/server";
import { createServiceClient } from "@/lib/supabase/service";
import type {
  HandoffPackageRow, HandoffItemRow, HandoffPackageStatus, HandoffItemStatus,
  ExternalPartnerRow, PartnerRole, PartnerStatus,
} from "./types";
import { HANDOFF_ITEM_REGISTRY } from "./types";

// ---------------------------------------------------------------------------
// Packages
// ---------------------------------------------------------------------------
type DbPackage = {
  id: string; project_id: string; version: number; title: string;
  status: HandoffPackageStatus; finalized_at: string | null; finalized_by: string | null;
  notes: string; created_at: string; updated_at: string; created_by: string | null;
};
function mapPackage(r: DbPackage): HandoffPackageRow {
  return {
    id: r.id, projectId: r.project_id, version: r.version, title: r.title,
    status: r.status, finalizedAt: r.finalized_at, finalizedBy: r.finalized_by,
    notes: r.notes, createdAt: r.created_at, updatedAt: r.updated_at, createdBy: r.created_by,
  };
}

type DbItem = {
  id: string; package_id: string; project_id: string; item_key: string;
  is_mandatory: boolean; status: HandoffItemStatus;
  content_url: string | null; content_text: string;
  content_ref_type: string | null; content_ref_id: string | null;
  notes: string; completed_at: string | null; completed_by: string | null;
  created_at: string; updated_at: string;
};
function mapItem(r: DbItem): HandoffItemRow {
  return {
    id: r.id, packageId: r.package_id, projectId: r.project_id,
    itemKey: r.item_key, isMandatory: r.is_mandatory, status: r.status,
    contentUrl: r.content_url, contentText: r.content_text,
    contentRefType: r.content_ref_type, contentRefId: r.content_ref_id,
    notes: r.notes, completedAt: r.completed_at, completedBy: r.completed_by,
    createdAt: r.created_at, updatedAt: r.updated_at,
  };
}

export async function listPackages(projectId: string): Promise<HandoffPackageRow[]> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("handoff_packages").select("*").eq("project_id", projectId)
    .order("version", { ascending: false });
  if (error) throw error;
  return (data as DbPackage[]).map(mapPackage);
}

export async function getLatestPackage(projectId: string): Promise<HandoffPackageRow | null> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("handoff_packages").select("*").eq("project_id", projectId)
    .order("version", { ascending: false }).limit(1).maybeSingle();
  if (error) throw error;
  return data ? mapPackage(data as DbPackage) : null;
}

export async function listItems(packageId: string): Promise<HandoffItemRow[]> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("handoff_items").select("*").eq("package_id", packageId)
    .order("is_mandatory", { ascending: false }).order("item_key", { ascending: true });
  if (error) throw error;
  return (data as DbItem[]).map(mapItem);
}

export async function createPackage(
  projectId: string, title: string, createdBy: string | null,
): Promise<HandoffPackageRow> {
  const svc = createServiceClient();
  // احسب رقم النسخة التالي
  const { data: existing, error: exErr } = await svc.from("handoff_packages")
    .select("version").eq("project_id", projectId)
    .order("version", { ascending: false }).limit(1);
  if (exErr) throw exErr;
  const nextVersion = (existing && existing[0]?.version ? existing[0].version : 0) + 1;

  const { data, error } = await svc.from("handoff_packages").insert({
    project_id: projectId, version: nextVersion,
    title: title || `Handoff Package v${nextVersion}`,
    status: "draft", created_by: createdBy,
  }).select("*").single();
  if (error) throw error;
  const pkg = mapPackage(data as DbPackage);

  // بذر الـ 7 عناصر الإلزامية بحالة pending
  const mandatoryDefs = HANDOFF_ITEM_REGISTRY.filter((d) => d.isMandatory);
  const seed = mandatoryDefs.map((d) => ({
    package_id: pkg.id, project_id: projectId,
    item_key: d.key, is_mandatory: true, status: "pending",
  }));
  const { error: seedErr } = await svc.from("handoff_items").insert(seed);
  if (seedErr) throw seedErr;
  return pkg;
}

export interface HandoffItemPatch {
  status?: HandoffItemStatus;
  contentUrl?: string | null;
  contentText?: string;
  contentRefType?: string | null;
  contentRefId?: string | null;
  notes?: string;
  isMandatory?: boolean;
}

/** upsert (package_id, item_key) — يدعم إضافة عناصر اختيارية جديدة. */
export async function upsertItem(
  packageId: string, projectId: string, itemKey: string, patch: HandoffItemPatch,
): Promise<HandoffItemRow> {
  const svc = createServiceClient();
  const def = HANDOFF_ITEM_REGISTRY.find((d) => d.key === itemKey);
  const isMandatory = patch.isMandatory ?? def?.isMandatory ?? false;

  const now = new Date().toISOString();
  const row: Record<string, unknown> = {
    package_id: packageId,
    project_id: projectId,
    item_key: itemKey,
    is_mandatory: isMandatory,
  };
  if (patch.status !== undefined) {
    row.status = patch.status;
    if (patch.status === "completed") row.completed_at = now;
  }
  if (patch.contentUrl !== undefined) row.content_url = patch.contentUrl;
  if (patch.contentText !== undefined) row.content_text = patch.contentText;
  if (patch.contentRefType !== undefined) row.content_ref_type = patch.contentRefType;
  if (patch.contentRefId !== undefined) row.content_ref_id = patch.contentRefId;
  if (patch.notes !== undefined) row.notes = patch.notes;

  const { data, error } = await svc.from("handoff_items")
    .upsert(row, { onConflict: "package_id,item_key" })
    .select("*").single();
  if (error) throw error;
  return mapItem(data as DbItem);
}

export async function finalizePackage(
  packageId: string, finalizedBy: string | null,
): Promise<HandoffPackageRow> {
  const svc = createServiceClient();
  const { data, error } = await svc.from("handoff_packages").update({
    status: "finalized",
    finalized_at: new Date().toISOString(),
    finalized_by: finalizedBy,
  }).eq("id", packageId).select("*").single();
  if (error) throw error;
  return mapPackage(data as DbPackage);
}

// ---------------------------------------------------------------------------
// Partners
// ---------------------------------------------------------------------------
type DbPartner = {
  id: string; project_id: string; name: string; organization: string; email: string;
  role: PartnerRole; status: PartnerStatus; access_token: string;
  expires_at: string | null; last_seen_at: string | null;
  invited_at: string; invited_by: string | null;
  revoked_at: string | null; revoke_reason: string; notes: string; updated_at: string;
};
function mapPartner(r: DbPartner): ExternalPartnerRow {
  return {
    id: r.id, projectId: r.project_id, name: r.name, organization: r.organization, email: r.email,
    role: r.role, status: r.status, accessToken: r.access_token,
    expiresAt: r.expires_at, lastSeenAt: r.last_seen_at,
    invitedAt: r.invited_at, invitedBy: r.invited_by,
    revokedAt: r.revoked_at, revokeReason: r.revoke_reason,
    notes: r.notes, updatedAt: r.updated_at,
  };
}

export async function listPartners(projectId: string): Promise<ExternalPartnerRow[]> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("external_partners").select("*").eq("project_id", projectId)
    .order("invited_at", { ascending: false });
  if (error) throw error;
  return (data as DbPartner[]).map(mapPartner);
}

export interface PartnerInput {
  name: string;
  organization?: string;
  email: string;
  role?: PartnerRole;
  expiresInDays?: number | null;
  notes?: string;
}

export async function createPartner(
  projectId: string, input: PartnerInput, invitedBy: string | null,
): Promise<ExternalPartnerRow> {
  const svc = createServiceClient();
  const accessToken = randomBytes(24).toString("hex");
  const expiresAt = input.expiresInDays
    ? new Date(Date.now() + input.expiresInDays * 86400_000).toISOString()
    : null;

  const { data, error } = await svc.from("external_partners").insert({
    project_id: projectId,
    name: input.name,
    organization: input.organization ?? "",
    email: input.email,
    role: input.role ?? "viewer",
    status: "invited",
    access_token: accessToken,
    expires_at: expiresAt,
    invited_by: invitedBy,
    notes: input.notes ?? "",
  }).select("*").single();
  if (error) throw error;
  return mapPartner(data as DbPartner);
}

export async function updatePartnerStatus(
  id: string, status: PartnerStatus, actor: string | null, reason?: string,
): Promise<ExternalPartnerRow> {
  const svc = createServiceClient();
  const patch: Record<string, unknown> = { status };
  if (status === "revoked") {
    patch.revoked_at = new Date().toISOString();
    patch.revoke_reason = reason ?? "";
    // ملاحظة: جدول external_partners ما فيهش عمود revoked_by (على عكس approvals).
    void actor;
  }
  const { data, error } = await svc.from("external_partners")
    .update(patch).eq("id", id).select("*").single();
  if (error) throw error;
  return mapPartner(data as DbPartner);
}

export async function revokePartner(
  id: string, reason: string, revokedBy: string | null,
): Promise<void> {
  await updatePartnerStatus(id, "revoked", revokedBy, reason);
}
