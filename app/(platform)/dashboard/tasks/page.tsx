import { redirect } from "next/navigation";
import { ListChecks } from "lucide-react";
import { createClient } from "@/lib/supabase/server";
import { requireRole } from "@/lib/auth/rbac";
import { ALL_ROLES } from "@/lib/auth/roles";
import PageHeader from "@/components/ui/PageHeader";
import {
  canApproveWTask,
  canAssignWTask,
  canCreateWTask,
  canDeleteWTask,
  canViewAllWTasks,
} from "@/lib/workspace-tasks/permissions";
import { listWorkspaceTasks } from "@/lib/workspace-tasks/service";
import type { UserRole } from "@/lib/types/database";
import TasksBoard from "./tasks-board";

export const dynamic = "force-dynamic";

export default async function TasksPage() {
  const a = await requireRole([...ALL_ROLES]);
  if (!a.ok || !a.userId) redirect("/login");
  const role = (a.role ?? "member") as UserRole;

  const isManager = canViewAllWTasks(role);
  const scope = isManager ? "all" : "assigned";
  const supabase = await createClient();

  const [tasks, { data: members }, { data: projects }, { data: clients }] = await Promise.all([
    listWorkspaceTasks({ scope, userId: a.userId }),
    supabase.from("profiles").select("id, full_name, email").eq("status", "active").order("full_name"),
    supabase.from("projects").select("id, name").is("archived_at", null).order("name"),
    supabase.from("clients").select("id, company_name").order("company_name"),
  ]);

  return (
    <div>
      <PageHeader
        title="المهام"
        icon={ListChecks}
        description={isManager ? "نظام إدارة المهام — إنشاء، إسناد، مراجعة، واعتماد." : "المهام المسندة إليك."}
      />
      <TasksBoard
        initialTasks={tasks}
        currentUserId={a.userId}
        isManager={isManager}
        canCreate={canCreateWTask(role)}
        canAssign={canAssignWTask(role)}
        canApprove={canApproveWTask(role)}
        canDelete={canDeleteWTask(role)}
        members={(members ?? []).map((m) => ({ id: m.id as string, name: (m.full_name as string) || (m.email as string) || "مستخدم" }))}
        projects={(projects ?? []).map((p) => ({ id: p.id as string, name: p.name as string }))}
        clients={(clients ?? []).map((c) => ({ id: c.id as string, name: c.company_name as string }))}
      />
    </div>
  );
}
