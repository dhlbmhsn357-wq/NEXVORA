import { createServiceClient } from "@/lib/supabase/service";
import { computeMilestoneProgress, computeTaskProgress } from "./task-logic";
import type { Milestone, MilestoneDeliveryType, MilestoneApprovalStatus, Task } from "@/lib/types/database";

/** خدمة Milestones (مرحلة التسليم) — CRUD + اعتماد + حساب التقدّم. */

export async function listMilestones(projectId: string): Promise<Milestone[]> {
  const supabase = createServiceClient();
  const { data } = await supabase.from("milestones").select("*").eq("project_id", projectId).order("order_index").order("planned_date", { nullsFirst: false });
  return (data ?? []) as Milestone[];
}

export async function createMilestone(input: {
  projectId: string;
  title: string;
  description?: string | null;
  deliveryType?: MilestoneDeliveryType;
  plannedDate?: string | null;
  createdBy: string | null;
}): Promise<{ ok: boolean; milestoneId?: string; message?: string }> {
  const supabase = createServiceClient();
  if (!input.title.trim()) return { ok: false, message: "عنوان المرحلة مطلوب." };
  const { data: last } = await supabase.from("milestones").select("order_index").eq("project_id", input.projectId).order("order_index", { ascending: false }).limit(1).maybeSingle();
  const { data, error } = await supabase
    .from("milestones")
    .insert({
      project_id: input.projectId,
      title: input.title.trim(),
      description: input.description ?? null,
      delivery_type: input.deliveryType ?? "custom",
      planned_date: input.plannedDate ?? null,
      order_index: (last?.order_index ?? 0) + 1,
      created_by: input.createdBy,
    })
    .select("id")
    .single();
  if (error || !data) return { ok: false, message: error?.message ?? "فشل الإنشاء." };
  return { ok: true, milestoneId: data.id };
}

export async function updateMilestone(milestoneId: string, fields: Partial<Pick<Milestone, "title" | "description" | "delivery_type" | "planned_date" | "actual_date" | "internal_notes" | "client_feedback">>): Promise<{ ok: boolean; message?: string }> {
  const supabase = createServiceClient();
  const { error } = await supabase.from("milestones").update({ ...fields, updated_at: new Date().toISOString() }).eq("id", milestoneId);
  if (error) return { ok: false, message: error.message };
  return { ok: true };
}

export async function setMilestoneApproval(milestoneId: string, status: MilestoneApprovalStatus): Promise<{ ok: boolean; message?: string }> {
  const supabase = createServiceClient();
  const { error } = await supabase
    .from("milestones")
    .update({ approval_status: status, actual_date: status === "approved" ? new Date().toISOString().slice(0, 10) : null, updated_at: new Date().toISOString() })
    .eq("id", milestoneId);
  if (error) return { ok: false, message: error.message };
  return { ok: true };
}

export async function deleteMilestone(milestoneId: string): Promise<{ ok: boolean; message?: string }> {
  const supabase = createServiceClient();
  const { error } = await supabase.from("milestones").delete().eq("id", milestoneId);
  if (error) return { ok: false, message: error.message };
  return { ok: true };
}

/** يعيد حساب progress_pct لكل Milestone من متوسط تقدّم مهامه الأعلى مستوى. */
export async function recomputeMilestoneProgress(projectId: string): Promise<void> {
  const supabase = createServiceClient();
  const [{ data: milestones }, { data: tasks }] = await Promise.all([
    supabase.from("milestones").select("id").eq("project_id", projectId),
    supabase.from("tasks").select("id, milestone_id, parent_task_id, status, checklist").eq("project_id", projectId),
  ]);
  const taskList = (tasks ?? []) as Pick<Task, "id" | "milestone_id" | "parent_task_id" | "status" | "checklist">[];
  for (const m of milestones ?? []) {
    const topTasks = taskList.filter((t) => t.milestone_id === m.id && !t.parent_task_id);
    const prog = computeMilestoneProgress(topTasks.map((t) => computeTaskProgress(t, [])));
    await supabase.from("milestones").update({ progress_pct: prog }).eq("id", m.id);
  }
}
