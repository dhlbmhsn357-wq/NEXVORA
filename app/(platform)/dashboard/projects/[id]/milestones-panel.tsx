"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Plus, Flag, X, Trash2, UserPlus } from "lucide-react";
import Card from "@/components/ui/Card";
import Button from "@/components/ui/Button";
import Input from "@/components/ui/Input";
import Badge, { type BadgeTone } from "@/components/ui/Badge";
import Avatar from "@/components/ui/Avatar";
import { toast } from "@/components/ui/Toaster";
import { MILESTONE_DELIVERY_LABELS, PROJECT_ROLE_LABELS, ALL_PROJECT_ROLES } from "@/lib/work/statuses";
import { canManageMilestones, canApproveMilestone, canManageProjectTeam } from "@/lib/work/permissions";
import {
  createMilestoneAction, deleteMilestoneAction,
  addProjectMemberAction, removeProjectMemberAction,
} from "./task-actions";
import { approveDeliveryAction, setPhaseVisibilityAction } from "./portfolio-actions";
import type { Milestone, MilestoneApprovalStatus, MilestoneDeliveryType, ProjectRole, UserRole, ItemVisibility } from "@/lib/types/database";
import type { ProjectMemberWithName } from "@/lib/work/project-members-service";

const APPROVAL_TONE: Record<MilestoneApprovalStatus, BadgeTone> = {
  pending: "warning", internal_review: "info", manager_approved: "success", client_approved: "success",
  approved: "success", rejected: "danger", changes_requested: "info", needs_revision: "warning",
};
const APPROVAL_LABEL: Record<MilestoneApprovalStatus, string> = {
  pending: "بانتظار", internal_review: "مراجعة داخلية", manager_approved: "اعتماد المدير", client_approved: "اعتماد العميل",
  approved: "معتمد", rejected: "مرفوض", changes_requested: "مطلوب تعديل", needs_revision: "يحتاج مراجعة",
};
const APPROVAL_FLOW: MilestoneApprovalStatus[] = ["pending", "internal_review", "manager_approved", "client_approved", "needs_revision", "rejected"];
const VISIBILITY_LABEL: Record<ItemVisibility, string> = { internal: "داخلي", client_visible: "ظاهر للعميل", hidden: "مخفي" };
const DELIVERY_TYPES: MilestoneDeliveryType[] = ["prototype", "module", "beta", "alpha", "release_candidate", "final", "custom"];
const PROJECT_ROLES: ProjectRole[] = ALL_PROJECT_ROLES;

export default function MilestonesPanel({ projectId, role, milestones, members, allUsers }: {
  projectId: string; role: UserRole; milestones: Milestone[]; members: ProjectMemberWithName[];
  allUsers: { id: string; name: string }[];
}) {
  const router = useRouter();
  const [showCreate, setShowCreate] = useState(false);
  const [title, setTitle] = useState("");
  const [deliveryType, setDeliveryType] = useState<MilestoneDeliveryType>("custom");
  const [plannedDate, setPlannedDate] = useState("");

  async function create() {
    if (!title.trim()) return;
    const r = await createMilestoneAction({ projectId, title, deliveryType, plannedDate: plannedDate || null });
    if (!r.ok) return toast.error(r.message ?? "فشل.");
    setTitle(""); setPlannedDate(""); setShowCreate(false); router.refresh();
  }
  async function approve(id: string, status: MilestoneApprovalStatus) {
    const r = await approveDeliveryAction(id, projectId, status);
    if (!r.ok) return toast.error(r.message ?? "فشل."); router.refresh();
  }
  async function changeVisibility(id: string, visibility: ItemVisibility) {
    const r = await setPhaseVisibilityAction(id, projectId, visibility);
    if (!r.ok) return toast.error(r.message ?? "فشل."); router.refresh();
  }
  async function remove(id: string) {
    if (!window.confirm("حذف المرحلة؟")) return;
    const r = await deleteMilestoneAction(id, projectId);
    if (!r.ok) return toast.error(r.message ?? "فشل."); router.refresh();
  }

  return (
    <div className="space-y-4">
      {/* فريق المشروع */}
      <ProjectTeam projectId={projectId} role={role} members={members} allUsers={allUsers} />

      {/* Milestones */}
      <Card padding="md">
        <div className="mb-3 flex items-center justify-between">
          <p className="flex items-center gap-2 text-sm font-semibold text-[var(--v-text)]"><Flag size={16} className="text-[var(--v-primary)]" /> مراحل التسليم</p>
          {canManageMilestones(role) && <Button variant="primary" size="sm" icon={<Plus size={14} />} onClick={() => setShowCreate((v) => !v)}>{showCreate ? "إلغاء" : "مرحلة جديدة"}</Button>}
        </div>

        {showCreate && (
          <div className="mb-3 grid gap-2 rounded-[var(--v-radius-md)] border border-[var(--v-border)] p-3 sm:grid-cols-3">
            <Input placeholder="عنوان المرحلة" value={title} onChange={(e) => setTitle(e.target.value)} className="sm:col-span-3" />
            <select value={deliveryType} onChange={(e) => setDeliveryType(e.target.value as MilestoneDeliveryType)} className="rounded-[var(--v-radius-sm)] border border-[var(--v-border)] bg-[var(--v-bg)] px-2 py-2 text-sm">
              {DELIVERY_TYPES.map((t) => <option key={t} value={t}>{MILESTONE_DELIVERY_LABELS[t]}</option>)}
            </select>
            <input type="date" value={plannedDate} onChange={(e) => setPlannedDate(e.target.value)} className="rounded-[var(--v-radius-sm)] border border-[var(--v-border)] bg-[var(--v-bg)] px-2 py-2 text-sm" />
            <Button variant="primary" size="sm" onClick={create}>إنشاء</Button>
          </div>
        )}

        {milestones.length === 0 ? (
          <p className="py-6 text-center text-xs text-[var(--v-text-muted)]">مفيش مراحل تسليم بعد.</p>
        ) : (
          <div className="space-y-2">
            {milestones.map((m) => (
              <div key={m.id} className="rounded-[var(--v-radius-md)] border border-[var(--v-border)] p-3">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div>
                    <p className="text-sm font-medium text-[var(--v-text)]">{m.title}</p>
                    <p className="text-[11px] text-[var(--v-text-muted)]">{MILESTONE_DELIVERY_LABELS[m.delivery_type]}{m.planned_date && ` · مخطّط: ${m.planned_date}`}</p>
                  </div>
                  <div className="flex items-center gap-2">
                    <Badge tone={APPROVAL_TONE[m.approval_status]}>{APPROVAL_LABEL[m.approval_status]}</Badge>
                    <Badge tone={m.visibility === "client_visible" ? "info" : "neutral"}>{VISIBILITY_LABEL[m.visibility]}</Badge>
                    <span className="text-xs text-[var(--v-text-secondary)]">{m.progress_pct}%</span>
                  </div>
                </div>
                <div className="mt-2 h-1.5 w-full overflow-hidden rounded-full bg-[var(--v-surface)]">
                  <div className="h-full bg-[var(--v-primary)]" style={{ width: `${m.progress_pct}%` }} />
                </div>
                {(canApproveMilestone(role) || canManageMilestones(role)) && (
                  <div className="mt-2 flex flex-wrap items-center gap-1.5">
                    {canManageMilestones(role) && (
                      <label className="flex items-center gap-1 text-[10px] text-[var(--v-text-muted)]">
                        سلسلة الاعتماد:
                        <select value={APPROVAL_FLOW.includes(m.approval_status) ? m.approval_status : "pending"} onChange={(e) => approve(m.id, e.target.value as MilestoneApprovalStatus)} className="rounded-[var(--v-radius-sm)] border border-[var(--v-border)] bg-[var(--v-bg)] px-1.5 py-1 text-[11px]">
                          {APPROVAL_FLOW.map((s) => <option key={s} value={s} disabled={s === "manager_approved" || s === "client_approved" ? !canApproveMilestone(role) : false}>{APPROVAL_LABEL[s]}</option>)}
                        </select>
                      </label>
                    )}
                    {canManageMilestones(role) && (
                      <label className="flex items-center gap-1 text-[10px] text-[var(--v-text-muted)]">
                        الرؤية:
                        <select value={m.visibility} onChange={(e) => changeVisibility(m.id, e.target.value as ItemVisibility)} className="rounded-[var(--v-radius-sm)] border border-[var(--v-border)] bg-[var(--v-bg)] px-1.5 py-1 text-[11px]">
                          {(["internal", "client_visible", "hidden"] as ItemVisibility[]).map((v) => <option key={v} value={v}>{VISIBILITY_LABEL[v]}</option>)}
                        </select>
                      </label>
                    )}
                    {canManageMilestones(role) && <Button variant="ghost" size="sm" icon={<Trash2 size={12} />} onClick={() => remove(m.id)}>حذف</Button>}
                  </div>
                )}
              </div>
            ))}
          </div>
        )}
      </Card>
    </div>
  );
}

function ProjectTeam({ projectId, role, members, allUsers }: { projectId: string; role: UserRole; members: ProjectMemberWithName[]; allUsers: { id: string; name: string }[] }) {
  const router = useRouter();
  const [addUser, setAddUser] = useState("");
  const [addRole, setAddRole] = useState<ProjectRole>("developer");
  const canManage = canManageProjectTeam(role);
  const memberIds = new Set(members.map((m) => m.user_id));

  async function add() {
    if (!addUser) return;
    const r = await addProjectMemberAction(projectId, addUser, addRole);
    if (!r.ok) return toast.error(r.message ?? "فشل."); setAddUser(""); router.refresh();
  }
  async function remove(userId: string) {
    const r = await removeProjectMemberAction(projectId, userId);
    if (!r.ok) return toast.error(r.message ?? "فشل."); router.refresh();
  }

  return (
    <Card padding="md">
      <p className="mb-3 flex items-center gap-2 text-sm font-semibold text-[var(--v-text)]"><UserPlus size={16} className="text-[var(--v-primary)]" /> فريق المشروع</p>
      <div className="space-y-1.5">
        {members.map((m) => (
          <div key={m.user_id} className="flex items-center justify-between border-b border-[var(--v-border)] py-1.5 last:border-b-0">
            <div className="flex items-center gap-2">
              <Avatar name={m.name} size={22} />
              <span className="text-sm text-[var(--v-text)]">{m.name}</span>
              <Badge tone="neutral">{PROJECT_ROLE_LABELS[m.project_role]}</Badge>
            </div>
            {canManage && <button type="button" onClick={() => remove(m.user_id)} className="text-[var(--v-text-muted)] hover:text-[var(--v-red)]"><X size={14} /></button>}
          </div>
        ))}
        {members.length === 0 && <p className="text-xs text-[var(--v-text-muted)]">مفيش أعضاء معيّنين بعد.</p>}
      </div>
      {canManage && (
        <div className="mt-3 flex flex-wrap items-end gap-2">
          <select value={addUser} onChange={(e) => setAddUser(e.target.value)} className="rounded-[var(--v-radius-sm)] border border-[var(--v-border)] bg-[var(--v-bg)] px-2 py-1.5 text-sm">
            <option value="">اختر مستخدم…</option>
            {allUsers.filter((u) => !memberIds.has(u.id)).map((u) => <option key={u.id} value={u.id}>{u.name}</option>)}
          </select>
          <select value={addRole} onChange={(e) => setAddRole(e.target.value as ProjectRole)} className="rounded-[var(--v-radius-sm)] border border-[var(--v-border)] bg-[var(--v-bg)] px-2 py-1.5 text-sm">
            {PROJECT_ROLES.map((r) => <option key={r} value={r}>{PROJECT_ROLE_LABELS[r]}</option>)}
          </select>
          <Button variant="outline" size="sm" onClick={add}>إضافة للفريق</Button>
        </div>
      )}
    </Card>
  );
}
