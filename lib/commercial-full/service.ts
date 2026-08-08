/**
 * NEXVORA Commercial Full — Data Access (P10)
 * Proposals + Pricing Packages + Change Requests
 *
 * Change Request semantics (0106):
 *   Change Request is a RECORD-ONLY entity.
 *   Approving a CR does NOT auto-update linked scope/proposal/contract.
 *   The PM manually updates downstream artifacts based on the approved CR.
 *   If Client Approval is required, PM must create a client_approval record separately.
 */
import "server-only";
import { createClient } from "@/lib/supabase/server";
import { createServiceClient } from "@/lib/supabase/service";
import type {
  PricingPackageRow, PackageTier,
  ProposalRow, ProposalItemRow, ProposalStatus,
  ChangeRequestRow, ChangeRequestStatus,
} from "./types";
import { isLegalCrTransition } from "./types";
import { computeLineTotal, computeProposalTotals } from "./derive";

// ---------------------------------------------------------------------------
// Mappers
// ---------------------------------------------------------------------------
type DbPkg = {
  id: string; name: string; tier: PackageTier; description: string;
  base_price: number | string; currency: string; features: string[];
  is_active: boolean; created_at: string; updated_at: string; created_by: string | null;
};
function mapPkg(r: DbPkg): PricingPackageRow {
  return {
    id: r.id, name: r.name, tier: r.tier, description: r.description,
    basePrice: typeof r.base_price === "string" ? Number(r.base_price) : r.base_price,
    currency: r.currency, features: r.features ?? [], isActive: r.is_active,
    createdAt: r.created_at, updatedAt: r.updated_at, createdBy: r.created_by,
  };
}

type DbProp = {
  id: string; project_id: string; version: number; title: string; summary: string;
  status: ProposalStatus; currency: string;
  subtotal: number | string; discount_amount: number | string; tax_amount: number | string; total_amount: number | string;
  valid_until: string | null; sent_at: string | null; accepted_at: string | null; rejected_at: string | null;
  linked_package_id: string | null; notes: string;
  created_at: string; updated_at: string; created_by: string | null;
};
const num = (n: number | string): number => typeof n === "string" ? Number(n) : n;
function mapProp(r: DbProp): ProposalRow {
  return {
    id: r.id, projectId: r.project_id, version: r.version, title: r.title, summary: r.summary,
    status: r.status, currency: r.currency,
    subtotal: num(r.subtotal), discountAmount: num(r.discount_amount),
    taxAmount: num(r.tax_amount), totalAmount: num(r.total_amount),
    validUntil: r.valid_until, sentAt: r.sent_at, acceptedAt: r.accepted_at, rejectedAt: r.rejected_at,
    linkedPackageId: r.linked_package_id, notes: r.notes,
    createdAt: r.created_at, updatedAt: r.updated_at, createdBy: r.created_by,
  };
}

type DbItem = {
  id: string; proposal_id: string; project_id: string; order_index: number;
  title: string; description: string;
  quantity: number | string; unit_price: number | string; line_total: number | string;
  notes: string; created_at: string;
};
function mapItem(r: DbItem): ProposalItemRow {
  return {
    id: r.id, proposalId: r.proposal_id, projectId: r.project_id,
    orderIndex: r.order_index, title: r.title, description: r.description,
    quantity: num(r.quantity), unitPrice: num(r.unit_price), lineTotal: num(r.line_total),
    notes: r.notes, createdAt: r.created_at,
  };
}

type DbCr = {
  id: string; project_id: string; code: string | null; title: string; description: string;
  reason: string; impact_scope: string;
  impact_cost: number | string; impact_time_days: number;
  status: ChangeRequestStatus; requested_by: string;
  linked_contract_id: string | null; linked_proposal_id: string | null;
  decided_at: string | null; decided_by: string | null; decision_note: string;
  created_at: string; updated_at: string; created_by: string | null;
};
function mapCr(r: DbCr): ChangeRequestRow {
  return {
    id: r.id, projectId: r.project_id, code: r.code, title: r.title, description: r.description,
    reason: r.reason, impactScope: r.impact_scope,
    impactCost: num(r.impact_cost), impactTimeDays: r.impact_time_days,
    status: r.status, requestedBy: r.requested_by,
    linkedContractId: r.linked_contract_id, linkedProposalId: r.linked_proposal_id,
    decidedAt: r.decided_at, decidedBy: r.decided_by, decisionNote: r.decision_note,
    createdAt: r.created_at, updatedAt: r.updated_at, createdBy: r.created_by,
  };
}

// ---------------------------------------------------------------------------
// Pricing Packages
// ---------------------------------------------------------------------------
export async function listPricingPackages(): Promise<PricingPackageRow[]> {
  const supabase = await createClient();
  const { data, error } = await supabase.from("pricing_packages").select("*")
    .order("tier", { ascending: true }).order("name", { ascending: true });
  if (error) throw error;
  return (data as DbPkg[]).map(mapPkg);
}

export interface PackageInput {
  name: string; tier?: PackageTier; description?: string;
  basePrice?: number; currency?: string; features?: string[]; isActive?: boolean;
}
export async function createPricingPackage(input: PackageInput, createdBy: string | null): Promise<PricingPackageRow> {
  const svc = createServiceClient();
  const { data, error } = await svc.from("pricing_packages").insert({
    name: input.name, tier: input.tier ?? "standard", description: input.description ?? "",
    base_price: input.basePrice ?? 0, currency: (input.currency ?? "EGP").toUpperCase(),
    features: input.features ?? [], is_active: input.isActive ?? true,
    created_by: createdBy,
  }).select("*").single();
  if (error) throw error;
  return mapPkg(data as DbPkg);
}
export async function updatePricingPackage(id: string, patch: Partial<PackageInput>): Promise<PricingPackageRow> {
  const svc = createServiceClient();
  const db: Record<string, unknown> = {};
  if (patch.name !== undefined) db.name = patch.name;
  if (patch.tier !== undefined) db.tier = patch.tier;
  if (patch.description !== undefined) db.description = patch.description;
  if (patch.basePrice !== undefined) db.base_price = patch.basePrice;
  if (patch.currency !== undefined) db.currency = patch.currency.toUpperCase();
  if (patch.features !== undefined) db.features = patch.features;
  if (patch.isActive !== undefined) db.is_active = patch.isActive;
  const { data, error } = await svc.from("pricing_packages").update(db).eq("id", id).select("*").single();
  if (error) throw error;
  return mapPkg(data as DbPkg);
}
export async function deletePricingPackage(id: string): Promise<void> {
  const svc = createServiceClient();
  const { error } = await svc.from("pricing_packages").delete().eq("id", id);
  if (error) throw error;
}

// ---------------------------------------------------------------------------
// Proposals + Items
// ---------------------------------------------------------------------------
export async function listProposals(projectId: string): Promise<ProposalRow[]> {
  const supabase = await createClient();
  const { data, error } = await supabase.from("proposals").select("*").eq("project_id", projectId)
    .order("version", { ascending: false }).order("created_at", { ascending: false });
  if (error) throw error;
  return (data as DbProp[]).map(mapProp);
}
export async function listProposalItems(projectId: string): Promise<ProposalItemRow[]> {
  const supabase = await createClient();
  const { data, error } = await supabase.from("proposal_items").select("*").eq("project_id", projectId)
    .order("proposal_id", { ascending: true }).order("order_index", { ascending: true });
  if (error) throw error;
  return (data as DbItem[]).map(mapItem);
}

export interface ProposalInput {
  title: string; summary?: string; status?: ProposalStatus; currency?: string;
  discountAmount?: number; taxAmount?: number; validUntil?: string | null;
  linkedPackageId?: string | null; notes?: string;
}
export async function createProposal(projectId: string, input: ProposalInput, createdBy: string | null): Promise<ProposalRow> {
  const svc = createServiceClient();
  // نجيب أعلى version لهذا المشروع
  const { data: existing } = await svc.from("proposals").select("version")
    .eq("project_id", projectId).order("version", { ascending: false }).limit(1);
  const nextVersion = (existing?.[0]?.version ?? 0) + 1;
  const totals = computeProposalTotals([], input.discountAmount ?? 0, input.taxAmount ?? 0);
  const { data, error } = await svc.from("proposals").insert({
    project_id: projectId, version: nextVersion, title: input.title, summary: input.summary ?? "",
    status: input.status ?? "draft",
    currency: (input.currency ?? "EGP").toUpperCase(),
    subtotal: totals.subtotal, discount_amount: totals.discountAmount,
    tax_amount: totals.taxAmount, total_amount: totals.totalAmount,
    valid_until: input.validUntil ?? null,
    linked_package_id: input.linkedPackageId ?? null,
    notes: input.notes ?? "",
    created_by: createdBy,
  }).select("*").single();
  if (error) throw error;
  return mapProp(data as DbProp);
}

/** يحدّث totals مع مراعاة البنود الحالية. */
async function recomputeProposalTotals(proposalId: string): Promise<void> {
  const svc = createServiceClient();
  const [propRes, itemsRes] = await Promise.all([
    svc.from("proposals").select("discount_amount, tax_amount").eq("id", proposalId).single(),
    svc.from("proposal_items").select("quantity, unit_price").eq("proposal_id", proposalId),
  ]);
  if (propRes.error) throw propRes.error;
  if (itemsRes.error) throw itemsRes.error;
  const disc = num((propRes.data?.discount_amount as number | string) ?? 0);
  const tax  = num((propRes.data?.tax_amount as number | string) ?? 0);
  const items = (itemsRes.data ?? []).map((r) => ({
    quantity: num(r.quantity as number | string),
    unitPrice: num(r.unit_price as number | string),
  }));
  const totals = computeProposalTotals(items, disc, tax);
  const { error } = await svc.from("proposals").update({
    subtotal: totals.subtotal, total_amount: totals.totalAmount,
  }).eq("id", proposalId);
  if (error) throw error;
}

export async function updateProposal(id: string, patch: Partial<ProposalInput> & {
  sentAt?: string | null; acceptedAt?: string | null; rejectedAt?: string | null;
}): Promise<ProposalRow> {
  const svc = createServiceClient();
  const db: Record<string, unknown> = {};
  if (patch.title !== undefined) db.title = patch.title;
  if (patch.summary !== undefined) db.summary = patch.summary;
  if (patch.status !== undefined) db.status = patch.status;
  if (patch.currency !== undefined) db.currency = patch.currency.toUpperCase();
  if (patch.discountAmount !== undefined) db.discount_amount = patch.discountAmount;
  if (patch.taxAmount !== undefined) db.tax_amount = patch.taxAmount;
  if (patch.validUntil !== undefined) db.valid_until = patch.validUntil;
  if (patch.linkedPackageId !== undefined) db.linked_package_id = patch.linkedPackageId;
  if (patch.notes !== undefined) db.notes = patch.notes;
  if (patch.sentAt !== undefined) db.sent_at = patch.sentAt;
  if (patch.acceptedAt !== undefined) db.accepted_at = patch.acceptedAt;
  if (patch.rejectedAt !== undefined) db.rejected_at = patch.rejectedAt;
  const { data, error } = await svc.from("proposals").update(db).eq("id", id).select("*").single();
  if (error) throw error;
  // لو الخصم/الضريبة اتغيّرت، أعِد حساب total
  if (patch.discountAmount !== undefined || patch.taxAmount !== undefined) {
    await recomputeProposalTotals(id);
    const { data: refreshed } = await svc.from("proposals").select("*").eq("id", id).single();
    if (refreshed) return mapProp(refreshed as DbProp);
  }
  return mapProp(data as DbProp);
}

export async function deleteProposal(id: string): Promise<void> {
  const svc = createServiceClient();
  const { error } = await svc.from("proposals").delete().eq("id", id);
  if (error) throw error;
}

export interface ItemInput {
  proposalId: string;
  orderIndex?: number; title: string; description?: string;
  quantity: number; unitPrice: number; notes?: string;
}
export async function createProposalItem(projectId: string, input: ItemInput): Promise<ProposalItemRow> {
  const svc = createServiceClient();
  const lineTotal = computeLineTotal(input.quantity, input.unitPrice);
  const { data, error } = await svc.from("proposal_items").insert({
    proposal_id: input.proposalId, project_id: projectId,
    order_index: input.orderIndex ?? 1, title: input.title, description: input.description ?? "",
    quantity: input.quantity, unit_price: input.unitPrice, line_total: lineTotal,
    notes: input.notes ?? "",
  }).select("*").single();
  if (error) throw error;
  await recomputeProposalTotals(input.proposalId);
  return mapItem(data as DbItem);
}

export async function updateProposalItem(id: string, patch: Partial<Omit<ItemInput, "proposalId">>): Promise<ProposalItemRow> {
  const svc = createServiceClient();
  const db: Record<string, unknown> = {};
  if (patch.orderIndex !== undefined) db.order_index = patch.orderIndex;
  if (patch.title !== undefined) db.title = patch.title;
  if (patch.description !== undefined) db.description = patch.description;
  if (patch.notes !== undefined) db.notes = patch.notes;
  // نحدّث line_total تلقائيًا لو quantity أو unit_price اتغيّروا
  const { data: current, error: cErr } = await svc.from("proposal_items")
    .select("proposal_id, quantity, unit_price").eq("id", id).single();
  if (cErr) throw cErr;
  const q = patch.quantity ?? num((current?.quantity as number | string) ?? 0);
  const u = patch.unitPrice ?? num((current?.unit_price as number | string) ?? 0);
  if (patch.quantity !== undefined) db.quantity = patch.quantity;
  if (patch.unitPrice !== undefined) db.unit_price = patch.unitPrice;
  db.line_total = computeLineTotal(q, u);
  const { data, error } = await svc.from("proposal_items").update(db).eq("id", id).select("*").single();
  if (error) throw error;
  await recomputeProposalTotals(current!.proposal_id as string);
  return mapItem(data as DbItem);
}

export async function deleteProposalItem(id: string): Promise<void> {
  const svc = createServiceClient();
  const { data: current } = await svc.from("proposal_items").select("proposal_id").eq("id", id).single();
  const { error } = await svc.from("proposal_items").delete().eq("id", id);
  if (error) throw error;
  if (current) await recomputeProposalTotals(current.proposal_id as string);
}

// ---------------------------------------------------------------------------
// Change Requests
// ---------------------------------------------------------------------------
export async function listChangeRequests(projectId: string): Promise<ChangeRequestRow[]> {
  const supabase = await createClient();
  const { data, error } = await supabase.from("change_requests").select("*").eq("project_id", projectId)
    .order("created_at", { ascending: false });
  if (error) throw error;
  return (data as DbCr[]).map(mapCr);
}

export interface CrInput {
  code?: string | null; title: string; description?: string; reason?: string;
  impactScope?: string; impactCost?: number; impactTimeDays?: number;
  status?: ChangeRequestStatus; requestedBy?: string;
  linkedContractId?: string | null; linkedProposalId?: string | null;
  decisionNote?: string;
}
export async function createChangeRequest(projectId: string, input: CrInput, createdBy: string | null): Promise<ChangeRequestRow> {
  const svc = createServiceClient();
  const { data, error } = await svc.from("change_requests").insert({
    project_id: projectId, code: input.code ?? null, title: input.title,
    description: input.description ?? "", reason: input.reason ?? "",
    impact_scope: input.impactScope ?? "",
    impact_cost: input.impactCost ?? 0, impact_time_days: input.impactTimeDays ?? 0,
    status: input.status ?? "draft", requested_by: input.requestedBy ?? "",
    linked_contract_id: input.linkedContractId ?? null,
    linked_proposal_id: input.linkedProposalId ?? null,
    decision_note: input.decisionNote ?? "",
    created_by: createdBy,
  }).select("*").single();
  if (error) throw error;
  return mapCr(data as DbCr);
}

export async function updateChangeRequest(id: string, patch: Partial<CrInput> & {
  decidedAt?: string | null; decidedBy?: string | null;
}): Promise<ChangeRequestRow> {
  const svc = createServiceClient();
  // 0106: منع الانتقالات غير الشرعية بين حالات CR (state machine).
  if (patch.status !== undefined) {
    const { data: current, error: curErr } = await svc.from("change_requests")
      .select("status").eq("id", id).single();
    if (curErr) throw curErr;
    const from = (current?.status as ChangeRequestStatus | undefined) ?? "draft";
    if (!isLegalCrTransition(from, patch.status)) {
      throw new Error(`انتقال حالة CR غير مسموح: ${from} → ${patch.status}`);
    }
  }
  const db: Record<string, unknown> = {};
  if (patch.code !== undefined) db.code = patch.code;
  if (patch.title !== undefined) db.title = patch.title;
  if (patch.description !== undefined) db.description = patch.description;
  if (patch.reason !== undefined) db.reason = patch.reason;
  if (patch.impactScope !== undefined) db.impact_scope = patch.impactScope;
  if (patch.impactCost !== undefined) db.impact_cost = patch.impactCost;
  if (patch.impactTimeDays !== undefined) db.impact_time_days = patch.impactTimeDays;
  if (patch.status !== undefined) db.status = patch.status;
  if (patch.requestedBy !== undefined) db.requested_by = patch.requestedBy;
  if (patch.linkedContractId !== undefined) db.linked_contract_id = patch.linkedContractId;
  if (patch.linkedProposalId !== undefined) db.linked_proposal_id = patch.linkedProposalId;
  if (patch.decisionNote !== undefined) db.decision_note = patch.decisionNote;
  if (patch.decidedAt !== undefined) db.decided_at = patch.decidedAt;
  if (patch.decidedBy !== undefined) db.decided_by = patch.decidedBy;
  const { data, error } = await svc.from("change_requests").update(db).eq("id", id).select("*").single();
  if (error) throw error;
  return mapCr(data as DbCr);
}

export async function deleteChangeRequest(id: string): Promise<void> {
  const svc = createServiceClient();
  const { error } = await svc.from("change_requests").delete().eq("id", id);
  if (error) throw error;
}
