/**
 * NEXVORA Prospecting Database — Data Access (Part 1: Backend)
 * ================================================================
 * القراءة عبر authenticated client (RLS SELECT)، الكتابة عبر service
 * client (RBAC مطبَّق في Server Actions — راجع prospect-actions.ts).
 * نمط الـ mapper (DB snake_case → camelCase) مطابق لـ lib/user-stories/service.ts.
 */
import "server-only";
import { createClient } from "@/lib/supabase/server";
import { createServiceClient } from "@/lib/supabase/service";
import { PROSPECTS_PAGE_SIZE } from "@/lib/pagination/page-sizes";
import { normalizeEgyptianPhone } from "./phone-normalization";
import { validateStatusTransition } from "./status-transitions";
import { compareProspectsForDefaultOrder } from "./sorting";
import { computeConversionRate } from "./summary-math";
import type { ProspectColumnMapping } from "./import-service";
import type {
  ProspectRow,
  ProspectActivityRow,
  ProspectImportBatchRow,
  ProspectWithActivities,
  ProspectStatus,
  ProspectPriority,
  ProspectConfidence,
  ProspectActivityType,
  ContactOutcome,
} from "./types";

// ---------------------------------------------------------------------------
// DB row types + mappers
// ---------------------------------------------------------------------------
interface DbProspect {
  id: string;
  import_batch_id: string | null;
  organization_name: string;
  normalized_name: string | null;
  sector: string | null;
  governorate: string | null;
  city_or_area: string | null;
  branches_count: number | null;
  scope_notes: string | null;
  primary_phone_raw: string | null;
  primary_phone_normalized: string | null;
  secondary_phones: string[] | null;
  email: string | null;
  website_url: string | null;
  social_url: string | null;
  source_urls: string[] | null;
  visible_size_evidence: string | null;
  activity_signal: string | null;
  pain_hypothesis: string | null;
  suggested_offer: string | null;
  research_score: number | null;
  priority: ProspectPriority;
  confidence: ProspectConfidence;
  verification_status: "unverified" | "verified" | "invalid_phone";
  status: ProspectStatus;
  assigned_to: string | null;
  last_contacted_at: string | null;
  next_follow_up_at: string | null;
  converted_lead_id: string | null;
  converted_at: string | null;
  notes: string | null;
  created_by: string | null;
  created_at: string;
  updated_at: string;
  archived_at: string | null;
}

function mapProspect(r: DbProspect): ProspectRow {
  return {
    id: r.id,
    importBatchId: r.import_batch_id,
    organizationName: r.organization_name,
    normalizedName: r.normalized_name,
    sector: r.sector,
    governorate: r.governorate,
    cityOrArea: r.city_or_area,
    branchesCount: r.branches_count,
    scopeNotes: r.scope_notes,
    primaryPhoneRaw: r.primary_phone_raw,
    primaryPhoneNormalized: r.primary_phone_normalized,
    secondaryPhones: r.secondary_phones ?? [],
    email: r.email,
    websiteUrl: r.website_url,
    socialUrl: r.social_url,
    sourceUrls: r.source_urls ?? [],
    visibleSizeEvidence: r.visible_size_evidence,
    activitySignal: r.activity_signal,
    painHypothesis: r.pain_hypothesis,
    suggestedOffer: r.suggested_offer,
    researchScore: r.research_score,
    priority: r.priority,
    confidence: r.confidence,
    verificationStatus: r.verification_status,
    status: r.status,
    assignedTo: r.assigned_to,
    lastContactedAt: r.last_contacted_at,
    nextFollowUpAt: r.next_follow_up_at,
    convertedLeadId: r.converted_lead_id,
    convertedAt: r.converted_at,
    notes: r.notes,
    createdBy: r.created_by,
    createdAt: r.created_at,
    updatedAt: r.updated_at,
    archivedAt: r.archived_at,
  };
}

interface DbProspectActivity {
  id: string;
  prospect_id: string;
  activity_type: ProspectActivityType;
  previous_status: ProspectStatus | null;
  new_status: ProspectStatus | null;
  channel: string | null;
  note: string | null;
  created_by: string | null;
  created_at: string;
}

function mapActivity(r: DbProspectActivity): ProspectActivityRow {
  return {
    id: r.id,
    prospectId: r.prospect_id,
    activityType: r.activity_type,
    previousStatus: r.previous_status,
    newStatus: r.new_status,
    channel: r.channel,
    note: r.note,
    createdBy: r.created_by,
    createdAt: r.created_at,
  };
}

interface DbImportBatch {
  id: string;
  original_filename: string;
  file_type: "xlsx" | "csv";
  imported_by: string | null;
  column_mapping: Record<string, string>;
  total_rows: number;
  imported_rows: number;
  duplicate_rows: number;
  rejected_rows: number;
  created_at: string;
}

function mapImportBatch(r: DbImportBatch): ProspectImportBatchRow {
  return {
    id: r.id,
    originalFilename: r.original_filename,
    fileType: r.file_type,
    importedBy: r.imported_by,
    columnMapping: r.column_mapping ?? {},
    totalRows: r.total_rows,
    importedRows: r.imported_rows,
    duplicateRows: r.duplicate_rows,
    rejectedRows: r.rejected_rows,
    createdAt: r.created_at,
  };
}

// ---------------------------------------------------------------------------
// Activity logging helper
// ---------------------------------------------------------------------------
async function logActivity(
  svc: ReturnType<typeof createServiceClient>,
  input: {
    prospectId: string;
    activityType: ProspectActivityType;
    previousStatus?: ProspectStatus | null;
    newStatus?: ProspectStatus | null;
    channel?: string | null;
    note?: string | null;
    createdBy: string | null;
  }
): Promise<void> {
  const { error } = await svc.from("prospect_activities").insert({
    prospect_id: input.prospectId,
    activity_type: input.activityType,
    previous_status: input.previousStatus ?? null,
    new_status: input.newStatus ?? null,
    channel: input.channel ?? null,
    note: input.note ?? null,
    created_by: input.createdBy,
  });
  if (error) throw error;
}

// ---------------------------------------------------------------------------
// listProspects
// ---------------------------------------------------------------------------
export interface ProspectListFilters {
  search?: string; // اسم أو هاتف
  sector?: string;
  governorate?: string;
  priority?: ProspectPriority;
  confidence?: ProspectConfidence;
  status?: ProspectStatus;
  assignedTo?: string;
  followUpToday?: boolean;
  followUpOverdue?: boolean;
  importBatchId?: string;
  /** افتراضيًا false — الجهات المؤرشفة لا تظهر إلا لو طُلب صراحة. */
  includeArchived?: boolean;
}

export interface ProspectListResult {
  items: ProspectRow[];
  hasMore: boolean;
}

export async function listProspects(filters: ProspectListFilters, offset: number): Promise<ProspectListResult> {
  const supabase = await createClient();
  let query = supabase.from("prospects").select("*");

  if (!filters.includeArchived) {
    query = query.is("archived_at", null);
  }
  if (filters.search) {
    const term = filters.search.trim();
    if (term) {
      query = query.or(`organization_name.ilike.%${term}%,primary_phone_normalized.ilike.%${term}%`);
    }
  }
  if (filters.sector) query = query.eq("sector", filters.sector);
  if (filters.governorate) query = query.eq("governorate", filters.governorate);
  if (filters.priority) query = query.eq("priority", filters.priority);
  if (filters.confidence) query = query.eq("confidence", filters.confidence);
  if (filters.status) query = query.eq("status", filters.status);
  if (filters.assignedTo) query = query.eq("assigned_to", filters.assignedTo);
  if (filters.importBatchId) query = query.eq("import_batch_id", filters.importBatchId);
  if (filters.followUpOverdue) {
    query = query.lt("next_follow_up_at", new Date().toISOString());
  }
  if (filters.followUpToday) {
    const now = new Date();
    const start = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate())).toISOString();
    const end = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate() + 1)).toISOString();
    query = query.gte("next_follow_up_at", start).lt("next_follow_up_at", end);
  }

  const { data, error } = await query
    .order("created_at", { ascending: false })
    .range(offset, offset + PROSPECTS_PAGE_SIZE - 1);
  if (error) throw error;

  const rows = ((data as DbProspect[] | null) ?? []).map(mapProspect);
  const nowIso = new Date().toISOString();
  rows.sort((a, b) => compareProspectsForDefaultOrder(a, b, nowIso));

  return { items: rows, hasMore: rows.length === PROSPECTS_PAGE_SIZE };
}

// ---------------------------------------------------------------------------
// getProspectById
// ---------------------------------------------------------------------------
export async function getProspectById(id: string): Promise<ProspectWithActivities | null> {
  const supabase = await createClient();
  const { data: prospect, error } = await supabase.from("prospects").select("*").eq("id", id).maybeSingle();
  if (error) throw error;
  if (!prospect) return null;

  const { data: activities, error: actErr } = await supabase
    .from("prospect_activities")
    .select("*")
    .eq("prospect_id", id)
    .order("created_at", { ascending: false });
  if (actErr) throw actErr;

  return {
    ...mapProspect(prospect as DbProspect),
    activities: ((activities as DbProspectActivity[] | null) ?? []).map(mapActivity),
  };
}

// ---------------------------------------------------------------------------
// createImportBatch + createProspectsFromImport
// ---------------------------------------------------------------------------
export interface CreateImportBatchInput {
  originalFilename: string;
  fileType: "xlsx" | "csv";
  columnMapping: ProspectColumnMapping;
}

export async function createImportBatch(input: CreateImportBatchInput, actorId: string | null): Promise<string> {
  const svc = createServiceClient();
  const { data, error } = await svc
    .from("prospect_import_batches")
    .insert({
      original_filename: input.originalFilename,
      file_type: input.fileType,
      imported_by: actorId,
      column_mapping: input.columnMapping,
    })
    .select("id")
    .single();
  if (error) throw error;
  return (data as { id: string }).id;
}

export interface ImportRowInput {
  raw: Record<string, unknown>;
  /** import: يُدرج كجهة جديدة. skip_duplicate: تكرار تم تجاهله بقرار المستخدم.
   *  skip_invalid: مرفوض (بلا اسم/بلا وسيلة تواصل — فُلتر مسبقًا في previewImportRows). */
  action: "import" | "skip_duplicate" | "skip_invalid";
}

function getMapped(raw: Record<string, unknown>, mapping: ProspectColumnMapping, field: keyof ProspectColumnMapping): string {
  const header = mapping[field];
  if (!header) return "";
  const v = raw[header];
  if (v === null || v === undefined) return "";
  return String(v).trim();
}

/** يفصل قيمة نصية فيها أكتر من عنصر (هواتف/روابط) بأي فاصل شائع — / أو ، أو ; أو سطر جديد. */
function splitMultiValue(raw: string): string[] {
  return raw
    .split(/[\/,;\n،]+/)
    .map((s) => s.trim())
    .filter((s) => s !== "");
}

/** يحوّل نص هواتف متعددة إلى مصفوفة أرقام مطبَّعة (يتجاهل الغير صالح بصمت). */
function parseSecondaryPhones(raw: string): string[] {
  return splitMultiValue(raw)
    .map((p) => normalizeEgyptianPhone(p))
    .filter((r) => r.isValid)
    .map((r) => r.normalized as string);
}

/** يحوّل نص أرقام/درجة إلى numeric — يتجاهل بصمت لو مش رقم صالح (زي "97/100" ياخد 97 بس). */
function parseResearchScore(raw: string): number | null {
  const match = raw.match(/-?\d+(\.\d+)?/);
  if (!match) return null;
  const n = Number(match[0]);
  return Number.isFinite(n) ? n : null;
}

/**
 * يحوّل نص أولوية حر (عربي أو رمزي) إلى enum ثابت. يدعم صيغ شائعة في ملفات
 * أبحاث السوق: "A - أولوية قصوى" / "مرتفعة" / "B" / "متوسطة" / "منخفضة" / "high".
 * غير متعرَّف عليه → null (يُترك للـ default 'medium' على مستوى DB).
 */
function parsePriority(raw: string): ProspectPriority | null {
  const v = raw.trim().toLowerCase();
  if (!v) return null;
  if (/^a\b|قصوى|مرتفع|عالي|high/.test(v)) return "high";
  if (/^c\b|منخفض|ضعيف|low/.test(v)) return "low";
  if (/^b\b|متوسط|medium/.test(v)) return "medium";
  return null;
}

/** يبني صف الإدراج من صف خام + mapping — بدون I/O، قابلة للاختبار مستقلة. */
export function buildProspectInsertRow(
  raw: Record<string, unknown>,
  columnMapping: ProspectColumnMapping,
  batchId: string,
  actorId: string | null
): { row: Record<string, unknown>; initialStatus: ProspectStatus } | null {
  const organizationName = getMapped(raw, columnMapping, "organization_name");
  if (!organizationName) return null;

  const phoneRaw = getMapped(raw, columnMapping, "primary_phone_raw");
  const phoneResult = phoneRaw ? normalizeEgyptianPhone(phoneRaw) : null;
  const email = getMapped(raw, columnMapping, "email") || null;

  const hasContact = (phoneResult?.isValid ?? false) || !!email;
  const initialStatus: ProspectStatus = hasContact ? "new" : "needs_verification";

  const branchesCountRaw = getMapped(raw, columnMapping, "branches_count");
  const branchesCount = branchesCountRaw && !Number.isNaN(Number(branchesCountRaw)) ? Number(branchesCountRaw) : null;

  const secondaryPhonesRaw = getMapped(raw, columnMapping, "secondary_phones");
  const secondaryPhones = secondaryPhonesRaw ? parseSecondaryPhones(secondaryPhonesRaw) : [];

  const sourceUrlsRaw = getMapped(raw, columnMapping, "source_urls");
  const sourceUrls = sourceUrlsRaw ? splitMultiValue(sourceUrlsRaw) : [];

  const researchScoreRaw = getMapped(raw, columnMapping, "research_score");
  const researchScore = researchScoreRaw ? parseResearchScore(researchScoreRaw) : null;

  const priorityRaw = getMapped(raw, columnMapping, "priority");
  const priority = priorityRaw ? parsePriority(priorityRaw) : null;

  return {
    initialStatus,
    row: {
      import_batch_id: batchId,
      organization_name: organizationName,
      normalized_name: organizationName.trim().toLowerCase().replace(/\s+/g, " "),
      sector: getMapped(raw, columnMapping, "sector") || null,
      governorate: getMapped(raw, columnMapping, "governorate") || null,
      city_or_area: getMapped(raw, columnMapping, "city_or_area") || null,
      branches_count: branchesCount,
      scope_notes: getMapped(raw, columnMapping, "scope_notes") || null,
      primary_phone_raw: phoneRaw || null,
      primary_phone_normalized: phoneResult?.isValid ? phoneResult.normalized : null,
      secondary_phones: secondaryPhones,
      email,
      website_url: getMapped(raw, columnMapping, "website_url") || null,
      social_url: getMapped(raw, columnMapping, "social_url") || null,
      source_urls: sourceUrls,
      visible_size_evidence: getMapped(raw, columnMapping, "visible_size_evidence") || null,
      activity_signal: getMapped(raw, columnMapping, "activity_signal") || null,
      pain_hypothesis: getMapped(raw, columnMapping, "pain_hypothesis") || null,
      suggested_offer: getMapped(raw, columnMapping, "suggested_offer") || null,
      research_score: researchScore,
      ...(priority ? { priority } : {}),
      notes: getMapped(raw, columnMapping, "notes") || null,
      verification_status: phoneRaw && !phoneResult?.isValid ? "invalid_phone" : "unverified",
      status: initialStatus,
      created_by: actorId,
    },
  };
}

export interface ImportExecutionResult {
  insertedCount: number;
  duplicateSkippedCount: number;
  rejectedCount: number;
  prospectIds: string[];
}

export async function createProspectsFromImport(
  batchId: string,
  rows: ImportRowInput[],
  columnMapping: ProspectColumnMapping,
  actorId: string | null
): Promise<ImportExecutionResult> {
  const svc = createServiceClient();

  let duplicateSkippedCount = 0;
  let rejectedCount = 0;
  const toInsert: { row: Record<string, unknown>; initialStatus: ProspectStatus }[] = [];

  for (const row of rows) {
    if (row.action === "skip_duplicate") {
      duplicateSkippedCount++;
      continue;
    }
    if (row.action === "skip_invalid") {
      rejectedCount++;
      continue;
    }
    const built = buildProspectInsertRow(row.raw, columnMapping, batchId, actorId);
    if (!built) {
      rejectedCount++;
      continue;
    }
    toInsert.push(built);
  }

  const prospectIds: string[] = [];
  if (toInsert.length > 0) {
    const { data, error } = await svc
      .from("prospects")
      .insert(toInsert.map((t) => t.row))
      .select("id");
    if (error) throw error;
    const inserted = (data as { id: string }[] | null) ?? [];
    inserted.forEach((r) => prospectIds.push(r.id));

    if (inserted.length === toInsert.length) {
      const activityRows = inserted.map((r, i) => ({
        prospect_id: r.id,
        activity_type: "imported" as const,
        previous_status: null,
        new_status: toInsert[i].initialStatus,
        channel: null,
        note: null,
        created_by: actorId,
      }));
      const { error: actErr } = await svc.from("prospect_activities").insert(activityRows);
      if (actErr) throw actErr;
    }
  }

  await svc
    .from("prospect_import_batches")
    .update({
      total_rows: rows.length,
      imported_rows: prospectIds.length,
      duplicate_rows: duplicateSkippedCount,
      rejected_rows: rejectedCount,
    })
    .eq("id", batchId);

  return {
    insertedCount: prospectIds.length,
    duplicateSkippedCount,
    rejectedCount,
    prospectIds,
  };
}

// ---------------------------------------------------------------------------
// updateProspect
// ---------------------------------------------------------------------------
export interface ProspectUpdatePatch {
  organizationName?: string;
  sector?: string | null;
  governorate?: string | null;
  cityOrArea?: string | null;
  branchesCount?: number | null;
  scopeNotes?: string | null;
  primaryPhoneRaw?: string | null;
  email?: string | null;
  websiteUrl?: string | null;
  socialUrl?: string | null;
  visibleSizeEvidence?: string | null;
  activitySignal?: string | null;
  painHypothesis?: string | null;
  suggestedOffer?: string | null;
  researchScore?: number | null;
  priority?: ProspectPriority;
  confidence?: ProspectConfidence;
  notes?: string | null;
}

export async function updateProspect(id: string, patch: ProspectUpdatePatch): Promise<ProspectRow> {
  const svc = createServiceClient();
  const db: Record<string, unknown> = {};
  if (patch.organizationName !== undefined) {
    db.organization_name = patch.organizationName;
    db.normalized_name = patch.organizationName.trim().toLowerCase().replace(/\s+/g, " ");
  }
  if (patch.sector !== undefined) db.sector = patch.sector;
  if (patch.governorate !== undefined) db.governorate = patch.governorate;
  if (patch.cityOrArea !== undefined) db.city_or_area = patch.cityOrArea;
  if (patch.branchesCount !== undefined) db.branches_count = patch.branchesCount;
  if (patch.scopeNotes !== undefined) db.scope_notes = patch.scopeNotes;
  if (patch.primaryPhoneRaw !== undefined) {
    db.primary_phone_raw = patch.primaryPhoneRaw;
    const result = patch.primaryPhoneRaw ? normalizeEgyptianPhone(patch.primaryPhoneRaw) : null;
    db.primary_phone_normalized = result?.isValid ? result.normalized : null;
  }
  if (patch.email !== undefined) db.email = patch.email;
  if (patch.websiteUrl !== undefined) db.website_url = patch.websiteUrl;
  if (patch.socialUrl !== undefined) db.social_url = patch.socialUrl;
  if (patch.visibleSizeEvidence !== undefined) db.visible_size_evidence = patch.visibleSizeEvidence;
  if (patch.activitySignal !== undefined) db.activity_signal = patch.activitySignal;
  if (patch.painHypothesis !== undefined) db.pain_hypothesis = patch.painHypothesis;
  if (patch.suggestedOffer !== undefined) db.suggested_offer = patch.suggestedOffer;
  if (patch.researchScore !== undefined) db.research_score = patch.researchScore;
  if (patch.priority !== undefined) db.priority = patch.priority;
  if (patch.confidence !== undefined) db.confidence = patch.confidence;
  if (patch.notes !== undefined) db.notes = patch.notes;

  const { data, error } = await svc.from("prospects").update(db).eq("id", id).select("*").single();
  if (error) throw error;
  return mapProspect(data as DbProspect);
}

// ---------------------------------------------------------------------------
// assignProspect
// ---------------------------------------------------------------------------
export async function assignProspect(id: string, assigneeId: string, actorId: string | null): Promise<ProspectRow> {
  const svc = createServiceClient();
  const { data, error } = await svc.from("prospects").update({ assigned_to: assigneeId }).eq("id", id).select("*").single();
  if (error) throw error;
  await logActivity(svc, { prospectId: id, activityType: "assigned", createdBy: actorId });
  return mapProspect(data as DbProspect);
}

// ---------------------------------------------------------------------------
// recordWhatsappOpened — نشاط فقط، لا يغيّر status أبدًا
// ---------------------------------------------------------------------------
export async function recordWhatsappOpened(id: string, actorId: string | null): Promise<void> {
  const svc = createServiceClient();
  await logActivity(svc, { prospectId: id, activityType: "whatsapp_opened", channel: "whatsapp", createdBy: actorId });
}

// ---------------------------------------------------------------------------
// confirmMessageSent — الوحيد الذي يحوّل الحالة إلى contacted
// ---------------------------------------------------------------------------
export type ProspectActionResult = { ok: true; prospect: ProspectRow } | { ok: false; message: string };

export async function confirmMessageSent(id: string, actorId: string | null): Promise<ProspectActionResult> {
  const svc = createServiceClient();
  const { data: current, error: fetchErr } = await svc
    .from("prospects")
    .select("status, converted_lead_id")
    .eq("id", id)
    .maybeSingle();
  if (fetchErr) throw fetchErr;
  if (!current) return { ok: false, message: "الجهة المستهدفة غير موجودة." };

  const currentStatus = current.status as ProspectStatus;
  const transition = validateStatusTransition({
    currentStatus,
    targetStatus: "contacted",
    hasConvertedLeadId: !!current.converted_lead_id,
    confirmedSent: true,
  });
  if (!transition.ok) return { ok: false, message: transition.message ?? "انتقال غير مسموح." };

  const { data, error } = await svc
    .from("prospects")
    .update({ status: "contacted", last_contacted_at: new Date().toISOString() })
    .eq("id", id)
    .select("*")
    .single();
  if (error) throw error;

  await logActivity(svc, {
    prospectId: id,
    activityType: "message_confirmed_sent",
    previousStatus: currentStatus,
    newStatus: "contacted",
    channel: "whatsapp",
    createdBy: actorId,
  });

  return { ok: true, prospect: mapProspect(data as DbProspect) };
}

// ---------------------------------------------------------------------------
// recordContactResult
// ---------------------------------------------------------------------------
export interface RecordContactResultInput {
  channel?: string;
  outcome: ContactOutcome;
  note?: string;
  nextFollowUpAt?: string | null;
  assigneeId?: string;
}

const OUTCOME_ACTIVITY_TYPE: Record<ContactOutcome, ProspectActivityType> = {
  no_answer: "no_answer",
  asked_for_details: "replied",
  interested: "interested",
  not_interested: "not_fit",
  wrong_number: "note_added", // لا يوجد نوع نشاط مخصّص لـ"رقم خاطئ" في القائمة المعتمدة
};

export async function recordContactResult(
  id: string,
  input: RecordContactResultInput,
  actorId: string | null
): Promise<ProspectActionResult> {
  const svc = createServiceClient();
  const { data: current, error: fetchErr } = await svc
    .from("prospects")
    .select("status, converted_lead_id")
    .eq("id", id)
    .maybeSingle();
  if (fetchErr) throw fetchErr;
  if (!current) return { ok: false, message: "الجهة المستهدفة غير موجودة." };

  const currentStatus = current.status as ProspectStatus;
  const hasConvertedLeadId = !!current.converted_lead_id;

  const db: Record<string, unknown> = {};
  let targetStatus: ProspectStatus = currentStatus;

  switch (input.outcome) {
    case "no_answer":
      targetStatus = input.nextFollowUpAt ? "follow_up" : currentStatus;
      break;
    case "asked_for_details":
      targetStatus = "replied";
      break;
    case "interested":
      targetStatus = "interested";
      break;
    case "not_interested":
      targetStatus = "not_fit";
      break;
    case "wrong_number":
      db.verification_status = "invalid_phone";
      targetStatus = currentStatus; // لا تُحذف الجهة ولا تُغيّر status
      break;
  }

  if (targetStatus !== currentStatus) {
    const transition = validateStatusTransition({ currentStatus, targetStatus, hasConvertedLeadId });
    if (!transition.ok) return { ok: false, message: transition.message ?? "انتقال غير مسموح." };
    db.status = targetStatus;
  }

  if (input.nextFollowUpAt !== undefined) db.next_follow_up_at = input.nextFollowUpAt;
  if (input.assigneeId) db.assigned_to = input.assigneeId;

  const { data, error } = await svc.from("prospects").update(db).eq("id", id).select("*").single();
  if (error) throw error;

  await logActivity(svc, {
    prospectId: id,
    activityType: OUTCOME_ACTIVITY_TYPE[input.outcome],
    previousStatus: currentStatus,
    newStatus: targetStatus !== currentStatus ? targetStatus : null,
    channel: input.channel ?? null,
    note: input.note ?? null,
    createdBy: actorId,
  });

  if (input.nextFollowUpAt && input.outcome !== "not_interested" && input.outcome !== "wrong_number") {
    await logActivity(svc, {
      prospectId: id,
      activityType: "follow_up_scheduled",
      channel: null,
      note: `موعد متابعة: ${input.nextFollowUpAt}`,
      createdBy: actorId,
    });
  }

  return { ok: true, prospect: mapProspect(data as DbProspect) };
}

// ---------------------------------------------------------------------------
// archive / unarchive
// ---------------------------------------------------------------------------
export async function archiveProspect(id: string, actorId: string | null): Promise<ProspectActionResult> {
  const svc = createServiceClient();
  const { data: current, error: fetchErr } = await svc.from("prospects").select("status").eq("id", id).maybeSingle();
  if (fetchErr) throw fetchErr;
  if (!current) return { ok: false, message: "الجهة المستهدفة غير موجودة." };

  const currentStatus = current.status as ProspectStatus;
  const { data, error } = await svc
    .from("prospects")
    .update({ status: "archived", archived_at: new Date().toISOString() })
    .eq("id", id)
    .select("*")
    .single();
  if (error) throw error;

  await logActivity(svc, {
    prospectId: id,
    activityType: "archived",
    previousStatus: currentStatus,
    newStatus: "archived",
    createdBy: actorId,
  });

  return { ok: true, prospect: mapProspect(data as DbProspect) };
}

export async function unarchiveProspect(id: string, reason: string, actorId: string | null): Promise<ProspectActionResult> {
  const svc = createServiceClient();
  const { data: current, error: fetchErr } = await svc
    .from("prospects")
    .select("status, converted_lead_id")
    .eq("id", id)
    .maybeSingle();
  if (fetchErr) throw fetchErr;
  if (!current) return { ok: false, message: "الجهة المستهدفة غير موجودة." };

  const currentStatus = current.status as ProspectStatus;
  if (currentStatus !== "archived" && currentStatus !== "not_fit") {
    return { ok: false, message: "الجهة ليست مؤرشفة أو غير مناسبة — لا حاجة لإعادة الفتح." };
  }

  const targetStatus: ProspectStatus = "ready_to_contact";
  const transition = validateStatusTransition({
    currentStatus,
    targetStatus,
    hasConvertedLeadId: !!current.converted_lead_id,
    explicitReopen: true,
  });
  if (!transition.ok) return { ok: false, message: transition.message ?? "انتقال غير مسموح." };

  const { data, error } = await svc
    .from("prospects")
    .update({ status: targetStatus, archived_at: null })
    .eq("id", id)
    .select("*")
    .single();
  if (error) throw error;

  await logActivity(svc, {
    prospectId: id,
    activityType: "note_added",
    previousStatus: currentStatus,
    newStatus: targetStatus,
    note: `أُعيد الفتح: ${reason}`,
    createdBy: actorId,
  });

  return { ok: true, prospect: mapProspect(data as DbProspect) };
}

// ---------------------------------------------------------------------------
// getTodayContactList
// ---------------------------------------------------------------------------
export interface TodayContactList {
  overdueFollowUp: ProspectRow[];
  todayFollowUp: ProspectRow[];
  interestedNoNextAction: ProspectRow[];
  repliedNoFollowUp: ProspectRow[];
  readyToContact: ProspectRow[];
}

export async function getTodayContactList(assigneeId?: string): Promise<TodayContactList> {
  const supabase = await createClient();
  const now = new Date();
  const nowIso = now.toISOString();
  const startOfDay = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate())).toISOString();
  const endOfDay = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate() + 1)).toISOString();

  const base = () => {
    let q = supabase.from("prospects").select("*").is("archived_at", null);
    if (assigneeId) q = q.eq("assigned_to", assigneeId);
    return q;
  };

  const [overdue, today, interested, replied, ready] = await Promise.all([
    base().lt("next_follow_up_at", nowIso).order("next_follow_up_at", { ascending: true }),
    base().gte("next_follow_up_at", startOfDay).lt("next_follow_up_at", endOfDay).order("next_follow_up_at", { ascending: true }),
    base().eq("status", "interested").is("next_follow_up_at", null).order("updated_at", { ascending: false }),
    base().eq("status", "replied").is("next_follow_up_at", null).order("updated_at", { ascending: false }),
    base().eq("status", "ready_to_contact").order("priority", { ascending: false }).order("created_at", { ascending: true }),
  ]);

  for (const r of [overdue, today, interested, replied, ready]) {
    if (r.error) throw r.error;
  }

  return {
    overdueFollowUp: ((overdue.data as DbProspect[] | null) ?? []).map(mapProspect),
    todayFollowUp: ((today.data as DbProspect[] | null) ?? []).map(mapProspect),
    interestedNoNextAction: ((interested.data as DbProspect[] | null) ?? []).map(mapProspect),
    repliedNoFollowUp: ((replied.data as DbProspect[] | null) ?? []).map(mapProspect),
    readyToContact: ((ready.data as DbProspect[] | null) ?? []).map(mapProspect),
  };
}

// ---------------------------------------------------------------------------
// getProspectingSummary
// ---------------------------------------------------------------------------
export interface ProspectingSummary {
  total: number;
  needsVerification: number;
  readyToContact: number;
  contacted: number;
  replied: number;
  interested: number;
  followUpToday: number;
  converted: number;
  /** null لو لا يوجد أي تواصل مؤكد بعد (تجنّب NaN/Infinity). */
  conversionRate: number | null;
}

export async function getProspectingSummary(): Promise<ProspectingSummary> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("prospects")
    .select("status, next_follow_up_at, last_contacted_at")
    .is("archived_at", null);
  if (error) throw error;

  const rows = (data as { status: ProspectStatus; next_follow_up_at: string | null; last_contacted_at: string | null }[] | null) ?? [];

  const now = new Date();
  const startOfDay = Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate());
  const endOfDay = startOfDay + 24 * 60 * 60 * 1000;

  let needsVerification = 0;
  let readyToContact = 0;
  let contacted = 0;
  let replied = 0;
  let interested = 0;
  let followUpToday = 0;
  let converted = 0;
  let confirmedContactedCount = 0;

  for (const r of rows) {
    if (r.status === "needs_verification") needsVerification++;
    if (r.status === "ready_to_contact") readyToContact++;
    if (r.status === "contacted") contacted++;
    if (r.status === "replied") replied++;
    if (r.status === "interested") interested++;
    if (r.status === "converted") converted++;
    if (r.last_contacted_at) confirmedContactedCount++;
    if (r.next_follow_up_at) {
      const t = new Date(r.next_follow_up_at).getTime();
      if (t >= startOfDay && t < endOfDay) followUpToday++;
    }
  }

  return {
    total: rows.length,
    needsVerification,
    readyToContact,
    contacted,
    replied,
    interested,
    followUpToday,
    converted,
    conversionRate: computeConversionRate(converted, confirmedContactedCount),
  };
}

export { mapImportBatch };
