/**
 * استيراد Excel/CSV — Service logic فقط (لا UI في هذا الجزء).
 * ==============================================================
 * يستخدم مكتبة xlsx (SheetJS) — تدعم .xlsx و.csv بنفس الـ API. لا يُخزَّن
 * الملف الخام بشكل دائم؛ المعالجة بالكامل في الذاكرة (buffer → rows)،
 * تفاديًا لتخزين ملف خام غير ضروري في Storage.
 */
import * as XLSX from "xlsx";
import { normalizeEgyptianPhone } from "./phone-normalization";
import {
  detectDuplicates,
  type DedupCandidateRow,
  type DedupMatch,
} from "./dedup-service";
import type { ProspectImportFileType } from "./types";

export const MAX_IMPORT_FILE_SIZE_BYTES = 5 * 1024 * 1024; // 5MB
const ALLOWED_EXTENSIONS = ["xlsx", "csv"] as const;

export interface FileValidationResult {
  ok: boolean;
  fileType?: ProspectImportFileType;
  message?: string;
}

/** يفحص الامتداد والحجم قبل أي معالجة — لا تسجّل محتوى الملف في الـ logs. */
export function validateImportFile(filename: string, sizeBytes: number): FileValidationResult {
  const ext = filename.split(".").pop()?.toLowerCase() ?? "";
  if (!(ALLOWED_EXTENSIONS as readonly string[]).includes(ext)) {
    return { ok: false, message: "الامتداد غير مدعوم — يُسمح فقط بملفات .xlsx و.csv." };
  }
  if (sizeBytes > MAX_IMPORT_FILE_SIZE_BYTES) {
    return { ok: false, message: `حجم الملف أكبر من الحد المسموح (${MAX_IMPORT_FILE_SIZE_BYTES / (1024 * 1024)}MB).` };
  }
  return { ok: true, fileType: ext as ProspectImportFileType };
}

export interface ParsedSpreadsheet {
  headers: string[];
  rows: Record<string, unknown>[];
  /** اسم الشيت اللي فعليًا اتقرا — يفيد لو الاختيار كان تلقائيًا. */
  sheetName: string;
}

export interface SpreadsheetSheetInfo {
  name: string;
  /** عدد صفوف البيانات (بدون صف العناوين) — يفيد لاختيار الشيت الصح تلقائيًا/يدويًا. */
  rowCount: number;
  /** عدد الأعمدة المكتشفة في صف العناوين. */
  columnCount: number;
}

/**
 * يسرد كل الشيتات (Sheets) في ملف Excel مع عدد صفوفها — عشان لو الملف فيه
 * أكتر من شيت (مثلًا شيت "تقرير/ملخص" نصّي + شيت "بيانات" فعلي) الواجهة
 * تقدر تعرض اختيار للمستخدم بدل ما تفترض الشيت الأول هو الصح دايمًا.
 * ملفات .csv دايمًا شيت واحد.
 */
export function listSpreadsheetSheets(buffer: ArrayBuffer): SpreadsheetSheetInfo[] {
  const workbook = XLSX.read(buffer, { type: "array", cellDates: true });
  return workbook.SheetNames.map((name) => {
    const sheet = workbook.Sheets[name];
    const asRows = XLSX.utils.sheet_to_json<unknown[]>(sheet, { header: 1, range: 0, blankrows: false });
    const columnCount = (asRows[0] as unknown[] | undefined)?.length ?? 0;
    return { name, rowCount: Math.max(0, asRows.length - 1), columnCount };
  });
}

/**
 * أفضل شيت افتراضي عند عدم تحديد المستخدم لواحد بعينه: الشيت اللي فيه أكبر
 * عدد صفوف بيانات (غالبًا هو جدول البيانات الفعلي، مش شيت تقرير/ملخص نصّي
 * قصير). لو كل الشيتات متساوية، ياخد الأول.
 */
function pickDefaultSheet(sheets: SpreadsheetSheetInfo[]): string | undefined {
  if (sheets.length === 0) return undefined;
  return sheets.reduce((best, s) => (s.rowCount > best.rowCount ? s : best), sheets[0]).name;
}

/**
 * يحلّل buffer ملف Excel/CSV إلى headers + rows. يرجّع كل الصفوف — الـ UI
 * (Part 2) هي المسؤولة عن عرض أول 10 فقط كـ Preview.
 *
 * لو الملف فيه أكتر من شيت ومفيش `sheetName` محدّد، بيختار تلقائيًا الشيت
 * اللي فيه أكبر عدد صفوف (بدل الشيت الأول دايمًا) — لتفادي قراءة شيت
 * تقرير/ملخص نصّي بدل جدول البيانات الفعلي.
 */
export function parseSpreadsheetFile(
  buffer: ArrayBuffer,
  fileType: ProspectImportFileType,
  sheetName?: string
): ParsedSpreadsheet {
  // SheetJS يتعامل مع .xlsx و.csv بنفس الـ API عبر XLSX.read — الباراميتر
  // محتفظ به في التوقيع لتوضيح النية للمستدعي ولإمكانية تخصيص لاحق لكل نوع.
  void fileType;
  const workbook = XLSX.read(buffer, { type: "array", cellDates: true });
  const sheets = listSpreadsheetSheets(buffer);
  const resolvedSheetName = sheetName && workbook.SheetNames.includes(sheetName)
    ? sheetName
    : pickDefaultSheet(sheets);
  if (!resolvedSheetName) return { headers: [], rows: [], sheetName: "" };

  const sheet = workbook.Sheets[resolvedSheetName];
  const rows = XLSX.utils.sheet_to_json<Record<string, unknown>>(sheet, { defval: null, raw: false });
  const headerRows = XLSX.utils.sheet_to_json<unknown[]>(sheet, { header: 1, range: 0, blankrows: false });
  const headers =
    (headerRows[0] as unknown[] | undefined)
      ?.map((h) => String(h ?? "").trim())
      .filter((h) => h !== "") ?? [];

  return { headers, rows, sheetName: resolvedSheetName };
}

/**
 * خريطة تحويل: اسم الحقل الهدف في prospects → اسم عمود المصدر في الملف.
 * يُبنى من UI (Part 2) بناءً على اختيار المستخدم لكل عمود.
 */
export type ProspectColumnMapping = Partial<
  Record<
    | "organization_name"
    | "sector"
    | "governorate"
    | "city_or_area"
    | "branches_count"
    | "scope_notes"
    | "primary_phone_raw"
    | "email"
    | "website_url"
    | "social_url"
    | "visible_size_evidence"
    | "activity_signal"
    | "pain_hypothesis"
    | "suggested_offer"
    | "notes",
    string
  >
>;

function getMappedValue(row: Record<string, unknown>, mapping: ProspectColumnMapping, field: keyof ProspectColumnMapping): string {
  const sourceHeader = mapping[field];
  if (!sourceHeader) return "";
  const value = row[sourceHeader];
  if (value === null || value === undefined) return "";
  return String(value).trim();
}

export type RowPreviewCategory =
  | "valid"
  | "duplicatePotential"
  | "invalidPhone"
  | "missingName"
  | "missingContact"
  | "needsReview";

export interface RowPreviewClassification {
  rowIndex: number;
  category: RowPreviewCategory;
  reasons: string[];
}

export interface ImportPreviewResult {
  totalRows: number;
  valid: RowPreviewClassification[];
  duplicatePotential: RowPreviewClassification[];
  invalidPhone: RowPreviewClassification[];
  missingName: RowPreviewClassification[];
  missingContact: RowPreviewClassification[];
  needsReview: RowPreviewClassification[];
  /** تفاصيل مطابقات التكرار داخل نفس الدفعة (intra-batch). التكرار مقابل
   *  قاعدة البيانات الفعلية يُفحص بشكل منفصل في service.ts::createProspectsFromImport
   *  (يحتاج قراءة من DB وليس pure function). */
  duplicateMatches: DedupMatch[];
}

/**
 * يحسب فئة كل صف قبل الحفظ الفعلي — Pure function، لا تحفظ شيئًا.
 * الأولوية: missingName > missingContact > invalidPhone > duplicatePotential
 * (داخل نفس الملف) > needsReview > valid.
 */
export function previewImportRows(
  rows: Record<string, unknown>[],
  columnMapping: ProspectColumnMapping
): ImportPreviewResult {
  const result: ImportPreviewResult = {
    totalRows: rows.length,
    valid: [],
    duplicatePotential: [],
    invalidPhone: [],
    missingName: [],
    missingContact: [],
    needsReview: [],
    duplicateMatches: [],
  };

  const dedupCandidates: DedupCandidateRow[] = rows.map((row) => {
    const phoneRaw = getMappedValue(row, columnMapping, "primary_phone_raw");
    const phoneResult = phoneRaw ? normalizeEgyptianPhone(phoneRaw) : null;
    return {
      organizationName: getMappedValue(row, columnMapping, "organization_name"),
      primaryPhoneNormalized: phoneResult?.isValid ? phoneResult.normalized : null,
      email: getMappedValue(row, columnMapping, "email") || null,
      governorate: getMappedValue(row, columnMapping, "governorate") || null,
    };
  });

  // كشف تكرار داخل نفس الملف: كل صف يُفحص مقابل الصفوف السابقة له فقط
  // (تراكميًا)، حتى يظهر التكرار من الصف الثاني فصاعدًا لا الأول.
  const seenSoFar: Array<{ id: string; organizationName: string; primaryPhoneNormalized: string | null; email: string | null; governorate: string | null }> = [];
  const intraBatchMatchByIndex = new Map<number, DedupMatch>();
  dedupCandidates.forEach((candidate, index) => {
    const matches = detectDuplicates([candidate], seenSoFar);
    if (matches.length > 0) {
      intraBatchMatchByIndex.set(index, matches[0]);
      result.duplicateMatches.push(matches[0]);
    }
    seenSoFar.push({ id: `row-${index}`, ...candidate });
  });

  rows.forEach((row, rowIndex) => {
    const name = getMappedValue(row, columnMapping, "organization_name");
    const phoneRaw = getMappedValue(row, columnMapping, "primary_phone_raw");
    const email = getMappedValue(row, columnMapping, "email");
    const governorate = getMappedValue(row, columnMapping, "governorate");
    const sector = getMappedValue(row, columnMapping, "sector");

    const reasons: string[] = [];

    if (!name) {
      result.missingName.push({ rowIndex, category: "missingName", reasons: ["لا يوجد اسم منظمة/جهة"] });
      return;
    }

    const hasPhoneRaw = phoneRaw !== "";
    const phoneCheck = hasPhoneRaw ? normalizeEgyptianPhone(phoneRaw) : null;
    const hasValidPhone = !!phoneCheck?.isValid;
    const hasEmail = email !== "";

    if (!hasPhoneRaw && !hasEmail) {
      result.missingContact.push({ rowIndex, category: "missingContact", reasons: ["لا يوجد رقم هاتف ولا بريد إلكتروني"] });
      return;
    }

    if (hasPhoneRaw && !hasValidPhone) {
      reasons.push("رقم الهاتف غير صالح بعد التطبيع");
      result.invalidPhone.push({ rowIndex, category: "invalidPhone", reasons });
      return;
    }

    const dupMatch = intraBatchMatchByIndex.get(rowIndex);
    if (dupMatch) {
      result.duplicatePotential.push({
        rowIndex,
        category: "duplicatePotential",
        reasons: [`تكرار محتمل داخل نفس الملف (${dupMatch.matchType})`],
      });
      return;
    }

    if (!governorate && !sector) {
      result.needsReview.push({
        rowIndex,
        category: "needsReview",
        reasons: ["لا يوجد قطاع ولا محافظة — يُنصح بالمراجعة قبل الحفظ"],
      });
      return;
    }

    result.valid.push({ rowIndex, category: "valid", reasons: [] });
  });

  return result;
}
