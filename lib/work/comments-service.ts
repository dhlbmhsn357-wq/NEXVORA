import { createServiceClient } from "@/lib/supabase/service";
import type { TaskComment, Profile } from "@/lib/types/database";

/** تعليقات المهام — Markdown آمن (نفس عارض الشات). */

export interface TaskCommentWithAuthor extends TaskComment {
  author_name: string | null;
}

export async function listTaskComments(taskId: string): Promise<TaskCommentWithAuthor[]> {
  const supabase = createServiceClient();
  const { data } = await supabase.from("task_comments").select("*").eq("task_id", taskId).order("created_at", { ascending: true });
  const list = (data ?? []) as TaskComment[];
  if (list.length === 0) return [];
  const authorIds = [...new Set(list.map((c) => c.author_id).filter(Boolean) as string[])];
  const { data: profiles } = await supabase.from("profiles").select("id, full_name, email").in("id", authorIds.length ? authorIds : ["00000000-0000-0000-0000-000000000000"]);
  const nameById = new Map<string, string>();
  for (const p of (profiles ?? []) as Pick<Profile, "id" | "full_name" | "email">[]) nameById.set(p.id, p.full_name || p.email || "مستخدم");
  return list.map((c) => ({ ...c, author_name: c.author_id ? nameById.get(c.author_id) ?? null : null }));
}

export async function addTaskComment(taskId: string, authorId: string, body: string): Promise<{ ok: boolean; message?: string }> {
  const supabase = createServiceClient();
  if (!body.trim()) return { ok: false, message: "التعليق فاضي." };
  const { data: task } = await supabase.from("tasks").select("project_id").eq("id", taskId).maybeSingle();
  if (!task) return { ok: false, message: "المهمة غير موجودة." };
  await supabase.from("task_comments").insert({ task_id: taskId, project_id: task.project_id, author_id: authorId, body: body.trim() });
  await supabase.from("task_activity").insert({ task_id: taskId, project_id: task.project_id, actor_id: authorId, event_type: "comment_added", detail: {} });
  return { ok: true };
}
