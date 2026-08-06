import type { SupabaseClient } from "@supabase/supabase-js";
import { createServiceClient } from "@/lib/supabase/service";

/**
 * سير اعتماد التنظيف — القرار للمدير/الإداري. لا تعديل تلقائي: التصحيحات
 * تبقى «نسخة عمل» حتى تُعتمَد، ثم تكوّن Clean Dataset القابل للتصدير.
 */

export type DqObject = "issue" | "duplicate" | "changeset";

function tableFor(kind: DqObject): string {
  return kind === "issue" ? "data_quality_issues" : kind === "duplicate" ? "data_quality_duplicates" : "data_quality_changeset";
}

export async function decideDq(
  kind: DqObject,
  id: string,
  decision: "approved" | "rejected" | "ignored",
  actorId: string | null,
  client?: SupabaseClient
): Promise<{ ok: boolean; message?: string }> {
  const db = client ?? createServiceClient();
  // changeset لا يقبل ignored.
  const status = kind === "changeset" && decision === "ignored" ? "rejected" : decision;
  const { error } = await db.from(tableFor(kind)).update({ status, decided_by: actorId, decided_at: new Date().toISOString() }).eq("id", id);
  if (error) return { ok: false, message: error.message };
  return { ok: true };
}

/** اعتماد كل التصحيحات عالية الثقة دفعةً (لا يشمل ما دون العتبة). */
export async function approveHighConfidence(runId: string, actorId: string | null, client?: SupabaseClient): Promise<{ ok: boolean; count?: number; message?: string }> {
  const db = client ?? createServiceClient();
  const { data, error } = await db
    .from("data_quality_changeset")
    .update({ status: "approved", decided_by: actorId, decided_at: new Date().toISOString() })
    .eq("run_id", runId)
    .eq("status", "pending")
    .gte("confidence", 95)
    .select("id");
  if (error) return { ok: false, message: error.message };
  return { ok: true, count: data?.length ?? 0 };
}

/** اعتماد التشغيلة كاملة — يشترط حسم كل ما دون العتبة يدويًا. */
export async function approveRun(runId: string, actorId: string | null, client?: SupabaseClient): Promise<{ ok: boolean; message?: string }> {
  const db = client ?? createServiceClient();
  const pending = await db.from("data_quality_changeset").select("id", { count: "exact", head: true }).eq("run_id", runId).eq("status", "pending").lt("confidence", 95);
  if ((pending.count ?? 0) > 0) return { ok: false, message: `يتبقّى ${pending.count} تصحيح منخفض الثقة قيد المراجعة — احسمها أولًا.` };
  const run = await db.from("data_quality_runs").select("version").eq("id", runId).maybeSingle();
  const version = (run.data as { version: number } | null)?.version ?? 1;
  await db.from("data_quality_versions").insert({ run_id: runId, version, action: "approved", actor_id: actorId });
  return { ok: true, message: "اعتُمد التنظيف — Cleaning Blueprint أصبح المرجع الرسمي لمرحلة التحويل." };
}

/** يبني Clean Dataset المعتمَد (للتصدير) بتطبيق التصحيحات المقبولة على المحتوى الأصلي المُمرَّر. */
export async function getApprovedChangeset(runId: string, client?: SupabaseClient) {
  const db = client ?? createServiceClient();
  const { data } = await db.from("data_quality_changeset").select("object, field, row_index, old_value, new_value").eq("run_id", runId).eq("status", "approved");
  return data ?? [];
}
