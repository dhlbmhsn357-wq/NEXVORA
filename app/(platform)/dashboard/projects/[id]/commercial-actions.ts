"use server";

/**
 * NEXVORA Commercial — Server Actions (P4)
 * =========================================
 * كل التعديلات على lifecycle/contracts/payments — محمية بـ RBAC
 * (owner + admin + supervisor). الـ member يقدر يشوف بس (RLS SELECT).
 */
import { revalidatePath } from "next/cache";
import { requireRole } from "@/lib/auth/rbac";
import { isLifecycleTransitionAllowed } from "@/lib/commercial/derive";
import {
  getClientLifecycleStatus,
  upsertClientLifecycleStatus,
  createContract,
  updateContract,
  deleteContract,
  createPaymentSchedule,
  updatePaymentSchedule,
  markPaymentPaid,
  deletePaymentSchedule,
  type ContractInput,
  type PaymentInput,
} from "@/lib/commercial/service";
import type { ClientLifecycleStatus, ContractStatus, PaymentStatus } from "@/lib/commercial/types";
import { CLIENT_LIFECYCLE_STATUSES, CONTRACT_STATUSES, PAYMENT_STATUSES } from "@/lib/commercial/types";

type ActionResult<T = void> = { ok: true; data?: T } | { ok: false; message: string };

const WRITE_ROLES = ["owner", "admin", "supervisor"] as const;

function isValidLifecycle(x: string): x is ClientLifecycleStatus {
  return (CLIENT_LIFECYCLE_STATUSES as readonly string[]).includes(x);
}
function isValidContractStatus(x: string): x is ContractStatus {
  return (CONTRACT_STATUSES as readonly string[]).includes(x);
}
function isValidPaymentStatus(x: string): x is PaymentStatus {
  return (PAYMENT_STATUSES as readonly string[]).includes(x);
}

async function guard() {
  const gate = await requireRole([...WRITE_ROLES]);
  if (!gate.ok) return { ok: false as const, message: gate.message ?? "غير مصرَّح" };
  return { ok: true as const, userId: gate.userId ?? null };
}

// ---------------------------------------------------------------------------
// Client Lifecycle
// ---------------------------------------------------------------------------
export async function setClientLifecycleAction(
  projectId: string,
  nextStatus: string,
  notes: string
): Promise<ActionResult> {
  const g = await guard();
  if (!g.ok) return g;
  if (!isValidLifecycle(nextStatus)) return { ok: false, message: "حالة غير معروفة." };

  const current = await getClientLifecycleStatus(projectId);
  const from = current?.status ?? "prospect"; // الافتراضي prospect لو لسه ما اتسجّلش
  // لو ماكانش موجود قبل كده، نسمح بأي حالة أوليّة (تأسيس الصف).
  if (current && !isLifecycleTransitionAllowed(from, nextStatus)) {
    return { ok: false, message: `الانتقال من "${from}" إلى "${nextStatus}" غير مسموح.` };
  }
  try {
    await upsertClientLifecycleStatus(projectId, nextStatus, notes.trim(), g.userId);
  } catch (e) {
    return { ok: false, message: e instanceof Error ? e.message : "فشل التحديث." };
  }
  revalidatePath(`/dashboard/projects/${projectId}`);
  return { ok: true };
}

// ---------------------------------------------------------------------------
// Contracts
// ---------------------------------------------------------------------------
export async function createContractAction(
  projectId: string,
  raw: {
    title: string; status?: string; totalAmount?: string | number | null;
    currency?: string; signedAt?: string | null; signedByClient?: string | null;
    documentUrl?: string | null; notes?: string;
  }
): Promise<ActionResult<{ id: string }>> {
  const g = await guard();
  if (!g.ok) return g;
  const title = raw.title?.trim();
  if (!title) return { ok: false, message: "العنوان مطلوب." };
  const input: ContractInput = {
    title,
    status: raw.status && isValidContractStatus(raw.status) ? raw.status : "draft",
    totalAmount: raw.totalAmount == null || raw.totalAmount === "" ? null : Number(raw.totalAmount),
    currency: raw.currency?.toUpperCase() || "EGP",
    signedAt: raw.signedAt || null,
    signedByClient: raw.signedByClient?.trim() || null,
    documentUrl: raw.documentUrl?.trim() || null,
    notes: raw.notes ?? "",
  };
  if (input.totalAmount != null && (Number.isNaN(input.totalAmount) || input.totalAmount < 0)) {
    return { ok: false, message: "قيمة العقد لازم تكون رقم موجب." };
  }
  try {
    const row = await createContract(projectId, input, g.userId);
    revalidatePath(`/dashboard/projects/${projectId}`);
    return { ok: true, data: { id: row.id } };
  } catch (e) {
    return { ok: false, message: e instanceof Error ? e.message : "فشل الإنشاء." };
  }
}

export async function updateContractAction(
  projectId: string,
  contractId: string,
  patch: Partial<{ title: string; status: string; totalAmount: number | string | null; currency: string; notes: string; signedAt: string | null; signedByClient: string | null; documentUrl: string | null; }>
): Promise<ActionResult> {
  const g = await guard();
  if (!g.ok) return g;
  const clean: Partial<ContractInput> = {};
  if (patch.title !== undefined) {
    const t = patch.title.trim(); if (!t) return { ok: false, message: "العنوان مطلوب." };
    clean.title = t;
  }
  if (patch.status !== undefined) {
    if (!isValidContractStatus(patch.status)) return { ok: false, message: "حالة العقد غير معروفة." };
    clean.status = patch.status;
  }
  if (patch.totalAmount !== undefined) {
    const n = patch.totalAmount == null || patch.totalAmount === "" ? null : Number(patch.totalAmount);
    if (n != null && (Number.isNaN(n) || n < 0)) return { ok: false, message: "قيمة غير صحيحة." };
    clean.totalAmount = n;
  }
  if (patch.currency !== undefined) clean.currency = patch.currency.toUpperCase();
  if (patch.notes !== undefined) clean.notes = patch.notes;
  if (patch.signedAt !== undefined) clean.signedAt = patch.signedAt;
  if (patch.signedByClient !== undefined) clean.signedByClient = patch.signedByClient?.trim() || null;
  if (patch.documentUrl !== undefined) clean.documentUrl = patch.documentUrl?.trim() || null;

  try {
    await updateContract(contractId, clean);
    revalidatePath(`/dashboard/projects/${projectId}`);
    return { ok: true };
  } catch (e) {
    return { ok: false, message: e instanceof Error ? e.message : "فشل التحديث." };
  }
}

export async function deleteContractAction(projectId: string, contractId: string): Promise<ActionResult> {
  const g = await guard();
  if (!g.ok) return g;
  try {
    await deleteContract(contractId);
    revalidatePath(`/dashboard/projects/${projectId}`);
    return { ok: true };
  } catch (e) {
    return { ok: false, message: e instanceof Error ? e.message : "فشل الحذف." };
  }
}

// ---------------------------------------------------------------------------
// Payment Schedules
// ---------------------------------------------------------------------------
export async function createPaymentAction(
  projectId: string,
  raw: {
    contractId?: string | null; installmentNo: number | string; title: string;
    amount: number | string; currency?: string; dueDate?: string | null;
    status?: string; notes?: string;
  }
): Promise<ActionResult<{ id: string }>> {
  const g = await guard();
  if (!g.ok) return g;
  const title = raw.title?.trim();
  if (!title) return { ok: false, message: "عنوان الدفعة مطلوب." };
  const installmentNo = Number(raw.installmentNo);
  if (!Number.isInteger(installmentNo) || installmentNo <= 0) {
    return { ok: false, message: "رقم القسط لازم يكون عدد موجب." };
  }
  const amount = Number(raw.amount);
  if (Number.isNaN(amount) || amount < 0) return { ok: false, message: "قيمة القسط لازم تكون رقم موجب." };

  const input: PaymentInput = {
    contractId: raw.contractId || null,
    installmentNo,
    title,
    amount,
    currency: raw.currency?.toUpperCase() || "EGP",
    dueDate: raw.dueDate || null,
    status: raw.status && isValidPaymentStatus(raw.status) ? raw.status : "pending",
    notes: raw.notes ?? "",
  };
  try {
    const row = await createPaymentSchedule(projectId, input, g.userId);
    revalidatePath(`/dashboard/projects/${projectId}`);
    return { ok: true, data: { id: row.id } };
  } catch (e) {
    return { ok: false, message: e instanceof Error ? e.message : "فشل الإنشاء." };
  }
}

export async function updatePaymentAction(
  projectId: string,
  paymentId: string,
  patch: Partial<{ installmentNo: number | string; title: string; amount: number | string; currency: string; dueDate: string | null; status: string; notes: string; contractId: string | null; }>
): Promise<ActionResult> {
  const g = await guard();
  if (!g.ok) return g;
  const clean: Partial<PaymentInput> = {};
  if (patch.installmentNo !== undefined) {
    const n = Number(patch.installmentNo);
    if (!Number.isInteger(n) || n <= 0) return { ok: false, message: "رقم القسط لازم يكون عدد موجب." };
    clean.installmentNo = n;
  }
  if (patch.title !== undefined) {
    const t = patch.title.trim(); if (!t) return { ok: false, message: "العنوان مطلوب." };
    clean.title = t;
  }
  if (patch.amount !== undefined) {
    const n = Number(patch.amount);
    if (Number.isNaN(n) || n < 0) return { ok: false, message: "قيمة غير صحيحة." };
    clean.amount = n;
  }
  if (patch.currency !== undefined) clean.currency = patch.currency.toUpperCase();
  if (patch.dueDate !== undefined) clean.dueDate = patch.dueDate;
  if (patch.status !== undefined) {
    if (!isValidPaymentStatus(patch.status)) return { ok: false, message: "حالة الدفعة غير معروفة." };
    clean.status = patch.status;
  }
  if (patch.notes !== undefined) clean.notes = patch.notes;
  if (patch.contractId !== undefined) clean.contractId = patch.contractId;

  try {
    await updatePaymentSchedule(paymentId, clean);
    revalidatePath(`/dashboard/projects/${projectId}`);
    return { ok: true };
  } catch (e) {
    return { ok: false, message: e instanceof Error ? e.message : "فشل التحديث." };
  }
}

export async function markPaymentPaidAction(projectId: string, paymentId: string): Promise<ActionResult> {
  const g = await guard();
  if (!g.ok) return g;
  try {
    await markPaymentPaid(paymentId, new Date().toISOString());
    revalidatePath(`/dashboard/projects/${projectId}`);
    return { ok: true };
  } catch (e) {
    return { ok: false, message: e instanceof Error ? e.message : "فشل التحديث." };
  }
}

export async function deletePaymentAction(projectId: string, paymentId: string): Promise<ActionResult> {
  const g = await guard();
  if (!g.ok) return g;
  try {
    await deletePaymentSchedule(paymentId);
    revalidatePath(`/dashboard/projects/${projectId}`);
    return { ok: true };
  } catch (e) {
    return { ok: false, message: e instanceof Error ? e.message : "فشل الحذف." };
  }
}
