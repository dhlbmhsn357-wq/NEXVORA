import type { DeveloperHandoffReviewFocusPriority } from "@/lib/types/database";

const EXPECTED_KEYS = [
  "project_overview",
  "setup_steps",
  "review_focus_areas",
  "review_acceptance_criteria",
] as const;

const VALID_PRIORITIES: DeveloperHandoffReviewFocusPriority[] = ["high", "medium", "low"];

export interface DeveloperHandoffGeneratedData {
  project_overview: string;
  setup_steps: string[];
  review_focus_areas: { area: string; priority: DeveloperHandoffReviewFocusPriority; reason: string }[];
  review_acceptance_criteria: string[];
}

export type DeveloperHandoffValidationResult =
  | { ok: true; data: DeveloperHandoffGeneratedData }
  | { ok: false; reason: string };

function isNonEmptyString(value: unknown): value is string {
  return typeof value === "string" && value.trim().length > 0;
}

function isNonEmptyStringArray(value: unknown): value is string[] {
  return Array.isArray(value) && value.length > 0 && value.every((v) => isNonEmptyString(v));
}

/**
 * يتحقق من رد توليد Developer Handoff قبل أي حفظ: JSON صالح، 4 مفاتيح
 * بالضبط، وكل حقل من الشكل المتوقع بدون قيم فارغة.
 */
export function validateDeveloperHandoffGeneration(raw: string | null): DeveloperHandoffValidationResult {
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

  const missingKeys = EXPECTED_KEYS.filter((k) => !actualKeys.includes(k));
  if (missingKeys.length > 0) {
    return { ok: false, reason: `مفاتيح ناقصة: ${missingKeys.join(", ")}` };
  }

  const extraKeys = actualKeys.filter((k) => !(EXPECTED_KEYS as readonly string[]).includes(k));
  if (extraKeys.length > 0) {
    return { ok: false, reason: `مفاتيح إضافية غير مسموحة: ${extraKeys.join(", ")}` };
  }

  if (!isNonEmptyString(obj.project_overview)) {
    return { ok: false, reason: "project_overview غير صالح أو فارغ." };
  }

  if (!isNonEmptyStringArray(obj.setup_steps)) {
    return { ok: false, reason: "setup_steps يجب أن تكون مصفوفة نصوص غير فارغة." };
  }

  if (!Array.isArray(obj.review_focus_areas) || obj.review_focus_areas.length === 0) {
    return { ok: false, reason: "review_focus_areas يجب أن تكون مصفوفة غير فارغة." };
  }
  for (const item of obj.review_focus_areas) {
    if (typeof item !== "object" || item === null) {
      return { ok: false, reason: "عنصر review_focus_areas غير صالح." };
    }
    const o = item as Record<string, unknown>;
    if (!isNonEmptyString(o.area)) {
      return { ok: false, reason: "review_focus_areas: area غير صالح أو فارغ." };
    }
    if (typeof o.priority !== "string" || !VALID_PRIORITIES.includes(o.priority as DeveloperHandoffReviewFocusPriority)) {
      return { ok: false, reason: `review_focus_areas: priority غير صالحة: ${String(o.priority)}` };
    }
    if (!isNonEmptyString(o.reason)) {
      return { ok: false, reason: "review_focus_areas: reason غير صالح أو فارغ." };
    }
  }

  if (!isNonEmptyStringArray(obj.review_acceptance_criteria)) {
    return { ok: false, reason: "review_acceptance_criteria يجب أن تكون مصفوفة نصوص غير فارغة." };
  }

  return {
    ok: true,
    data: {
      project_overview: obj.project_overview as string,
      setup_steps: obj.setup_steps as string[],
      review_focus_areas: obj.review_focus_areas as DeveloperHandoffGeneratedData["review_focus_areas"],
      review_acceptance_criteria: obj.review_acceptance_criteria as string[],
    },
  };
}
