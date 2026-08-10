/**
 * NEXVORA Change Impact — Material Field Detection
 * ================================================
 *
 * Pure helpers that decide whether an update to a requirement / story / AC
 * constitutes a "material change" — one that should trigger downstream
 * needs_review flags and notifications.
 *
 * A change is material when either:
 *   1. A tracked semantic field changed value, OR
 *   2. The row transitioned *out of* an approved state (approved / verified /
 *      in_progress / in_dev / done) — this signals the meaning shifted enough
 *      to un-approve it, so anything that depended on the approval must be
 *      revisited.
 */

export type ChangeImpactTable =
  | "product_requirements"
  | "user_stories"
  | "acceptance_criteria";

const MATERIAL_FIELDS: Record<ChangeImpactTable, readonly string[]> = {
  product_requirements: ["title", "description", "priority", "requirement_type", "requirementType"],
  user_stories: ["title", "as_a", "asA", "i_want", "iWant", "so_that", "soThat", "priority", "business_value", "businessValue"],
  acceptance_criteria: ["given_clause", "givenClause", "when_clause", "whenClause", "then_clause", "thenClause", "title"],
};

const APPROVED_STATUSES: Record<ChangeImpactTable, readonly string[]> = {
  product_requirements: ["approved", "in_progress", "done"],
  user_stories: ["approved", "in_dev", "done"],
  acceptance_criteria: ["approved", "verified"],
};

function shallowEqual(a: unknown, b: unknown): boolean {
  if (a === b) return true;
  if (a == null || b == null) return false;
  if (typeof a !== typeof b) return false;
  if (typeof a !== "object") return false;
  const aa = JSON.stringify(a);
  const bb = JSON.stringify(b);
  return aa === bb;
}

/**
 * Returns true when the update should be treated as a material change.
 * `before` and `after` are the raw row (either DB or camelCase — both key
 * styles are recognised).
 */
export function isMaterialChange(
  table: ChangeImpactTable,
  before: Record<string, unknown>,
  after: Record<string, unknown>,
): boolean {
  // Status transition OUT of approved-set → always material.
  const beforeStatus = String(before.status ?? "");
  const afterStatus = String(after.status ?? beforeStatus);
  const approved = APPROVED_STATUSES[table];
  if (approved.includes(beforeStatus) && !approved.includes(afterStatus)) {
    return true;
  }

  // Any tracked field changed value → material.
  for (const key of MATERIAL_FIELDS[table]) {
    if (!(key in after)) continue;
    const oldVal = before[key];
    const newVal = after[key];
    if (!shallowEqual(oldVal, newVal)) return true;
  }
  return false;
}
