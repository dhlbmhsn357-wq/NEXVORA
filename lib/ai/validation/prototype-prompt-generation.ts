import { PROTOTYPE_PROMPT_SECTION_KEYS } from "@/lib/types/database";
import type { PrototypePromptSectionKey, PrototypePromptSections } from "@/lib/types/database";

export type PrototypePromptValidationResult =
  | { ok: true; data: PrototypePromptSections }
  | { ok: false; reason: string };

export type PrototypePromptSectionValidationResult =
  | { ok: true; value: string }
  | { ok: false; reason: string };

function isNonEmptyString(value: unknown): value is string {
  return typeof value === "string" && value.trim().length > 0;
}

/**
 * يتحقق من رد التوليد الكامل: JSON صالح، 15 مفتاح بالضبط بنفس الأسماء
 * المطلوبة (لا نقص ولا زيادة)، وكل قيمة نص غير فارغ.
 */
export function validatePrototypePromptGeneration(
  raw: string | null
): PrototypePromptValidationResult {
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

  const obj = parsed as Record<string, unknown>;
  const actualKeys = Object.keys(obj);

  const missingKeys = PROTOTYPE_PROMPT_SECTION_KEYS.filter((k) => !actualKeys.includes(k));
  if (missingKeys.length > 0) {
    return { ok: false, reason: `أقسام ناقصة: ${missingKeys.join(", ")}` };
  }

  const extraKeys = actualKeys.filter(
    (k) => !(PROTOTYPE_PROMPT_SECTION_KEYS as readonly string[]).includes(k)
  );
  if (extraKeys.length > 0) {
    return { ok: false, reason: `أقسام إضافية غير مسموحة: ${extraKeys.join(", ")}` };
  }

  for (const key of PROTOTYPE_PROMPT_SECTION_KEYS) {
    if (!isNonEmptyString(obj[key])) {
      return { ok: false, reason: `القسم "${key}" غير صالح أو فارغ.` };
    }
  }

  return { ok: true, data: obj as unknown as PrototypePromptSections };
}

/**
 * يتحقق من رد إعادة توليد قسم واحد: JSON صالح، مفتاح واحد بالظبط
 * (نفس اسم القسم المطلوب)، والقيمة نص غير فارغ.
 */
export function validatePrototypePromptSectionRegeneration(
  raw: string | null,
  sectionKey: PrototypePromptSectionKey
): PrototypePromptSectionValidationResult {
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

  const obj = parsed as Record<string, unknown>;
  const actualKeys = Object.keys(obj);

  if (actualKeys.length !== 1 || actualKeys[0] !== sectionKey) {
    return { ok: false, reason: `المتوقع مفتاح واحد بس باسم "${sectionKey}".` };
  }

  if (!isNonEmptyString(obj[sectionKey])) {
    return { ok: false, reason: `القسم "${sectionKey}" غير صالح أو فارغ.` };
  }

  return { ok: true, value: obj[sectionKey] };
}
