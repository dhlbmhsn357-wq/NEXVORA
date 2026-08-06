import type { SupabaseClient } from "@supabase/supabase-js";
import { createServiceClient } from "@/lib/supabase/service";
import { listSources, type SafeSourceRow } from "./source-service";
import type { MigrationReportRow } from "./types";

/**
 * لوحة اكتشاف الترحيل — تجميع للعرض. رشيقة: أي جدول مفقود = قيم صفرية.
 */

export interface MigrationDashboard {
  sources: SafeSourceRow[];
  totals: {
    sources: number;
    analyzed: number;
    avgReadiness: number;
    totalRisks: number;
  };
  latestReports: Array<Pick<MigrationReportRow, "id" | "source_id" | "system_type" | "readiness_score" | "risk_score" | "quality_score" | "detected_domains" | "created_at">>;
}

export async function getMigrationDashboard(projectId: string | null, client?: SupabaseClient): Promise<MigrationDashboard> {
  const db = client ?? createServiceClient();
  const sources = await listSources(projectId, db);

  let latestReports: MigrationDashboard["latestReports"] = [];
  try {
    let q = db
      .from("migration_reports")
      .select("id, source_id, system_type, readiness_score, risk_score, quality_score, detected_domains, created_at")
      .order("created_at", { ascending: false })
      .limit(50);
    if (projectId) q = q.eq("project_id", projectId);
    const { data, error } = await q;
    if (!error && data) latestReports = data as MigrationDashboard["latestReports"];
  } catch {
    /* الجدول قد يكون غير مطبَّق */
  }

  // أحدث تقرير لكل مصدر فقط.
  const bySource = new Map<string, MigrationDashboard["latestReports"][number]>();
  for (const r of latestReports) if (!bySource.has(r.source_id)) bySource.set(r.source_id, r);
  const uniqueReports = [...bySource.values()];

  const analyzed = uniqueReports.length;
  const avgReadiness = analyzed > 0 ? Math.round(uniqueReports.reduce((s, r) => s + r.readiness_score, 0) / analyzed) : 0;
  const totalRisks = uniqueReports.reduce((s, r) => s + (r.risk_score > 0 ? 1 : 0), 0);

  return {
    sources,
    totals: { sources: sources.length, analyzed, avgReadiness, totalRisks },
    latestReports: uniqueReports,
  };
}
