"use server";

import { createClient } from "@/lib/supabase/server";
import { PROJECTS_PAGE_SIZE } from "@/lib/pagination/page-sizes";

interface RawProject {
  id: string;
  name: string;
  stage: string;
  project_type: string;
  payment_status: string;
  created_at: string;
  clients: { company_name: string | null } | { company_name: string | null }[] | null;
}

export interface ProjectListItem {
  id: string;
  name: string;
  stage: string;
  project_type: string;
  payment_status: string;
  created_at: string;
  clients: { company_name: string | null } | null;
  health: "ok" | "warning" | "danger";
}

export async function loadMoreProjects(
  offset: number
): Promise<{ items: ProjectListItem[]; hasMore: boolean }> {
  const supabase = await createClient();

  const [{ data }, { data: blockedReviews }, { data: pendingSupport }] = await Promise.all([
    supabase
      .from("projects")
      .select(
        "id, name, stage, project_type, payment_status, created_at, archived_at, clients(company_name)"
      )
      .is("archived_at", null)
      .order("created_at", { ascending: false })
      .range(offset, offset + PROJECTS_PAGE_SIZE - 1),
    supabase.from("prototype_review").select("project_id").eq("overall_status", "blocked"),
    supabase
      .from("support_requests")
      .select("project_id")
      .in("resolution_status", ["escalated", "in_progress"]),
  ]);

  // إشارات حتمية (Count/عضوية مباشرة) — نفس المنطق المستخدم في KPIs
  // الداشبورد، صفر AI أو تقدير.
  const blockedSet = new Set((blockedReviews ?? []).map((r) => r.project_id));
  const pendingSet = new Set((pendingSupport ?? []).map((r) => r.project_id));

  const rows = (data as RawProject[] | null) ?? [];
  const items: ProjectListItem[] = rows.map((p) => ({
    id: p.id,
    name: p.name,
    stage: p.stage,
    project_type: p.project_type,
    payment_status: p.payment_status,
    created_at: p.created_at,
    clients: Array.isArray(p.clients) ? (p.clients[0] ?? null) : (p.clients ?? null),
    health: blockedSet.has(p.id) ? "danger" : pendingSet.has(p.id) ? "warning" : "ok",
  }));

  return { items, hasMore: rows.length === PROJECTS_PAGE_SIZE };
}
