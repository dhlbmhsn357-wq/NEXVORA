import type {
  AcceptanceCriterionReview,
  EvidenceRef,
  GapReport,
  ImplementationStatus,
  UserStoryReview,
} from "@/lib/types/database";

const EXPECTED_KEYS = [
  "user_stories",
  "acceptance_criteria_results",
  "missing_features",
  "scope_creep",
  "non_functional_gaps",
  "unresolved_risks",
  "recommendation_summary",
] as const;

const VALID_STATUSES: ImplementationStatus[] = [
  "implemented",
  "partially_implemented",
  "implemented_differently",
  "not_implemented",
];

export type PrototypeReviewValidationResult =
  | { ok: true; data: GapReport }
  | { ok: false; reason: string };

function isNonEmptyString(value: unknown): value is string {
  return typeof value === "string" && value.trim().length > 0;
}

function isStringArray(value: unknown): value is string[] {
  return Array.isArray(value) && value.every((v) => typeof v === "string");
}

function isEvidenceArray(value: unknown): value is EvidenceRef[] {
  return (
    Array.isArray(value) &&
    value.length > 0 &&
    value.every((v) => {
      const o = v as Record<string, unknown>;
      return typeof v === "object" && v !== null && isNonEmptyString(o.file);
    })
  );
}

/**
 * يتحقق من عنصر واحد (User Story أو Acceptance Criterion): status
 * صالحة، evidence إلزامي وغير فارغ لأي حالة "تنفيذ"، وnull فقط لو
 * not_implemented — تطبيقًا لـ Evidence Rules.
 */
function validateReviewItem(item: unknown): { valid: boolean; reason?: string } {
  if (typeof item !== "object" || item === null) {
    return { valid: false, reason: "عنصر غير صالح." };
  }
  const o = item as Record<string, unknown>;

  if (!isNonEmptyString(o.story) && !isNonEmptyString(o.criterion)) {
    return { valid: false, reason: "عنصر بدون نص Story/Criterion." };
  }
  if (typeof o.status !== "string" || !VALID_STATUSES.includes(o.status as ImplementationStatus)) {
    return { valid: false, reason: `status غير صالحة: ${String(o.status)}` };
  }

  const status = o.status as ImplementationStatus;

  if (status === "not_implemented") {
    if (o.evidence !== null) {
      return { valid: false, reason: "not_implemented لازم يكون evidence فيها null." };
    }
  } else {
    if (!isEvidenceArray(o.evidence)) {
      return { valid: false, reason: `evidence إلزامي وغير فارغ لحالة "${status}".` };
    }
  }

  if (o.gap !== null && !isNonEmptyString(o.gap)) {
    return { valid: false, reason: "gap لازم يكون نص غير فارغ أو null." };
  }

  return { valid: true };
}

/**
 * يتحقق من رد المراجعة الكامل قبل أي حفظ: JSON صالح، 7 مفاتيح
 * بالضبط، وكل عنصر User Story/Acceptance Criterion يطابق Evidence Rules.
 */
export function validatePrototypeReview(raw: string | null): PrototypeReviewValidationResult {
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

  if (!Array.isArray(obj.user_stories) || obj.user_stories.length === 0) {
    return { ok: false, reason: "user_stories يجب أن تكون مصفوفة غير فارغة." };
  }
  for (const item of obj.user_stories) {
    const check = validateReviewItem(item);
    if (!check.valid) return { ok: false, reason: `user_stories: ${check.reason}` };
  }

  if (!Array.isArray(obj.acceptance_criteria_results) || obj.acceptance_criteria_results.length === 0) {
    return { ok: false, reason: "acceptance_criteria_results يجب أن تكون مصفوفة غير فارغة." };
  }
  for (const item of obj.acceptance_criteria_results) {
    const check = validateReviewItem(item);
    if (!check.valid) return { ok: false, reason: `acceptance_criteria_results: ${check.reason}` };
  }

  if (!isStringArray(obj.missing_features)) {
    return { ok: false, reason: "missing_features يجب أن تكون مصفوفة نصوص." };
  }
  if (!isStringArray(obj.scope_creep)) {
    return { ok: false, reason: "scope_creep يجب أن تكون مصفوفة نصوص." };
  }
  if (!isStringArray(obj.non_functional_gaps)) {
    return { ok: false, reason: "non_functional_gaps يجب أن تكون مصفوفة نصوص." };
  }
  if (!isStringArray(obj.unresolved_risks)) {
    return { ok: false, reason: "unresolved_risks يجب أن تكون مصفوفة نصوص." };
  }
  if (!isNonEmptyString(obj.recommendation_summary)) {
    return { ok: false, reason: "recommendation_summary غير صالح أو فارغ." };
  }

  const userStories = (obj.user_stories as Record<string, unknown>[]).map(
    (s): UserStoryReview => ({
      story: s.story as string,
      ai_status: s.status as ImplementationStatus,
      ai_evidence: (s.evidence as EvidenceRef[] | null) ?? null,
      ai_gap: (s.gap as string | null) ?? null,
      pm_override: null,
    })
  );

  const acceptanceCriteriaResults = (obj.acceptance_criteria_results as Record<string, unknown>[]).map(
    (c): AcceptanceCriterionReview => ({
      criterion: c.criterion as string,
      ai_status: c.status as ImplementationStatus,
      ai_evidence: (c.evidence as EvidenceRef[] | null) ?? null,
      ai_gap: (c.gap as string | null) ?? null,
      pm_override: null,
    })
  );

  return {
    ok: true,
    data: {
      user_stories: userStories,
      acceptance_criteria_results: acceptanceCriteriaResults,
      missing_features: obj.missing_features as string[],
      scope_creep: obj.scope_creep as string[],
      non_functional_gaps: obj.non_functional_gaps as string[],
      unresolved_risks: obj.unresolved_risks as string[],
      recommendation_summary: obj.recommendation_summary as string,
    },
  };
}
