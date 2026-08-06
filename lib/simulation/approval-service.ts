import type { SupabaseClient } from "@supabase/supabase-js";
import { createServiceClient } from "@/lib/supabase/service";
import { promoteSimulationToOrgMemory } from "./org-memory-integration";

/**
 * سير اعتماد المحاكاة (Human Approval Workflow) — Director/Admin فقط.
 * **قاعدة صارمة:** المحاكاة المحظورة (blocked=true بقواعد المنع) لا يمكن
 * اعتمادها إطلاقًا — الترحيل الحقيقي ممنوع حتى تُحلّ الأخطاء الحرجة.
 * الاعتماد يُرقّي الدروس للذاكرة المؤسسية تلقائيًا.
 */

export async function approveSimulation(simulationId: string, actorId: string | null, client?: SupabaseClient): Promise<{ ok: boolean; message?: string }> {
  const db = client ?? createServiceClient();
  const sim = await db.from("migration_simulations").select("status, blocked, blockers").eq("id", simulationId).maybeSingle();
  if (!sim.data) return { ok: false, message: "المحاكاة غير موجودة." };
  const row = sim.data as { status: string; blocked: boolean; blockers: string[] };
  if (row.status !== "completed") return { ok: false, message: "لا يمكن اعتماد محاكاة غير مكتملة." };
  if (row.blocked) return { ok: false, message: `الاعتماد محظور بقواعد المنع: ${(row.blockers ?? []).join("، ")}. عالجها وأعد المحاكاة.` };

  const upd = await db.from("migration_simulations").update({ status: "approved", approved_by: actorId, approved_at: new Date().toISOString() }).eq("id", simulationId);
  if (upd.error) return { ok: false, message: upd.error.message };

  // ترقية الدروس (best-effort — لا تفشل الاعتماد).
  try {
    await promoteSimulationToOrgMemory(simulationId, actorId, db);
  } catch {
    /* اختياري */
  }
  return { ok: true, message: "اعتُمدت المحاكاة — النظام جاهز للانتقال للترحيل الحقيقي (Phase 6)." };
}

export async function rejectSimulation(simulationId: string, reason: string, actorId: string | null, client?: SupabaseClient): Promise<{ ok: boolean; message?: string }> {
  const db = client ?? createServiceClient();
  const upd = await db.from("migration_simulations").update({ status: "rejected", decision_reason: reason || "مرفوضة", approved_by: actorId, approved_at: new Date().toISOString() }).eq("id", simulationId);
  if (upd.error) return { ok: false, message: upd.error.message };
  return { ok: true, message: "رُفضت المحاكاة." };
}

export async function archiveSimulation(simulationId: string, client?: SupabaseClient): Promise<{ ok: boolean; message?: string }> {
  const db = client ?? createServiceClient();
  const upd = await db.from("migration_simulations").update({ status: "archived" }).eq("id", simulationId);
  if (upd.error) return { ok: false, message: upd.error.message };
  return { ok: true, message: "أُرشفت المحاكاة." };
}

/** تاريخ محاكاة مصدر (كل الإصدارات). */
export async function getSimulationHistory(sourceId: string, client?: SupabaseClient) {
  const db = client ?? createServiceClient();
  const { data } = await db
    .from("migration_simulations")
    .select("id, version, status, approval_score, readiness_verdict, risk_level, blocked, created_at, approved_at")
    .eq("source_id", sourceId)
    .order("version", { ascending: false })
    .limit(30);
  return data ?? [];
}
