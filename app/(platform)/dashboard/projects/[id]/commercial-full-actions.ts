"use server";

import { revalidatePath } from "next/cache";
import { requireRole } from "@/lib/auth/rbac";
import {
  createPricingPackage, updatePricingPackage, deletePricingPackage,
  createProposal, updateProposal, deleteProposal,
  createProposalItem, updateProposalItem, deleteProposalItem,
  createChangeRequest, updateChangeRequest, deleteChangeRequest,
  type PackageInput, type ProposalInput, type ItemInput, type CrInput,
} from "@/lib/commercial-full/service";
import {
  PACKAGE_TIERS, PROPOSAL_STATUSES, CHANGE_REQUEST_STATUSES,
  type PackageTier, type ProposalStatus, type ChangeRequestStatus,
} from "@/lib/commercial-full/types";

type Result<T = void> = { ok: true; data?: T } | { ok: false; message: string };
const WRITE_ROLES = ["owner", "admin", "supervisor"] as const;

async function guard() {
  const g = await requireRole([...WRITE_ROLES]);
  if (!g.ok) return { ok: false as const, message: g.message ?? "غير مصرَّح" };
  return { ok: true as const, userId: g.userId ?? null };
}
const isTier = (x: string): x is PackageTier => (PACKAGE_TIERS as readonly string[]).includes(x);
const isPropStatus = (x: string): x is ProposalStatus => (PROPOSAL_STATUSES as readonly string[]).includes(x);
const isCrStatus = (x: string): x is ChangeRequestStatus => (CHANGE_REQUEST_STATUSES as readonly string[]).includes(x);

function parseFeatures(s: string | undefined): string[] {
  if (!s) return [];
  return s.split(/\r?\n/).map((t) => t.trim()).filter(Boolean).slice(0, 30);
}
function numOrZero(v: unknown): number {
  if (v === undefined || v === null || v === "") return 0;
  const n = Number(v);
  return Number.isFinite(n) ? n : 0;
}

// ---------- Pricing Packages ----------
export async function createPackageAction(raw: {
  name: string; tier?: string; description?: string;
  basePrice?: number | string; currency?: string; features?: string; isActive?: boolean;
}): Promise<Result<{ id: string }>> {
  const g = await guard(); if (!g.ok) return g;
  const name = raw.name?.trim();
  if (!name) return { ok: false, message: "الاسم مطلوب." };
  const input: PackageInput = {
    name, tier: raw.tier && isTier(raw.tier) ? raw.tier : "standard",
    description: raw.description ?? "",
    basePrice: numOrZero(raw.basePrice),
    currency: (raw.currency ?? "EGP").toUpperCase(),
    features: parseFeatures(raw.features),
    isActive: raw.isActive ?? true,
  };
  try {
    const row = await createPricingPackage(input, g.userId);
    revalidatePath("/dashboard");
    return { ok: true, data: { id: row.id } };
  } catch (e) { return { ok: false, message: e instanceof Error ? e.message : "فشل الإنشاء." }; }
}

export async function updatePackageAction(id: string, patch: Partial<{
  name: string; tier: string; description: string;
  basePrice: number | string; currency: string; features: string; isActive: boolean;
}>): Promise<Result> {
  const g = await guard(); if (!g.ok) return g;
  const clean: Partial<PackageInput> = {};
  if (patch.name !== undefined) {
    const n = patch.name.trim(); if (!n) return { ok: false, message: "الاسم مطلوب." };
    clean.name = n;
  }
  if (patch.tier !== undefined) {
    if (!isTier(patch.tier)) return { ok: false, message: "شريحة غير معروفة." };
    clean.tier = patch.tier;
  }
  if (patch.description !== undefined) clean.description = patch.description;
  if (patch.basePrice !== undefined) clean.basePrice = numOrZero(patch.basePrice);
  if (patch.currency !== undefined) clean.currency = patch.currency.toUpperCase();
  if (patch.features !== undefined) clean.features = parseFeatures(patch.features);
  if (patch.isActive !== undefined) clean.isActive = patch.isActive;
  try {
    await updatePricingPackage(id, clean);
    revalidatePath("/dashboard");
    return { ok: true };
  } catch (e) { return { ok: false, message: e instanceof Error ? e.message : "فشل التحديث." }; }
}

export async function deletePackageAction(id: string): Promise<Result> {
  const g = await guard(); if (!g.ok) return g;
  try {
    await deletePricingPackage(id);
    revalidatePath("/dashboard");
    return { ok: true };
  } catch (e) { return { ok: false, message: e instanceof Error ? e.message : "فشل الحذف." }; }
}

// ---------- Proposals ----------
export async function createProposalAction(projectId: string, raw: {
  title: string; summary?: string; status?: string; currency?: string;
  discountAmount?: number | string; taxAmount?: number | string;
  validUntil?: string | null; linkedPackageId?: string | null; notes?: string;
}): Promise<Result<{ id: string }>> {
  const g = await guard(); if (!g.ok) return g;
  const title = raw.title?.trim();
  if (!title) return { ok: false, message: "العنوان مطلوب." };
  const input: ProposalInput = {
    title, summary: raw.summary ?? "",
    status: raw.status && isPropStatus(raw.status) ? raw.status : "draft",
    currency: (raw.currency ?? "EGP").toUpperCase(),
    discountAmount: numOrZero(raw.discountAmount), taxAmount: numOrZero(raw.taxAmount),
    validUntil: raw.validUntil || null,
    linkedPackageId: raw.linkedPackageId || null, notes: raw.notes ?? "",
  };
  try {
    const row = await createProposal(projectId, input, g.userId);
    revalidatePath(`/dashboard/projects/${projectId}`);
    return { ok: true, data: { id: row.id } };
  } catch (e) { return { ok: false, message: e instanceof Error ? e.message : "فشل الإنشاء." }; }
}

export async function updateProposalAction(projectId: string, id: string, patch: Partial<{
  title: string; summary: string; status: string; currency: string;
  discountAmount: number | string; taxAmount: number | string;
  validUntil: string | null; linkedPackageId: string | null; notes: string;
}>): Promise<Result> {
  const g = await guard(); if (!g.ok) return g;
  const clean: Partial<ProposalInput> & { sentAt?: string | null; acceptedAt?: string | null; rejectedAt?: string | null } = {};
  if (patch.title !== undefined) {
    const t = patch.title.trim(); if (!t) return { ok: false, message: "العنوان مطلوب." };
    clean.title = t;
  }
  if (patch.summary !== undefined) clean.summary = patch.summary;
  if (patch.status !== undefined) {
    if (!isPropStatus(patch.status)) return { ok: false, message: "حالة غير معروفة." };
    clean.status = patch.status;
    // نضبط timestamps تلقائيًا مع الانتقالات
    const now = new Date().toISOString();
    if (patch.status === "sent") clean.sentAt = now;
    if (patch.status === "accepted") clean.acceptedAt = now;
    if (patch.status === "rejected") clean.rejectedAt = now;
  }
  if (patch.currency !== undefined) clean.currency = patch.currency.toUpperCase();
  if (patch.discountAmount !== undefined) clean.discountAmount = numOrZero(patch.discountAmount);
  if (patch.taxAmount !== undefined) clean.taxAmount = numOrZero(patch.taxAmount);
  if (patch.validUntil !== undefined) clean.validUntil = patch.validUntil;
  if (patch.linkedPackageId !== undefined) clean.linkedPackageId = patch.linkedPackageId;
  if (patch.notes !== undefined) clean.notes = patch.notes;
  try {
    await updateProposal(id, clean);
    revalidatePath(`/dashboard/projects/${projectId}`);
    return { ok: true };
  } catch (e) { return { ok: false, message: e instanceof Error ? e.message : "فشل التحديث." }; }
}

export async function deleteProposalAction(projectId: string, id: string): Promise<Result> {
  const g = await guard(); if (!g.ok) return g;
  try {
    await deleteProposal(id);
    revalidatePath(`/dashboard/projects/${projectId}`);
    return { ok: true };
  } catch (e) { return { ok: false, message: e instanceof Error ? e.message : "فشل الحذف." }; }
}

// ---------- Proposal Items ----------
export async function addItemAction(projectId: string, raw: {
  proposalId: string; orderIndex?: number | string; title: string; description?: string;
  quantity: number | string; unitPrice: number | string; notes?: string;
}): Promise<Result<{ id: string }>> {
  const g = await guard(); if (!g.ok) return g;
  const title = raw.title?.trim();
  if (!title) return { ok: false, message: "العنوان مطلوب." };
  if (!raw.proposalId) return { ok: false, message: "العرض مطلوب." };
  const q = numOrZero(raw.quantity); const u = numOrZero(raw.unitPrice);
  if (q < 0 || u < 0) return { ok: false, message: "قيم غير صحيحة." };
  const orderIndex = raw.orderIndex === undefined ? 1 : Math.max(1, Math.round(Number(raw.orderIndex)));
  const input: ItemInput = {
    proposalId: raw.proposalId, orderIndex, title,
    description: raw.description ?? "", quantity: q, unitPrice: u, notes: raw.notes ?? "",
  };
  try {
    const row = await createProposalItem(projectId, input);
    revalidatePath(`/dashboard/projects/${projectId}`);
    return { ok: true, data: { id: row.id } };
  } catch (e) { return { ok: false, message: e instanceof Error ? e.message : "فشل الإضافة." }; }
}

export async function updateItemAction(projectId: string, id: string, patch: Partial<{
  orderIndex: number | string; title: string; description: string;
  quantity: number | string; unitPrice: number | string; notes: string;
}>): Promise<Result> {
  const g = await guard(); if (!g.ok) return g;
  const clean: Partial<Omit<ItemInput, "proposalId">> = {};
  if (patch.orderIndex !== undefined) clean.orderIndex = Math.max(1, Math.round(Number(patch.orderIndex)));
  if (patch.title !== undefined) {
    const t = patch.title.trim(); if (!t) return { ok: false, message: "العنوان مطلوب." };
    clean.title = t;
  }
  if (patch.description !== undefined) clean.description = patch.description;
  if (patch.quantity !== undefined) clean.quantity = numOrZero(patch.quantity);
  if (patch.unitPrice !== undefined) clean.unitPrice = numOrZero(patch.unitPrice);
  if (patch.notes !== undefined) clean.notes = patch.notes;
  try {
    await updateProposalItem(id, clean);
    revalidatePath(`/dashboard/projects/${projectId}`);
    return { ok: true };
  } catch (e) { return { ok: false, message: e instanceof Error ? e.message : "فشل التحديث." }; }
}

export async function deleteItemAction(projectId: string, id: string): Promise<Result> {
  const g = await guard(); if (!g.ok) return g;
  try {
    await deleteProposalItem(id);
    revalidatePath(`/dashboard/projects/${projectId}`);
    return { ok: true };
  } catch (e) { return { ok: false, message: e instanceof Error ? e.message : "فشل الحذف." }; }
}

// ---------- Change Requests ----------
export async function createCrAction(projectId: string, raw: {
  code?: string; title: string; description?: string; reason?: string;
  impactScope?: string; impactCost?: number | string; impactTimeDays?: number | string;
  status?: string; requestedBy?: string;
  linkedContractId?: string | null; linkedProposalId?: string | null;
}): Promise<Result<{ id: string }>> {
  const g = await guard(); if (!g.ok) return g;
  const title = raw.title?.trim();
  if (!title) return { ok: false, message: "العنوان مطلوب." };
  const input: CrInput = {
    code: raw.code?.trim() || null, title,
    description: raw.description ?? "", reason: raw.reason ?? "",
    impactScope: raw.impactScope ?? "",
    impactCost: numOrZero(raw.impactCost),
    impactTimeDays: Math.max(0, Math.round(numOrZero(raw.impactTimeDays))),
    status: raw.status && isCrStatus(raw.status) ? raw.status : "draft",
    requestedBy: raw.requestedBy ?? "",
    linkedContractId: raw.linkedContractId || null,
    linkedProposalId: raw.linkedProposalId || null,
  };
  try {
    const row = await createChangeRequest(projectId, input, g.userId);
    revalidatePath(`/dashboard/projects/${projectId}`);
    return { ok: true, data: { id: row.id } };
  } catch (e) { return { ok: false, message: e instanceof Error ? e.message : "فشل الإنشاء." }; }
}

export async function updateCrAction(projectId: string, id: string, patch: Partial<{
  code: string; title: string; description: string; reason: string;
  impactScope: string; impactCost: number | string; impactTimeDays: number | string;
  status: string; requestedBy: string;
  linkedContractId: string | null; linkedProposalId: string | null;
  decisionNote: string;
}>): Promise<Result> {
  const g = await guard(); if (!g.ok) return g;
  const clean: Partial<CrInput> & { decidedAt?: string | null; decidedBy?: string | null } = {};
  if (patch.code !== undefined) clean.code = patch.code?.trim() || null;
  if (patch.title !== undefined) {
    const t = patch.title.trim(); if (!t) return { ok: false, message: "العنوان مطلوب." };
    clean.title = t;
  }
  if (patch.description !== undefined) clean.description = patch.description;
  if (patch.reason !== undefined) clean.reason = patch.reason;
  if (patch.impactScope !== undefined) clean.impactScope = patch.impactScope;
  if (patch.impactCost !== undefined) clean.impactCost = numOrZero(patch.impactCost);
  if (patch.impactTimeDays !== undefined) clean.impactTimeDays = Math.max(0, Math.round(numOrZero(patch.impactTimeDays)));
  if (patch.status !== undefined) {
    if (!isCrStatus(patch.status)) return { ok: false, message: "حالة غير معروفة." };
    clean.status = patch.status;
    // نضبط decidedAt عند تحوّل نهائي
    if (["approved","rejected","cancelled","implemented"].includes(patch.status)) {
      clean.decidedAt = new Date().toISOString();
      clean.decidedBy = g.userId;
    }
  }
  if (patch.requestedBy !== undefined) clean.requestedBy = patch.requestedBy;
  if (patch.linkedContractId !== undefined) clean.linkedContractId = patch.linkedContractId;
  if (patch.linkedProposalId !== undefined) clean.linkedProposalId = patch.linkedProposalId;
  if (patch.decisionNote !== undefined) clean.decisionNote = patch.decisionNote;
  try {
    await updateChangeRequest(id, clean);
    revalidatePath(`/dashboard/projects/${projectId}`);
    return { ok: true };
  } catch (e) { return { ok: false, message: e instanceof Error ? e.message : "فشل التحديث." }; }
}

export async function deleteCrAction(projectId: string, id: string): Promise<Result> {
  const g = await guard(); if (!g.ok) return g;
  try {
    await deleteChangeRequest(id);
    revalidatePath(`/dashboard/projects/${projectId}`);
    return { ok: true };
  } catch (e) { return { ok: false, message: e instanceof Error ? e.message : "فشل الحذف." }; }
}
