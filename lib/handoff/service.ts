/**
 * NEXVORA Handoff Package + External Partners — Data Access (P12)
 */
import "server-only";
import { randomBytes } from "node:crypto";
import type { SupabaseClient } from "@supabase/supabase-js";
import { createClient } from "@/lib/supabase/server";
import { createServiceClient } from "@/lib/supabase/service";
import type {
  HandoffPackageRow, HandoffItemRow, HandoffPackageStatus, HandoffItemStatus,
  HandoffPackageSnapshotRow,
  ExternalPartnerRow, PartnerRole, PartnerStatus,
  HandoffQuestionRow, HandoffQuestionStatus, HandoffQuestionPriority,
  HandoffDeliveryRow, HandoffDeliveryStatus,
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
  // 0110
  source_type?: string | null; source_version?: string | null; source_hash?: string | null;
  assembled_at?: string | null; assembled_by?: string | null;
  is_manual_override?: boolean; override_reason?: string;
};
function mapItem(r: DbItem): HandoffItemRow {
  return {
    id: r.id, packageId: r.package_id, projectId: r.project_id,
    itemKey: r.item_key, isMandatory: r.is_mandatory, status: r.status,
    contentUrl: r.content_url, contentText: r.content_text,
    contentRefType: r.content_ref_type, contentRefId: r.content_ref_id,
    notes: r.notes, completedAt: r.completed_at, completedBy: r.completed_by,
    createdAt: r.created_at, updatedAt: r.updated_at,
    sourceType: r.source_type ?? null,
    sourceVersion: r.source_version ?? null,
    sourceHash: r.source_hash ?? null,
    assembledAt: r.assembled_at ?? null,
    assembledBy: r.assembled_by ?? null,
    isManualOverride: r.is_manual_override ?? false,
    overrideReason: r.override_reason ?? "",
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

/**
 * 0111 — يرفض أي كتابة على حزمة نُهيت (finalized/superseded).
 * يُستدعى في كل mutation قبل الكتابة. Defense-in-depth مع DB trigger.
 * يقبل packageId مباشرة أو يستنتجها من itemId.
 */
export async function assertPackageMutable(
  supabase: SupabaseClient,
  ref: { packageId?: string; itemId?: string },
): Promise<void> {
  let packageId = ref.packageId ?? null;
  if (!packageId && ref.itemId) {
    const { data, error } = await supabase
      .from("handoff_items")
      .select("package_id")
      .eq("id", ref.itemId)
      .maybeSingle();
    if (error) throw error;
    if (!data) throw new Error("عنصر التسليم غير موجود.");
    packageId = data.package_id as string;
  }
  if (!packageId) throw new Error("assertPackageMutable: يلزم packageId أو itemId.");
  const { data, error } = await supabase
    .from("handoff_packages")
    .select("status")
    .eq("id", packageId)
    .maybeSingle();
  if (error) throw error;
  if (!data) throw new Error("الحزمة غير موجودة.");
  const status = data.status as string;
  if (status === "finalized" || status === "superseded") {
    throw new Error("هذه نسخة تسليم نهائية وثابتة. أنشئ نسخة جديدة لإجراء تعديلات.");
  }
}

/** upsert (package_id, item_key) — يدعم إضافة عناصر اختيارية جديدة. */
export async function upsertItem(
  packageId: string, projectId: string, itemKey: string, patch: HandoffItemPatch,
): Promise<HandoffItemRow> {
  const svc = createServiceClient();
  await assertPackageMutable(svc as unknown as SupabaseClient, { packageId });
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

/** 0110 — يضبط علم الـ manual override على عنصر (يمنع الـ assembler من تغييره). */
export async function setManualOverride(
  itemId: string, override: boolean, reason: string,
): Promise<HandoffItemRow> {
  const svc = createServiceClient();
  await assertPackageMutable(svc as unknown as SupabaseClient, { itemId });
  const { data, error } = await svc.from("handoff_items")
    .update({ is_manual_override: override, override_reason: reason })
    .eq("id", itemId).select("*").single();
  if (error) throw error;
  return mapItem(data as DbItem);
}

export async function finalizePackage(
  packageId: string, finalizedBy: string | null,
): Promise<HandoffPackageRow> {
  const svc = createServiceClient();
  // 0111 — guard: refuse if already finalized/superseded (idempotency handled at caller)
  await assertPackageMutable(svc as unknown as SupabaseClient, { packageId });
  const { data, error } = await svc.from("handoff_packages").update({
    status: "finalized",
    finalized_at: new Date().toISOString(),
    finalized_by: finalizedBy,
  }).eq("id", packageId).select("*").single();
  if (error) throw error;
  return mapPackage(data as DbPackage);
}

// ---------------------------------------------------------------------------
// 0110 — Package Snapshots (Formal Delivery / Freeze)
// ---------------------------------------------------------------------------
type DbSnapshot = {
  id: string; package_id: string; project_id: string; version: number;
  payload: unknown; created_at: string; created_by: string | null;
};
function mapSnapshot(r: DbSnapshot): HandoffPackageSnapshotRow {
  return {
    id: r.id, packageId: r.package_id, projectId: r.project_id,
    version: r.version, payload: r.payload,
    createdAt: r.created_at, createdBy: r.created_by,
  };
}

/**
 * يجمّد الحزمة: يبني payload كامل ثابت (كل الحقول + resolved)، ينشئ سطر snapshot،
 * ويحدّث الحزمة إلى finalized. يُستخدم مع UI "تسليم رسمي".
 */
export async function freezePackage(
  packageId: string, userId: string | null,
): Promise<HandoffPackageSnapshotRow> {
  const svc = createServiceClient();
  // 0111 — Idempotency: لو مُجمَّدة بالفعل، أعِد آخر snapshot موجود.
  const { data: existing, error: exErr } = await svc.from("handoff_packages")
    .select("status, version").eq("id", packageId).maybeSingle();
  if (exErr) throw exErr;
  if (!existing) throw new Error("الحزمة غير موجودة.");
  if (existing.status === "finalized" || existing.status === "superseded") {
    const { data: snap, error: sErr } = await svc.from("handoff_package_snapshots")
      .select("*").eq("package_id", packageId).eq("version", existing.version)
      .order("created_at", { ascending: false }).limit(1).maybeSingle();
    if (sErr) throw sErr;
    if (snap) return mapSnapshot(snap as DbSnapshot);
    // fall-through: finalized بدون snapshot — نكمّل العملية العادية
  }
  const { data: pkgData, error: pErr } = await svc.from("handoff_packages")
    .select("*").eq("id", packageId).single();
  if (pErr) throw pErr;
  const pkg = mapPackage(pkgData as DbPackage);

  const { data: itemRows, error: iErr } = await svc.from("handoff_items")
    .select("*").eq("package_id", packageId).order("item_key", { ascending: true });
  if (iErr) throw iErr;
  const items = (itemRows as DbItem[]).map(mapItem);

  const payload = {
    frozenAt: new Date().toISOString(),
    frozenBy: userId,
    package: pkg,
    items,
    summary: {
      totalItems: items.length,
      completed: items.filter((i) => i.status === "completed").length,
      manualOverrides: items.filter((i) => i.isManualOverride).length,
    },
  };

  const { data: snap, error: sErr } = await svc.from("handoff_package_snapshots").insert({
    package_id: packageId,
    project_id: pkg.projectId,
    version: pkg.version,
    payload,
    created_by: userId,
  }).select("*").single();
  if (sErr) throw sErr;

  const { error: updErr } = await svc.from("handoff_packages").update({
    status: "finalized",
    finalized_at: new Date().toISOString(),
    finalized_by: userId,
  }).eq("id", packageId);
  if (updErr) throw updErr;

  return mapSnapshot(snap as DbSnapshot);
}

export async function listSnapshots(packageId: string): Promise<HandoffPackageSnapshotRow[]> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("handoff_package_snapshots").select("*").eq("package_id", packageId)
    .order("created_at", { ascending: false });
  if (error) throw error;
  return (data as DbSnapshot[]).map(mapSnapshot);
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

// ============================================================================
// Handoff Questions (0107)
// ============================================================================
type DbQuestion = {
  id: string; project_id: string; package_id: string; partner_id: string | null;
  question: string; answer: string;
  status: HandoffQuestionStatus; priority: HandoffQuestionPriority;
  asked_by: string | null; assigned_to: string | null; answered_by: string | null;
  asked_at: string; answered_at: string | null; closed_at: string | null;
  created_at: string; updated_at: string;
};
function mapQuestion(r: DbQuestion): HandoffQuestionRow {
  return {
    id: r.id, projectId: r.project_id, packageId: r.package_id, partnerId: r.partner_id,
    question: r.question, answer: r.answer, status: r.status, priority: r.priority,
    askedBy: r.asked_by, assignedTo: r.assigned_to, answeredBy: r.answered_by,
    askedAt: r.asked_at, answeredAt: r.answered_at, closedAt: r.closed_at,
    createdAt: r.created_at, updatedAt: r.updated_at,
  };
}

export async function listQuestions(packageId: string): Promise<HandoffQuestionRow[]> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("handoff_questions").select("*").eq("package_id", packageId)
    .order("asked_at", { ascending: false });
  if (error) throw error;
  return (data as DbQuestion[]).map(mapQuestion);
}

export interface CreateQuestionInput {
  projectId: string;
  packageId: string;
  question: string;
  partnerId?: string | null;
  priority?: HandoffQuestionPriority;
  assignedTo?: string | null;
}

export async function createQuestion(
  input: CreateQuestionInput, askedBy: string | null,
): Promise<HandoffQuestionRow> {
  const svc = createServiceClient();
  const { data, error } = await svc.from("handoff_questions").insert({
    project_id: input.projectId,
    package_id: input.packageId,
    partner_id: input.partnerId ?? null,
    question: input.question,
    priority: input.priority ?? "medium",
    assigned_to: input.assignedTo ?? null,
    asked_by: askedBy,
  }).select("*").single();
  if (error) throw error;
  return mapQuestion(data as DbQuestion);
}

export async function answerQuestion(
  id: string, answer: string, answeredBy: string | null,
): Promise<HandoffQuestionRow> {
  const svc = createServiceClient();
  const now = new Date().toISOString();
  const { data, error } = await svc.from("handoff_questions")
    .update({ answer, answered_by: answeredBy, answered_at: now, status: "answered" })
    .eq("id", id).select("*").single();
  if (error) throw error;
  return mapQuestion(data as DbQuestion);
}

export async function updateQuestionStatus(
  id: string, status: HandoffQuestionStatus,
): Promise<HandoffQuestionRow> {
  const svc = createServiceClient();
  const patch: Record<string, unknown> = { status };
  if (status === "closed") patch.closed_at = new Date().toISOString();
  const { data, error } = await svc.from("handoff_questions")
    .update(patch).eq("id", id).select("*").single();
  if (error) throw error;
  return mapQuestion(data as DbQuestion);
}

export async function getQuestion(id: string): Promise<HandoffQuestionRow | null> {
  const supabase = await createClient();
  const { data, error } = await supabase.from("handoff_questions").select("*").eq("id", id).maybeSingle();
  if (error) throw error;
  return data ? mapQuestion(data as DbQuestion) : null;
}

// ============================================================================
// Handoff Deliveries (0107)
// ============================================================================
type DbDelivery = {
  id: string; project_id: string; package_id: string; partner_id: string | null;
  partner_name: string; receipt_status: HandoffDeliveryStatus;
  sent_at: string | null; sent_by: string | null;
  received_at: string | null; accepted_at: string | null; rejected_at: string | null;
  status_updated_by: string | null; notes: string;
  created_at: string; updated_at: string;
};
function mapDelivery(r: DbDelivery): HandoffDeliveryRow {
  return {
    id: r.id, projectId: r.project_id, packageId: r.package_id, partnerId: r.partner_id,
    partnerName: r.partner_name, receiptStatus: r.receipt_status,
    sentAt: r.sent_at, sentBy: r.sent_by,
    receivedAt: r.received_at, acceptedAt: r.accepted_at, rejectedAt: r.rejected_at,
    statusUpdatedBy: r.status_updated_by, notes: r.notes,
    createdAt: r.created_at, updatedAt: r.updated_at,
  };
}

export async function listDeliveries(packageId: string): Promise<HandoffDeliveryRow[]> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("handoff_deliveries").select("*").eq("package_id", packageId)
    .order("created_at", { ascending: false });
  if (error) throw error;
  return (data as DbDelivery[]).map(mapDelivery);
}

export interface CreateDeliveryInput {
  projectId: string;
  packageId: string;
  partnerId?: string | null;
  partnerName?: string;
  receiptStatus?: HandoffDeliveryStatus;
  notes?: string;
}

export async function createDelivery(
  input: CreateDeliveryInput, actor: string | null,
): Promise<HandoffDeliveryRow> {
  const svc = createServiceClient();
  const now = new Date().toISOString();
  const status = input.receiptStatus ?? "pending";
  const insertRow: Record<string, unknown> = {
    project_id: input.projectId,
    package_id: input.packageId,
    partner_id: input.partnerId ?? null,
    partner_name: input.partnerName ?? "",
    receipt_status: status,
    notes: input.notes ?? "",
    status_updated_by: actor,
  };
  if (status === "sent") { insertRow.sent_at = now; insertRow.sent_by = actor; }
  if (status === "received") insertRow.received_at = now;
  if (status === "accepted") insertRow.accepted_at = now;
  if (status === "rejected") insertRow.rejected_at = now;
  const { data, error } = await svc.from("handoff_deliveries").insert(insertRow).select("*").single();
  if (error) throw error;
  return mapDelivery(data as DbDelivery);
}

export async function updateDeliveryStatus(
  id: string, status: HandoffDeliveryStatus, actor: string | null,
): Promise<HandoffDeliveryRow> {
  const svc = createServiceClient();
  const now = new Date().toISOString();
  const patch: Record<string, unknown> = { receipt_status: status, status_updated_by: actor };
  if (status === "sent") { patch.sent_at = now; patch.sent_by = actor; }
  if (status === "received") patch.received_at = now;
  if (status === "accepted") patch.accepted_at = now;
  if (status === "rejected") patch.rejected_at = now;
  const { data, error } = await svc.from("handoff_deliveries")
    .update(patch).eq("id", id).select("*").single();
  if (error) throw error;
  return mapDelivery(data as DbDelivery);
}

export async function getDelivery(id: string): Promise<HandoffDeliveryRow | null> {
  const supabase = await createClient();
  const { data, error } = await supabase.from("handoff_deliveries").select("*").eq("id", id).maybeSingle();
  if (error) throw error;
  return data ? mapDelivery(data as DbDelivery) : null;
}
