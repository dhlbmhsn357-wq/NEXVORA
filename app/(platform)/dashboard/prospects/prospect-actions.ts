"use server";

/**
 * Server Actions — قاعدة الاستهداف (Prospecting Database).
 * نفس نمط app/(platform)/dashboard/leads/lead-actions.ts بالضبط:
 * RBAC guard أولًا، ثم منطق، ثم revalidatePath.
 *
 * RBAC حسب الـ spec:
 *  - owner/admin: كل العمليات.
 *  - supervisor: الاستيراد + التوزيع + التعديل + التحويل (مع owner/admin).
 *  - member: رؤية/تحديث الجهات المسندة إليه + تسجيل التواصل (كل العمليات
 *    "العامة" أدناه تُفتح لـ member أيضًا؛ Server Actions لا تُقيّد
 *    الجهة المحددة بالمُسنَد حاليًا — ذلك تصفية عرض في UI (Part 2) وليس RBAC).
 */
import { revalidatePath } from "next/cache";
import { requireRole } from "@/lib/auth/rbac";
import { roleSatisfies } from "@/lib/auth/roles";
import {
  listProspects,
  getProspectById,
  createImportBatch,
  createProspectsFromImport,
  updateProspect,
  assignProspect,
  recordWhatsappOpened,
  confirmMessageSent,
  recordContactResult,
  archiveProspect,
  unarchiveProspect,
  getTodayContactList,
  getProspectingSummary,
  type ProspectListFilters,
  type ProspectUpdatePatch,
  type ImportRowInput,
  type RecordContactResultInput,
  type CreateImportBatchInput,
  type ProspectActionResult,
} from "@/lib/prospecting/service";
import { checkExistingLeadMatch, executeConversion, type ConversionOutcome } from "@/lib/prospecting/conversion-service";
import type { ProspectColumnMapping } from "@/lib/prospecting/import-service";
import type { ProspectRow, ProspectWithActivities } from "@/lib/prospecting/types";

const PATH = "/dashboard/prospects";

// كل الأدوار الأربعة: رؤية/تحديث الجهات وتسجيل التواصل.
const GENERAL_ROLES = ["owner", "admin", "supervisor", "member"] as const;
// استيراد/توزيع/تحويل: owner/admin/supervisor فقط.
const MANAGE_ROLES = ["owner", "admin", "supervisor"] as const;

type Result<T> = { ok: true; data: T } | { ok: false; message: string };

function fail(message: string): { ok: false; message: string } {
  return { ok: false, message };
}

// ---------------------------------------------------------------------------
// list / get / today / summary
// ---------------------------------------------------------------------------
export async function listProspectsAction(
  filters: ProspectListFilters,
  offset: number
): Promise<Result<{ items: ProspectRow[]; hasMore: boolean }>> {
  const auth = await requireRole([...GENERAL_ROLES]);
  if (!auth.ok) return fail(auth.message ?? "غير مصرّح.");
  const data = await listProspects(filters, offset);
  return { ok: true, data };
}

export async function getProspectByIdAction(id: string): Promise<Result<ProspectWithActivities | null>> {
  const auth = await requireRole([...GENERAL_ROLES]);
  if (!auth.ok) return fail(auth.message ?? "غير مصرّح.");
  const data = await getProspectById(id);
  return { ok: true, data };
}

export async function getTodayContactListAction(assigneeId?: string) {
  const auth = await requireRole([...GENERAL_ROLES]);
  if (!auth.ok) return fail(auth.message ?? "غير مصرّح.");
  const data = await getTodayContactList(assigneeId);
  return { ok: true, data } as const;
}

export async function getProspectingSummaryAction() {
  const auth = await requireRole([...GENERAL_ROLES]);
  if (!auth.ok) return fail(auth.message ?? "غير مصرّح.");
  const data = await getProspectingSummary();
  return { ok: true, data } as const;
}

// ---------------------------------------------------------------------------
// import (owner/admin/supervisor)
// ---------------------------------------------------------------------------
export async function createImportBatchAction(input: CreateImportBatchInput): Promise<Result<{ batchId: string }>> {
  const auth = await requireRole([...MANAGE_ROLES]);
  if (!auth.ok) return fail(auth.message ?? "غير مصرّح.");
  const batchId = await createImportBatch(input, auth.userId ?? null);
  return { ok: true, data: { batchId } };
}

export async function createProspectsFromImportAction(
  batchId: string,
  rows: ImportRowInput[],
  columnMapping: ProspectColumnMapping
) {
  const auth = await requireRole([...MANAGE_ROLES]);
  if (!auth.ok) return fail(auth.message ?? "غير مصرّح.");
  const data = await createProspectsFromImport(batchId, rows, columnMapping, auth.userId ?? null);
  revalidatePath(PATH);
  return { ok: true, data } as const;
}

// ---------------------------------------------------------------------------
// update / assign (owner/admin/supervisor)
// ---------------------------------------------------------------------------
export async function updateProspectAction(id: string, patch: ProspectUpdatePatch): Promise<Result<ProspectRow>> {
  const auth = await requireRole([...MANAGE_ROLES]);
  if (!auth.ok) return fail(auth.message ?? "غير مصرّح.");
  const data = await updateProspect(id, patch);
  revalidatePath(PATH);
  return { ok: true, data };
}

export async function assignProspectAction(id: string, assigneeId: string): Promise<Result<ProspectRow>> {
  const auth = await requireRole([...MANAGE_ROLES]);
  if (!auth.ok) return fail(auth.message ?? "غير مصرّح.");
  const data = await assignProspect(id, assigneeId, auth.userId ?? null);
  revalidatePath(PATH);
  return { ok: true, data };
}

// ---------------------------------------------------------------------------
// WhatsApp + تسجيل التواصل (كل الأدوار — الجهات المسندة/المتاحة للمستخدم)
// ---------------------------------------------------------------------------
export async function recordWhatsappOpenedAction(id: string): Promise<{ ok: true } | { ok: false; message: string }> {
  const auth = await requireRole([...GENERAL_ROLES]);
  if (!auth.ok) return fail(auth.message ?? "غير مصرّح.");
  await recordWhatsappOpened(id, auth.userId ?? null);
  revalidatePath(PATH);
  return { ok: true };
}

export async function confirmMessageSentAction(id: string): Promise<ProspectActionResult> {
  const auth = await requireRole([...GENERAL_ROLES]);
  if (!auth.ok) return fail(auth.message ?? "غير مصرّح.");
  const result = await confirmMessageSent(id, auth.userId ?? null);
  if (result.ok) revalidatePath(PATH);
  return result;
}

export async function recordContactResultAction(id: string, input: RecordContactResultInput): Promise<ProspectActionResult> {
  const auth = await requireRole([...GENERAL_ROLES]);
  if (!auth.ok) return fail(auth.message ?? "غير مصرّح.");
  const result = await recordContactResult(id, input, auth.userId ?? null);
  if (result.ok) revalidatePath(PATH);
  return result;
}

// ---------------------------------------------------------------------------
// archive / unarchive (owner/admin/supervisor)
// ---------------------------------------------------------------------------
export async function archiveProspectAction(id: string): Promise<ProspectActionResult> {
  const auth = await requireRole([...MANAGE_ROLES]);
  if (!auth.ok) return fail(auth.message ?? "غير مصرّح.");
  const result = await archiveProspect(id, auth.userId ?? null);
  if (result.ok) revalidatePath(PATH);
  return result;
}

export async function unarchiveProspectAction(id: string, reason: string): Promise<ProspectActionResult> {
  const auth = await requireRole([...MANAGE_ROLES]);
  if (!auth.ok) return fail(auth.message ?? "غير مصرّح.");
  if (!reason.trim()) return fail("سبب إعادة الفتح مطلوب.");
  const result = await unarchiveProspect(id, reason, auth.userId ?? null);
  if (result.ok) revalidatePath(PATH);
  return result;
}

// ---------------------------------------------------------------------------
// تحويل إلى Lead (owner/admin/supervisor) — مرحلتان: preview ثم تنفيذ
// ---------------------------------------------------------------------------
export async function checkExistingLeadMatchAction(prospectId: string) {
  const auth = await requireRole([...MANAGE_ROLES]);
  if (!auth.ok) return fail(auth.message ?? "غير مصرّح.");
  const data = await checkExistingLeadMatch(prospectId);
  return { ok: true, data } as const;
}

export async function executeConversionAction(
  prospectId: string,
  choice: "link" | "create",
  existingLeadId?: string,
  overrideReason?: string
): Promise<ConversionOutcome> {
  const auth = await requireRole([...MANAGE_ROLES]);
  if (!auth.ok) return fail(auth.message ?? "غير مصرّح.");
  const isOwnerOrAdmin = roleSatisfies(auth.role ?? "member", ["owner", "admin"]);
  const result = await executeConversion(prospectId, auth.userId ?? null, choice, existingLeadId, {
    overrideReason,
    isOwnerOrAdmin,
  });
  if (result.ok) {
    revalidatePath(PATH);
    revalidatePath("/dashboard/leads");
  }
  return result;
}
