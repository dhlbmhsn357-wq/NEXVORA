import type { SupabaseClient } from "@supabase/supabase-js";
import { createServiceClient } from "@/lib/supabase/service";
import type { SimulationReport } from "./simulation-types";

/**
 * تكامل الذاكرة المؤسسية — بعد اعتماد المدير، يحفظ دروس المحاكاة (أفضل
 * Batch Size، ترتيب الجداول، الأخطاء وحلولها) كمرشّحات خبرة (حاجز مراجعة
 * المدير) لتحسين ترحيلات المستقبل. **مشتقّات معقّمة فقط، لا بيانات خام.**
 */

export async function promoteSimulationToOrgMemory(simulationId: string, actorId: string | null, client?: SupabaseClient): Promise<{ ok: boolean; message?: string; count?: number }> {
  const db = client ?? createServiceClient();

  const sim = await db.from("migration_simulations").select("id, project_id, domain, report, approval_score, readiness_verdict").eq("id", simulationId).maybeSingle();
  if (!sim.data) return { ok: false, message: "المحاكاة غير موجودة." };
  const row = sim.data as { project_id: string | null; domain: string; report: { performance?: SimulationReport["performance"]; recommendations?: SimulationReport["recommendations"] }; approval_score: number; readiness_verdict: string };

  const perf = row.report?.performance;
  const recs = row.report?.recommendations ?? [];
  const candidates: Array<{ experience_type: string; title: string; content: string }> = [];

  if (perf?.strategy) {
    candidates.push({
      experience_type: "best_practice",
      title: `إستراتيجية دفعات مثلى — مجال ${row.domain}`,
      content: `Batch Size ${perf.strategy.batchSize}، توازي ${perf.strategy.parallelism}، طابور ${perf.strategy.queueSize}. ${perf.strategy.retryStrategy} ${perf.strategy.resumeStrategy}`,
    });
  }

  const ordering = recs.find((r) => r.category === "ordering");
  if (ordering) candidates.push({ experience_type: "reusable_checklist", title: `ترتيب ترحيل الجداول — ${row.domain}`, content: `${ordering.title}: ${ordering.detail}` });

  const dataFix = recs.filter((r) => r.category === "data_fix");
  for (const d of dataFix.slice(0, 3)) candidates.push({ experience_type: "lesson_learned", title: d.title, content: d.detail });

  if (candidates.length === 0) return { ok: true, count: 0, message: "لا دروس قابلة للترقية من هذه المحاكاة." };

  const rows = candidates.map((c) => ({
    project_id: row.project_id,
    experience_type: c.experience_type,
    domain: row.domain,
    title: c.title,
    content: c.content,
    detail: { source: "migration_simulation", approval_score: row.approval_score, verdict: row.readiness_verdict },
    sanitized: true,
    suggested_confidence: Math.min(90, row.approval_score),
    status: "pending",
  }));

  try {
    const ins = await db.from("org_experience_candidates").insert(rows);
    if (ins.error) return { ok: false, message: ins.error.message };
  } catch {
    return { ok: false, message: "تعذّر حفظ المرشّحات (جدول الذاكرة المؤسسية غير متاح)." };
  }

  await db.from("migration_simulations").update({ promoted_to_org_memory: true }).eq("id", simulationId);
  void actorId;
  return { ok: true, count: candidates.length, message: `رُقّيت ${candidates.length} خبرة كمرشّحات (بانتظار مراجعة المدير).` };
}
