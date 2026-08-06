import { after } from "next/server";
import type { SupabaseClient } from "@supabase/supabase-js";
import { createServiceClient } from "@/lib/supabase/service";
import { recordAuthEvent } from "@/lib/auth/audit";
import { emitEvent } from "@/lib/automation/event-bus";
import { EVENT_TYPES } from "@/lib/automation/events";
import { computeProjectHealth, type HealthResult } from "./health";
import { computeUserWorkload, type UserWorkload } from "./capacity";
import { isTerminalStatus, isDoneStatus } from "@/lib/work/statuses";
import { isOverdue } from "@/lib/work/task-logic";
import type {
  OwnershipType, ProjectOwnership, MilestoneApprovalStatus, ItemVisibility, Task, Profile, ProjectRole,
} from "@/lib/types/database";

/**
 * خدمة المحفظة والتسليم (Phase 4) — ملكية المشروع، مراحل التسليم
 * الغنية واعتماداتها، صحة المشروع، وأحمال الفريق. كل شيء عبر service
 * client، والصلاحيات في طبقة الـ Server Actions فوقها.
 */

// ===== Ownership =====
export async function listOwnership(projectId: string): Promise<(ProjectOwnership & { name: string | null })[]> {
  const supabase = createServiceClient();
  const { data } = await supabase.from("project_ownership").select("*").eq("project_id", projectId);
  const rows = (data ?? []) as ProjectOwnership[];
  const ids = rows.map((r) => r.user_id).filter(Boolean) as string[];
  const nameById = new Map<string, string>();
  if (ids.length) {
    const { data: profiles } = await supabase.from("profiles").select("id, full_name, email").in("id", ids);
    for (const p of (profiles ?? []) as Pick<Profile, "id" | "full_name" | "email">[]) nameById.set(p.id, p.full_name || p.email || "مستخدم");
  }
  return rows.map((r) => ({ ...r, name: r.user_id ? nameById.get(r.user_id) ?? null : null }));
}

export async function setOwnership(projectId: string, ownershipType: OwnershipType, userId: string | null, actorId: string): Promise<{ ok: boolean; message?: string }> {
  const supabase = createServiceClient();
  const { data: prev } = await supabase.from("project_ownership").select("user_id").eq("project_id", projectId).eq("ownership_type", ownershipType).maybeSingle();
  const { error } = await supabase
    .from("project_ownership")
    .upsert({ project_id: projectId, ownership_type: ownershipType, user_id: userId, assigned_by: actorId }, { onConflict: "project_id,ownership_type" });
  if (error) return { ok: false, message: error.message };
  await recordAuthEvent({
    actorId,
    targetUserId: userId,
    action: prev?.user_id ? "ownership_transferred" : "ownership_assigned",
    details: { project_id: projectId, ownership_type: ownershipType, from: prev?.user_id ?? null, to: userId },
  });
  return { ok: true };
}

// ===== Delivery phases (milestones enrichment) =====
export interface DeliveryPhaseFields {
  title?: string;
  description?: string | null;
  objectives?: string | null;
  deliverables?: string[];
  expected_output?: string | null;
  start_date?: string | null;
  planned_date?: string | null;
  estimated_days?: number | null;
  assigned_user_ids?: string[];
  visibility?: ItemVisibility;
  internal_notes?: string | null;
  client_feedback?: string | null;
}

export async function updateDeliveryPhase(milestoneId: string, fields: DeliveryPhaseFields): Promise<{ ok: boolean; message?: string }> {
  const supabase = createServiceClient();
  const { error } = await supabase.from("milestones").update({ ...fields, updated_at: new Date().toISOString() }).eq("id", milestoneId);
  if (error) return { ok: false, message: error.message };
  return { ok: true };
}

/** يسجّل اعتماد مرحلة تسليم (append-only) + يحدّث حالة الـ milestone + Audit. */
export async function recordDeliveryApproval(milestoneId: string, projectId: string, status: MilestoneApprovalStatus, actorId: string, note?: string): Promise<{ ok: boolean; message?: string }> {
  const supabase = createServiceClient();
  await supabase.from("delivery_approvals").insert({ milestone_id: milestoneId, project_id: projectId, status, note: note ?? null, actor_id: actorId });
  await supabase
    .from("milestones")
    .update({ approval_status: status, actual_date: status === "client_approved" || status === "approved" ? new Date().toISOString().slice(0, 10) : null, updated_at: new Date().toISOString() })
    .eq("id", milestoneId);
  await recordAuthEvent({ actorId, targetUserId: null, action: "delivery_approval", details: { milestone_id: milestoneId, status } });

  // أطلق حدث الأتمتة: اعتماد → إشعار؛ رفض/طلب تعديل → مهمة معالجة.
  const approved = status === "approved" || status === "client_approved" || status === "manager_approved";
  const rejected = status === "needs_revision";
  if (approved || rejected) {
    const { data: m } = await supabase.from("milestones").select("title, projects(name)").eq("id", milestoneId).maybeSingle();
    const milestoneTitle = (m as { title?: string } | null)?.title ?? "مرحلة تسليم";
    const rel = (m as { projects?: unknown } | null)?.projects;
    const projectName = Array.isArray(rel) ? (rel[0] as { name?: string } | undefined)?.name ?? "" : (rel as { name?: string } | null)?.name ?? "";
    after(() =>
      emitEvent({
        type: approved ? EVENT_TYPES.DELIVERY_APPROVED : EVENT_TYPES.DELIVERY_REJECTED,
        projectId,
        actorId,
        recordId: milestoneId,
        payload: { status, milestoneTitle, projectName },
      })
    );
  }
  return { ok: true };
}

export async function listDeliveryApprovals(milestoneId: string): Promise<{ id: string; status: string; note: string | null; created_at: string; actor_name: string | null }[]> {
  const supabase = createServiceClient();
  const { data } = await supabase.from("delivery_approvals").select("id, status, note, created_at, actor_id").eq("milestone_id", milestoneId).order("created_at", { ascending: false });
  const rows = (data ?? []) as { id: string; status: string; note: string | null; created_at: string; actor_id: string | null }[];
  const ids = [...new Set(rows.map((r) => r.actor_id).filter(Boolean) as string[])];
  const nameById = new Map<string, string>();
  if (ids.length) {
    const { data: profiles } = await supabase.from("profiles").select("id, full_name, email").in("id", ids);
    for (const p of (profiles ?? []) as Pick<Profile, "id" | "full_name" | "email">[]) nameById.set(p.id, p.full_name || p.email || "مستخدم");
  }
  return rows.map((r) => ({ id: r.id, status: r.status, note: r.note, created_at: r.created_at, actor_name: r.actor_id ? nameById.get(r.actor_id) ?? null : null }));
}

// ===== Project Health =====
export async function getProjectHealth(projectId: string): Promise<HealthResult> {
  const supabase = createServiceClient();
  const nowMs = Date.now();
  const today = new Date().toISOString().slice(0, 10);
  const [{ data: tasks }, { data: milestones }, { data: incidents }, { data: eqa }] = await Promise.all([
    supabase.from("tasks").select("status, priority, due_date, parent_task_id, checklist").eq("project_id", projectId),
    supabase.from("milestones").select("planned_date, approval_status").eq("project_id", projectId),
    supabase.from("monitoring_incidents").select("id").eq("project_id", projectId).eq("severity", "critical").neq("status", "resolved"),
    supabase.from("engineering_reviews").select("review_status").eq("project_id", projectId).order("created_at", { ascending: false }).limit(1).maybeSingle(),
  ]);
  const taskList = (tasks ?? []) as Pick<Task, "status" | "priority" | "due_date" | "parent_task_id" | "checklist">[];
  const topLevel = taskList.filter((t) => !t.parent_task_id);
  const doneCount = topLevel.filter((t) => isDoneStatus(t.status)).length;
  const overallProgress = topLevel.length ? Math.round((doneCount / topLevel.length) * 100) : 0;
  const overdue = taskList.filter((t) => isOverdue(t, nowMs));
  const delayedMilestones = (milestones ?? []).filter((m) => m.planned_date && m.planned_date < today && m.approval_status !== "approved" && m.approval_status !== "client_approved").length;

  return computeProjectHealth({
    overallProgress,
    blockedTasks: taskList.filter((t) => t.status === "blocked").length,
    overdueTasks: overdue.length,
    criticalOverdueTasks: overdue.filter((t) => t.priority === "critical").length,
    delayedMilestones,
    openCriticalIncidents: (incidents ?? []).length,
    engineeringQaFailing: (eqa as { review_status?: string } | null)?.review_status === "failed",
    totalTasks: taskList.length,
  });
}

// ===== Team workload / capacity =====
export interface MemberWorkload extends UserWorkload {
  userId: string;
  name: string;
  projectRole: ProjectRole;
}

/** أحمال أعضاء مشروع — لكل عضو مهامه غير المنتهية عبر كل المشاريع. */
export async function getTeamWorkload(projectId: string): Promise<MemberWorkload[]> {
  const supabase = createServiceClient();
  const { data: members } = await supabase.from("project_members").select("user_id, project_role").eq("project_id", projectId);
  const memberList = (members ?? []) as { user_id: string; project_role: ProjectRole }[];
  if (memberList.length === 0) return [];
  const userIds = memberList.map((m) => m.user_id);

  const [{ data: profiles }, { data: assignRows }] = await Promise.all([
    supabase.from("profiles").select("id, full_name, email").in("id", userIds),
    supabase.from("task_assignees").select("user_id, task_id").in("user_id", userIds),
  ]);
  const nameById = new Map<string, string>();
  for (const p of (profiles ?? []) as Pick<Profile, "id" | "full_name" | "email">[]) nameById.set(p.id, p.full_name || p.email || "مستخدم");

  const taskIds = [...new Set((assignRows ?? []).map((a) => a.task_id))];
  const tasksById = new Map<string, Pick<Task, "status" | "estimated_hours">>();
  if (taskIds.length) {
    const { data: tasks } = await supabase.from("tasks").select("id, status, estimated_hours").in("id", taskIds);
    for (const t of (tasks ?? []) as (Pick<Task, "status" | "estimated_hours"> & { id: string })[]) tasksById.set(t.id, { status: t.status, estimated_hours: t.estimated_hours });
  }

  return memberList.map((m) => {
    const userTasks = (assignRows ?? []).filter((a) => a.user_id === m.user_id).map((a) => tasksById.get(a.task_id)).filter(Boolean) as Pick<Task, "status" | "estimated_hours">[];
    return { userId: m.user_id, name: nameById.get(m.user_id) ?? "مستخدم", projectRole: m.project_role, ...computeUserWorkload(userTasks) };
  });
}

// ===== Workspace bootstrap (lead → project) =====
/**
 * تهيئة مساحة عمل المشروع تلقائيًا عند التحويل من Lead: منشئ المشروع
 * يبقى عضو فريق (pm) + مالك المشروع (project owner)، وبتتعمل قنوات
 * التعاون. idempotent. (باقي الطبقات — المهام/التسليم/الـ Brain — بتتربط
 * تلقائيًا بالـ project_id فمفيش تهيئة إضافية مطلوبة.)
 */
export async function ensureProjectWorkspace(projectId: string, creatorId: string | null): Promise<void> {
  const supabase: SupabaseClient = createServiceClient();
  if (creatorId) {
    await supabase.from("project_members").upsert({ project_id: projectId, user_id: creatorId, project_role: "pm", added_by: creatorId }, { onConflict: "project_id,user_id" });
    await supabase.from("project_ownership").upsert({ project_id: projectId, ownership_type: "project", user_id: creatorId, assigned_by: creatorId }, { onConflict: "project_id,ownership_type" });
  }
  try {
    const { ensureProjectChannels } = await import("@/lib/collaboration/service");
    await ensureProjectChannels(projectId, creatorId);
  } catch (err) {
    console.error("[Portfolio] ensureProjectChannels failed:", err instanceof Error ? err.message : err);
  }
  await recordAuthEvent({ actorId: creatorId, targetUserId: null, action: "project_workspace_created", details: { project_id: projectId } });
}

export { isTerminalStatus };
