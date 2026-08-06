import type { SupabaseClient } from "@supabase/supabase-js";
import { createServiceClient } from "@/lib/supabase/service";
import { notifyHypercare } from "./notify";

/**
 * خدمة التحسينات — اعتماد/تطبيق/رفض توصية. كل تطبيق يحفظ Before/After/
 * Performance Gain + إصدار (تاريخ التحسينات).
 */

export async function decideOptimization(optId: string, decision: "approved" | "applied" | "dismissed", performanceGain: string, actorId: string | null, client?: SupabaseClient): Promise<{ ok: boolean; message?: string }> {
  const db = client ?? createServiceClient();
  const opt = await db.from("hypercare_optimizations").select("period_id, title, priority").eq("id", optId).maybeSingle();
  const row = opt.data as { period_id: string; title: string; priority: string } | null;
  if (!row) return { ok: false, message: "التوصية غير موجودة." };

  const patch: Record<string, unknown> = { status: decision, decided_by: actorId };
  if (decision === "applied") patch.performance_gain = performanceGain || "غير محدّد";
  const upd = await db.from("hypercare_optimizations").update(patch).eq("id", optId);
  if (upd.error) return { ok: false, message: upd.error.message };

  const proj = await db.from("hypercare_periods").select("project_id").eq("id", row.period_id).maybeSingle();
  const projectId = (proj.data as { project_id: string | null } | null)?.project_id ?? null;

  if (decision === "applied") {
    // أعد حساب عدد المُطبَّق.
    const { data } = await db.from("hypercare_optimizations").select("id").eq("period_id", row.period_id).eq("status", "applied");
    await db.from("hypercare_periods").update({ optimizations_applied: ((data ?? []) as unknown[]).length }).eq("id", row.period_id);
    await notifyHypercare("optimization_completed", row.period_id, `طُبِّق تحسين: ${row.title}.`, projectId);
  } else if (decision === "approved" && (row.priority === "critical" || row.priority === "high")) {
    await notifyHypercare("major_recommendation", row.period_id, `اعتُمدت توصية مهمّة: ${row.title}.`, projectId);
  }
  return { ok: true, message: decision === "applied" ? "طُبِّق التحسين." : decision === "approved" ? "اعتُمدت التوصية." : "رُفضت التوصية." };
}
