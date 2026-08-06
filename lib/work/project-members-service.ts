import { after } from "next/server";
import { createServiceClient } from "@/lib/supabase/service";
import { recordAuthEvent } from "@/lib/auth/audit";
import { emitEvent } from "@/lib/automation/event-bus";
import { EVENT_TYPES } from "@/lib/automation/events";
import type { ProjectMember, ProjectRole, Profile } from "@/lib/types/database";

/**
 * تعيين فريق المشروع — الجدول اللي كان ناقص (قبل كده owner_id بس).
 * المشاريع المعيّن عليها المستخدم بتظهر في My Workspace بتاعته فورًا.
 */

export interface ProjectMemberWithName extends ProjectMember {
  name: string;
  email: string | null;
}

export async function listProjectMembers(projectId: string): Promise<ProjectMemberWithName[]> {
  const supabase = createServiceClient();
  const { data: members } = await supabase.from("project_members").select("*").eq("project_id", projectId);
  const list = (members ?? []) as ProjectMember[];
  if (list.length === 0) return [];
  const { data: profiles } = await supabase.from("profiles").select("id, full_name, email").in("id", list.map((m) => m.user_id));
  const byId = new Map<string, Pick<Profile, "full_name" | "email">>();
  for (const p of (profiles ?? []) as Pick<Profile, "id" | "full_name" | "email">[]) byId.set(p.id, { full_name: p.full_name, email: p.email });
  return list.map((m) => ({ ...m, name: byId.get(m.user_id)?.full_name || byId.get(m.user_id)?.email || "مستخدم", email: byId.get(m.user_id)?.email ?? null }));
}

export async function addProjectMember(projectId: string, userId: string, projectRole: ProjectRole, actorId: string): Promise<{ ok: boolean; message?: string }> {
  const supabase = createServiceClient();
  const { error } = await supabase
    .from("project_members")
    .upsert({ project_id: projectId, user_id: userId, project_role: projectRole, added_by: actorId }, { onConflict: "project_id,user_id" });
  if (error) return { ok: false, message: error.message };
  await recordAuthEvent({ actorId, targetUserId: userId, action: "project_member_added", details: { project_id: projectId, project_role: projectRole } });
  after(async () => {
    const [{ data: prof }, { data: proj }] = await Promise.all([
      supabase.from("profiles").select("full_name, email").eq("id", userId).maybeSingle(),
      supabase.from("projects").select("name").eq("id", projectId).maybeSingle(),
    ]);
    await emitEvent({
      type: EVENT_TYPES.PROJECT_MEMBER_ADDED,
      projectId,
      actorId,
      recordId: userId,
      payload: {
        memberName: (prof as { full_name?: string; email?: string } | null)?.full_name || (prof as { email?: string } | null)?.email || "عضو جديد",
        projectName: (proj as { name?: string } | null)?.name ?? "",
      },
    });
  });
  return { ok: true };
}

export async function removeProjectMember(projectId: string, userId: string, actorId: string): Promise<{ ok: boolean; message?: string }> {
  const supabase = createServiceClient();
  const { error } = await supabase.from("project_members").delete().eq("project_id", projectId).eq("user_id", userId);
  if (error) return { ok: false, message: error.message };
  await recordAuthEvent({ actorId, targetUserId: userId, action: "project_member_removed", details: { project_id: projectId } });
  return { ok: true };
}

/** المشاريع اللي المستخدم عضو فيها أو مالكها — لـ My Workspace. */
export async function listUserProjects(userId: string): Promise<{ id: string; name: string; project_role: ProjectRole | "owner" }[]> {
  const supabase = createServiceClient();
  const [{ data: memberships }, { data: owned }] = await Promise.all([
    supabase.from("project_members").select("project_id, project_role").eq("user_id", userId),
    supabase.from("projects").select("id, name").eq("owner_id", userId),
  ]);
  const memberProjectIds = (memberships ?? []).map((m) => m.project_id);
  const roleByproject = new Map<string, ProjectRole>();
  for (const m of memberships ?? []) roleByproject.set(m.project_id, m.project_role as ProjectRole);

  const result: { id: string; name: string; project_role: ProjectRole | "owner" }[] = [];
  const seen = new Set<string>();
  for (const p of (owned ?? []) as { id: string; name: string }[]) {
    result.push({ id: p.id, name: p.name, project_role: "owner" });
    seen.add(p.id);
  }
  if (memberProjectIds.length > 0) {
    const remaining = memberProjectIds.filter((id) => !seen.has(id));
    if (remaining.length > 0) {
      const { data: projs } = await supabase.from("projects").select("id, name").in("id", remaining);
      for (const p of (projs ?? []) as { id: string; name: string }[]) {
        result.push({ id: p.id, name: p.name, project_role: roleByproject.get(p.id) ?? "executor" });
      }
    }
  }
  return result;
}
