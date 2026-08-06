import { normalizeForMatch } from "./fuzzy-match";
import { inferValueKind, type ValueKind } from "./validators";

/**
 * محرّك التوحيد (Normalization) — **وحدة نقية بلا I/O**.
 *
 * يوحّد صيغ القيم: أسماء، دول، هواتف (E.164-ish)، بريد، تواريخ (ISO)،
 * منطقي، حالة، مسافات. يرجّع القيمة الموحّدة **مقترَحة** — لا يعدّل الأصل.
 */

export type NormalizationKind =
  | "none" | "trim" | "title_case" | "lowercase" | "email" | "phone"
  | "date_iso" | "boolean" | "country_code" | "whitespace" | "status";

export interface NormalizationResult {
  changed: boolean;
  value: string;
  kind: NormalizationKind;
}

const COUNTRY_CODES: Record<string, string> = {
  egypt: "EG", مصر: "EG", "saudi arabia": "SA", السعودية: "SA", ksa: "SA",
  uae: "AE", الامارات: "AE", usa: "US", "united states": "US", uk: "GB",
};

function none(value: string): NormalizationResult {
  return { changed: false, value, kind: "none" };
}

/** يوحّد قيمة حسب نوعها المستنتَج من اسم الحقل. */
export function normalizeValue(fieldName: string, raw: string): NormalizationResult {
  const v = (raw ?? "").trim();
  if (v === "") return none(raw);
  const kind = inferValueKind(fieldName);
  return normalizeByKind(kind, fieldName, v);
}

export function normalizeByKind(kind: ValueKind, fieldName: string, v: string): NormalizationResult {
  switch (kind) {
    case "email": {
      const nv = v.toLowerCase().replace(/\s+/g, "");
      return nv === v ? none(v) : { changed: true, value: nv, kind: "email" };
    }
    case "phone": {
      let digits = v.replace(/[^\d+]/g, "");
      if (!digits.startsWith("+") && digits.length >= 9) digits = "+" + digits.replace(/^00/, "");
      return digits === v ? none(v) : { changed: true, value: digits, kind: "phone" };
    }
    case "country": {
      const code = COUNTRY_CODES[v.toLowerCase()];
      return code && code !== v ? { changed: true, value: code, kind: "country_code" } : none(v);
    }
    case "boolean": {
      const l = v.toLowerCase();
      const b = ["1", "yes", "y", "true", "نعم", "active"].includes(l) ? "true" : ["0", "no", "n", "false", "لا", "inactive"].includes(l) ? "false" : null;
      return b && b !== v ? { changed: true, value: b, kind: "boolean" } : none(v);
    }
    case "text": {
      // توحيد الأسماء: إزالة المسافات الزائدة + Title Case للاتيني.
      if (/(name|title|اسم)/.test(fieldName.toLowerCase())) {
        const nv = v.replace(/\s+/g, " ").trim().replace(/\b[a-z]/g, (c) => c.toUpperCase());
        return nv !== v ? { changed: true, value: nv, kind: "title_case" } : none(v);
      }
      const nv = v.replace(/\s+/g, " ").trim();
      return nv !== v ? { changed: true, value: nv, kind: "whitespace" } : none(v);
    }
    default: {
      const nv = v.replace(/\s+/g, " ").trim();
      return nv !== v ? { changed: true, value: nv, kind: "whitespace" } : none(v);
    }
  }
}

/** مفتاح توحيد للمقارنة (يُستخدم في كشف التكرار على مستوى الحقل). */
export function normalizationKey(raw: string): string {
  return normalizeForMatch(raw);
}
