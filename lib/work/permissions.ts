import { roleSatisfies } from "@/lib/auth/roles";
import type { UserRole } from "@/lib/types/database";

/**
 * صلاحيات Work Management — وحدة نقية فوق RBAC الهرمي (lib/auth/roles).
 * ممنوع أي فحص دور ثابت في مكان تاني.
 *
 * القاعدة العامة:
 *  - أي مستخدم نشط يقدر ينشئ مهام ويعلّق ويحدّث مهامه.
 *  - تعيين فريق المشروع + إنشاء/اعتماد Milestones = supervisor فأعلى.
 *  - حذف المهام + تغيير أدوار الفريق = admin فأعلى.
 */

export function canCreateTask(role: UserRole): boolean {
  return roleSatisfies(role, ["owner", "admin", "supervisor", "member"]);
}

export function canAssignTask(role: UserRole): boolean {
  return roleSatisfies(role, ["owner", "admin", "supervisor"]);
}

export function canDeleteTask(role: UserRole): boolean {
  return roleSatisfies(role, ["owner", "admin"]);
}

export function canManageMilestones(role: UserRole): boolean {
  return roleSatisfies(role, ["owner", "admin", "supervisor"]);
}

export function canApproveMilestone(role: UserRole): boolean {
  return roleSatisfies(role, ["owner", "admin"]);
}

export function canManageProjectTeam(role: UserRole): boolean {
  return roleSatisfies(role, ["owner", "admin", "supervisor"]);
}

/**
 * هل يقدر يعدّل/ينقل حالة مهمة معيّنة؟ صاحبها أو أحد المكلّفين بها،
 * أو مشرف فأعلى.
 */
export function canUpdateTask(role: UserRole, creatorId: string | null, assigneeIds: string[], userId: string): boolean {
  if (creatorId === userId) return true;
  if (assigneeIds.includes(userId)) return true;
  return roleSatisfies(role, ["owner", "admin", "supervisor"]);
}
