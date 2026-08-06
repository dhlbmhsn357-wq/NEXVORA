/**
 * مُتحقّقات القيم — **وحدة نقية بلا I/O**.
 *
 * لكل نوع قيمة: يتحقّق من الصلاحية، ويعرض سبب الخطأ وطريقة التصحيح
 * المقترَحة (بلا تنفيذ). يُستخدم في كشف البيانات غير الصالحة.
 */

export type ValueKind = "email" | "phone" | "date" | "currency" | "country" | "code" | "number" | "percentage" | "boolean" | "enum" | "text";

export interface ValidationResult {
  valid: boolean;
  reason?: string;
  /** تصحيح مقترَح (لا يُطبَّق تلقائيًا). */
  suggestion?: string;
}

const OK: ValidationResult = { valid: true };

const EMAIL_RE = /^[^@\s]+@[^@\s]+\.[^@\s]{2,}$/;
const ISO_DATE_RE = /^\d{4}-\d{2}-\d{2}([ t]\d{2}:\d{2}(:\d{2})?)?$/i;

const BOOLEAN_TRUE = new Set(["true", "1", "yes", "y", "نعم", "صح", "active", "مفعل"]);
const BOOLEAN_FALSE = new Set(["false", "0", "no", "n", "لا", "خطأ", "inactive", "معطل"]);

/** أشهر رموز/أسماء الدول — عيّنة موسَّعة (للتحقّق والتوحيد). */
const COUNTRY_ALIASES: Record<string, string> = {
  egypt: "EG", مصر: "EG", eg: "EG",
  "saudi arabia": "SA", السعودية: "SA", ksa: "SA", sa: "SA",
  uae: "AE", الامارات: "AE", emirates: "AE", ae: "AE",
  usa: "US", "united states": "US", us: "US", america: "US",
  uk: "GB", "united kingdom": "GB", gb: "GB", britain: "GB",
};

export function validateValue(kind: ValueKind, raw: string, enumValues?: string[]): ValidationResult {
  const v = (raw ?? "").trim();
  if (v === "") return OK; // الفراغ يُعالَج في «القيم الناقصة» لا هنا.

  switch (kind) {
    case "email":
      return EMAIL_RE.test(v) ? OK : { valid: false, reason: "صيغة بريد غير صحيحة", suggestion: v.includes("@") ? v.toLowerCase().trim() : undefined };

    case "phone": {
      const digits = v.replace(/[^\d+]/g, "");
      const count = digits.replace(/\D/g, "").length;
      if (count < 7 || count > 15) return { valid: false, reason: "عدد أرقام الهاتف غير منطقي", suggestion: undefined };
      return OK;
    }

    case "date": {
      if (ISO_DATE_RE.test(v)) return OK;
      const d = tryParseDate(v);
      return d ? { valid: false, reason: "تاريخ بصيغة غير قياسية", suggestion: d } : { valid: false, reason: "تاريخ غير صالح" };
    }

    case "number":
      return /^-?\d+(\.\d+)?$/.test(v.replace(/,/g, "")) ? OK : { valid: false, reason: "قيمة ليست رقمًا", suggestion: v.replace(/[^\d.-]/g, "") || undefined };

    case "currency": {
      const num = v.replace(/[^\d.-]/g, "");
      return /^-?\d+(\.\d+)?$/.test(num) ? OK : { valid: false, reason: "قيمة عملة غير صالحة", suggestion: num || undefined };
    }

    case "percentage": {
      const num = parseFloat(v.replace("%", ""));
      if (Number.isNaN(num)) return { valid: false, reason: "نسبة غير صالحة" };
      return num >= 0 && num <= 100 ? OK : { valid: false, reason: "نسبة خارج النطاق ٠-١٠٠" };
    }

    case "boolean": {
      const l = v.toLowerCase();
      return BOOLEAN_TRUE.has(l) || BOOLEAN_FALSE.has(l) ? OK : { valid: false, reason: "قيمة منطقية غير معروفة", suggestion: undefined };
    }

    case "country": {
      const l = v.toLowerCase();
      if (l.length === 2 && /^[a-z]{2}$/.test(l)) return OK;
      const code = COUNTRY_ALIASES[l];
      return code ? { valid: false, reason: "اسم دولة غير موحّد", suggestion: code } : { valid: false, reason: "دولة غير معروفة" };
    }

    case "enum": {
      if (!enumValues || enumValues.length === 0) return OK;
      if (enumValues.includes(v)) return OK;
      const match = enumValues.find((e) => e.toLowerCase() === v.toLowerCase());
      return match ? { valid: false, reason: "قيمة تعداد باختلاف حالة", suggestion: match } : { valid: false, reason: `قيمة خارج التعداد المسموح (${enumValues.join("، ")})` };
    }

    case "code":
    case "text":
    default:
      return OK;
  }
}

/** يستنتج نوع القيمة من اسم الحقل (heuristic). */
export function inferValueKind(fieldName: string): ValueKind {
  const n = fieldName.toLowerCase();
  if (/(email|mail|بريد)/.test(n)) return "email";
  if (/(phone|mobile|tel|هاتف|جوال)/.test(n)) return "phone";
  if (/(date|_at$|_on$|تاريخ)/.test(n)) return "date";
  if (/(price|amount|total|cost|salary|balance|سعر|مبلغ|راتب)/.test(n)) return "currency";
  if (/(country|دولة|بلد)/.test(n)) return "country";
  if (/(percent|نسبة|rate)/.test(n)) return "percentage";
  if (/(is_|active|enabled|منطقي|نشط)/.test(n)) return "boolean";
  if (/(status|state|type|حالة|نوع)/.test(n)) return "enum";
  if (/(qty|quantity|count|number|age|كمية|عدد)/.test(n)) return "number";
  return "text";
}

function tryParseDate(v: string): string | null {
  // dd/mm/yyyy أو dd-mm-yyyy أو mm/dd/yyyy — نحاول تطبيعها لـISO.
  const m = /^(\d{1,4})[/\-.](\d{1,2})[/\-.](\d{1,4})$/.exec(v.trim());
  if (!m) return null;
  const [, a, b, c] = m;
  // لو الأول ٤ أرقام فهو السنة.
  if (a.length === 4) return `${a}-${b.padStart(2, "0")}-${c.padStart(2, "0")}`;
  if (c.length === 4) {
    const day = a.padStart(2, "0");
    const mon = b.padStart(2, "0");
    return `${c}-${mon}-${day}`;
  }
  return null;
}
