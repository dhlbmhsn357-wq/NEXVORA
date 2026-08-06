import type { SupabaseClient } from "@supabase/supabase-js";
import { createServiceClient } from "@/lib/supabase/service";

/** لوحة مركز الإطلاق — تجميع للعرض. رشيقة: أي جدول مفقود = قيم صفرية. */

export interface GlExecutionOption {
  id: string;
  source_id: string | null;
  source_name: string;
  status: string;
  has_verification: boolean;
}

export interface GlVerificationRow {
  id: string;
  source_id: string | null;
  status: string;
  go_live_status: string;
  verification_score: number;
  business_acceptance_score: number;
  final_score: number;
  open_issues: number;
  data_match: boolean;
  created_at: string;
}

export interface GoLiveDashboard {
  executions: GlExecutionOption[];
  verifications: GlVerificationRow[];
  totals: { verifications: number; certified: number; ready: number; openIssues: number };
}

export async function getGoLiveDashboard(projectId: string | null, client?: SupabaseClient): Promise<GoLiveDashboard> {
  const db = client ?? createServiceClient();

  const executions: GlExecutionOption[] = [];
  try {
    let q = db.from("migration_executions").select("id, source_id, status").eq("status", "completed").order("created_at", { ascending: false }).limit(50);
    if (projectId) q = q.eq("project_id", projectId);
    const { data } = await q;
    const execs = (data ?? []) as Array<{ id: string; source_id: string | null; status: string }>;
    if (execs.length) {
      const srcIds = [...new Set(execs.map((e) => e.source_id).filter(Boolean))] as string[];
      const { data: srcs } = srcIds.length ? await db.from("migration_sources").select("id, name").in("id", srcIds) : { data: [] };
      const nameById = new Map(((srcs ?? []) as Array<{ id: string; name: string }>).map((s) => [s.id, s.name]));
      const { data: vers } = await db.from("go_live_verifications").select("execution_id").in("execution_id", execs.map((e) => e.id));
      const verified = new Set(((vers ?? []) as Array<{ execution_id: string }>).map((v) => v.execution_id));
      for (const e of execs) executions.push({ id: e.id, source_id: e.source_id, source_name: nameById.get(e.source_id ?? "") ?? "مصدر", status: e.status, has_verification: verified.has(e.id) });
    }
  } catch {
    /* غير مطبَّق */
  }

  let verifications: GlVerificationRow[] = [];
  try {
    let q = db.from("go_live_verifications").select("id, source_id, status, go_live_status, verification_score, business_acceptance_score, final_score, open_issues, data_match, created_at").order("created_at", { ascending: false }).limit(50);
    if (projectId) q = q.eq("project_id", projectId);
    const { data } = await q;
    if (data) verifications = data as GlVerificationRow[];
  } catch {
    /* غير مطبَّق */
  }

  return {
    executions,
    verifications,
    totals: {
      verifications: verifications.length,
      certified: verifications.filter((v) => v.status === "certified").length,
      ready: verifications.filter((v) => v.go_live_status === "ready" || v.go_live_status === "live").length,
      openIssues: verifications.reduce((s, v) => s + v.open_issues, 0),
    },
  };
}

export async function getVerificationDetail(verificationId: string, client?: SupabaseClient) {
  const db = client ?? createServiceClient();
  const [ver, dataChecks, departments, branches, uat, issues, certificate] = await Promise.all([
    db.from("go_live_verifications").select("*").eq("id", verificationId).maybeSingle(),
    db.from("go_live_data_checks").select("entity, label, source_count, production_count, difference, matched, note").eq("verification_id", verificationId),
    db.from("go_live_departments").select("id, department, label, checklist, status, notes, decided_role").eq("verification_id", verificationId),
    db.from("go_live_branches").select("id, branch_name, status, notes, decided_role").eq("verification_id", verificationId),
    db.from("go_live_uat").select("scenario, verdict, comment, actor_role, created_at").eq("verification_id", verificationId).order("created_at", { ascending: false }).limit(50),
    db.from("go_live_issues").select("id, title, severity, status, detail, resolution").eq("verification_id", verificationId).order("created_at", { ascending: false }),
    db.from("go_live_certificates").select("*").eq("verification_id", verificationId).order("issued_at", { ascending: false }).limit(1).maybeSingle(),
  ]);
  if (!ver.data) return null;
  return {
    verification: ver.data,
    dataChecks: dataChecks.data ?? [],
    departments: departments.data ?? [],
    branches: branches.data ?? [],
    uat: uat.data ?? [],
    issues: issues.data ?? [],
    certificate: certificate.data ?? null,
  };
}
