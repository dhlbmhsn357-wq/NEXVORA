import type { SupabaseClient } from "@supabase/supabase-js";
import { createServiceClient } from "@/lib/supabase/service";
import { buildSimulationPlan } from "./plan-builder";
import { runSimulationReport } from "./simulation-report";
import { enrichSimulationWithAi } from "./ai-validation-service";
import type { SimulationReport } from "./simulation-types";

/**
 * خدمة محاكاة الترحيل — تبني خطة من المراحل ١-٤، تشغّل التقرير الحتمي
 * الكامل (Digital Twin replay + كل المتحقّقات)، تُثريه بالذكاء الاصطناعي،
 * وتحفظ **المشتقّات فقط** (لا صفوف خام). **لا كتابة على Production.**
 */

const UNDEFINED_TABLE = "42P01";

export interface StartOutcome {
  ok: boolean;
  simulationId?: string;
  message?: string;
}

/** ينشئ صفّ محاكاة (running) فورًا كي تعرضه اللوحة، ويعيد معرّفه. */
export async function startSimulation(sourceId: string, actorId: string | null, client?: SupabaseClient): Promise<StartOutcome> {
  const db = client ?? createServiceClient();

  const src = await db.from("migration_sources").select("project_id").eq("id", sourceId).maybeSingle();
  const projectId = (src.data as { project_id: string | null } | null)?.project_id ?? null;

  const pipe = await db.from("transformation_pipelines").select("id, status").eq("source_id", sourceId).order("version", { ascending: false }).limit(1).maybeSingle();
  const pipeline = pipe.data as { id: string; status: string } | null;
  if (!pipeline) return { ok: false, message: "لا يوجد محرّك تحويل لهذا المصدر — ابنِه واعتمده في المرحلة ٤ أولًا." };
  if (pipeline.status !== "approved") return { ok: false, message: "محرّك التحويل غير معتمَد — اعتمده في المرحلة ٤ قبل المحاكاة." };

  const last = await db.from("migration_simulations").select("version").eq("source_id", sourceId).order("version", { ascending: false }).limit(1).maybeSingle();
  const version = ((last.data as { version: number } | null)?.version ?? 0) + 1;

  const ins = await db
    .from("migration_simulations")
    .insert({ source_id: sourceId, pipeline_id: pipeline.id, project_id: projectId, status: "running", version, created_by: actorId })
    .select("id")
    .maybeSingle();
  if (ins.error || !ins.data) {
    if (ins.error && ins.error.code === UNDEFINED_TABLE) return { ok: false, message: "جداول المرحلة ٥ غير مطبَّقة (طبّق ترحيل 0087)." };
    return { ok: false, message: ins.error?.message ?? "فشل إنشاء المحاكاة." };
  }
  return { ok: true, simulationId: (ins.data as { id: string }).id };
}

/** ينفّذ المحاكاة الكاملة على صفّ موجود ويحدّثه بالنتائج (خلفية). */
export async function runSimulation(simulationId: string, sourceId: string, content: string, sourceType: string, actorId: string | null, client?: SupabaseClient): Promise<void> {
  const db = client ?? createServiceClient();
  const startedAt = Date.now();

  try {
    const planRes = await buildSimulationPlan(sourceId, content, sourceType, db);
    if (!planRes.ok || !planRes.plan) {
      await fail(db, simulationId, planRes.message ?? "تعذّر بناء خطة المحاكاة.");
      return;
    }

    const report: SimulationReport = runSimulationReport(planRes.plan);

    // إثراء الذكاء الاصطناعي (استشاري، مستند للتقرير، best-effort).
    const ai = await enrichSimulationWithAi(report, planRes.plan.domain, planRes.plan.entities.length, actorId, planRes.plan.entities.map((e) => e.entity), db);

    const s = report.summary;
    await db
      .from("migration_simulations")
      .update({
        status: "completed",
        domain: planRes.plan.domain,
        total_source_rows: s.totalSourceRows,
        total_target_rows: s.totalTargetRows,
        migrated: s.outcomes.migrated,
        skipped: s.outcomes.skipped,
        archived_rows: s.outcomes.archived,
        failed_rows: s.outcomes.failed,
        data_loss_count: s.dataLossCount,
        broken_relations: s.brokenRelations,
        business_failures: s.businessFailures,
        critical_issues: s.criticalIssues,
        approval_score: report.approval.score,
        readiness_verdict: report.approval.verdict,
        risk_level: report.risk.level,
        blocked: report.approval.blocked,
        blockers: report.approval.blockers,
        report: { ...report, ai },
        ai_summary: ai?.executive_summary ?? "",
        recommendations: report.recommendations.map((r) => r.title),
        duration_ms: Date.now() - startedAt,
      })
      .eq("id", simulationId);

    // خطوات إعادة التنفيذ.
    const stepRows = report.steps.map((st) => ({
      simulation_id: simulationId, step_order: st.order, stage: st.stage, name: st.name,
      status: st.status, processed: st.processed, failed: st.failed, estimated_ms: st.estimatedMs, detail: st.detail, errors: st.errors,
    }));
    if (stepRows.length) await db.from("migration_simulation_steps").insert(stepRows);

    // كتالوج المشاكل (مشتقّات + عيّنات مقصوصة).
    const issueRows = report.issues.slice(0, 500).map((i) => ({
      simulation_id: simulationId, entity: i.entity, category: i.category, issue_type: i.issueType, field: i.field,
      severity: i.severity, count: i.count, message: i.message, rule_id: i.ruleId ?? null, samples: i.samples,
    }));
    for (let k = 0; k < issueRows.length; k += 500) await db.from("migration_simulation_issues").insert(issueRows.slice(k, k + 500));

    // التقارير المنفصلة (٨ + استشاري).
    const reportRows: Array<{ simulation_id: string; report_type: string; content: unknown }> = [
      { simulation_id: simulationId, report_type: "summary", content: report.summary },
      { simulation_id: simulationId, report_type: "difference", content: report.difference },
      { simulation_id: simulationId, report_type: "relationships", content: report.relationships },
      { simulation_id: simulationId, report_type: "business", content: report.business },
      { simulation_id: simulationId, report_type: "risk", content: report.risk },
      { simulation_id: simulationId, report_type: "performance", content: report.performance },
      { simulation_id: simulationId, report_type: "failure", content: report.failure },
      { simulation_id: simulationId, report_type: "rollback", content: report.rollback },
      { simulation_id: simulationId, report_type: "recommendations", content: report.recommendations },
    ];
    if (ai) reportRows.push({ simulation_id: simulationId, report_type: "validation", content: ai });
    await db.from("migration_simulation_reports").insert(reportRows);
  } catch (err) {
    await fail(db, simulationId, `خطأ غير متوقّع أثناء المحاكاة: ${(err as Error).message}`);
  }
}

async function fail(db: SupabaseClient, simulationId: string, message: string): Promise<void> {
  await db.from("migration_simulations").update({ status: "failed", error: message }).eq("id", simulationId);
}

/** تفاصيل محاكاة كاملة للعرض (الصفّ + الخطوات + المشاكل + التقارير). */
export async function getSimulationDetail(simulationId: string, client?: SupabaseClient) {
  const db = client ?? createServiceClient();
  const [sim, steps, issues, reports] = await Promise.all([
    db.from("migration_simulations").select("*").eq("id", simulationId).maybeSingle(),
    db.from("migration_simulation_steps").select("*").eq("simulation_id", simulationId).order("step_order", { ascending: true }),
    db.from("migration_simulation_issues").select("*").eq("simulation_id", simulationId).order("severity", { ascending: true }),
    db.from("migration_simulation_reports").select("report_type, content").eq("simulation_id", simulationId),
  ]);
  if (!sim.data) return null;
  return { simulation: sim.data, steps: steps.data ?? [], issues: issues.data ?? [], reports: reports.data ?? [] };
}
