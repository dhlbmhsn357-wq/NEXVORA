import type { SupabaseClient } from "@supabase/supabase-js";
import { createServiceClient } from "@/lib/supabase/service";

/**
 * لوحة الـMapping — تجميع للعرض. رشيقة: أي جدول مفقود = قيم صفرية.
 */

export interface MappingSource {
  id: string;
  name: string;
  source_type: string;
  status: string;
}

export interface MappingDashboard {
  sources: MappingSource[];
  blueprints: Array<{
    id: string;
    source_id: string | null;
    status: string;
    confidence_avg: number;
    complexity: string;
    detected_template: string | null;
    stats: Record<string, unknown>;
    version: number;
  }>;
  totals: {
    blueprints: number;
    approved: number;
    inReview: number;
    avgConfidence: number;
    reviewQueue: number;
  };
  templates: Array<{ template_key: string; label: string; usage_count: number }>;
}

export async function getMappingDashboard(projectId: string | null, client?: SupabaseClient): Promise<MappingDashboard> {
  const db = client ?? createServiceClient();

  // مصادر المرحلة ١ اللي عندها لقطة مكتملة (قابلة للـMapping).
  let sources: MappingSource[] = [];
  try {
    let q = db.from("migration_sources").select("id, name, source_type, status").eq("status", "analyzed").order("created_at", { ascending: false });
    if (projectId) q = q.eq("project_id", projectId);
    const { data, error } = await q;
    if (!error && data) sources = data as MappingSource[];
  } catch {
    /* الجدول قد يكون غير مطبَّق */
  }

  let blueprints: MappingDashboard["blueprints"] = [];
  try {
    let q = db.from("migration_blueprints").select("id, source_id, status, confidence_avg, complexity, detected_template, stats, version").order("created_at", { ascending: false }).limit(100);
    if (projectId) q = q.eq("project_id", projectId);
    const { data, error } = await q;
    if (!error && data) blueprints = data as MappingDashboard["blueprints"];
  } catch {
    /* غير مطبَّق */
  }

  // أحدث مخطّط لكل مصدر.
  const bySource = new Map<string, MappingDashboard["blueprints"][number]>();
  for (const b of blueprints) if (b.source_id && !bySource.has(b.source_id)) bySource.set(b.source_id, b);
  const latest = [...bySource.values()];

  const approved = latest.filter((b) => b.status === "approved").length;
  const inReview = latest.filter((b) => b.status === "in_review").length;
  const avgConfidence = latest.length ? Math.round(latest.reduce((s, b) => s + b.confidence_avg, 0) / latest.length) : 0;
  const reviewQueue = latest.reduce((s, b) => s + Number((b.stats as { reviewCount?: number })?.reviewCount ?? 0), 0);

  let templates: MappingDashboard["templates"] = [];
  try {
    const { data } = await db.from("migration_mapping_templates").select("template_key, label, usage_count").order("usage_count", { ascending: false }).limit(20);
    if (data) templates = data as MappingDashboard["templates"];
  } catch {
    /* غير مطبَّق */
  }

  return {
    sources,
    blueprints: latest,
    totals: { blueprints: latest.length, approved, inReview, avgConfidence, reviewQueue },
    templates,
  };
}
