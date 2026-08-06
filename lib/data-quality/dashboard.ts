import type { SupabaseClient } from "@supabase/supabase-js";
import { createServiceClient } from "@/lib/supabase/service";

/**
 * لوحة جودة البيانات — تجميع للعرض. رشيقة: أي جدول مفقود = قيم صفرية.
 */

export interface DqSource {
  id: string;
  name: string;
  source_type: string;
}

export interface DqDashboard {
  sources: DqSource[];
  runs: Array<{ id: string; source_id: string | null; quality_score: number; records: number; readiness_delta: number; status: string; report: Record<string, unknown> }>;
  totals: { runs: number; avgQuality: number; totalIssues: number; pendingReviews: number; duplicateGroups: number };
}

export async function getDqDashboard(projectId: string | null, client?: SupabaseClient): Promise<DqDashboard> {
  const db = client ?? createServiceClient();

  let sources: DqSource[] = [];
  try {
    let q = db.from("migration_sources").select("id, name, source_type").in("status", ["analyzed", "connected"]).order("created_at", { ascending: false });
    if (projectId) q = q.eq("project_id", projectId);
    const { data, error } = await q;
    if (!error && data) sources = data as DqSource[];
  } catch {
    /* غير مطبَّق */
  }

  let runs: DqDashboard["runs"] = [];
  try {
    let q = db.from("data_quality_runs").select("id, source_id, quality_score, records, readiness_delta, status, report").order("created_at", { ascending: false }).limit(100);
    if (projectId) q = q.eq("project_id", projectId);
    const { data, error } = await q;
    if (!error && data) runs = data as DqDashboard["runs"];
  } catch {
    /* غير مطبَّق */
  }

  // أحدث تشغيلة لكل مصدر.
  const bySource = new Map<string, DqDashboard["runs"][number]>();
  for (const r of runs) if (r.source_id && !bySource.has(r.source_id)) bySource.set(r.source_id, r);
  const latest = [...bySource.values()];

  const avgQuality = latest.length ? Math.round(latest.reduce((s, r) => s + r.quality_score, 0) / latest.length) : 0;
  const totalIssues = latest.reduce((s, r) => s + Number((r.report as { stats?: { missing?: number; invalid?: number } })?.stats?.missing ?? 0) + Number((r.report as { stats?: { invalid?: number } })?.stats?.invalid ?? 0), 0);
  const pendingReviews = latest.reduce((s, r) => s + Number((r.report as { stats?: { reviewQueue?: number } })?.stats?.reviewQueue ?? 0), 0);
  const duplicateGroups = latest.reduce((s, r) => s + Number((r.report as { stats?: { duplicateGroups?: number } })?.stats?.duplicateGroups ?? 0), 0);

  return {
    sources,
    runs: latest,
    totals: { runs: latest.length, avgQuality, totalIssues, pendingReviews, duplicateGroups },
  };
}
