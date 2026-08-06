import type { SupabaseClient } from "@supabase/supabase-js";
import { createServiceClient } from "@/lib/supabase/service";
import { buildClosure } from "./closure";
import { notifyHypercare } from "./notify";

/**
 * إغلاق المشروع (Project Closure) — بعد انتهاء Hypercare يُبنى تقرير إغلاق
 * شامل + رضا العميل. لا يُغلَق قبل حلّ الحوادث الحرجة المفتوحة. يُرقّي ملخّص
 * الخبرة للذاكرة المؤسسية (حاجز مراجعة المدير).
 */

export async function closeHypercare(periodId: string, satisfactionScore: number, actorId: string | null, client?: SupabaseClient): Promise<{ ok: boolean; message?: string; blockers?: string[] }> {
  const db = client ?? createServiceClient();
  const p = await db.from("hypercare_periods").select("verification_id, project_id, duration_days, total_incidents, resolved_incidents, optimizations_applied, knowledge_added, overall_health_score, status, started_at").eq("id", periodId).maybeSingle();
  const period = p.data as { verification_id: string | null; project_id: string | null; duration_days: number; total_incidents: number; resolved_incidents: number; optimizations_applied: number; knowledge_added: number; overall_health_score: number; status: string } | null;
  if (!period) return { ok: false, message: "الفترة غير موجودة." };
  if (period.status === "closed") return { ok: false, message: "الفترة مغلقة بالفعل." };

  const criticalOpen = await db.from("hypercare_incidents").select("id").eq("period_id", periodId).eq("severity", "critical").in("status", ["open", "investigating"]);
  const criticalCount = ((criticalOpen.data ?? []) as unknown[]).length;

  const [ver, proj] = await Promise.all([
    period.verification_id ? db.from("go_live_verifications").select("final_score").eq("id", period.verification_id).maybeSingle() : Promise.resolve({ data: null }),
    period.project_id ? db.from("projects").select("name").eq("id", period.project_id).maybeSingle() : Promise.resolve({ data: null }),
  ]);
  const goLiveScore = (ver.data as { final_score: number } | null)?.final_score ?? 0;
  const projectName = (proj.data as { name: string } | null)?.name ?? "مشروع الترحيل";
  const satisfaction = Math.max(0, Math.min(100, Math.round(satisfactionScore)));

  const report = buildClosure({
    projectName, hypercareDays: period.duration_days, totalIncidents: period.total_incidents, resolvedIncidents: period.resolved_incidents,
    optimizationsApplied: period.optimizations_applied, knowledgeAdded: period.knowledge_added, finalHealthScore: period.overall_health_score,
    goLiveScore, satisfactionScore: satisfaction,
  }, criticalCount);

  if (!report.closed) return { ok: false, message: "لا يُغلَق قبل حلّ الحوادث الحرجة المفتوحة.", blockers: report.highlights.filter((h) => h.includes("حرجة")) };

  await db.from("hypercare_periods").update({ status: "closed", closure_report: report, satisfaction_score: satisfaction, closed_at: new Date().toISOString() }).eq("id", periodId);

  // ملخّص خبرة المشروع → مرشّح ذاكرة مؤسسية.
  try {
    await db.from("org_experience_candidates").insert({
      project_id: period.project_id, experience_type: "best_practice", domain: "general",
      title: `خلاصة مشروع ترحيل ناجح — ${projectName}`,
      content: `${report.migrationSummary} ${report.hypercareSummary} الصحة النهائية ${report.finalHealthScore}/100، رضا العميل ${satisfaction}/100.`,
      detail: { source: "hypercare_closure", period_id: periodId }, sanitized: true, suggested_confidence: 85, status: "pending",
    });
    await db.from("hypercare_periods").update({ promoted_to_org_memory: true }).eq("id", periodId);
  } catch { /* اختياري */ }

  await notifyHypercare("hypercare_closed", periodId, `أُغلق المشروع: صحة ${report.finalHealthScore}/100، رضا ${satisfaction}/100.`, period.project_id);
  void actorId;
  return { ok: true, message: `أُغلق المشروع بنجاح — الصحة النهائية ${report.finalHealthScore}/100.` };
}
