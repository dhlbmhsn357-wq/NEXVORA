import { roleSatisfies } from "@/lib/auth/roles";
import type { UserRole } from "@/lib/types/database";
import type { ConversationType } from "@/lib/types/database";

/**
 * صلاحيات Collaboration Hub — وحدة نقية بدون I/O، مبنية فوق نفس RBAC
 * الهرمي من المرحلة 1 (lib/auth/roles). ممنوع أي فحص دور ثابت في مكان تاني.
 */

/** من يقدر ينشئ إعلانًا؟ admin فأعلى (Executor/member لأ). */
export function canCreateAnnouncement(role: UserRole): boolean {
  return roleSatisfies(role, ["owner", "admin"]);
}

/** من يقدر يدير عضوية قنوات الأقسام؟ admin فأعلى. */
export function canManageDepartmentMembership(role: UserRole): boolean {
  return roleSatisfies(role, ["owner", "admin"]);
}

/** من يقدر ينشئ/يدير قناة قسم؟ admin فأعلى. */
export function canManageDepartmentChannel(role: UserRole): boolean {
  return roleSatisfies(role, ["owner", "admin"]);
}

/** من يقدر يدير مناقشات المشروع (تثبيت/حذف رسائل الغير)؟ supervisor فأعلى. */
export function canModerateProjectDiscussion(role: UserRole): boolean {
  return roleSatisfies(role, ["owner", "admin", "supervisor"]);
}

/**
 * هل يقدر ينشئ محادثة من النوع ده؟
 * - direct: أي مستخدم.
 * - project: supervisor فأعلى (القنوات بتتعمل تلقائيًا كمان مع المشروع).
 * - department: admin فأعلى.
 * - announcement: admin فأعلى.
 */
export function canCreateConversation(role: UserRole, type: ConversationType): boolean {
  switch (type) {
    case "direct":
      return true;
    case "project":
      return roleSatisfies(role, ["owner", "admin", "supervisor"]);
    case "department":
    case "announcement":
      return roleSatisfies(role, ["owner", "admin"]);
    default:
      return false;
  }
}

/**
 * هل يقدر يعدّل/يحذف رسالة؟ صاحبها دايمًا، أو مشرف فأعلى (إشراف).
 */
export function canEditMessage(role: UserRole, authorId: string | null, userId: string): boolean {
  if (authorId && authorId === userId) return true;
  return canModerateProjectDiscussion(role);
}

export function canDeleteMessage(role: UserRole, authorId: string | null, userId: string): boolean {
  return canEditMessage(role, authorId, userId);
}

/** هل يقدر يثبّت رسالة؟ مشرف فأعلى. */
export function canPinMessage(role: UserRole): boolean {
  return canModerateProjectDiscussion(role);
}
