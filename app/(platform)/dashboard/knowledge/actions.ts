"use server";

import { requireRole } from "@/lib/auth/rbac";
import { createServiceClient } from "@/lib/supabase/service";
import { collectMonitoring, type KnowledgeMonitoring } from "@/lib/knowledge-hub/monitoring";

/**
 * إجراءات لوحة مركز المعرفة.
 *
 * اللوحة **لكل مشروع** لا عامة: المعرفة معزولة بالمشروع من ٠٠٧١،
 * وعرضها مجمّعة عبر المشاريع كان هيكسر العزل اللي المواصفة أصرّت عليه.
 */

const ALLOWED = ["owner", "admin", "supervisor"] as const;

export interface ProjectOption {
  id: string;
  name: string;
}

export interface KnowledgeDashboardData {
  projects: ProjectOption[];
  selectedProjectId: string | null;
  monitoring: KnowledgeMonitoring | null;
}

export async function getKnowledgeDashboard(
  projectId?: string
): Promise<{ ok: boolean; message?: string; data?: KnowledgeDashboardData }> {
  const auth = await requireRole([...ALLOWED]);
  if (!auth.ok) return { ok: false, message: auth.message };

  const db = createServiceClient();

  const { data: projectRows } = await db
    .from("projects")
    .select("id, name")
    .order("created_at", { ascending: false })
    .limit(100);

  const projects = ((projectRows ?? []) as ProjectOption[]).filter((p) => p.id && p.name);
  const selectedProjectId = projectId ?? projects[0]?.id ?? null;

  if (!selectedProjectId) {
    return { ok: true, data: { projects, selectedProjectId: null, monitoring: null } };
  }

  const monitoring = await collectMonitoring(selectedProjectId, db);
  return { ok: true, data: { projects, selectedProjectId, monitoring } };
}
