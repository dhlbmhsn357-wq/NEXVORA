import type { SupabaseClient } from "@supabase/supabase-js";
import { createServiceClient } from "@/lib/supabase/service";

/** لوحة مركز المحاكاة — تجميع للعرض. رشيقة: أي جدول مفقود = قيم صفرية. */

export interface SimSource {
  id: string;
  name: string;
  source_type: string;
  pipeline_approved: boolean;
}

export interface SimRow {
  id: string;
  source_id: string | null;
  version: number;
  status: string;
  approval_score: number;
  readiness_verdict: string;
  risk_level: string;
  blocked: boolean;
  total_source_rows: number;
  total_target_rows: number;
  data_loss_count: number;
  broken_relations: number;
  business_failures: number;
  created_at: string;
}

export interface SimDashboard {
  sources: SimSource[];
  simulations: SimRow[];
  totals: { runs: number; approved: number; blocked: number; avgScore: number; ready: number };
}

export async function getSimDashboard(projectId: string | null, client?: SupabaseClient): Promise<SimDashboard> {
  const db = client ?? createServiceClient();

  // المصادر المؤهَّلة: لديها محرّك تحويل معتمَد (المرحلة ٤).
  const sources: SimSource[] = [];
  try {
    let sq = db.from("migration_sources").select("id, name, source_type").eq("status", "analyzed").order("created_at", { ascending: false });
    if (projectId) sq = sq.eq("project_id", projectId);
    const { data: srcData } = await sq;
    const srcs = (srcData ?? []) as Array<{ id: string; name: string; source_type: string }>;

    if (srcs.length) {
      const ids = srcs.map((s) => s.id);
      const { data: pipes } = await db.from("transformation_pipelines").select("source_id, status").in("source_id", ids).eq("status", "approved");
      const approved = new Set(((pipes ?? []) as Array<{ source_id: string }>).map((p) => p.source_id));
      for (const s of srcs) sources.push({ ...s, pipeline_approved: approved.has(s.id) });
    }
  } catch {
    /* غير مطبَّق */
  }

  let simulations: SimRow[] = [];
  try {
    let q = db
      .from("migration_simulations")
      .select("id, source_id, version, status, approval_score, readiness_verdict, risk_level, blocked, total_source_rows, total_target_rows, data_loss_count, broken_relations, business_failures, created_at")
      .order("created_at", { ascending: false })
      .limit(50);
    if (projectId) q = q.eq("project_id", projectId);
    const { data } = await q;
    if (data) simulations = data as SimRow[];
  } catch {
    /* غير مطبَّق */
  }

  const completed = simulations.filter((s) => s.status === "completed" || s.status === "approved" || s.status === "rejected");
  const approved = simulations.filter((s) => s.status === "approved").length;
  const blocked = simulations.filter((s) => s.blocked).length;
  const ready = simulations.filter((s) => s.readiness_verdict === "ready" && !s.blocked).length;
  const avgScore = completed.length ? Math.round(completed.reduce((sum, s) => sum + s.approval_score, 0) / completed.length) : 0;

  return {
    sources,
    simulations,
    totals: { runs: simulations.length, approved, blocked, avgScore, ready },
  };
}
