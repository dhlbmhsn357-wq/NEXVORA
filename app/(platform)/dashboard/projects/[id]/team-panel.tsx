"use client";

/**
 * TeamPanel — الفريق والملكية
 * ============================
 * تبويب موحّد وخفيف يجمع:
 *   1) ملكية المشروع: مالك المشروع دايمًا ظاهر + أدوار موسّعة (تقني/أعمال/
 *      تسليم/دعم) خلف زر «+ أدوار موسّعة».
 *   2) أعضاء الفريق: إضافة/إزالة، مع سعة الأعضاء (workload bars) بس لما
 *      عدد الأعضاء غير المُلّاك > 1 (بلا كده مؤشر السعة مالوش معنى).
 *
 * كل server actions المستخدمة موجودة من قبل — مفيش تغيير في الـ schema
 * ولا في صلاحيات الأدوار.
 */

import { useCallback, useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { Crown, ChevronDown, ChevronUp, UserPlus, X, Users2 } from "lucide-react";
import Card from "@/components/ui/Card";
import Button from "@/components/ui/Button";
import Avatar from "@/components/ui/Avatar";
import Badge from "@/components/ui/Badge";
import { toast } from "@/components/ui/Toaster";
import { PROJECT_ROLE_LABELS, ALL_PROJECT_ROLES } from "@/lib/work/statuses";
import { canManageProjectTeam } from "@/lib/work/permissions";
import { addProjectMemberAction, removeProjectMemberAction } from "./task-actions";
import { loadOwnershipAction, loadWorkloadAction, setOwnershipAction } from "./portfolio-actions";
import { OVERLOAD_THRESHOLD_PCT } from "@/lib/portfolio/capacity";
import type { MemberWorkload } from "@/lib/portfolio/service";
import type { OwnershipType, ProjectRole, UserRole } from "@/lib/types/database";
import type { ProjectMemberWithName } from "@/lib/work/project-members-service";

const OWNERSHIP_LABELS: Record<OwnershipType, string> = {
  project: "مالك المشروع",
  technical: "المالك التقني",
  business: "مالك الأعمال",
  delivery: "مالك التسليم",
  support: "مالك الدعم",
};

const PRIMARY_TYPE: OwnershipType = "project";
const EXTENDED_TYPES: OwnershipType[] = ["technical", "business", "delivery", "support"];
const PROJECT_ROLES: ProjectRole[] = ALL_PROJECT_ROLES;

interface OwnershipRow {
  ownership_type: OwnershipType;
  user_id: string | null;
  name: string | null;
}

export default function TeamPanel({
  projectId,
  role,
  members,
  allUsers,
}: {
  projectId: string;
  role: UserRole;
  members: ProjectMemberWithName[];
  allUsers: { id: string; name: string }[];
}) {
  const router = useRouter();
  const canManage = canManageProjectTeam(role);
  const [ownership, setOwnership] = useState<OwnershipRow[]>([]);
  const [workload, setWorkload] = useState<MemberWorkload[]>([]);
  const [expandOwners, setExpandOwners] = useState(false);

  const load = useCallback(async () => {
    const [o, w] = await Promise.all([loadOwnershipAction(projectId), loadWorkloadAction(projectId)]);
    if (o.ok) setOwnership(o.ownership);
    if (w.ok) setWorkload(w.workload);
  }, [projectId]);
  // eslint-disable-next-line react-hooks/set-state-in-effect
  useEffect(() => { load(); }, [load]);

  const ownerByType = useMemo(() => new Map(ownership.map((o) => [o.ownership_type, o])), [ownership]);
  const hasAnyExtended = EXTENDED_TYPES.some((t) => ownerByType.get(t)?.user_id);

  async function assignOwner(type: OwnershipType, userId: string) {
    const r = await setOwnershipAction(projectId, type, userId || null);
    if (!r.ok) return toast.error(r.message ?? "فشل.");
    await load();
    router.refresh();
  }

  return (
    <div className="space-y-4">
      <OwnershipCard
        canManage={canManage}
        allUsers={allUsers}
        ownerByType={ownerByType}
        expand={expandOwners || hasAnyExtended}
        onToggleExpand={() => setExpandOwners((v) => !v)}
        onAssign={assignOwner}
      />

      <TeamMembersCard
        projectId={projectId}
        canManage={canManage}
        members={members}
        allUsers={allUsers}
        workload={workload}
      />
    </div>
  );
}

function OwnershipCard({
  canManage,
  allUsers,
  ownerByType,
  expand,
  onToggleExpand,
  onAssign,
}: {
  canManage: boolean;
  allUsers: { id: string; name: string }[];
  ownerByType: Map<OwnershipType, OwnershipRow>;
  expand: boolean;
  onToggleExpand: () => void;
  onAssign: (type: OwnershipType, userId: string) => void;
}) {
  const primary = ownerByType.get(PRIMARY_TYPE);
  return (
    <Card padding="md">
      <div className="mb-2 flex items-center justify-between">
        <p className="flex items-center gap-2 text-sm font-semibold text-[var(--v-text)]">
          <Crown size={16} className="text-[var(--v-amber)]" /> ملكية المشروع
        </p>
        <button
          type="button"
          onClick={onToggleExpand}
          className="inline-flex items-center gap-1 rounded-[var(--v-radius-sm)] border border-[var(--v-border)] px-2 py-1 text-[11px] text-[var(--v-text-secondary)] transition hover:border-[var(--v-primary)] hover:text-[var(--v-primary)]"
          aria-expanded={expand}
        >
          {expand ? <ChevronUp size={12} /> : <ChevronDown size={12} />}
          {expand ? "طيّ الأدوار الموسّعة" : "+ أدوار موسّعة"}
        </button>
      </div>

      <OwnershipRowItem
        type={PRIMARY_TYPE}
        row={primary}
        canManage={canManage}
        allUsers={allUsers}
        onAssign={onAssign}
      />

      {expand && (
        <div className="mt-2 grid gap-2 sm:grid-cols-2">
          {EXTENDED_TYPES.map((t) => (
            <OwnershipRowItem
              key={t}
              type={t}
              row={ownerByType.get(t)}
              canManage={canManage}
              allUsers={allUsers}
              onAssign={onAssign}
            />
          ))}
        </div>
      )}
    </Card>
  );
}

function OwnershipRowItem({
  type,
  row,
  canManage,
  allUsers,
  onAssign,
}: {
  type: OwnershipType;
  row: OwnershipRow | undefined;
  canManage: boolean;
  allUsers: { id: string; name: string }[];
  onAssign: (type: OwnershipType, userId: string) => void;
}) {
  return (
    <div className="flex items-center justify-between gap-2 rounded-[var(--v-radius-sm)] border border-[var(--v-border)] px-2 py-1.5">
      <span className="text-xs text-[var(--v-text-secondary)]">{OWNERSHIP_LABELS[type]}</span>
      {canManage ? (
        <select
          value={row?.user_id ?? ""}
          onChange={(e) => onAssign(type, e.target.value)}
          className="rounded-[var(--v-radius-sm)] border border-[var(--v-border)] bg-[var(--v-bg)] px-1.5 py-1 text-[11px]"
        >
          <option value="">— بدون —</option>
          {allUsers.map((u) => (
            <option key={u.id} value={u.id}>{u.name}</option>
          ))}
        </select>
      ) : (
        <span className="text-[11px] text-[var(--v-text)]">{row?.name ?? "—"}</span>
      )}
    </div>
  );
}

function TeamMembersCard({
  projectId,
  canManage,
  members,
  allUsers,
  workload,
}: {
  projectId: string;
  canManage: boolean;
  members: ProjectMemberWithName[];
  allUsers: { id: string; name: string }[];
  workload: MemberWorkload[];
}) {
  const router = useRouter();
  const [addUser, setAddUser] = useState("");
  const [addRole, setAddRole] = useState<ProjectRole>("developer");
  const memberIds = new Set(members.map((m) => m.user_id));

  // إخفاء شريط السعة لما عدد الأعضاء (بغض النظر عن دورهم) ≤ 1 — مالوش
  // معنى تشوف شخص واحد "محمّل 40%" في مشروع فردي.
  const showCapacity = members.length > 1;

  async function add() {
    if (!addUser) return;
    const r = await addProjectMemberAction(projectId, addUser, addRole);
    if (!r.ok) return toast.error(r.message ?? "فشل.");
    setAddUser("");
    router.refresh();
  }
  async function remove(userId: string) {
    const r = await removeProjectMemberAction(projectId, userId);
    if (!r.ok) return toast.error(r.message ?? "فشل.");
    router.refresh();
  }

  return (
    <Card padding="md">
      <p className="mb-3 flex items-center gap-2 text-sm font-semibold text-[var(--v-text)]">
        <UserPlus size={16} className="text-[var(--v-primary)]" /> فريق المشروع
      </p>
      <div className="space-y-1.5">
        {members.map((m) => (
          <div
            key={m.user_id}
            className="flex items-center justify-between border-b border-[var(--v-border)] py-1.5 last:border-b-0"
          >
            <div className="flex items-center gap-2">
              <Avatar name={m.name} size={22} />
              <span className="text-sm text-[var(--v-text)]">{m.name}</span>
              <Badge tone="neutral">{PROJECT_ROLE_LABELS[m.project_role]}</Badge>
            </div>
            {canManage && (
              <button
                type="button"
                onClick={() => remove(m.user_id)}
                className="text-[var(--v-text-muted)] hover:text-[var(--v-red)]"
                aria-label="إزالة العضو"
              >
                <X size={14} />
              </button>
            )}
          </div>
        ))}
        {members.length === 0 && (
          <p className="text-xs text-[var(--v-text-muted)]">مفيش أعضاء معيّنين بعد.</p>
        )}
      </div>

      {canManage && (
        <div className="mt-3 flex flex-wrap items-end gap-2">
          <select
            value={addUser}
            onChange={(e) => setAddUser(e.target.value)}
            className="rounded-[var(--v-radius-sm)] border border-[var(--v-border)] bg-[var(--v-bg)] px-2 py-1.5 text-sm"
          >
            <option value="">اختر مستخدم…</option>
            {allUsers.filter((u) => !memberIds.has(u.id)).map((u) => (
              <option key={u.id} value={u.id}>{u.name}</option>
            ))}
          </select>
          <select
            value={addRole}
            onChange={(e) => setAddRole(e.target.value as ProjectRole)}
            className="rounded-[var(--v-radius-sm)] border border-[var(--v-border)] bg-[var(--v-bg)] px-2 py-1.5 text-sm"
          >
            {PROJECT_ROLES.map((r) => (
              <option key={r} value={r}>{PROJECT_ROLE_LABELS[r]}</option>
            ))}
          </select>
          <Button variant="outline" size="sm" onClick={add}>إضافة للفريق</Button>
        </div>
      )}

      {showCapacity && workload.length > 0 && (
        <div className="mt-4 border-t border-[var(--v-border)] pt-3">
          <p className="mb-2 flex items-center gap-2 text-xs font-semibold text-[var(--v-text)]">
            <Users2 size={14} className="text-[var(--v-primary)]" /> سعة الفريق
          </p>
          <div className="space-y-1.5">
            {workload.map((w) => (
              <div key={w.userId} className="flex items-center gap-2">
                <Avatar name={w.name} size={22} />
                <span className="w-28 truncate text-xs text-[var(--v-text)]">{w.name}</span>
                <div className="h-2 flex-1 overflow-hidden rounded-full bg-[var(--v-surface)]">
                  <div
                    className="h-full"
                    style={{
                      width: `${Math.min(100, w.workloadPct)}%`,
                      backgroundColor: w.overloaded ? "var(--v-red)" : "var(--v-primary)",
                    }}
                  />
                </div>
                <span
                  className={`w-24 text-left text-[11px] ${
                    w.overloaded ? "text-[var(--v-red)]" : "text-[var(--v-text-muted)]"
                  }`}
                >
                  {w.workloadPct}% · {w.openTasks} مهمة
                </span>
              </div>
            ))}
            {workload.some((w) => w.overloaded) && (
              <p className="mt-1 text-[11px] text-[var(--v-red)]">
                ⚠️ فيه أعضاء محمّلين فوق {OVERLOAD_THRESHOLD_PCT}% — فكّر في إعادة التوزيع.
              </p>
            )}
          </div>
        </div>
      )}
    </Card>
  );
}
