/**
 * NEXVORA Auto Code Generation Service
 * ====================================
 * Race-safe generation of REQ-###, US-###, AC-###, SC-### codes per project.
 *
 * Strategy: SELECT MAX(code) + retry on unique_violation (23505). The DB
 * UNIQUE(project_id, code) constraint (migration 0109) is the authority —
 * even if two racing writers pick the same code, one insert fails and the
 * caller retries with the next available number.
 */
import type { SupabaseClient } from "@supabase/supabase-js";

export type CodedTable =
  | "product_requirements"
  | "user_stories"
  | "acceptance_criteria"
  | "evaluation_scenarios";

const PREFIX: Record<CodedTable, string> = {
  product_requirements: "REQ",
  user_stories: "US",
  acceptance_criteria: "AC",
  evaluation_scenarios: "SC",
};

/**
 * Compute the next code for a (project, table) pair by scanning the highest
 * numeric suffix currently in use. Not race-safe on its own — pair with
 * generateAndInsertWithRetry.
 */
export async function nextCode(
  // Using minimal shape so both server + service clients (and tests) work.
  supabase: Pick<SupabaseClient, "from">,
  table: CodedTable,
  projectId: string,
): Promise<string> {
  const prefix = PREFIX[table];
  const { data, error } = await supabase
    .from(table)
    .select("code")
    .eq("project_id", projectId)
    .not("code", "is", null)
    .order("code", { ascending: false })
    .limit(50);
  if (error) throw error;
  let maxNum = 0;
  for (const row of (data ?? []) as Array<{ code: string | null }>) {
    const code = row.code;
    if (!code || !code.startsWith(`${prefix}-`)) continue;
    const n = parseInt(code.slice(prefix.length + 1), 10);
    if (Number.isFinite(n) && n > maxNum) maxNum = n;
  }
  return `${prefix}-${String(maxNum + 1).padStart(3, "0")}`;
}

/**
 * Insert a row with an auto-generated code, retrying on unique_violation up
 * to `maxRetries` times to survive concurrent inserts.
 *
 * `buildRow(code)` returns the exact insert payload; the caller controls
 * every column except the auto-generated `code`.
 */
export async function generateAndInsertWithRetry<T = unknown>(
  supabase: Pick<SupabaseClient, "from">,
  table: CodedTable,
  projectId: string,
  buildRow: (code: string) => Record<string, unknown>,
  maxRetries = 5,
): Promise<T> {
  let lastError: unknown = null;
  for (let attempt = 0; attempt < maxRetries; attempt++) {
    const code = await nextCode(supabase, table, projectId);
    const { data, error } = await supabase
      .from(table)
      .insert(buildRow(code))
      .select("*")
      .single();
    if (!error) return data as T;
    lastError = error;
    // Postgres unique_violation → try again with next number.
    const pgCode = (error as { code?: string }).code;
    if (pgCode === "23505" && attempt < maxRetries - 1) continue;
    throw error;
  }
  throw lastError instanceof Error
    ? lastError
    : new Error("generateAndInsertWithRetry: exhausted retries");
}
