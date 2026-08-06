import type {
  DiscoveryQuestionType,
  DiscoveryUploadedFile,
} from "@/lib/types/database";

/** بيانات وصفية لكل نوع سؤال — تُستخدم في الأدمن والـ Wizard. */
export interface QuestionTypeMeta {
  type: DiscoveryQuestionType;
  label: string;
  /** هل النوع يحتاج قائمة خيارات (options)؟ */
  hasOptions: boolean;
  /** هل النوع يسمح بأكثر من اختيار (قيمته مصفوفة)؟ */
  isMulti: boolean;
  /** هل النوع رفع ملف؟ */
  isUpload: boolean;
}

export const QUESTION_TYPES: QuestionTypeMeta[] = [
  { type: "short_text", label: "نص قصير", hasOptions: false, isMulti: false, isUpload: false },
  { type: "long_text", label: "نص طويل", hasOptions: false, isMulti: false, isUpload: false },
  { type: "yes_no", label: "نعم / لا", hasOptions: false, isMulti: false, isUpload: false },
  { type: "multiple_choice", label: "اختيار من متعدد", hasOptions: true, isMulti: false, isUpload: false },
  { type: "checkbox", label: "اختيارات متعددة", hasOptions: true, isMulti: true, isUpload: false },
  { type: "rating", label: "تقييم (1–5)", hasOptions: false, isMulti: false, isUpload: false },
  { type: "number", label: "رقم", hasOptions: false, isMulti: false, isUpload: false },
  { type: "website", label: "موقع إلكتروني", hasOptions: false, isMulti: false, isUpload: false },
  { type: "email", label: "بريد إلكتروني", hasOptions: false, isMulti: false, isUpload: false },
  { type: "phone", label: "رقم هاتف", hasOptions: false, isMulti: false, isUpload: false },
  { type: "date", label: "تاريخ", hasOptions: false, isMulti: false, isUpload: false },
  { type: "time", label: "وقت", hasOptions: false, isMulti: false, isUpload: false },
  { type: "currency", label: "مبلغ / عملة", hasOptions: false, isMulti: false, isUpload: false },
  { type: "multi_select", label: "قائمة اختيار متعدد", hasOptions: true, isMulti: true, isUpload: false },
  { type: "file_upload", label: "رفع ملف", hasOptions: false, isMulti: false, isUpload: true },
  { type: "logo_upload", label: "رفع شعار", hasOptions: false, isMulti: false, isUpload: true },
  { type: "document_upload", label: "رفع مستند", hasOptions: false, isMulti: false, isUpload: true },
];

const TYPE_META_MAP: Record<DiscoveryQuestionType, QuestionTypeMeta> = QUESTION_TYPES.reduce(
  (acc, m) => {
    acc[m.type] = m;
    return acc;
  },
  {} as Record<DiscoveryQuestionType, QuestionTypeMeta>
);

export function getQuestionTypeMeta(type: DiscoveryQuestionType): QuestionTypeMeta {
  return TYPE_META_MAP[type] ?? TYPE_META_MAP.short_text;
}

export function questionTypeLabel(type: DiscoveryQuestionType): string {
  return getQuestionTypeMeta(type).label;
}

/** الامتدادات الافتراضية المسموحة لكل نوع رفع (لو الأدمن ما حددش). */
export const DEFAULT_UPLOAD_ACCEPT: Record<string, string[]> = {
  file_upload: ["pdf", "png", "jpg", "jpeg", "webp", "zip", "doc", "docx", "xls", "xlsx"],
  logo_upload: ["png", "jpg", "jpeg", "webp", "svg"],
  document_upload: ["pdf", "doc", "docx", "xls", "xlsx", "ppt", "pptx", "txt"],
};

export const DEFAULT_MAX_FILE_MB = 10;

function isUploadedFile(value: unknown): value is DiscoveryUploadedFile {
  return (
    typeof value === "object" &&
    value !== null &&
    "path" in value &&
    "name" in value &&
    typeof (value as DiscoveryUploadedFile).path === "string"
  );
}

/**
 * يحوّل قيمة إجابة (بأي نوع) إلى نص للعرض أو للـ AI. يرجّع null لو فاضية.
 */
export function formatAnswerValue(
  value: unknown,
  type: DiscoveryQuestionType
): string | null {
  if (value === undefined || value === null || value === "") return null;

  if (type === "yes_no") {
    if (value === true) return "نعم";
    if (value === false) return "لا";
    return null;
  }

  if (type === "rating") {
    const n = Number(value);
    if (!Number.isFinite(n) || n <= 0) return null;
    return `${n}/5`;
  }

  if (type === "currency") {
    const n = Number(value);
    if (!Number.isFinite(n)) {
      const s = String(value).trim();
      return s === "" ? null : s;
    }
    return n.toLocaleString("en-US");
  }

  if (getQuestionTypeMeta(type).isUpload) {
    if (Array.isArray(value)) {
      const names = value.filter(isUploadedFile).map((f) => f.name);
      return names.length ? names.join("، ") : null;
    }
    if (isUploadedFile(value)) return value.name;
    return null;
  }

  if (Array.isArray(value)) {
    const items = value.map((v) => String(v)).filter((s) => s.trim() !== "");
    return items.length ? items.join("، ") : null;
  }

  const s = String(value).trim();
  return s === "" ? null : s;
}
