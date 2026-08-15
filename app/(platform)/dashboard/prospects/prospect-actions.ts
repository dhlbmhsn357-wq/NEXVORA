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
import { createClient } from "@/lib/supabase/server";
import type { ProspectMessageTemplateRow } from "@/lib/prospecting/types";
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
import {
  validateImportFile,
  parseSpreadsheetFile,
  listSpreadsheetSheets,
  guessColumnMapping,
  previewImportRows,
  type ProspectColumnMapping,
  type ImportPreviewResult,
  type SpreadsheetSheetInfo,
} from "@/lib/prospecting/import-service";
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

/**
 * يقرأ ملف مرفوع من المتصفح (FormData) ويحلّله إلى headers + rows —
 * بديل client-safe لـ parseSpreadsheetFile (اللي محتاج Buffer/server-only
 * imports مش متاحة في المتصفح). لا يُخزَّن الملف الخام — معالجة كاملة
 * في الذاكرة ثم تُرمى.
 */
export async function parseUploadedFileAction(
  formData: FormData
): Promise<
  Result<{
    headers: string[];
    rows: Record<string, unknown>[];
    fileType: "xlsx" | "csv";
    sheetName: string;
    /** رقم صف العناوين الفعلي (0-based) — لو > 0 يبقى الملف فيه صفوف تمهيدية اتخطّاها. */
    headerRowIndex: number;
    /** كل الشيتات المتاحة في الملف (شيت واحد دائمًا لملفات csv). لو أكتر من شيت، الواجهة تعرض اختيار. */
    sheets: SpreadsheetSheetInfo[];
    /** تخمين تلقائي لربط الأعمدة (مرادفات عربي/إنجليزي) — نقطة بداية، المستخدم يراجع/يصحح. */
    guessedMapping: ProspectColumnMapping;
  }>
> {
  const auth = await requireRole([...MANAGE_ROLES]);
  if (!auth.ok) return fail(auth.message ?? "غير مصرّح.");

  const file = formData.get("file");
  if (!(file instanceof File)) return fail("لم يتم اختيار ملف.");

  // لو المستخدم اختار شيت بعينه (بعد ما شاف قائمة الشيتات)، بييجي هنا.
  const requestedSheet = formData.get("sheetName");

  const validation = validateImportFile(file.name, file.size);
  if (!validation.ok || !validation.fileType) return fail(validation.message ?? "ملف غير صالح.");

  const buffer = await file.arrayBuffer();
  const sheets = listSpreadsheetSheets(buffer);
  const parsed = parseSpreadsheetFile(
    buffer,
    validation.fileType,
    typeof requestedSheet === "string" && requestedSheet ? requestedSheet : undefined
  );
  const guessedMapping = guessColumnMapping(parsed.headers);
  return { ok: true, data: { ...parsed, fileType: validation.fileType, sheets, guessedMapping } };
}

/** غلاف Server Action حول previewImportRows (pure function) — لاستدعائها من مكوّن "use client". */
export async function previewImportRowsAction(
  rows: Record<string, unknown>[],
  columnMapping: ProspectColumnMapping
): Promise<Result<ImportPreviewResult>> {
  const auth = await requireRole([...MANAGE_ROLES]);
  if (!auth.ok) return fail(auth.message ?? "غير مصرّح.");
  const data = previewImportRows(rows, columnMapping);
  return { ok: true, data };
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
// قوالب الرسائل (قراءة فقط — كل الأدوار)
// ---------------------------------------------------------------------------
export async function listMessageTemplatesAction(): Promise<Result<ProspectMessageTemplateRow[]>> {
  const auth = await requireRole([...GENERAL_ROLES]);
  if (!auth.ok) return fail(auth.message ?? "غير مصرّح.");
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("prospect_message_templates")
    .select("*")
    .order("is_default", { ascending: false })
    .order("created_at", { ascending: true });
  if (error) return fail(error.message);
  interface DbTemplate {
    id: string;
    name: string;
    template_type: ProspectMessageTemplateRow["templateType"];
    body: string;
    is_default: boolean;
    created_by: string | null;
    created_at: string;
    updated_at: string;
  }
  const rows = ((data as DbTemplate[] | null) ?? []).map((r) => ({
    id: r.id,
    name: r.name,
    templateType: r.template_type,
    body: r.body,
    isDefault: r.is_default,
    createdBy: r.created_by,
    createdAt: r.created_at,
    updatedAt: r.updated_at,
  }));
  return { ok: true, data: rows };
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
