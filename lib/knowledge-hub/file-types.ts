/**
 * تصنيف أنواع الملفات في Knowledge Hub وتحديد طريقة استخراج النص منها.
 *
 * فيه أربع طرق استخراج، والاختيار بينهم مبني على قدرات موجودة فعلًا في
 * المشروع — مش على تمنّي مكتبات:
 *
 * - `text`      — الملف نص خام، بنقراه مباشرةً (txt / md / csv / json / xml
 *                 / sql / كود / Postman / OpenAPI / draw.io / logs).
 * - `docx`      — عبر mammoth، وهي تبعية موجودة بالفعل في المشروع.
 * - `ai_native` — بنبعت الملف نفسه للنموذج: PDF والصور والصوت والفيديو.
 *                 Gemini بيقراهم أصلًا، وده أدق بكتير من أي مكتبة استخراج
 *                 نصوص محلية خصوصًا مع المخططات والجداول الممسوحة ضوئيًا.
 * - `archive`   — ZIP / RAR: مش بنفكّها دلوقتي. بنسجّلها ونطلب من المستخدم
 *                 يرفع محتواها، بدل ما نوهمه إنها اتحلّلت.
 * - `unsupported` — أي حاجة تانية: بتتسجّل كمصدر بس من غير استخراج.
 *
 * الصراحة هنا مقصودة: المواصفة طالبة دعم كل الأنواع، والدعم الحقيقي معناه
 * إما نستخرج فعلًا أو نقول بوضوح إن ده مش متاح — مش نخزّن الملف ونسيبه
 * يبان كأنه اتحلّل.
 */

export type ExtractionMethod = "text" | "docx" | "xlsx" | "ai_native" | "archive" | "unsupported";

export interface FileTypeInfo {
  method: ExtractionMethod;
  /** تسمية عربية للعرض في الواجهة. */
  label: string;
  /** مجموعة العرض في مركز الرفع. */
  group: KnowledgeFileGroup;
}

export type KnowledgeFileGroup =
  | "documents"
  | "spreadsheets"
  | "presentations"
  | "data"
  | "diagrams"
  | "code"
  | "media"
  | "archives"
  | "other";

/** الامتداد (من غير نقطة، بحروف صغيرة) → معلوماته. */
const BY_EXTENSION: Record<string, FileTypeInfo> = {
  // نصوص ومستندات
  txt: { method: "text", label: "نص", group: "documents" },
  md: { method: "text", label: "Markdown", group: "documents" },
  markdown: { method: "text", label: "Markdown", group: "documents" },
  rtf: { method: "text", label: "نص منسّق", group: "documents" },
  docx: { method: "docx", label: "مستند Word", group: "documents" },
  // doc القديم صيغة ثنائية مختلفة تمامًا عن docx وmammoth مابتفكّهاش —
  // بنعلنها صراحةً كغير مدعومة بدل ما نفشل بصمت وقت الاستخراج.
  doc: { method: "unsupported", label: "مستند Word قديم", group: "documents" },
  pdf: { method: "ai_native", label: "PDF", group: "documents" },
  eml: { method: "text", label: "بريد إلكتروني", group: "documents" },

  // جداول
  csv: { method: "text", label: "CSV", group: "spreadsheets" },
  tsv: { method: "text", label: "TSV", group: "spreadsheets" },
  // Excel الحديث (xlsx) حاوية ZIP فيها XML، فبنستخرجه بأمان عبر jszip
  // (office-extract.ts) — من غير مكتبة `xlsx` الثغرية. الـ xls القديم صيغة
  // ثنائية مختلفة، jszip مابيفكّهاش، فبيفضل غير مدعوم (صدّره xlsx/CSV).
  xlsx: { method: "xlsx", label: "Excel", group: "spreadsheets" },
  xls: { method: "unsupported", label: "Excel قديم", group: "spreadsheets" },

  // عروض
  pptx: { method: "unsupported", label: "PowerPoint", group: "presentations" },
  ppt: { method: "unsupported", label: "PowerPoint قديم", group: "presentations" },

  // بيانات وواجهات برمجية
  json: { method: "text", label: "JSON", group: "data" },
  xml: { method: "text", label: "XML", group: "data" },
  yaml: { method: "text", label: "YAML", group: "data" },
  yml: { method: "text", label: "YAML", group: "data" },
  sql: { method: "text", label: "SQL", group: "data" },
  log: { method: "text", label: "سجلّات", group: "data" },

  // مخططات
  drawio: { method: "text", label: "Draw.io", group: "diagrams" },
  vsdx: { method: "unsupported", label: "Visio", group: "diagrams" },
  svg: { method: "text", label: "SVG", group: "diagrams" },
  puml: { method: "text", label: "PlantUML", group: "diagrams" },

  // كود
  ts: { method: "text", label: "TypeScript", group: "code" },
  tsx: { method: "text", label: "TypeScript", group: "code" },
  js: { method: "text", label: "JavaScript", group: "code" },
  jsx: { method: "text", label: "JavaScript", group: "code" },
  py: { method: "text", label: "Python", group: "code" },
  java: { method: "text", label: "Java", group: "code" },
  cs: { method: "text", label: "C#", group: "code" },
  php: { method: "text", label: "PHP", group: "code" },
  go: { method: "text", label: "Go", group: "code" },
  rb: { method: "text", label: "Ruby", group: "code" },

  // وسائط — الذكاء الاصطناعي بيقراها مباشرةً
  png: { method: "ai_native", label: "صورة", group: "media" },
  jpg: { method: "ai_native", label: "صورة", group: "media" },
  jpeg: { method: "ai_native", label: "صورة", group: "media" },
  webp: { method: "ai_native", label: "صورة", group: "media" },
  gif: { method: "ai_native", label: "صورة", group: "media" },
  mp3: { method: "ai_native", label: "صوت", group: "media" },
  wav: { method: "ai_native", label: "صوت", group: "media" },
  m4a: { method: "ai_native", label: "صوت", group: "media" },
  ogg: { method: "ai_native", label: "صوت", group: "media" },
  mp4: { method: "ai_native", label: "فيديو", group: "media" },
  webm: { method: "ai_native", label: "فيديو", group: "media" },
  mov: { method: "ai_native", label: "فيديو", group: "media" },

  // أرشيف
  zip: { method: "archive", label: "أرشيف ZIP", group: "archives" },
  rar: { method: "archive", label: "أرشيف RAR", group: "archives" },
  "7z": { method: "archive", label: "أرشيف 7z", group: "archives" },
  tar: { method: "archive", label: "أرشيف TAR", group: "archives" },
  gz: { method: "archive", label: "أرشيف GZ", group: "archives" },
};

const UNKNOWN: FileTypeInfo = { method: "unsupported", label: "نوع غير معروف", group: "other" };

/** يستخرج الامتداد من اسم الملف — بحروف صغيرة، من غير نقطة. */
export function fileExtension(fileName: string): string {
  const clean = fileName.trim().toLowerCase();
  const dot = clean.lastIndexOf(".");
  if (dot === -1 || dot === clean.length - 1) return "";
  return clean.slice(dot + 1);
}

/**
 * يحدّد نوع الملف. الامتداد له الأولوية على الـ MIME type لأن المتصفحات
 * بترجّع MIME عام (`application/octet-stream`) لأنواع كتير، خصوصًا الملفات
 * الهندسية زي drawio وpuml.
 */
export function classifyFile(fileName: string, mimeType?: string | null): FileTypeInfo {
  const ext = fileExtension(fileName);
  const byExt = BY_EXTENSION[ext];
  if (byExt) return byExt;

  const mime = (mimeType ?? "").toLowerCase();
  if (mime.startsWith("text/")) return { method: "text", label: "نص", group: "documents" };
  if (mime.startsWith("image/")) return { method: "ai_native", label: "صورة", group: "media" };
  if (mime.startsWith("audio/")) return { method: "ai_native", label: "صوت", group: "media" };
  if (mime.startsWith("video/")) return { method: "ai_native", label: "فيديو", group: "media" };
  if (mime === "application/pdf") return { method: "ai_native", label: "PDF", group: "documents" };
  if (mime === "application/json") return { method: "text", label: "JSON", group: "data" };

  return UNKNOWN;
}

/** رسالة عربية توضّح ليه الملف ده مش هيتحلّل — بتتعرض للمستخدم كما هي. */
export function unsupportedReason(info: FileTypeInfo): string | null {
  if (info.method === "archive") {
    return "الملفات المضغوطة تُحفظ كمرجع لكن لا يُستخرج محتواها — فُكّ الضغط وارفع الملفات مباشرةً ليتم تحليلها.";
  }
  if (info.method === "unsupported") {
    return `${info.label}: يُحفظ كمرجع لكن استخراج النص منه غير متاح حاليًا — صدّره إلى PDF أو نص وارفعه مرة أخرى ليُحلَّل.`;
  }
  return null;
}

/** الأنواع اللي بيتم استخراج محتواها فعليًا. */
export function isExtractable(info: FileTypeInfo): boolean {
  return info.method === "text" || info.method === "docx" || info.method === "xlsx" || info.method === "ai_native";
}

/**
 * هل يمكن إعادة معالجة مصدر موجود؟ — **دالة نقيّة مشتركة** بين الخادم
 * (retrySource) والواجهة (زرّ إعادة المحاولة). ضرورية بعد إضافة مستخرِج
 * جديد (زي xlsx): مصدر اتصنّف قديمًا كـ«غير مدعوم» أو خرج بلا نص لازم
 * يقدر يُعاد تحليله بالكود الحالي بدل ما يفضل عالقًا.
 *
 * - `failed`: عطل حقيقي — قابل دايمًا.
 * - `ready` بلا نص (`extractedChars === 0`): استخراج فارغ (docx مثلًا) —
 *   يستحق محاولة بالمستخرِج المحسّن.
 * - `skipped_duplicate` لملف: كان نوعًا غير مدعوم وقت الرفع — قابل **فقط**
 *   لو النوع صار مدعومًا الآن (xlsx). التكرار الحقيقي لا يُنشئ صفًّا أصلًا.
 */
export function isReprocessableSource(
  status: string,
  kind: string,
  fileName: string | null,
  mimeType: string | null,
  extractedChars: number
): boolean {
  if (status === "failed") return true;
  if (status === "ready" && extractedChars === 0) return true;
  if (status === "skipped_duplicate" && kind === "file") {
    return isExtractable(classifyFile(fileName ?? "", mimeType));
  }
  return false;
}

/** كل الامتدادات المقبولة — تُستخدم في خاصية accept لحقل الرفع. */
export function acceptedExtensions(): string[] {
  return Object.keys(BY_EXTENSION)
    .map((ext) => `.${ext}`)
    .sort();
}

/**
 * حد الحجم لكل ملف. الرفع بيروح للتخزين مباشرةً من المتصفح، فحد Vercel
 * (حوالي 4.5MB على جسم الطلب) مش منطبق هنا. الحد ده للحماية من ملفات
 * ضخمة بتكسّر خطوة الاستخراج نفسها.
 */
export const MAX_FILE_BYTES = 100 * 1024 * 1024;

/**
 * الملفات اللي بتتبعت للنموذج مباشرةً محدودة بحجم الطلب عنده. أي ملف
 * أكبر من كده بيتسجّل كمصدر لكن بيتعلّم إنه محتاج تقسيم يدوي.
 */
export const MAX_AI_NATIVE_BYTES = 18 * 1024 * 1024;

export function checkFileSize(
  sizeBytes: number,
  info: FileTypeInfo
): { ok: true } | { ok: false; message: string } {
  if (sizeBytes <= 0) {
    return { ok: false, message: "الملف فارغ." };
  }
  if (sizeBytes > MAX_FILE_BYTES) {
    const mb = Math.round(MAX_FILE_BYTES / 1024 / 1024);
    return { ok: false, message: `حجم الملف يتجاوز الحد المسموح (${mb} ميجابايت).` };
  }
  if (info.method === "ai_native" && sizeBytes > MAX_AI_NATIVE_BYTES) {
    const mb = Math.round(MAX_AI_NATIVE_BYTES / 1024 / 1024);
    return {
      ok: false,
      message: `هذا النوع يُقرأ بالذكاء الاصطناعي مباشرةً، والحد ${mb} ميجابايت — قسّم الملف أو صدّره بجودة أقل.`,
    };
  }
  return { ok: true };
}
