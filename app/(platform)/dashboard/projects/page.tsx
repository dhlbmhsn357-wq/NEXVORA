import { FolderKanban } from "lucide-react";
import { createClient } from "@/lib/supabase/server";
import PageHeader from "@/components/ui/PageHeader";
import ProjectsList from "./projects-list";
import { type ProjectListItem } from "./load-more-projects-action";
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

export default async function ProjectsPage() {
  const supabase = await createClient();

  const [{ data: projects }, { data: blockedReviews }, { data: pendingSupport }] = await Promise.all([
    supabase
      .from("projects")
      .select(
        "id, name, stage, project_type, payment_status, created_at, archived_at, clients(company_name)"
      )
      .is("archived_at", null)
      .order("created_at", { ascending: false })
      .range(0, PROJECTS_PAGE_SIZE - 1),
    supabase.from("prototype_review").select("project_id").eq("overall_status", "blocked"),
    supabase
      .from("support_requests")
      .select("project_id")
      .in("resolution_status", ["escalated", "in_progress"]),
  ]);

  const blockedSet = new Set((blockedReviews ?? []).map((r) => r.project_id));
  const pendingSet = new Set((pendingSupport ?? []).map((r) => r.project_id));

  const normalized: ProjectListItem[] = ((projects as RawProject[] | null) ?? []).map((p) => ({
    id: p.id,
    name: p.name,
    stage: p.stage,
    project_type: p.project_type,
    payment_status: p.payment_status,
    created_at: p.created_at,
    clients: Array.isArray(p.clients) ? (p.clients[0] ?? null) : (p.clients ?? null),
    health: blockedSet.has(p.id) ? "danger" : pendingSet.has(p.id) ? "warning" : "ok",
  }));

  return (
    <div>
      <PageHeader title="المشاريع" icon={FolderKanban} />
      <div>
        <ProjectsList
          initialProjects={normalized}
          initialHasMore={normalized.length === PROJECTS_PAGE_SIZE}
        />
      </div>
    </div>
  );
}
