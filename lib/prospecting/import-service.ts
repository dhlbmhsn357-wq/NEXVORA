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
  /** رقم صف العناوين الفعلي (0-based) داخل الشيت — يفيد لو فيه صفوف تمهيدية اتخطّاها. */
  headerRowIndex: number;
}

/**
 * كثير من ملفات أبحاث السوق الحقيقية (زي "خريطة سوق السناتر") بتبدأ
 * بصف/صفّين عنوان وملاحظة نصّية طويلة قبل صف العناوين الفعلي — لو
 * افترضنا الصف الأول دايمًا هو العناوين، هنعامل جملة سردية كأنها "عمود".
 *
 * الحل: نفحص أول `maxScan` صف، ونحسب عدد الخلايا المملوءة في كل صف.
 * صف العناوين الحقيقي بيكون فيه أكبر عدد خلايا مملوءة *ومتبوع* بصف بيانات
 * بعرض مشابه (نفس عدد الأعمدة تقريبًا) — بعكس صف عنوان/ملاحظة اللي بيكون
 * فيه خلية واحدة بس بنص طويل، ومفيش صف بعده بنفس العرض.
 */
export function detectHeaderRowIndex(matrix: unknown[][], maxScan = 20): number {
  const window = matrix.slice(0, Math.min(maxScan, matrix.length));
  const filledCounts = window.map(
    (row) => row.filter((c) => c !== null && c !== undefined && String(c).trim() !== "").length
  );

  let bestIdx = -1;
  let bestScore = -1;
  for (let i = 0; i < filledCounts.length; i++) {
    const count = filledCounts[i];
    // صف بخلية واحدة أو صفر = عنوان/ملاحظة نصّية، مش صف عناوين جدول حقيقي.
    if (count < 2) continue;
    const next = filledCounts[i + 1] ?? 0;
    // لازم الصف اللي بعده يكون بعرض مشابه (بيانات فعلية)، وإلا الصف ده
    // نفسه صف نصّي عريض استثنائي مش عناوين.
    if (next < count * 0.4) continue;
    if (count > bestScore) {
      bestScore = count;
      bestIdx = i;
    }
  }
  return bestIdx === -1 ? 0 : bestIdx; // fallback: الصف الأول لو مفيش نمط واضح
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
    // نحسب عدد الصفوف/الأعمدة بناءً على صف العناوين الحقيقي (بعد تخطّي أي
    // صفوف عنوان/ملاحظة تمهيدية) — مش الصف الأول دايمًا — عشان الرقم اللي
    // بيبان للمستخدم وقت اختيار الشيت يكون معبّر عن حجم البيانات الفعلي.
    const headerIdx = detectHeaderRowIndex(asRows as unknown[][]);
    const columnCount = (asRows[headerIdx] as unknown[] | undefined)?.length ?? 0;
    return { name, rowCount: Math.max(0, asRows.length - 1 - headerIdx), columnCount };
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
  if (!resolvedSheetName) return { headers: [], rows: [], sheetName: "", headerRowIndex: 0 };

  const sheet = workbook.Sheets[resolvedSheetName];
  // نكتشف صف العناوين الحقيقي أولًا (بيتخطّى صفوف العنوان/الملاحظة
  // التمهيدية اللي ملفات أبحاث السوق الحقيقية غالبًا بتبدأ بيها)، وبعدين
  // نقرا الجدول بدايةً من الصف ده — لا نفترض الصف الأول دايمًا هو العناوين.
  const allRowsAsMatrix = XLSX.utils.sheet_to_json<unknown[]>(sheet, { header: 1, range: 0, blankrows: false });
  const headerRowIndex = detectHeaderRowIndex(allRowsAsMatrix as unknown[][]);

  const rows = XLSX.utils.sheet_to_json<Record<string, unknown>>(sheet, {
    defval: null,
    raw: false,
    range: headerRowIndex,
  });
  const headers =
    (allRowsAsMatrix[headerRowIndex] as unknown[] | undefined)
      ?.map((h) => String(h ?? "").trim())
      .filter((h) => h !== "") ?? [];

  return { headers, rows, sheetName: resolvedSheetName, headerRowIndex };
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
    | "secondary_phones"
    | "email"
    | "website_url"
    | "social_url"
    | "source_urls"
    | "visible_size_evidence"
    | "activity_signal"
    | "pain_hypothesis"
    | "suggested_offer"
    | "research_score"
    | "priority"
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

// ---------------------------------------------------------------------------
// تعرّف ذكي على ربط الأعمدة (Column Mapping) — synonyms عربي/إنجليزي
// ---------------------------------------------------------------------------

/**
 * لكل حقل هدف، قائمة كلمات مفتاحية (عربي وإنجليزي) — لو عنوان العمود
 * (بعد التطبيع: trim + توحيد الهمزات/التاء المربوطة + lowercase للإنجليزي)
 * يحتوي أي كلمة منها، يُعتبر تطابق. **الترتيب مهم**: الحقول الأكثر تحديدًا
 * (زي secondary_phones اللي لازم "أخرى/ثانوي/إضافي") تتفحص قبل الحقل العام
 * (primary_phone_raw) عشان "هواتف أخرى" ما تتوهش مع "الهاتف الأساسي".
 */
const FIELD_SYNONYMS: { field: keyof ProspectColumnMapping; keywords: string[] }[] = [
  { field: "organization_name", keywords: ["اسم السنتر", "اسم الجهة", "اسم المنظمة", "اسم الشركة", "السنتر", "الجهة", "الشركة", "المؤسسة", "organization", "company name", "name"] },
  { field: "secondary_phones", keywords: ["هواتف أخرى", "أرقام أخرى", "هاتف إضافي", "هاتف ثانوي", "أرقام إضافية", "other phone", "secondary phone"] },
  { field: "primary_phone_raw", keywords: ["الهاتف الأساسي", "رقم الهاتف", "الهاتف", "تليفون", "موبايل", "جوال", "واتساب", "whatsapp", "phone", "mobile", "tel"] },
  { field: "governorate", keywords: ["المحافظة", "governorate", "province"] },
  { field: "city_or_area", keywords: ["المدينة/المنطقة", "المدينة", "المنطقة", "الحي", "city", "area", "district"] },
  { field: "branches_count", keywords: ["عدد الفروع", "الفروع المؤكدة", "الفروع", "branches", "branch count"] },
  { field: "sector", keywords: ["القطاع", "المجال", "النشاط التجاري", "sector", "industry"] },
  { field: "scope_notes", keywords: ["المراحل/النطاق", "المراحل", "النطاق", "نطاق النشاط", "scope"] },
  { field: "email", keywords: ["البريد الإلكتروني", "البريد", "الإيميل", "email", "e-mail"] },
  { field: "website_url", keywords: ["الموقع/الصفحة", "الموقع الإلكتروني", "الموقع", "website", "site url"] },
  { field: "social_url", keywords: ["رابط اجتماعي", "السوشيال", "فيسبوك", "انستجرام", "social", "facebook", "instagram"] },
  { field: "source_urls", keywords: ["المصدر 1", "المصدر 2", "المصادر", "مصدر", "source"] },
  { field: "visible_size_evidence", keywords: ["دليل الحجم الظاهر", "دليل الحجم", "size evidence"] },
  { field: "activity_signal", keywords: ["مؤشر النشاط الحالي", "مؤشر النشاط", "إشارة نشاط", "activity signal"] },
  { field: "pain_hypothesis", keywords: ["فرضية المشكلة", "المشكلة", "لماذا فرصة", "pain hypothesis", "pain point"] },
  { field: "suggested_offer", keywords: ["العرض المقترح", "العرض الافتتاحي", "العرض", "suggested offer"] },
  { field: "research_score", keywords: ["الدرجة الكلية", "الدرجة", "درجة البحث", "score", "research score"] },
  { field: "priority", keywords: ["الأولوية", "priority"] },
  { field: "notes", keywords: ["ملاحظات", "الخطوة التالية", "حالة التواصل", "notes", "remarks"] },
];

function normalizeHeaderForMatching(header: string): string {
  return header
    .trim()
    .toLowerCase()
    .replace(/[أإآا]/g, "ا")
    .replace(/ة/g, "ه")
    .replace(/\s+/g, " ");
}

/**
 * تعرّف تلقائي على ربط الأعمدة (Column Mapping) — Pure function، بدون AI،
 * بمطابقة مرادفات عربية/إنجليزية شائعة بدل المطابقة الحرفية بس. أول عمود
 * يطابق كل حقل يفوز (ترتيب الأعمدة في الملف بيحدد الأولوية عند التعارض).
 * المستخدم يراجع/يصحح دايمًا في خطوة "ربط الأعمدة" — التخمين نقطة بداية بس.
 */
export function guessColumnMapping(headers: string[]): ProspectColumnMapping {
  const mapping: Record<string, string> = {};
  const usedFields = new Set<string>();

  for (const header of headers) {
    const normalized = normalizeHeaderForMatching(header);
    for (const { field, keywords } of FIELD_SYNONYMS) {
      if (usedFields.has(field)) continue;
      const matched = keywords.some((kw) => normalized.includes(normalizeHeaderForMatching(kw)));
      if (matched) {
        mapping[field] = header;
        usedFields.add(field);
        break;
      }
    }
  }

  return mapping as ProspectColumnMapping;
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
