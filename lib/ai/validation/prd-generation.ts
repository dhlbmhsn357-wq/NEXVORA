import { PRD_SECTION_KEYS } from "@/lib/types/database";
import type { AcceptanceCriterion, PRDSectionKey, UserStory } from "@/lib/types/database";

export interface PRDGeneratedData {
  overview: string;
  problem_statement: string;
  goals: string[];
  out_of_scope: string[];
  target_users: string[];
  user_stories: UserStory[];
  acceptance_criteria: AcceptanceCriterion[];
  functional_requirements: string[];
  non_functional_requirements: string[];
  risks_assumptions: string[];
  success_metrics: string[];
}

export type PRDValidationResult =
  | { ok: true; data: PRDGeneratedData }
  | { ok: false; reason: string };

export type PRDSectionValidationResult =
  | { ok: true; value: unknown }
  | { ok: false; reason: string };

function isNonEmptyString(value: unknown): value is string {
  return typeof value === "string" && value.trim().length > 0;
}

function isStringArray(value: unknown): value is string[] {
  return Array.isArray(value) && value.every((v) => isNonEmptyString(v));
}

function isUserStoryArray(value: unknown): value is UserStory[] {
  return (
    Array.isArray(value) &&
    value.every((v) => {
      const o = v as Record<string, unknown>;
      return (
        typeof v === "object" &&
        v !== null &&
        isNonEmptyString(o.role) &&
        isNonEmptyString(o.want) &&
        isNonEmptyString(o.benefit)
      );
    })
  );
}

function isAcceptanceCriteriaArray(value: unknown): value is AcceptanceCriterion[] {
  return (
    Array.isArray(value) &&
    value.every((v) => {
      const o = v as Record<string, unknown>;
      return (
        typeof v === "object" &&
        v !== null &&
        isNonEmptyString(o.given) &&
        isNonEmptyString(o.when) &&
        isNonEmptyString(o.then)
      );
    })
  );
}

function validateSectionValue(key: PRDSectionKey, value: unknown): boolean {
  switch (key) {
    case "overview":
    case "problem_statement":
      return isNonEmptyString(value);
    case "user_stories":
      return isUserStoryArray(value);
    case "acceptance_criteria":
      return isAcceptanceCriteriaArray(value);
    default:
      return isStringArray(value);
  }
}

/**
 * يتحقق من رد التوليد الكامل: JSON صالح، 11 مفتاح بالضبط بنفس الترتيب
 * المطلوب (لا نقص ولا زيادة)، وكل قسم بالنوع الصحيح.
 */
export function validatePRDGeneration(raw: string | null): PRDValidationResult {
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

  const missingKeys = PRD_SECTION_KEYS.filter((k) => !actualKeys.includes(k));
  if (missingKeys.length > 0) {
    return { ok: false, reason: `أقسام ناقصة: ${missingKeys.join(", ")}` };
  }

  const extraKeys = actualKeys.filter((k) => !(PRD_SECTION_KEYS as readonly string[]).includes(k));
  if (extraKeys.length > 0) {
    return { ok: false, reason: `أقسام إضافية غير مسموحة: ${extraKeys.join(", ")}` };
  }

  for (const key of PRD_SECTION_KEYS) {
    if (!validateSectionValue(key, obj[key])) {
      return { ok: false, reason: `القسم "${key}" غير صالح أو بنوع بيانات خاطئ.` };
    }
  }

  return { ok: true, data: obj as unknown as PRDGeneratedData };
}

/**
 * يتحقق من رد إعادة توليد قسم واحد: JSON صالح، مفتاح واحد بالظبط
 * (نفس اسم القسم المطلوب)، وبنوع البيانات الصحيح لهذا القسم تحديدًا.
 */
export function validatePRDSectionRegeneration(
  raw: string | null,
  sectionKey: PRDSectionKey
): PRDSectionValidationResult {
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

  if (!validateSectionValue(sectionKey, obj[sectionKey])) {
    return { ok: false, reason: `القسم "${sectionKey}" غير صالح أو بنوع بيانات خاطئ.` };
  }

  return { ok: true, value: obj[sectionKey] };
}
