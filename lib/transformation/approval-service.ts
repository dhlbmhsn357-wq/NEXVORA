import type { SupabaseClient } from "@supabase/supabase-js";
import { createServiceClient } from "@/lib/supabase/service";

/**
 * سير اعتماد قواعد التحويل — القرار للمدير/الإداري. Approve/Reject/Edit/
 * Disable + اعتماد الـPipeline كاملًا + إصدار للتاريخ والتراجع.
 */

export type RuleObject = "rule" | "business_rule";

function tableFor(kind: RuleObject): string {
  return kind === "rule" ? "transformation_rules" : "transformation_business_rules";
}

export async function decideRule(
  kind: RuleObject,
  id: string,
  decision: "approved" | "rejected" | "disabled",
  actorId: string | null,
  client?: SupabaseClient
): Promise<{ ok: boolean; message?: string }> {
  const db = client ?? createServiceClient();
  const patch: Record<string, unknown> = { status: decision, decided_by: actorId, decided_at: new Date().toISOString() };
  if (decision === "disabled") patch.enabled = false;
  if (decision === "approved") patch.enabled = true;
  const { error } = await db.from(tableFor(kind)).update(patch).eq("id", id);
  if (error) return { ok: false, message: error.message };
  return { ok: true };
}

/** تعديل يدوي لقاعدة (kind/config/condition). */
export async function editRule(
  id: string,
  patch: { kind?: string; config?: Record<string, unknown>; condition?: unknown },
  actorId: string | null,
  client?: SupabaseClient
): Promise<{ ok: boolean; message?: string }> {
  const db = client ?? createServiceClient();
  const update: Record<string, unknown> = { status: "approved", source: "manual", decided_by: actorId, decided_at: new Date().toISOString() };
  if (patch.kind) update.kind = patch.kind;
  if (patch.config) update.config = patch.config;
  if (patch.condition !== undefined) update.condition = patch.condition;
  const { error } = await db.from("transformation_rules").update(update).eq("id", id);
  if (error) return { ok: false, message: error.message };
  return { ok: true };
}

export async function approvePipeline(pipelineId: string, actorId: string | null, client?: SupabaseClient): Promise<{ ok: boolean; message?: string }> {
  const db = client ?? createServiceClient();
  const pending = await db.from("transformation_rules").select("id", { count: "exact", head: true }).eq("pipeline_id", pipelineId).eq("status", "pending").eq("enabled", true);
  if ((pending.count ?? 0) > 0) return { ok: false, message: `يتبقّى ${pending.count} قاعدة قيد المراجعة — احسمها أولًا.` };
  const pipe = await db.from("transformation_pipelines").select("version").eq("id", pipelineId).maybeSingle();
  const version = (pipe.data as { version: number } | null)?.version ?? 1;
  const { error } = await db.from("transformation_pipelines").update({ status: "approved" }).eq("id", pipelineId);
  if (error) return { ok: false, message: error.message };
  await db.from("transformation_rule_versions").insert({ pipeline_id: pipelineId, version, action: "approved", actor_id: actorId });
  return { ok: true, message: "اعتُمد المحرّك — جاهز لمرحلة المحاكاة (Phase 5)." };
}

export async function getPipelineHistory(pipelineId: string, client?: SupabaseClient) {
  const db = client ?? createServiceClient();
  const { data } = await db.from("transformation_rule_versions").select("*").eq("pipeline_id", pipelineId).order("created_at", { ascending: false });
  return data ?? [];
}
