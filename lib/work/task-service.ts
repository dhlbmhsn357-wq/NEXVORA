import { after } from "next/server";
import type { SupabaseClient } from "@supabase/supabase-js";
import { createServiceClient } from "@/lib/supabase/service";
import { emitEvent } from "@/lib/automation/event-bus";
import { EVENT_TYPES } from "@/lib/automation/events";
import { checkDependencyGate, computeTaskProgress } from "./task-logic";
import { isDoneStatus } from "./statuses";
import type {
  Task, TaskStatus, TaskPriority, TaskSourceType, TaskAssignee, Profile,
} from "@/lib/types/database";

/**
 * خدمة المهام (Work Management) — كل قراءة/كتابة تمرّ من هنا (service
 * client؛ الصلاحيات تُفحص في طبقة الـ Server Actions فوقها). كل تغيير
 * بيتسجّل في task_activity (Timeline لكل مهمة).
 */

async function logActivity(
  supabase: SupabaseClient,
  taskId: string | null,
  projectId: string,
  actorId: string | null,
  eventType: string,
  detail: Record<string, unknown> = {}
): Promise<void> {
  await supabase.from("task_activity").insert({ task_id: taskId, project_id: projectId, actor_id: actorId, event_type: eventType, detail });
}

export interface CreateTaskInput {
  projectId: string;
  title: string;
  description?: string | null;
  taskType?: string;
  priority?: TaskPriority;
  status?: TaskStatus;
  milestoneId?: string | null;
  parentTaskId?: string | null;
  dueDate?: string | null;
  startDate?: string | null;
  estimatedHours?: number | null;
  assigneeIds?: string[];
  sourceType?: TaskSourceType | null;
  sourceReference?: string | null;
  createdBy: string | null;
}

export async function createTask(input: CreateTaskInput): Promise<{ ok: boolean; taskId?: string; message?: string }> {
  const supabase = createServiceClient();
  if (!input.title.trim()) return { ok: false, message: "عنوان المهمة مطلوب." };

  const { data, error } = await supabase
    .from("tasks")
    .insert({
      project_id: input.projectId,
      milestone_id: input.milestoneId ?? null,
      parent_task_id: input.parentTaskId ?? null,
      title: input.title.trim(),
      description: input.description ?? null,
      task_type: input.taskType ?? "development",
      priority: input.priority ?? "medium",
      status: input.status ?? "backlog",
      start_date: input.startDate ?? null,
      due_date: input.dueDate ?? null,
      estimated_hours: input.estimatedHours ?? null,
      source_type: input.sourceType ?? "manual",
      source_reference: input.sourceReference ?? null,
      created_by: input.createdBy,
    })
    .select("id")
    .single();
  if (error || !data) return { ok: false, message: error?.message ?? "فشل الإنشاء." };
  const taskId = data.id;

  if (input.assigneeIds && input.assigneeIds.length > 0) {
    await supabase.from("task_assignees").insert(
      input.assigneeIds.map((uid) => ({ task_id: taskId, user_id: uid, assigned_by: input.createdBy }))
    );
  }

  await logActivity(supabase, taskId, input.projectId, input.createdBy, input.parentTaskId ? "subtask_added" : "created", {
    title: input.title.trim(),
    source: input.sourceType ?? "manual",
  });
  return { ok: true, taskId };
}

/** تغيير حالة مهمة مع بوابة التبعيات (منع البدء قبل اكتمال ما تعتمد عليه). */
export async function changeStatus(taskId: string, actorId: string | null, newStatus: TaskStatus): Promise<{ ok: boolean; message?: string }> {
  const supabase = createServiceClient();
  const { data: task } = await supabase.from("tasks").select("project_id, status, title").eq("id", taskId).maybeSingle();
  if (!task) return { ok: false, message: "المهمة غير موجودة." };

  const { data: deps } = await supabase.from("task_dependencies").select("depends_on_task_id").eq("task_id", taskId);
  const depIds = (deps ?? []).map((d) => d.depends_on_task_id);
  if (depIds.length > 0) {
    const { data: depTasks } = await supabase.from("tasks").select("id, status").in("id", depIds);
    const gate = checkDependencyGate(newStatus, (depTasks ?? []) as { id: string; status: TaskStatus }[]);
    if (!gate.allowed) return { ok: false, message: gate.message };
  }

  await supabase
    .from("tasks")
    .update({ status: newStatus, updated_at: new Date().toISOString(), completed_at: isDoneStatus(newStatus) ? new Date().toISOString() : null })
    .eq("id", taskId);
  await logActivity(supabase, taskId, task.project_id, actorId, isDoneStatus(newStatus) ? "completed" : "status_changed", { from: task.status, to: newStatus });
  if (isDoneStatus(newStatus)) {
    after(() =>
      emitEvent({
        type: EVENT_TYPES.TASK_COMPLETED,
        projectId: task.project_id,
        actorId,
        recordId: taskId,
        payload: { title: task.title },
      })
    );
  }
  return { ok: true };
}

export async function updateTaskFields(taskId: string, actorId: string | null, fields: Partial<Pick<Task, "title" | "description" | "priority" | "task_type" | "due_date" | "start_date" | "estimated_hours" | "actual_hours" | "milestone_id" | "checklist">>): Promise<{ ok: boolean; message?: string }> {
  const supabase = createServiceClient();
  const { data: task } = await supabase.from("tasks").select("project_id").eq("id", taskId).maybeSingle();
  if (!task) return { ok: false, message: "المهمة غير موجودة." };
  const { error } = await supabase.from("tasks").update({ ...fields, updated_at: new Date().toISOString() }).eq("id", taskId);
  if (error) return { ok: false, message: error.message };
  if (fields.due_date !== undefined) await logActivity(supabase, taskId, task.project_id, actorId, "due_changed", { due_date: fields.due_date });
  return { ok: true };
}

export async function setAssignees(taskId: string, actorId: string | null, userIds: string[]): Promise<{ ok: boolean; message?: string }> {
  const supabase = createServiceClient();
  const { data: task } = await supabase.from("tasks").select("project_id").eq("id", taskId).maybeSingle();
  if (!task) return { ok: false, message: "المهمة غير موجودة." };
  await supabase.from("task_assignees").delete().eq("task_id", taskId);
  if (userIds.length > 0) {
    await supabase.from("task_assignees").insert(userIds.map((uid) => ({ task_id: taskId, user_id: uid, assigned_by: actorId })));
  }
  await logActivity(supabase, taskId, task.project_id, actorId, "assigned", { assignees: userIds });
  return { ok: true };
}

export async function addDependency(taskId: string, dependsOnTaskId: string): Promise<{ ok: boolean; message?: string }> {
  if (taskId === dependsOnTaskId) return { ok: false, message: "المهمة مش ممكن تعتمد على نفسها." };
  const supabase = createServiceClient();
  const { error } = await supabase.from("task_dependencies").upsert({ task_id: taskId, depends_on_task_id: dependsOnTaskId }, { onConflict: "task_id,depends_on_task_id" });
  if (error) return { ok: false, message: error.message };
  return { ok: true };
}

export async function deleteTask(taskId: string, actorId: string | null): Promise<{ ok: boolean; message?: string }> {
  const supabase = createServiceClient();
  const { data: task } = await supabase.from("tasks").select("project_id").eq("id", taskId).maybeSingle();
  if (!task) return { ok: false, message: "المهمة غير موجودة." };
  await supabase.from("tasks").delete().eq("id", taskId);
  await logActivity(supabase, null, task.project_id, actorId, "deleted", { task_id: taskId });
  return { ok: true };
}

export interface TaskWithMeta extends Task {
  assignees: { user_id: string; name: string }[];
  dependency_ids: string[];
  comment_count: number;
  subtask_ids: string[];
}

/** كل مهام مشروع (مع المكلّفين/التبعيات/عدد التعليقات) — للوحة. */
export async function listProjectTasks(projectId: string): Promise<TaskWithMeta[]> {
  const supabase = createServiceClient();
  const { data: tasks } = await supabase.from("tasks").select("*").eq("project_id", projectId).order("order_index").order("created_at");
  const list = (tasks ?? []) as Task[];
  if (list.length === 0) return [];
  const ids = list.map((t) => t.id);

  const [{ data: assignees }, { data: deps }, { data: comments }] = await Promise.all([
    supabase.from("task_assignees").select("task_id, user_id").in("task_id", ids),
    supabase.from("task_dependencies").select("task_id, depends_on_task_id").in("task_id", ids),
    supabase.from("task_comments").select("task_id").in("task_id", ids).is("deleted_at", null),
  ]);

  const assigneeUserIds = [...new Set((assignees ?? []).map((a) => a.user_id))];
  const { data: profiles } = await supabase.from("profiles").select("id, full_name, email").in("id", assigneeUserIds.length ? assigneeUserIds : ["00000000-0000-0000-0000-000000000000"]);
  const nameById = new Map<string, string>();
  for (const p of (profiles ?? []) as Pick<Profile, "id" | "full_name" | "email">[]) nameById.set(p.id, p.full_name || p.email || "مستخدم");

  const commentCount = new Map<string, number>();
  for (const c of comments ?? []) commentCount.set(c.task_id, (commentCount.get(c.task_id) ?? 0) + 1);
  const subtasksByParent = new Map<string, string[]>();
  for (const t of list) if (t.parent_task_id) subtasksByParent.set(t.parent_task_id, [...(subtasksByParent.get(t.parent_task_id) ?? []), t.id]);

  return list.map((t) => ({
    ...t,
    assignees: (assignees ?? []).filter((a) => a.task_id === t.id).map((a) => ({ user_id: a.user_id, name: nameById.get(a.user_id) ?? "مستخدم" })),
    dependency_ids: (deps ?? []).filter((d) => d.task_id === t.id).map((d) => d.depends_on_task_id),
    comment_count: commentCount.get(t.id) ?? 0,
    subtask_ids: subtasksByParent.get(t.id) ?? [],
  }));
}

/** مهام مكلّف بها مستخدم (عبر كل المشاريع) — لـ My Workspace. */
export async function listUserTasks(userId: string): Promise<Task[]> {
  const supabase = createServiceClient();
  const { data: rows } = await supabase.from("task_assignees").select("task_id").eq("user_id", userId);
  const ids = (rows ?? []).map((r) => r.task_id);
  if (ids.length === 0) return [];
  const { data: tasks } = await supabase.from("tasks").select("*").in("id", ids).not("status", "in", "(archived,cancelled)").order("due_date", { ascending: true, nullsFirst: false });
  return (tasks ?? []) as Task[];
}

export async function computeTaskProgressMap(tasks: Task[]): Promise<Map<string, number>> {
  // نحسب الأبناء الأول ثم الآباء (مستوى واحد من subtasks مدعوم).
  const byParent = new Map<string, Task[]>();
  for (const t of tasks) if (t.parent_task_id) byParent.set(t.parent_task_id, [...(byParent.get(t.parent_task_id) ?? []), t]);
  const progress = new Map<string, number>();
  for (const t of tasks) {
    const children = byParent.get(t.id) ?? [];
    const childProgress = children.map((c) => computeTaskProgress(c, []));
    progress.set(t.id, computeTaskProgress(t, childProgress));
  }
  return progress;
}

export type { TaskAssignee };
