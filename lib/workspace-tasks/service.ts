import { createServiceClient } from "@/lib/supabase/service";
import { NotificationService } from "@/lib/notifications/service";
import type { WTaskPriority, WTaskStatus } from "./statuses";
import type { ChecklistItem, WTaskLink } from "./task-logic";

/**
 * طبقة خدمة نظام مهام "مساحتي" — service-role client (بيتخطى RLS)؛ RBAC
 * بيتفرض في Server Actions. بتسجّل كل تغيير في workspace_task_activity
 * وبتبعت إشعارات المؤسسة عبر NotificationService.emit.
 */

export interface WorkspaceTaskRow {
  id: string;
  title: string;
  description: string | null;
  project_id: string | null;
  client_id: string | null;
  priority: WTaskPriority;
  status: WTaskStatus;
  start_date: string | null;
  due_date: string | null;
  checklist: ChecklistItem[];
  links: WTaskLink[];
  tags: string[];
  notes: string | null;
  reject_reason: string | null;
  created_by: string | null;
  approved_by: string | null;
  approved_at: string | null;
  started_at: string | null;
  completed_at: string | null;
  deleted_at: string | null;
  created_at: string;
  updated_at: string;
}

export interface WorkspaceTaskWithMeta extends WorkspaceTaskRow {
  assignee_ids: string[];
  assignees: { id: string; name: string }[];
  comment_count: number;
  project_name: string | null;
  client_name: string | null;
  creator_name: string | null;
}

export interface WorkspaceTaskComment {
  id: string;
  task_id: string;
  author_id: string | null;
  author_name: string | null;
  body: string;
  is_report: boolean;
  created_at: string;
}

export interface WorkspaceTaskAttachment {
  id: string;
  task_id: string;
  storage_path: string;
  file_name: string;
  mime_type: string | null;
  size_bytes: number | null;
  uploaded_by: string | null;
  created_at: string;
}

export interface WorkspaceTaskActivityRow {
  id: string;
  task_id: string | null;
  actor_id: string | null;
  actor_name: string | null;
  event_type: string;
  detail: Record<string, unknown>;
  created_at: string;
}

export interface CreateWorkspaceTaskInput {
  title: string;
  description?: string | null;
  projectId?: string | null;
  clientId?: string | null;
  priority?: WTaskPriority;
  startDate?: string | null;
  dueDate?: string | null;
  checklist?: ChecklistItem[];
  links?: WTaskLink[];
  tags?: string[];
  notes?: string | null;
  assigneeIds?: string[];
}

type Result = { ok: boolean; message?: string };

async function logActivity(
  taskId: string,
  actorId: string | null,
  eventType: string,
  detail: Record<string, unknown> = {}
): Promise<void> {
  const supabase = createServiceClient();
  await supabase.from("workspace_task_activity").insert({ task_id: taskId, actor_id: actorId, event_type: eventType, detail });
}

async function nameMap(ids: string[]): Promise<Map<string, string>> {
  const clean = Array.from(new Set(ids.filter(Boolean)));
  if (clean.length === 0) return new Map();
  const supabase = createServiceClient();
  const { data } = await supabase.from("profiles").select("id, full_name, email").in("id", clean);
  const map = new Map<string, string>();
  for (const p of data ?? []) map.set(p.id as string, (p.full_name as string) || (p.email as string) || "مستخدم");
  return map;
}

/** قائمة المهام: المدير (all) يشوف الكل؛ غيره يشوف المسندة إليه فقط. */
export async function listWorkspaceTasks(opts: { scope: "all" | "assigned"; userId: string }): Promise<WorkspaceTaskWithMeta[]> {
  const supabase = createServiceClient();

  let taskIdsFilter: string[] | null = null;
  if (opts.scope === "assigned") {
    const { data: mine } = await supabase.from("workspace_task_assignees").select("task_id").eq("user_id", opts.userId);
    taskIdsFilter = (mine ?? []).map((r) => r.task_id as string);
    if (taskIdsFilter.length === 0) return [];
  }

  let query = supabase.from("workspace_tasks").select("*").is("deleted_at", null);
  if (taskIdsFilter) query = query.in("id", taskIdsFilter);
  const { data: rows } = await query.order("created_at", { ascending: false });
  const tasks = (rows ?? []) as WorkspaceTaskRow[];
  if (tasks.length === 0) return [];

  const ids = tasks.map((t) => t.id);
  const [{ data: assignRows }, { data: commentRows }] = await Promise.all([
    supabase.from("workspace_task_assignees").select("task_id, user_id").in("task_id", ids),
    supabase.from("workspace_task_comments").select("task_id").in("task_id", ids).is("deleted_at", null),
  ]);

  const projectIds = tasks.map((t) => t.project_id).filter(Boolean) as string[];
  const clientIds = tasks.map((t) => t.client_id).filter(Boolean) as string[];
  const [{ data: projs }, { data: clis }] = await Promise.all([
    projectIds.length ? supabase.from("projects").select("id, name").in("id", projectIds) : Promise.resolve({ data: [] as { id: string; name: string }[] }),
    clientIds.length ? supabase.from("clients").select("id, company_name").in("id", clientIds) : Promise.resolve({ data: [] as { id: string; company_name: string }[] }),
  ]);
  const projMap = new Map((projs ?? []).map((p) => [p.id as string, p.name as string]));
  const cliMap = new Map((clis ?? []).map((c) => [c.id as string, c.company_name as string]));

  const assigneesByTask = new Map<string, string[]>();
  for (const r of assignRows ?? []) {
    const arr = assigneesByTask.get(r.task_id as string) ?? [];
    arr.push(r.user_id as string);
    assigneesByTask.set(r.task_id as string, arr);
  }
  const commentCount = new Map<string, number>();
  for (const r of commentRows ?? []) commentCount.set(r.task_id as string, (commentCount.get(r.task_id as string) ?? 0) + 1);

  const names = await nameMap([
    ...tasks.map((t) => t.created_by).filter(Boolean) as string[],
    ...Array.from(assigneesByTask.values()).flat(),
  ]);

  return tasks.map((t) => {
    const aIds = assigneesByTask.get(t.id) ?? [];
    return {
      ...t,
      assignee_ids: aIds,
      assignees: aIds.map((id) => ({ id, name: names.get(id) ?? "مستخدم" })),
      comment_count: commentCount.get(t.id) ?? 0,
      project_name: t.project_id ? projMap.get(t.project_id) ?? null : null,
      client_name: t.client_id ? cliMap.get(t.client_id) ?? null : null,
      creator_name: t.created_by ? names.get(t.created_by) ?? null : null,
    };
  });
}

export async function getWorkspaceTask(taskId: string): Promise<WorkspaceTaskWithMeta | null> {
  const supabase = createServiceClient();
  const { data } = await supabase.from("workspace_tasks").select("*").eq("id", taskId).is("deleted_at", null).maybeSingle();
  if (!data) return null;
  const list = await listWorkspaceTasks({ scope: "all", userId: "" });
  return list.find((t) => t.id === taskId) ?? null;
}

export async function getTaskAssigneeIds(taskId: string): Promise<string[]> {
  const supabase = createServiceClient();
  const { data } = await supabase.from("workspace_task_assignees").select("user_id").eq("task_id", taskId);
  return (data ?? []).map((r) => r.user_id as string);
}

export async function getTaskCore(taskId: string): Promise<Pick<WorkspaceTaskRow, "id" | "title" | "status" | "created_by"> | null> {
  const supabase = createServiceClient();
  const { data } = await supabase.from("workspace_tasks").select("id, title, status, created_by").eq("id", taskId).maybeSingle();
  return (data as Pick<WorkspaceTaskRow, "id" | "title" | "status" | "created_by">) ?? null;
}

function taskUrl(taskId: string): string {
  return `/dashboard/tasks?task=${taskId}`;
}

export async function createWorkspaceTask(input: CreateWorkspaceTaskInput, actorId: string): Promise<{ ok: boolean; taskId?: string; message?: string }> {
  const supabase = createServiceClient();
  const { data, error } = await supabase
    .from("workspace_tasks")
    .insert({
      title: input.title.trim(),
      description: input.description?.trim() || null,
      project_id: input.projectId || null,
      client_id: input.clientId || null,
      priority: input.priority ?? "medium",
      status: "todo",
      start_date: input.startDate || null,
      due_date: input.dueDate || null,
      checklist: input.checklist ?? [],
      links: input.links ?? [],
      tags: input.tags ?? [],
      notes: input.notes?.trim() || null,
      created_by: actorId,
    })
    .select("id")
    .maybeSingle();
  if (error || !data) return { ok: false, message: error?.message ?? "فشل إنشاء المهمة." };

  const taskId = data.id as string;
  await logActivity(taskId, actorId, "created", { title: input.title });

  if (input.assigneeIds && input.assigneeIds.length > 0) {
    await setWorkspaceTaskAssignees(taskId, actorId, input.assigneeIds, { silent: true });
    await NotificationService.emit({
      dedupeKey: `wtask-assigned-${taskId}`,
      type: "wtask_assigned",
      severity: "info",
      title: "مهمة جديدة أُسندت",
      message: `تم إسناد المهمة «${input.title}» — تفقّدها في مهامي.`,
      targetUrl: taskUrl(taskId),
      targetRecordId: taskId,
    });
  }
  return { ok: true, taskId };
}

export async function updateWorkspaceTaskFields(
  taskId: string,
  actorId: string,
  fields: Partial<Pick<WorkspaceTaskRow, "title" | "description" | "priority" | "project_id" | "client_id" | "start_date" | "due_date" | "checklist" | "links" | "tags" | "notes">>
): Promise<Result> {
  const supabase = createServiceClient();
  const { error } = await supabase.from("workspace_tasks").update(fields).eq("id", taskId);
  if (error) return { ok: false, message: error.message };
  await logActivity(taskId, actorId, "updated", { fields: Object.keys(fields) });
  return { ok: true };
}

export async function changeWorkspaceTaskStatus(
  taskId: string,
  actorId: string,
  newStatus: WTaskStatus,
  extra?: { rejectReason?: string }
): Promise<Result> {
  const supabase = createServiceClient();
  const core = await getTaskCore(taskId);
  if (!core) return { ok: false, message: "المهمة غير موجودة." };

  const patch: Record<string, unknown> = { status: newStatus };
  if (newStatus === "in_progress" && extra?.rejectReason) patch.reject_reason = extra.rejectReason;
  if (newStatus === "in_progress" && !core.status) patch.started_at = new Date().toISOString();
  if (core.status === "todo" && newStatus === "in_progress") patch.started_at = new Date().toISOString();
  if (newStatus === "approved") {
    patch.approved_by = actorId;
    patch.approved_at = new Date().toISOString();
  }
  if (newStatus === "completed") patch.completed_at = new Date().toISOString();

  const { error } = await supabase.from("workspace_tasks").update(patch).eq("id", taskId);
  if (error) return { ok: false, message: error.message };

  const event =
    newStatus === "approved" ? "approved"
    : newStatus === "in_progress" && extra?.rejectReason ? "rejected"
    : newStatus === "completed" ? "completed"
    : "status_changed";
  await logActivity(taskId, actorId, event, { from: core.status, to: newStatus, ...(extra?.rejectReason ? { reason: extra.rejectReason } : {}) });

  // إشعارات الأحداث المهمة
  if (newStatus === "waiting_review") {
    await NotificationService.emit({
      dedupeKey: `wtask-review-${taskId}`,
      type: "wtask_waiting_review",
      severity: "warning",
      title: "مهمة بانتظار المراجعة",
      message: `المهمة «${core.title}» جاهزة للمراجعة والاعتماد.`,
      targetUrl: taskUrl(taskId),
      targetRecordId: taskId,
    });
  } else if (event === "rejected") {
    await NotificationService.emit({
      dedupeKey: `wtask-rejected-${taskId}-${Date.now()}`,
      type: "wtask_rejected",
      severity: "warning",
      title: "مهمة مرفوضة — تحتاج تعديل",
      message: `المهمة «${core.title}» رُفضت: ${extra?.rejectReason ?? ""}`.trim(),
      targetUrl: taskUrl(taskId),
      targetRecordId: taskId,
    });
  } else if (newStatus === "approved" || newStatus === "completed") {
    await NotificationService.emit({
      dedupeKey: `wtask-approved-${taskId}`,
      type: "wtask_approved",
      severity: "info",
      title: newStatus === "completed" ? "تم إكمال مهمة" : "تم اعتماد مهمة",
      message: `المهمة «${core.title}» ${newStatus === "completed" ? "اكتملت" : "تم اعتمادها"}.`,
      targetUrl: taskUrl(taskId),
      targetRecordId: taskId,
    });
  }
  return { ok: true };
}

export async function setWorkspaceTaskAssignees(
  taskId: string,
  actorId: string,
  userIds: string[],
  opts?: { silent?: boolean }
): Promise<Result> {
  const supabase = createServiceClient();
  const clean = Array.from(new Set(userIds.filter(Boolean)));
  await supabase.from("workspace_task_assignees").delete().eq("task_id", taskId);
  if (clean.length > 0) {
    const { error } = await supabase
      .from("workspace_task_assignees")
      .insert(clean.map((uid) => ({ task_id: taskId, user_id: uid, assigned_by: actorId })));
    if (error) return { ok: false, message: error.message };
  }
  await logActivity(taskId, actorId, "assigned", { assignees: clean });
  if (!opts?.silent && clean.length > 0) {
    const core = await getTaskCore(taskId);
    await NotificationService.emit({
      dedupeKey: `wtask-assigned-${taskId}`,
      type: "wtask_assigned",
      severity: "info",
      title: "تم تحديث إسناد مهمة",
      message: `تم إسناد المهمة «${core?.title ?? ""}» — تفقّدها في مهامي.`,
      targetUrl: taskUrl(taskId),
      targetRecordId: taskId,
    });
  }
  return { ok: true };
}

export async function addWorkspaceTaskComment(
  taskId: string,
  authorId: string,
  body: string,
  isReport = false
): Promise<Result> {
  const supabase = createServiceClient();
  const { error } = await supabase.from("workspace_task_comments").insert({ task_id: taskId, author_id: authorId, body: body.trim(), is_report: isReport });
  if (error) return { ok: false, message: error.message };
  await logActivity(taskId, authorId, isReport ? "report_added" : "comment_added", {});
  const core = await getTaskCore(taskId);
  await NotificationService.emit({
    dedupeKey: `wtask-comment-${taskId}-${Date.now()}`,
    type: isReport ? "wtask_report" : "wtask_comment",
    severity: "info",
    title: isReport ? "تقرير مرحلي جديد" : "تعليق جديد على مهمة",
    message: `${isReport ? "تقرير جديد" : "تعليق جديد"} على المهمة «${core?.title ?? ""}».`,
    targetUrl: taskUrl(taskId),
    targetRecordId: taskId,
  });
  return { ok: true };
}

export async function addWorkspaceTaskAttachment(
  taskId: string,
  uploaderId: string,
  file: { storage_path: string; file_name: string; mime_type?: string | null; size_bytes?: number | null }
): Promise<Result> {
  const supabase = createServiceClient();
  const { error } = await supabase.from("workspace_task_attachments").insert({
    task_id: taskId,
    storage_path: file.storage_path,
    file_name: file.file_name,
    mime_type: file.mime_type ?? null,
    size_bytes: file.size_bytes ?? null,
    uploaded_by: uploaderId,
  });
  if (error) return { ok: false, message: error.message };
  await logActivity(taskId, uploaderId, "attachment_added", { file_name: file.file_name });
  return { ok: true };
}

export async function softDeleteWorkspaceTask(taskId: string, actorId: string): Promise<Result> {
  const supabase = createServiceClient();
  const { error } = await supabase.from("workspace_tasks").update({ deleted_at: new Date().toISOString() }).eq("id", taskId);
  if (error) return { ok: false, message: error.message };
  await logActivity(taskId, actorId, "deleted", {});
  return { ok: true };
}

export async function listWorkspaceTaskComments(taskId: string): Promise<WorkspaceTaskComment[]> {
  const supabase = createServiceClient();
  const { data } = await supabase
    .from("workspace_task_comments")
    .select("*")
    .eq("task_id", taskId)
    .is("deleted_at", null)
    .order("created_at", { ascending: true });
  const rows = (data ?? []) as Omit<WorkspaceTaskComment, "author_name">[];
  const names = await nameMap(rows.map((r) => r.author_id).filter(Boolean) as string[]);
  return rows.map((r) => ({ ...r, author_name: r.author_id ? names.get(r.author_id) ?? null : null }));
}

export async function listWorkspaceTaskAttachments(taskId: string): Promise<WorkspaceTaskAttachment[]> {
  const supabase = createServiceClient();
  const { data } = await supabase.from("workspace_task_attachments").select("*").eq("task_id", taskId).order("created_at", { ascending: false });
  return (data ?? []) as WorkspaceTaskAttachment[];
}

export async function listWorkspaceTaskActivity(taskId: string): Promise<WorkspaceTaskActivityRow[]> {
  const supabase = createServiceClient();
  const { data } = await supabase.from("workspace_task_activity").select("*").eq("task_id", taskId).order("created_at", { ascending: false }).limit(100);
  const rows = (data ?? []) as Omit<WorkspaceTaskActivityRow, "actor_name">[];
  const names = await nameMap(rows.map((r) => r.actor_id).filter(Boolean) as string[]);
  return rows.map((r) => ({ ...r, actor_name: r.actor_id ? names.get(r.actor_id) ?? null : null }));
}
