import type { SupabaseClient } from "@supabase/supabase-js";
import { createServiceClient } from "@/lib/supabase/service";
import { windowState } from "./hypercare-window";

/** لوحة Hypercare التنفيذية — تجميع للعرض. رشيقة: أي جدول مفقود = صفري. */

export interface HcCertifiedOption {
  verification_id: string;
  project_name: string;
  final_score: number;
  has_period: boolean;
}

export interface HcPeriodRow {
  id: string;
  project_id: string | null;
  status: string;
  duration_days: number;
  overall_health_score: number;
  total_incidents: number;
  resolved_incidents: number;
  optimizations_applied: number;
  knowledge_added: number;
  satisfaction_score: number;
  started_at: string;
  ends_at: string | null;
  progressPercent: number;
  daysRemaining: number;
}

export interface HypercareDashboard {
  certified: HcCertifiedOption[];
  periods: HcPeriodRow[];
  totals: { active: number; closed: number; openIncidents: number; avgHealth: number };
}

export async function getHypercareDashboard(projectId: string | null, client?: SupabaseClient): Promise<HypercareDashboard> {
  const db = client ?? createServiceClient();

  const certified: HcCertifiedOption[] = [];
  try {
    let q = db.from("go_live_verifications").select("id, project_id, final_score").eq("status", "certified").order("created_at", { ascending: false }).limit(50);
    if (projectId) q = q.eq("project_id", projectId);
    const { data } = await q;
    const vers = (data ?? []) as Array<{ id: string; project_id: string | null; final_score: number }>;
    if (vers.length) {
      const projIds = [...new Set(vers.map((v) => v.project_id).filter(Boolean))] as string[];
      const { data: projs } = projIds.length ? await db.from("projects").select("id, name").in("id", projIds) : { data: [] };
      const nameById = new Map(((projs ?? []) as Array<{ id: string; name: string }>).map((p) => [p.id, p.name]));
      const { data: periods } = await db.from("hypercare_periods").select("verification_id").in("verification_id", vers.map((v) => v.id));
      const started = new Set(((periods ?? []) as Array<{ verification_id: string }>).map((p) => p.verification_id));
      for (const v of vers) certified.push({ verification_id: v.id, project_name: nameById.get(v.project_id ?? "") ?? "مشروع", final_score: v.final_score, has_period: started.has(v.id) });
    }
  } catch { /* غير مطبَّق */ }

  let periods: HcPeriodRow[] = [];
  try {
    let q = db.from("hypercare_periods").select("id, project_id, status, duration_days, overall_health_score, total_incidents, resolved_incidents, optimizations_applied, knowledge_added, satisfaction_score, started_at, ends_at").order("created_at", { ascending: false }).limit(50);
    if (projectId) q = q.eq("project_id", projectId);
    const { data } = await q;
    periods = ((data ?? []) as Array<Omit<HcPeriodRow, "progressPercent" | "daysRemaining">>).map((p) => {
      const daysElapsed = (Date.now() - new Date(p.started_at).getTime()) / (24 * 3600 * 1000);
      const w = windowState(daysElapsed, p.duration_days, p.status === "closed");
      return { ...p, progressPercent: w.progressPercent, daysRemaining: w.daysRemaining };
    });
  } catch { /* غير مطبَّق */ }

  const activePeriods = periods.filter((p) => p.status !== "closed");
  return {
    certified,
    periods,
    totals: {
      active: activePeriods.length,
      closed: periods.filter((p) => p.status === "closed").length,
      openIncidents: periods.reduce((s, p) => s + (p.total_incidents - p.resolved_incidents), 0),
      avgHealth: activePeriods.length ? Math.round(activePeriods.reduce((s, p) => s + p.overall_health_score, 0) / activePeriods.length) : 0,
    },
  };
}

export async function getPeriodDetail(periodId: string, client?: SupabaseClient) {
  const db = client ?? createServiceClient();
  const [period, incidents, optimizations, knowledge, feedback, snapshots] = await Promise.all([
    db.from("hypercare_periods").select("*").eq("id", periodId).maybeSingle(),
    db.from("hypercare_incidents").select("id, title, severity, status, impact, affected_modules, suggested_solution, root_cause, resolution, confidence, detected_by").eq("period_id", periodId).order("created_at", { ascending: false }),
    db.from("hypercare_optimizations").select("id, category, title, detail, priority, expected_gain, status, performance_gain").eq("period_id", periodId).order("created_at", { ascending: false }),
    db.from("hypercare_knowledge_suggestions").select("id, kind, title, content, confidence, status").eq("period_id", periodId).order("created_at", { ascending: false }),
    db.from("hypercare_feedback").select("id, kind, title, detail, status").eq("period_id", periodId).order("created_at", { ascending: false }).limit(50),
    db.from("hypercare_snapshots").select("health_score, anomalies_count, created_at").eq("period_id", periodId).order("created_at", { ascending: false }).limit(30),
  ]);
  if (!period.data) return null;
  return {
    period: period.data,
    incidents: incidents.data ?? [],
    optimizations: optimizations.data ?? [],
    knowledge: knowledge.data ?? [],
    feedback: feedback.data ?? [],
    snapshots: snapshots.data ?? [],
  };
}
