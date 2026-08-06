"use server";

import { revalidatePath } from "next/cache";
import { requireRole } from "@/lib/auth/rbac";
import { canManageProjectTeam, canApproveMilestone, canManageMilestones } from "@/lib/work/permissions";
import {
  setOwnership, listOwnership, recordDeliveryApproval, updateDeliveryPhase, listDeliveryApprovals,
  getProjectHealth, getTeamWorkload, type MemberWorkload, type DeliveryPhaseFields,
} from "@/lib/portfolio/service";
import { analyzeDelivery, type DeliveryIntelligenceResult } from "@/lib/portfolio/ai-service";
import { listMilestones } from "@/lib/work/milestone-service";
import { listProjectMembers } from "@/lib/work/project-members-service";
import type { HealthResult } from "@/lib/portfolio/health";
import type { UserRole, OwnershipType, MilestoneApprovalStatus, ProjectOwnership, ItemVisibility } from "@/lib/types/database";

const PATH = (id: string) => `/dashboard/projects/${id}`;
async function auth() {
  return requireRole(["owner", "admin", "supervisor", "member"]);
}

export async function setOwnershipAction(projectId: string, ownershipType: OwnershipType, userId: string | null): Promise<{ ok: boolean; message?: string }> {
  const a = await auth();
  if (!a.ok) return { ok: false, message: a.message };
  if (!canManageProjectTeam(a.role as UserRole)) return { ok: false, message: "إدارة الملكية للمشرفين فأعلى." };
  const r = await setOwnership(projectId, ownershipType, userId, a.userId!);
  if (r.ok) revalidatePath(PATH(projectId));
  return r;
}

export async function loadOwnershipAction(projectId: string): Promise<{ ok: boolean; ownership: (ProjectOwnership & { name: string | null })[] }> {
  const a = await auth();
  if (!a.ok) return { ok: false, ownership: [] };
  return { ok: true, ownership: await listOwnership(projectId) };
}

export async function approveDeliveryAction(milestoneId: string, projectId: string, status: MilestoneApprovalStatus, note?: string): Promise<{ ok: boolean; message?: string }> {
  const a = await auth();
  if (!a.ok) return { ok: false, message: a.message };
  // اعتماد المدير/العميل = admin فأعلى؛ باقي المراحل (internal_review/needs_revision) = مشرف فأعلى
  const needsAdmin = status === "manager_approved" || status === "client_approved" || status === "approved";
  if (needsAdmin ? !canApproveMilestone(a.role as UserRole) : !canManageMilestones(a.role as UserRole)) {
    return { ok: false, message: "مش مسموح بهذا الإجراء." };
  }
  const r = await recordDeliveryApproval(milestoneId, projectId, status, a.userId!, note);
  if (r.ok) revalidatePath(PATH(projectId));
  return r;
}

export async function updateDeliveryPhaseAction(milestoneId: string, projectId: string, fields: DeliveryPhaseFields): Promise<{ ok: boolean; message?: string }> {
  const a = await auth();
  if (!a.ok) return { ok: false, message: a.message };
  if (!canManageMilestones(a.role as UserRole)) return { ok: false, message: "مش مسموح." };
  const r = await updateDeliveryPhase(milestoneId, fields);
  if (r.ok) revalidatePath(PATH(projectId));
  return r;
}

export async function setPhaseVisibilityAction(milestoneId: string, projectId: string, visibility: ItemVisibility): Promise<{ ok: boolean; message?: string }> {
  return updateDeliveryPhaseAction(milestoneId, projectId, { visibility });
}

export async function loadApprovalsAction(milestoneId: string): Promise<{ ok: boolean; approvals: Awaited<ReturnType<typeof listDeliveryApprovals>> }> {
  const a = await auth();
  if (!a.ok) return { ok: false, approvals: [] };
  return { ok: true, approvals: await listDeliveryApprovals(milestoneId) };
}

export async function loadHealthAction(projectId: string): Promise<{ ok: boolean; health?: HealthResult }> {
  const a = await auth();
  if (!a.ok) return { ok: false };
  return { ok: true, health: await getProjectHealth(projectId) };
}

export async function loadWorkloadAction(projectId: string): Promise<{ ok: boolean; workload: MemberWorkload[] }> {
  const a = await auth();
  if (!a.ok) return { ok: false, workload: [] };
  return { ok: true, workload: await getTeamWorkload(projectId) };
}

export async function analyzeDeliveryAction(projectId: string, projectName: string): Promise<{ ok: boolean; result?: DeliveryIntelligenceResult; message?: string }> {
  const a = await auth();
  if (!a.ok) return { ok: false, message: a.message };
  const [health, milestones, members] = await Promise.all([
    getProjectHealth(projectId), listMilestones(projectId), listProjectMembers(projectId),
  ]);
  const today = new Date().toISOString().slice(0, 10);
  return analyzeDelivery({
    projectName,
    healthScore: health.score,
    overallProgress: 0,
    blockedTasks: 0,
    overdueTasks: 0,
    delayedMilestones: milestones.filter((m) => m.planned_date && m.planned_date < today && m.approval_status !== "approved" && m.approval_status !== "client_approved").length,
    teamRoles: [...new Set(members.map((m) => m.project_role))],
    upcomingMilestones: milestones.filter((m) => m.approval_status !== "approved").slice(0, 6).map((m) => ({ title: m.title, planned_date: m.planned_date, progress: m.progress_pct })),
  }, projectId, a.userId!);
}
