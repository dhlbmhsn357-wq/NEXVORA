/**
 * NEXVORA Commercial — Data Access Service (P4)
 * =============================================
 *
 * كل استعلامات Supabase على الجداول التجارية في مكان واحد:
 *   • client_lifecycle_status
 *   • contracts
 *   • payment_schedules
 *
 * كل الدوال server-only (تستخدم `createClient` من lib/supabase/server).
 * الـ RLS مفعّلة لكن Select-only للمستخدمين المسجّلين — الكتابة عبر
 * service client (نستخدم نفس authenticated client لأن الجداول جديدة
 * ومحمية بسياسة SELECT فقط، والكتابة من خلال server actions مسموحة
 * بدون service role إلا لو أضفنا policies أشمل لاحقًا). حاليًا كل من
 * يكتب هو Owner/Admin عبر server action محمي في RBAC.
 */
import "server-only";
import { createClient } from "@/lib/supabase/server";
import { createServiceClient } from "@/lib/supabase/service";
import type {
  ClientLifecycleStatus,
  ClientLifecycleStatusRow,
  ContractRow,
  ContractStatus,
  PaymentScheduleRow,
  PaymentStatus,
} from "./types";

// ---------------------------------------------------------------------------
// Row mappers (DB snake_case → TS camelCase)
// ---------------------------------------------------------------------------
type DbLifecycle = {
  project_id: string;
  status: ClientLifecycleStatus;
  notes: string;
  updated_at: string;
  updated_by: string | null;
};
function mapLifecycle(row: DbLifecycle): ClientLifecycleStatusRow {
  return {
    projectId: row.project_id,
    status: row.status,
    notes: row.notes,
    updatedAt: row.updated_at,
    updatedBy: row.updated_by,
  };
}

type DbContract = {
  id: string; project_id: string; title: string; status: ContractStatus;
  total_amount: number | null; currency: string; signed_at: string | null;
  signed_by_client: string | null; document_url: string | null; notes: string;
  created_at: string; updated_at: string; created_by: string | null;
};
function mapContract(row: DbContract): ContractRow {
  return {
    id: row.id, projectId: row.project_id, title: row.title, status: row.status,
    totalAmount: row.total_amount, currency: row.currency, signedAt: row.signed_at,
    signedByClient: row.signed_by_client, documentUrl: row.document_url, notes: row.notes,
    createdAt: row.created_at, updatedAt: row.updated_at, createdBy: row.created_by,
  };
}

type DbPayment = {
  id: string; project_id: string; contract_id: string | null; installment_no: number;
  title: string; amount: number | string; currency: string; due_date: string | null;
  paid_at: string | null; status: PaymentStatus; notes: string;
  created_at: string; updated_at: string; created_by: string | null;
};
function mapPayment(row: DbPayment): PaymentScheduleRow {
  return {
    id: row.id, projectId: row.project_id, contractId: row.contract_id,
    installmentNo: row.installment_no, title: row.title,
    // Supabase قد يرجّع numeric كـ string — نحوّل لرقم مرة واحدة هنا.
    amount: typeof row.amount === "string" ? Number(row.amount) : row.amount,
    currency: row.currency, dueDate: row.due_date, paidAt: row.paid_at,
    status: row.status, notes: row.notes,
    createdAt: row.created_at, updatedAt: row.updated_at, createdBy: row.created_by,
  };
}

// ---------------------------------------------------------------------------
// Client Lifecycle Status
// ---------------------------------------------------------------------------
export async function getClientLifecycleStatus(projectId: string): Promise<ClientLifecycleStatusRow | null> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("client_lifecycle_status")
    .select("project_id,status,notes,updated_at,updated_by")
    .eq("project_id", projectId)
    .maybeSingle();
  if (error) throw error;
  return data ? mapLifecycle(data as DbLifecycle) : null;
}

/**
 * upsert: يستخدم service client لأن policies حاليًا SELECT-only.
 * الحماية عبر server action (Owner/Admin/Supervisor فقط).
 */
export async function upsertClientLifecycleStatus(
  projectId: string,
  status: ClientLifecycleStatus,
  notes: string,
  updatedBy: string | null
): Promise<ClientLifecycleStatusRow> {
  const svc = createServiceClient();
  const { data, error } = await svc
    .from("client_lifecycle_status")
    .upsert({
      project_id: projectId,
      status,
      notes,
      updated_by: updatedBy,
    }, { onConflict: "project_id" })
    .select("project_id,status,notes,updated_at,updated_by")
    .single();
  if (error) throw error;
  return mapLifecycle(data as DbLifecycle);
}

// ---------------------------------------------------------------------------
// Contracts
// ---------------------------------------------------------------------------
export async function listContracts(projectId: string): Promise<ContractRow[]> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("contracts")
    .select("*")
    .eq("project_id", projectId)
    .order("created_at", { ascending: false });
  if (error) throw error;
  return (data as DbContract[]).map(mapContract);
}

export interface ContractInput {
  title: string;
  status?: ContractStatus;
  totalAmount?: number | null;
  currency?: string;
  signedAt?: string | null;
  signedByClient?: string | null;
  documentUrl?: string | null;
  notes?: string;
}

export async function createContract(
  projectId: string,
  input: ContractInput,
  createdBy: string | null
): Promise<ContractRow> {
  const svc = createServiceClient();
  const { data, error } = await svc
    .from("contracts")
    .insert({
      project_id: projectId,
      title: input.title,
      status: input.status ?? "draft",
      total_amount: input.totalAmount ?? null,
      currency: (input.currency ?? "EGP").toUpperCase(),
      signed_at: input.signedAt ?? null,
      signed_by_client: input.signedByClient ?? null,
      document_url: input.documentUrl ?? null,
      notes: input.notes ?? "",
      created_by: createdBy,
    })
    .select("*")
    .single();
  if (error) throw error;
  return mapContract(data as DbContract);
}

export async function updateContract(
  contractId: string,
  patch: Partial<ContractInput>
): Promise<ContractRow> {
  const svc = createServiceClient();
  const dbPatch: Record<string, unknown> = {};
  if (patch.title !== undefined) dbPatch.title = patch.title;
  if (patch.status !== undefined) dbPatch.status = patch.status;
  if (patch.totalAmount !== undefined) dbPatch.total_amount = patch.totalAmount;
  if (patch.currency !== undefined) dbPatch.currency = patch.currency.toUpperCase();
  if (patch.signedAt !== undefined) dbPatch.signed_at = patch.signedAt;
  if (patch.signedByClient !== undefined) dbPatch.signed_by_client = patch.signedByClient;
  if (patch.documentUrl !== undefined) dbPatch.document_url = patch.documentUrl;
  if (patch.notes !== undefined) dbPatch.notes = patch.notes;

  const { data, error } = await svc
    .from("contracts")
    .update(dbPatch)
    .eq("id", contractId)
    .select("*")
    .single();
  if (error) throw error;
  return mapContract(data as DbContract);
}

export async function deleteContract(contractId: string): Promise<void> {
  const svc = createServiceClient();
  const { error } = await svc.from("contracts").delete().eq("id", contractId);
  if (error) throw error;
}

// ---------------------------------------------------------------------------
// Payment Schedules
// ---------------------------------------------------------------------------
export async function listPaymentSchedules(projectId: string): Promise<PaymentScheduleRow[]> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("payment_schedules")
    .select("*")
    .eq("project_id", projectId)
    .order("installment_no", { ascending: true });
  if (error) throw error;
  return (data as DbPayment[]).map(mapPayment);
}

export interface PaymentInput {
  contractId?: string | null;
  installmentNo: number;
  title: string;
  amount: number;
  currency?: string;
  dueDate?: string | null;
  status?: PaymentStatus;
  notes?: string;
}

export async function createPaymentSchedule(
  projectId: string,
  input: PaymentInput,
  createdBy: string | null
): Promise<PaymentScheduleRow> {
  const svc = createServiceClient();
  const { data, error } = await svc
    .from("payment_schedules")
    .insert({
      project_id: projectId,
      contract_id: input.contractId ?? null,
      installment_no: input.installmentNo,
      title: input.title,
      amount: input.amount,
      currency: (input.currency ?? "EGP").toUpperCase(),
      due_date: input.dueDate ?? null,
      status: input.status ?? "pending",
      notes: input.notes ?? "",
      created_by: createdBy,
    })
    .select("*")
    .single();
  if (error) throw error;
  return mapPayment(data as DbPayment);
}

export async function updatePaymentSchedule(
  paymentId: string,
  patch: Partial<PaymentInput> & { paidAt?: string | null }
): Promise<PaymentScheduleRow> {
  const svc = createServiceClient();
  const dbPatch: Record<string, unknown> = {};
  if (patch.contractId !== undefined) dbPatch.contract_id = patch.contractId;
  if (patch.installmentNo !== undefined) dbPatch.installment_no = patch.installmentNo;
  if (patch.title !== undefined) dbPatch.title = patch.title;
  if (patch.amount !== undefined) dbPatch.amount = patch.amount;
  if (patch.currency !== undefined) dbPatch.currency = patch.currency.toUpperCase();
  if (patch.dueDate !== undefined) dbPatch.due_date = patch.dueDate;
  if (patch.status !== undefined) dbPatch.status = patch.status;
  if (patch.notes !== undefined) dbPatch.notes = patch.notes;
  if (patch.paidAt !== undefined) dbPatch.paid_at = patch.paidAt;

  const { data, error } = await svc
    .from("payment_schedules")
    .update(dbPatch)
    .eq("id", paymentId)
    .select("*")
    .single();
  if (error) throw error;
  return mapPayment(data as DbPayment);
}

/**
 * علامة الدفعة كمدفوعة الآن. تحدّث status + paid_at في عملية واحدة.
 * `paidAtISO` حقن صريح لتسهيل الاختبار.
 */
export async function markPaymentPaid(
  paymentId: string,
  paidAtISO: string
): Promise<PaymentScheduleRow> {
  return updatePaymentSchedule(paymentId, { status: "paid", paidAt: paidAtISO });
}

export async function deletePaymentSchedule(paymentId: string): Promise<void> {
  const svc = createServiceClient();
  const { error } = await svc.from("payment_schedules").delete().eq("id", paymentId);
  if (error) throw error;
}
