import type { SupabaseClient } from "@supabase/supabase-js";
import { createServiceClient } from "@/lib/supabase/service";

/** لوحة محرّك التحويل — تجميع للعرض. رشيقة: أي جدول مفقود = قيم صفرية. */

export interface TrSource {
  id: string;
  name: string;
  source_type: string;
}

export interface TrDashboard {
  sources: TrSource[];
  pipelines: Array<{ id: string; source_id: string | null; status: string; confidence_avg: number; coverage: number; complexity: string; report: Record<string, unknown> }>;
  totals: { pipelines: number; approved: number; totalRules: number; reviewQueue: number; avgConfidence: number; avgCoverage: number };
  templates: Array<{ rule_key: string; domain: string; kind: string; usage_count: number }>;
}

export async function getTrDashboard(projectId: string | null, client?: SupabaseClient): Promise<TrDashboard> {
  const db = client ?? createServiceClient();

  let sources: TrSource[] = [];
  try {
    let q = db.from("migration_sources").select("id, name, source_type").eq("status", "analyzed").order("created_at", { ascending: false });
    if (projectId) q = q.eq("project_id", projectId);
    const { data, error } = await q;
    if (!error && data) sources = data as TrSource[];
  } catch {
    /* غير مطبَّق */
  }

  let pipelines: TrDashboard["pipelines"] = [];
  try {
    let q = db.from("transformation_pipelines").select("id, source_id, status, confidence_avg, coverage, complexity, report").order("created_at", { ascending: false }).limit(100);
    if (projectId) q = q.eq("project_id", projectId);
    const { data, error } = await q;
    if (!error && data) pipelines = data as TrDashboard["pipelines"];
  } catch {
    /* غير مطبَّق */
  }

  const bySource = new Map<string, TrDashboard["pipelines"][number]>();
  for (const p of pipelines) if (p.source_id && !bySource.has(p.source_id)) bySource.set(p.source_id, p);
  const latest = [...bySource.values()];

  const approved = latest.filter((p) => p.status === "approved").length;
  const totalRules = latest.reduce((s, p) => s + Number((p.report as { stats?: { rules?: number } })?.stats?.rules ?? 0), 0);
  const reviewQueue = latest.reduce((s, p) => s + Number((p.report as { stats?: { reviewQueue?: number } })?.stats?.reviewQueue ?? 0), 0);
  const avgConfidence = latest.length ? Math.round(latest.reduce((s, p) => s + p.confidence_avg, 0) / latest.length) : 0;
  const avgCoverage = latest.length ? Math.round(latest.reduce((s, p) => s + p.coverage, 0) / latest.length) : 0;

  let templates: TrDashboard["templates"] = [];
  try {
    const { data } = await db.from("transformation_rule_library").select("rule_key, domain, kind, usage_count").order("usage_count", { ascending: false }).limit(20);
    if (data) templates = data as TrDashboard["templates"];
  } catch {
    /* غير مطبَّق */
  }

  return {
    sources,
    pipelines: latest,
    totals: { pipelines: latest.length, approved, totalRules, reviewQueue, avgConfidence, avgCoverage },
    templates,
  };
}
