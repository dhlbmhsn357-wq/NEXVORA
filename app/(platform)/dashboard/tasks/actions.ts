"use server";

import { revalidatePath } from "next/cache";
import { requireRole } from "@/lib/auth/rbac";
import { ALL_ROLES } from "@/lib/auth/roles";
import { createServiceClient } from "@/lib/supabase/service";
import type { UserRole } from "@/lib/types/database";
import {
  canApproveWTask,
  canAssignWTask,
  canChangeWTaskStatus,
  canCreateWTask,
  canDeleteWTask,
  canEditWTask,
} from "@/lib/workspace-tasks/permissions";
import type { WTaskStatus, WTaskPriority } from "@/lib/workspace-tasks/statuses";
import type { ChecklistItem, WTaskLink } from "@/lib/workspace-tasks/task-logic";
import {
  addWorkspaceTaskAttachment,
  addWorkspaceTaskComment,
  changeWorkspaceTaskStatus,
  createWorkspaceTask,
  getTaskAssigneeIds,
  getTaskCore,
  listWorkspaceTaskActivity,
  listWorkspaceTaskAttachments,
  listWorkspaceTaskComments,
  setWorkspaceTaskAssignees,
  softDeleteWorkspaceTask,
  updateWorkspaceTaskFields,
  type WorkspaceTaskActivityRow,
  type WorkspaceTaskAttachment,
  type WorkspaceTaskComment,
} from "@/lib/workspace-tasks/service";

const PATH = "/dashboard/tasks";
type ActionResult = { ok: boolean; message?: string };

const TASK_BUCKET = "chat-attachments";

async function auth() {
  return requireRole([...ALL_ROLES]);
}

/** إنشاء مهمة — owner/admin/supervisor فقط (المنفّذ لأ). */
export async function createTaskAction(input: {
  title: string;
  description?: string;
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
}): Promise<ActionResult> {
  const a = await auth();
  if (!a.ok) return { ok: false, message: a.message };
  if (!canCreateWTask(a.role as UserRole)) return { ok: false, message: "ماعندكش صلاحية إنشاء مهام." };
  if (!input.title?.trim()) return { ok: false, message: "عنوان المهمة مطلوب." };
  if (input.assigneeIds && input.assigneeIds.length > 0 && !canAssignWTask(a.role as UserRole)) {
    return { ok: false, message: "ماعندكش صلاحية إسناد المهام." };
  }

  const res = await createWorkspaceTask(input, a.userId!);
  if (res.ok) revalidatePath(PATH);
  return res;
}

async function loadGuardCtx(taskId: string) {
  const core = await getTaskCore(taskId);
  const assigneeIds = await getTaskAssigneeIds(taskId);
  return { core, assigneeIds };
}

export async function updateTaskAction(
  taskId: string,
  fields: {
    title?: string;
    description?: string | null;
    priority?: WTaskPriority;
    projectId?: string | null;
    clientId?: string | null;
    startDate?: string | null;
    dueDate?: string | null;
    checklist?: ChecklistItem[];
    links?: WTaskLink[];
    tags?: string[];
    notes?: string | null;
  }
): Promise<ActionResult> {
  const a = await auth();
  if (!a.ok) return { ok: false, message: a.message };
  const { core, assigneeIds } = await loadGuardCtx(taskId);
  if (!core) return { ok: false, message: "المهمة غير موجودة." };
  if (!canEditWTask(a.role as UserRole, a.userId!, core.created_by, assigneeIds)) {
    return { ok: false, message: "ماعندكش صلاحية تعديل المهمة دي." };
  }

  const res = await updateWorkspaceTaskFields(taskId, a.userId!, {
    ...(fields.title !== undefined ? { title: fields.title.trim() } : {}),
    ...(fields.description !== undefined ? { description: fields.description?.trim() || null } : {}),
    ...(fields.priority !== undefined ? { priority: fields.priority } : {}),
    ...(fields.projectId !== undefined ? { project_id: fields.projectId || null } : {}),
    ...(fields.clientId !== undefined ? { client_id: fields.clientId || null } : {}),
    ...(fields.startDate !== undefined ? { start_date: fields.startDate || null } : {}),
    ...(fields.dueDate !== undefined ? { due_date: fields.dueDate || null } : {}),
    ...(fields.checklist !== undefined ? { checklist: fields.checklist } : {}),
    ...(fields.links !== undefined ? { links: fields.links } : {}),
    ...(fields.tags !== undefined ? { tags: fields.tags } : {}),
    ...(fields.notes !== undefined ? { notes: fields.notes?.trim() || null } : {}),
  });
  if (res.ok) revalidatePath(PATH);
  return res;
}

export async function changeStatusAction(
  taskId: string,
  newStatus: WTaskStatus,
  rejectReason?: string
): Promise<ActionResult> {
  const a = await auth();
  if (!a.ok) return { ok: false, message: a.message };
  const { core, assigneeIds } = await loadGuardCtx(taskId);
  if (!core) return { ok: false, message: "المهمة غير موجودة." };

  const allowed = canChangeWTaskStatus({
    role: a.role as UserRole,
    userId: a.userId!,
    creatorId: core.created_by,
    assigneeIds,
    from: core.status,
    to: newStatus,
  });
  if (!allowed) return { ok: false, message: "الانتقال ده غير مسموح لصلاحيتك أو غير صالح." };
  if ((newStatus === "approved" || newStatus === "completed") && !canApproveWTask(a.role as UserRole)) {
    return { ok: false, message: "الاعتماد/الإكمال لمسؤول النظام أو المسؤول فقط." };
  }
  if (newStatus === "in_progress" && rejectReason && !canApproveWTask(a.role as UserRole)) {
    return { ok: false, message: "الرفض بعد المراجعة للمدير فقط." };
  }

  const res = await changeWorkspaceTaskStatus(taskId, a.userId!, newStatus, rejectReason ? { rejectReason } : undefined);
  if (res.ok) revalidatePath(PATH);
  return res;
}

/** اختصار المراجعة: اعتماد (approved) أو رفض (→ in_progress + سبب). */
export async function reviewTaskAction(taskId: string, decision: "approve" | "reject", reason?: string): Promise<ActionResult> {
  if (decision === "reject") {
    if (!reason?.trim()) return { ok: false, message: "اكتب سبب الرفض." };
    return changeStatusAction(taskId, "in_progress", reason.trim());
  }
  return changeStatusAction(taskId, "approved");
}

export async function setAssigneesAction(taskId: string, userIds: string[]): Promise<ActionResult> {
  const a = await auth();
  if (!a.ok) return { ok: false, message: a.message };
  if (!canAssignWTask(a.role as UserRole)) return { ok: false, message: "ماعندكش صلاحية الإسناد." };
  const res = await setWorkspaceTaskAssignees(taskId, a.userId!, userIds);
  if (res.ok) revalidatePath(PATH);
  return res;
}

export async function addCommentAction(taskId: string, body: string, isReport = false): Promise<ActionResult> {
  const a = await auth();
  if (!a.ok) return { ok: false, message: a.message };
  if (!body?.trim()) return { ok: false, message: "اكتب نص التعليق." };
  const res = await addWorkspaceTaskComment(taskId, a.userId!, body, isReport);
  if (res.ok) revalidatePath(PATH);
  return res;
}

export async function deleteTaskAction(taskId: string): Promise<ActionResult> {
  const a = await auth();
  if (!a.ok) return { ok: false, message: a.message };
  if (!canDeleteWTask(a.role as UserRole)) return { ok: false, message: "الحذف لمسؤول النظام/المسؤول فقط." };
  const res = await softDeleteWorkspaceTask(taskId, a.userId!);
  if (res.ok) revalidatePath(PATH);
  return res;
}

export async function uploadAttachmentAction(taskId: string, formData: FormData): Promise<ActionResult> {
  const a = await auth();
  if (!a.ok) return { ok: false, message: a.message };
  const { core, assigneeIds } = await loadGuardCtx(taskId);
  if (!core) return { ok: false, message: "المهمة غير موجودة." };
  if (!canEditWTask(a.role as UserRole, a.userId!, core.created_by, assigneeIds)) {
    return { ok: false, message: "ماعندكش صلاحية رفع مرفقات للمهمة دي." };
  }

  const file = formData.get("file");
  if (!(file instanceof File) || file.size === 0) return { ok: false, message: "اختر ملفًا." };
  if (file.size > 15 * 1024 * 1024) return { ok: false, message: "أقصى حجم للملف 15 ميجابايت." };

  const supabase = createServiceClient();
  const safeName = file.name.replace(/[^a-zA-Z0-9._-]/g, "_");
  const path = `workspace-tasks/${taskId}/${Date.now()}-${safeName}`;
  const bytes = new Uint8Array(await file.arrayBuffer());
  const { error: upErr } = await supabase.storage.from(TASK_BUCKET).upload(path, bytes, {
    contentType: file.type || "application/octet-stream",
    upsert: false,
  });
  if (upErr) return { ok: false, message: `فشل الرفع: ${upErr.message}` };

  const res = await addWorkspaceTaskAttachment(taskId, a.userId!, {
    storage_path: path,
    file_name: file.name,
    mime_type: file.type || null,
    size_bytes: file.size,
  });
  if (res.ok) revalidatePath(PATH);
  return res;
}

export interface TaskDetailPayload {
  comments: WorkspaceTaskComment[];
  attachments: (WorkspaceTaskAttachment & { url: string | null })[];
  activity: WorkspaceTaskActivityRow[];
}

export async function loadTaskDetailAction(taskId: string): Promise<{ ok: boolean; data?: TaskDetailPayload; message?: string }> {
  const a = await auth();
  if (!a.ok) return { ok: false, message: a.message };
  const [comments, attachmentsRaw, activity] = await Promise.all([
    listWorkspaceTaskComments(taskId),
    listWorkspaceTaskAttachments(taskId),
    listWorkspaceTaskActivity(taskId),
  ]);

  const supabase = createServiceClient();
  const attachments = await Promise.all(
    attachmentsRaw.map(async (att) => {
      const { data } = await supabase.storage.from(TASK_BUCKET).createSignedUrl(att.storage_path, 60 * 60);
      return { ...att, url: data?.signedUrl ?? null };
    })
  );
  return { ok: true, data: { comments, attachments, activity } };
}
