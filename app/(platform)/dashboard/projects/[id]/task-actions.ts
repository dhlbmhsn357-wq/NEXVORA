"use server";

import { revalidatePath } from "next/cache";
import { requireRole } from "@/lib/auth/rbac";
import {
  canCreateTask, canAssignTask, canDeleteTask, canUpdateTask, canManageMilestones, canApproveMilestone, canManageProjectTeam,
} from "@/lib/work/permissions";
import {
  createTask, changeStatus, updateTaskFields, setAssignees, addDependency, deleteTask,
  listProjectTasks, computeTaskProgressMap, type TaskWithMeta,
} from "@/lib/work/task-service";
import {
  createMilestone, updateMilestone, setMilestoneApproval, deleteMilestone, recomputeMilestoneProgress, listMilestones,
} from "@/lib/work/milestone-service";
import { addProjectMember, removeProjectMember, listProjectMembers, type ProjectMemberWithName } from "@/lib/work/project-members-service";
import { addTaskComment, listTaskComments, type TaskCommentWithAuthor } from "@/lib/work/comments-service";
import { analyzeTask } from "@/lib/work/ai-service";
import { createServiceClient } from "@/lib/supabase/service";
import type {
  UserRole, TaskStatus, TaskPriority, MilestoneDeliveryType, MilestoneApprovalStatus, ProjectRole, Milestone, TaskActivity,
} from "@/lib/types/database";

const PROJECT_PATH = (id: string) => `/dashboard/projects/${id}`;

async function auth() {
  return requireRole(["owner", "admin", "supervisor", "member"]);
}

// ---- Tasks ----
export async function createTaskAction(input: {
  projectId: string; title: string; description?: string; taskType?: string; priority?: TaskPriority;
  milestoneId?: string | null; parentTaskId?: string | null; dueDate?: string | null; assigneeIds?: string[];
}): Promise<{ ok: boolean; taskId?: string; message?: string }> {
  const a = await auth();
  if (!a.ok) return { ok: false, message: a.message };
  if (!canCreateTask(a.role as UserRole)) return { ok: false, message: "مش مسموح." };
  if (input.assigneeIds && input.assigneeIds.length > 0 && !canAssignTask(a.role as UserRole)) {
    return { ok: false, message: "التعيين للمشرفين فأعلى." };
  }
  const r = await createTask({ ...input, createdBy: a.userId! });
  if (r.ok) { await recomputeMilestoneProgress(input.projectId); revalidatePath(PROJECT_PATH(input.projectId)); }
  return r;
}

export async function changeTaskStatusAction(taskId: string, projectId: string, status: TaskStatus): Promise<{ ok: boolean; message?: string }> {
  const a = await auth();
  if (!a.ok) return { ok: false, message: a.message };
  const guard = await canUpdateTaskGuard(taskId, a.role as UserRole, a.userId!);
  if (!guard.ok) return guard;
  const r = await changeStatus(taskId, a.userId!, status);
  if (r.ok) { await recomputeMilestoneProgress(projectId); revalidatePath(PROJECT_PATH(projectId)); }
  return r;
}

export async function updateTaskAction(taskId: string, projectId: string, fields: Record<string, unknown>): Promise<{ ok: boolean; message?: string }> {
  const a = await auth();
  if (!a.ok) return { ok: false, message: a.message };
  const guard = await canUpdateTaskGuard(taskId, a.role as UserRole, a.userId!);
  if (!guard.ok) return guard;
  const r = await updateTaskFields(taskId, a.userId!, fields);
  if (r.ok) { await recomputeMilestoneProgress(projectId); revalidatePath(PROJECT_PATH(projectId)); }
  return r;
}

export async function setTaskAssigneesAction(taskId: string, projectId: string, userIds: string[]): Promise<{ ok: boolean; message?: string }> {
  const a = await auth();
  if (!a.ok) return { ok: false, message: a.message };
  if (!canAssignTask(a.role as UserRole)) return { ok: false, message: "التعيين للمشرفين فأعلى." };
  const r = await setAssignees(taskId, a.userId!, userIds);
  if (r.ok) revalidatePath(PROJECT_PATH(projectId));
  return r;
}

export async function addDependencyAction(taskId: string, projectId: string, dependsOnTaskId: string): Promise<{ ok: boolean; message?: string }> {
  const a = await auth();
  if (!a.ok) return { ok: false, message: a.message };
  if (!canAssignTask(a.role as UserRole)) return { ok: false, message: "إدارة التبعيات للمشرفين فأعلى." };
  const r = await addDependency(taskId, dependsOnTaskId);
  if (r.ok) revalidatePath(PROJECT_PATH(projectId));
  return r;
}

export async function deleteTaskAction(taskId: string, projectId: string): Promise<{ ok: boolean; message?: string }> {
  const a = await auth();
  if (!a.ok) return { ok: false, message: a.message };
  if (!canDeleteTask(a.role as UserRole)) return { ok: false, message: "الحذف للمسؤولين فأعلى." };
  const r = await deleteTask(taskId, a.userId!);
  if (r.ok) { await recomputeMilestoneProgress(projectId); revalidatePath(PROJECT_PATH(projectId)); }
  return r;
}

export async function loadTasksAction(projectId: string): Promise<{ ok: boolean; tasks: TaskWithMeta[]; progress: Record<string, number> }> {
  const a = await auth();
  if (!a.ok) return { ok: false, tasks: [], progress: {} };
  const tasks = await listProjectTasks(projectId);
  const progressMap = await computeTaskProgressMap(tasks);
  return { ok: true, tasks, progress: Object.fromEntries(progressMap) };
}

async function canUpdateTaskGuard(taskId: string, role: UserRole, userId: string): Promise<{ ok: boolean; message?: string }> {
  const supabase = createServiceClient();
  const { data: task } = await supabase.from("tasks").select("created_by").eq("id", taskId).maybeSingle();
  const { data: assignees } = await supabase.from("task_assignees").select("user_id").eq("task_id", taskId);
  const assigneeIds = (assignees ?? []).map((x) => x.user_id);
  if (!canUpdateTask(role, task?.created_by ?? null, assigneeIds, userId)) return { ok: false, message: "مش مسموح تعدّل المهمة دي." };
  return { ok: true };
}

// ---- AI ----
export async function analyzeTaskAction(projectId: string, title: string, description: string): Promise<{ ok: boolean; result?: Awaited<ReturnType<typeof analyzeTask>>["result"]; message?: string }> {
  const a = await auth();
  if (!a.ok) return { ok: false, message: a.message };
  return analyzeTask(title, description, a.userId!, projectId);
}

// ---- Comments ----
export async function addTaskCommentAction(taskId: string, projectId: string, body: string): Promise<{ ok: boolean; message?: string }> {
  const a = await auth();
  if (!a.ok) return { ok: false, message: a.message };
  const r = await addTaskComment(taskId, a.userId!, body);
  if (r.ok) revalidatePath(PROJECT_PATH(projectId));
  return r;
}
export async function loadTaskCommentsAction(taskId: string): Promise<{ ok: boolean; comments: TaskCommentWithAuthor[] }> {
  const a = await auth();
  if (!a.ok) return { ok: false, comments: [] };
  return { ok: true, comments: await listTaskComments(taskId) };
}
export async function loadTaskActivityAction(taskId: string): Promise<{ ok: boolean; activity: TaskActivity[] }> {
  const a = await auth();
  if (!a.ok) return { ok: false, activity: [] };
  const supabase = createServiceClient();
  const { data } = await supabase.from("task_activity").select("*").eq("task_id", taskId).order("created_at", { ascending: false }).limit(30);
  return { ok: true, activity: (data ?? []) as TaskActivity[] };
}

// ---- Milestones ----
export async function createMilestoneAction(input: { projectId: string; title: string; description?: string; deliveryType?: MilestoneDeliveryType; plannedDate?: string | null }): Promise<{ ok: boolean; message?: string }> {
  const a = await auth();
  if (!a.ok) return { ok: false, message: a.message };
  if (!canManageMilestones(a.role as UserRole)) return { ok: false, message: "إدارة المراحل للمشرفين فأعلى." };
  const r = await createMilestone({ ...input, createdBy: a.userId! });
  if (r.ok) revalidatePath(PROJECT_PATH(input.projectId));
  return r;
}
export async function updateMilestoneAction(milestoneId: string, projectId: string, fields: Partial<Pick<Milestone, "title" | "description" | "delivery_type" | "planned_date" | "actual_date" | "internal_notes" | "client_feedback">>): Promise<{ ok: boolean; message?: string }> {
  const a = await auth();
  if (!a.ok) return { ok: false, message: a.message };
  if (!canManageMilestones(a.role as UserRole)) return { ok: false, message: "مش مسموح." };
  const r = await updateMilestone(milestoneId, fields);
  if (r.ok) revalidatePath(PROJECT_PATH(projectId));
  return r;
}
export async function approveMilestoneAction(milestoneId: string, projectId: string, status: MilestoneApprovalStatus): Promise<{ ok: boolean; message?: string }> {
  const a = await auth();
  if (!a.ok) return { ok: false, message: a.message };
  if (!canApproveMilestone(a.role as UserRole)) return { ok: false, message: "اعتماد المراحل للمسؤولين فأعلى." };
  const r = await setMilestoneApproval(milestoneId, status);
  if (r.ok) revalidatePath(PROJECT_PATH(projectId));
  return r;
}
export async function deleteMilestoneAction(milestoneId: string, projectId: string): Promise<{ ok: boolean; message?: string }> {
  const a = await auth();
  if (!a.ok) return { ok: false, message: a.message };
  if (!canManageMilestones(a.role as UserRole)) return { ok: false, message: "مش مسموح." };
  const r = await deleteMilestone(milestoneId);
  if (r.ok) revalidatePath(PROJECT_PATH(projectId));
  return r;
}
export async function loadMilestonesAction(projectId: string): Promise<{ ok: boolean; milestones: Milestone[] }> {
  const a = await auth();
  if (!a.ok) return { ok: false, milestones: [] };
  return { ok: true, milestones: await listMilestones(projectId) };
}

// ---- Project team ----
export async function addProjectMemberAction(projectId: string, userId: string, projectRole: ProjectRole): Promise<{ ok: boolean; message?: string }> {
  const a = await auth();
  if (!a.ok) return { ok: false, message: a.message };
  if (!canManageProjectTeam(a.role as UserRole)) return { ok: false, message: "إدارة الفريق للمشرفين فأعلى." };
  const r = await addProjectMember(projectId, userId, projectRole, a.userId!);
  if (r.ok) revalidatePath(PROJECT_PATH(projectId));
  return r;
}
export async function removeProjectMemberAction(projectId: string, userId: string): Promise<{ ok: boolean; message?: string }> {
  const a = await auth();
  if (!a.ok) return { ok: false, message: a.message };
  if (!canManageProjectTeam(a.role as UserRole)) return { ok: false, message: "مش مسموح." };
  const r = await removeProjectMember(projectId, userId, a.userId!);
  if (r.ok) revalidatePath(PROJECT_PATH(projectId));
  return r;
}
export async function loadProjectMembersAction(projectId: string): Promise<{ ok: boolean; members: ProjectMemberWithName[] }> {
  const a = await auth();
  if (!a.ok) return { ok: false, members: [] };
  return { ok: true, members: await listProjectMembers(projectId) };
}
