import { createClient } from "@/lib/supabase/server";
import { createServiceClient } from "@/lib/supabase/service";
import {
  ensureProjectChannels,
  ensureAnnouncementChannel,
  getProjectConversations,
  getGlobalConversations,
  getDirectConversations,
} from "@/lib/collaboration/service";
import CollaborationClient, { type CollabInitialData } from "./collaboration-client";
import type { UserRole } from "@/lib/types/database";

export const dynamic = "force-dynamic";

export default async function CollaborationPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return null;

  const { data: profile } = await supabase.from("profiles").select("role").eq("id", user.id).maybeSingle();
  const role = (profile?.role ?? "member") as UserRole;

  const service = createServiceClient();
  const { data: projects } = await service.from("projects").select("id, name").order("created_at", { ascending: false }).limit(100);
  const projectList = (projects ?? []) as { id: string; name: string }[];

  // ضمان القنوات (idempotent) + قناة الإعلانات
  await Promise.all([
    ...projectList.map((p) => ensureProjectChannels(p.id, user.id)),
    ensureAnnouncementChannel(user.id),
  ]);

  const [projectConvsArrays, globalConvs, directConvs, usersRes] = await Promise.all([
    Promise.all(projectList.map((p) => getProjectConversations(p.id))),
    getGlobalConversations(),
    getDirectConversations(user.id),
    service.from("profiles").select("id, full_name, email").neq("status", "deleted").order("full_name"),
  ]);

  const initial: CollabInitialData = {
    currentUserId: user.id,
    role,
    projects: projectList.map((p, i) => ({ id: p.id, name: p.name, channels: projectConvsArrays[i] })),
    departmentChannels: globalConvs.filter((c) => c.type === "department"),
    announcementChannels: globalConvs.filter((c) => c.type === "announcement"),
    directConversations: directConvs,
    users: ((usersRes.data ?? []) as { id: string; full_name: string | null; email: string | null }[]).filter((u) => u.id !== user.id),
  };

  return <CollaborationClient initial={initial} />;
}
