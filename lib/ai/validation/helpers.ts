/**
 * مكتبة مساعدة موحّدة للتحقق من ردود AI. مبنية بأسلوب بدون تبعيات
 * خارجية (بدل Zod) عشان نحافظ على قرار المشروع الأصلي: صفر
 * dependencies إضافية. الاستخدام: كل validator موجود بيستبدل الكود
 * المكرر عنده بالدوال دي، والسلوك متطابق تمامًا مع الصياغة القديمة.
 */

export type ValidationOk<T> = { ok: true; data: T };
export type ValidationErr = { ok: false; reason: string };
export type ValidationResult<T> = ValidationOk<T> | ValidationErr;

/**
 * Parsing آمن للـ JSON مع فحص أن الناتج كائن (مش array أو primitive).
 */
export function parseJsonObject(raw: string | null | undefined): ValidationResult<Record<string, unknown>> {
  if (!raw || raw.trim().length === 0) {
    return { ok: false, reason: "الرد من نموذج الذكاء الاصطناعي فارغ." };
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(raw.trim());
  } catch {
    return { ok: false, reason: "الرد ليس JSON صالحًا." };
  }

  if (typeof parsed !== "object" || parsed === null || Array.isArray(parsed)) {
    return { ok: false, reason: "الرد ليس كائن JSON." };
  }

  return { ok: true, data: parsed as Record<string, unknown> };
}

/**
 * يتأكد من أن مجموعة المفاتيح الفعلية = المتوقعة بالضبط، بدون زيادة
 * أو نقصان. بيرجّع رسالة عربية واضحة للمفاتيح الناقصة أو الإضافية.
 */
export function ensureExactKeys(
  obj: Record<string, unknown>,
  expected: readonly string[]
): ValidationResult<null> {
  const actualKeys = Object.keys(obj);
  const missingKeys = expected.filter((k) => !actualKeys.includes(k));
  if (missingKeys.length > 0) {
    return { ok: false, reason: `مفاتيح ناقصة: ${missingKeys.join(", ")}` };
  }
  const extraKeys = actualKeys.filter((k) => !expected.includes(k));
  if (extraKeys.length > 0) {
    return { ok: false, reason: `مفاتيح إضافية غير مسموحة: ${extraKeys.join(", ")}` };
  }
  return { ok: true, data: null };
}

export function isNonEmptyString(value: unknown): value is string {
  return typeof value === "string" && value.trim().length > 0;
}

export function isNullableString(value: unknown): value is string | null {
  return value === null || typeof value === "string";
}

export function isStringArray(value: unknown): value is string[] {
  return Array.isArray(value) && value.every((v) => typeof v === "string");
}

export function isNonEmptyStringArray(value: unknown): value is string[] {
  return Array.isArray(value) && value.length > 0 && value.every((v) => isNonEmptyString(v));
}

export function isOneOf<T extends string>(value: unknown, allowed: readonly T[]): value is T {
  return typeof value === "string" && (allowed as readonly string[]).includes(value);
}
