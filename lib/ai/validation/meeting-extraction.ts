import type { MeetingExtraction } from "@/lib/types/database";

const EXPECTED_KEYS = ["decisions", "risks", "requests", "questions", "deadlines"] as const;

export type MeetingExtractionValidationResult =
  | { ok: true; data: MeetingExtraction }
  | { ok: false; reason: string };

/**
 * ينظّف مصفوفة إلى نصوص غير فارغة (يتجاهل القيم غير النصية والفارغة بدل
 * رفض الرد كله). يرجّع null لو القيمة نفسها مش مصفوفة.
 */
function toCleanStringArray(value: unknown): string[] | null {
  if (!Array.isArray(value)) return null;
  return value
    .filter((v): v is string => typeof v === "string")
    .map((v) => v.trim())
    .filter((v) => v.length > 0);
}

/**
 * يتحقق من رد الـ AI الخام قبل إنشاء أي Project Brain Entry.
 *
 * فلسفة مرنة (زي تحليل الاكتشاف): نتأكد إن كل مفتاح موجود يكون مصفوفة،
 * المفاتيح الغايبة تُعتبَر فاضية، وأي مفاتيح إضافية أو قيم فارغة تُتجاهل
 * بدل رفض الاستخراج كله على اختلاف تجميلي من الـ AI.
 */
export function validateMeetingExtraction(raw: string | null): MeetingExtractionValidationResult {
  if (!raw || raw.trim().length === 0) {
    return { ok: false, reason: "الرد من نموذج الذكاء الاصطناعي فارغ." };
  }

  // نظّف code fences لو المزوّد لفّ الـ JSON بها
  let text = raw.trim();
  if (text.startsWith("```")) {
    text = text.replace(/^```(?:json)?\s*/i, "").replace(/```\s*$/i, "").trim();
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(text);
  } catch {
    return { ok: false, reason: "الرد ليس JSON صالحًا." };
  }

  if (typeof parsed !== "object" || parsed === null || Array.isArray(parsed)) {
    return { ok: false, reason: "الرد ليس كائن JSON." };
  }

  const obj = parsed as Record<string, unknown>;

  const result: Record<(typeof EXPECTED_KEYS)[number], string[]> = {
    decisions: [],
    risks: [],
    requests: [],
    questions: [],
    deadlines: [],
  };

  for (const key of EXPECTED_KEYS) {
    if (obj[key] === undefined || obj[key] === null) continue; // مفتاح غايب = فاضي
    const clean = toCleanStringArray(obj[key]);
    if (clean === null) {
      return { ok: false, reason: `${key} يجب أن تكون مصفوفة.` };
    }
    result[key] = clean;
  }

  return { ok: true, data: result };
}
