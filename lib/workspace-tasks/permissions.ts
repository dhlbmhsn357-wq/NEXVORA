import { roleSatisfies } from "@/lib/auth/roles";
import type { UserRole } from "@/lib/types/database";
import { MANAGER_ONLY_TARGET_STATUSES, canTransition, type WTaskStatus } from "./statuses";

/**
 * صلاحيات نظام مهام "مساحتي" — وحدة نقية فوق roleSatisfies. مفيش نظام
 * صلاحيات دقيق (grants) في المشروع، فالفحص role-tier:
 *  - إنشاء/إسناد/اعتماد/حذف: owner/admin (+supervisor للإنشاء والإسناد).
 *  - المنفّذ (member): يشوف وينفّذ مهامه فقط، ما يقدرش ينشئ ولا يعتمد.
 */

/** من يقدر ينشئ مهمة؟ owner/admin/supervisor (المنفّذ لأ). */
export function canCreateWTask(role: UserRole): boolean {
  return roleSatisfies(role, ["owner", "admin", "supervisor"]);
}

/** من يقدر يسند/يعدّل الإسناد؟ owner/admin/supervisor. */
export function canAssignWTask(role: UserRole): boolean {
  return roleSatisfies(role, ["owner", "admin", "supervisor"]);
}

/** من يقدر يعتمد/يرفض المراجعة؟ owner/admin فقط (المدير). */
export function canApproveWTask(role: UserRole): boolean {
  return roleSatisfies(role, ["owner", "admin"]);
}

/** من يقدر يحذف (Soft delete)؟ owner/admin. */
export function canDeleteWTask(role: UserRole): boolean {
  return roleSatisfies(role, ["owner", "admin"]);
}

/** من يشوف كل المهام (لوحة المدير)؟ owner/admin/supervisor. غيرهم = مهامه فقط. */
export function canViewAllWTasks(role: UserRole): boolean {
  return roleSatisfies(role, ["owner", "admin", "supervisor"]);
}

/** هل المستخدم مرتبط بالمهمة (منشئ أو مسؤول)؟ */
export function isWTaskParticipant(
  userId: string,
  creatorId: string | null,
  assigneeIds: string[]
): boolean {
  return creatorId === userId || assigneeIds.includes(userId);
}

/**
 * هل يقدر المستخدم يعدّل حقول المهمة (عنوان/وصف/تشيك-ليست…)؟
 * المدير (admin+) دائمًا؛ أو المنشئ/المسؤول عن مهمته.
 */
export function canEditWTask(
  role: UserRole,
  userId: string,
  creatorId: string | null,
  assigneeIds: string[]
): boolean {
  if (roleSatisfies(role, ["owner", "admin", "supervisor"])) return true;
  return isWTaskParticipant(userId, creatorId, assigneeIds);
}

/**
 * هل يُسمح بهذا الانتقال للحالة من هذا الدور؟ يجمع بين قانون الانتقالات
 * (statuses) وحق الدور: الحالات manager-only (approved/completed/archived)
 * لِـ owner/admin فقط؛ الباقي متاح للمشارك في المهمة.
 */
export function canChangeWTaskStatus(params: {
  role: UserRole;
  userId: string;
  creatorId: string | null;
  assigneeIds: string[];
  from: WTaskStatus;
  to: WTaskStatus;
}): boolean {
  const { role, userId, creatorId, assigneeIds, from, to } = params;
  if (!canTransition(from, to)) return false;

  const isManager = roleSatisfies(role, ["owner", "admin"]);
  if (MANAGER_ONLY_TARGET_STATUSES.includes(to)) {
    return isManager; // الاعتماد/الإكمال/الأرشفة للمدير فقط
  }
  // باقي الانتقالات: مدير/مشرف، أو المشارك في المهمة (منفّذ على مهمته).
  if (roleSatisfies(role, ["owner", "admin", "supervisor"])) return true;
  return isWTaskParticipant(userId, creatorId, assigneeIds);
}
