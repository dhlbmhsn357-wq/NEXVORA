import type { UserRole, UserStatus } from "@/lib/types/database";
import { roleSatisfies, isStatusAllowed } from "@/lib/auth/roles";

/**
 * صلاحيات إدراج المهام — وحدة نقية.
 *
 * القاعدة: **لا يُدرِج مستخدمٌ مهمةً لا يملك صلاحيتها.** الفحص هنا
 * قبل لمس قاعدة البيانات، وهو الطبقة الأولى لا الوحيدة (RLS تبقى
 * حارسًا أخيرًا).
 *
 * أربعة أبعاد تُفحص: الدور، وحالة الحساب، وملكية المشروع، والعضوية.
 */

export interface EnqueueActor {
  userId: string;
  role: UserRole;
  status: UserStatus;
}

export interface EnqueuePermissionInput {
  actor: EnqueueActor;
  /** الأدوار المسموحة للنوع — من تعريف المعالج. */
  allowedRoles?: UserRole[];
  requiresProjectMembership?: boolean;
  projectId?: string | null;
  /** معرّفات أعضاء المشروع — تُقرأ مرة واحدة وتُمرَّر. */
  projectMemberIds?: string[];
  /** مالك المشروع. */
  projectOwnerId?: string | null;
}

export type PermissionDecision =
  | { allowed: true }
  | { allowed: false; reason: string };

/** قرار السماح بالإدراج. */
export function canEnqueue(input: EnqueuePermissionInput): PermissionDecision {
  // ١) حالة الحساب أولًا: حساب موقوف أو مقفول لا يعمل شيئًا مهما كان دوره.
  if (!isStatusAllowed(input.actor.status)) {
    return { allowed: false, reason: "الحساب غير نشط — لا يمكن تنفيذ أي عملية." };
  }

  // ٢) الدور — هرمي، فأي دور أعلى يمرّ تلقائيًا.
  if (input.allowedRoles && input.allowedRoles.length > 0) {
    if (!roleSatisfies(input.actor.role, input.allowedRoles)) {
      return { allowed: false, reason: "صلاحيتك لا تسمح بتشغيل هذا النوع من المهام." };
    }
  }

  // ٣) العضوية في المشروع.
  if (input.requiresProjectMembership) {
    if (!input.projectId) {
      return { allowed: false, reason: "هذه المهمة لازم تكون مرتبطة بمشروع." };
    }

    // مسؤول النظام والمسؤول يعبران العضوية — وإلا تعذّرت الإدارة على
    // مشاريع لم ينضمّوا إليها، وهذا ليس عزلًا أمنيًا بل عرقلة تشغيلية.
    const isAdministrative = roleSatisfies(input.actor.role, ["admin"]);
    if (isAdministrative) return { allowed: true };

    const isOwner = input.projectOwnerId === input.actor.userId;
    const isMember = (input.projectMemberIds ?? []).includes(input.actor.userId);

    if (!isOwner && !isMember) {
      return { allowed: false, reason: "إنت مش عضو في المشروع ده." };
    }
  }

  return { allowed: true };
}

/**
 * قرار السماح بالتحكّم في مهمة قائمة (إلغاء · إيقاف · استئناف).
 *
 * أضيق من الإدراج عن قصد: من أنشأ المهمة يتحكّم فيها، ومن فوقه إداريًا
 * كذلك. زميل في نفس المشروع **لا** يلغي مهمة غيره — الإلغاء يرمي عملًا
 * قد يكون مدفوع الثمن.
 */
export function canControlJob(input: {
  actor: EnqueueActor;
  jobCreatedBy: string | null;
}): PermissionDecision {
  if (!isStatusAllowed(input.actor.status)) {
    return { allowed: false, reason: "الحساب غير نشط." };
  }

  if (input.jobCreatedBy && input.jobCreatedBy === input.actor.userId) {
    return { allowed: true };
  }

  if (roleSatisfies(input.actor.role, ["admin"])) return { allowed: true };

  return { allowed: false, reason: "التحكّم في المهمة متاح لمن أنشأها أو لمسؤول." };
}

/**
 * قرار السماح بعرض لوحة الطوابير.
 *
 * اللوحة تكشف أحمال النظام وأخطاءه عبر كل المشاريع، فهي إدارية بحتة.
 */
export function canViewQueueDashboard(actor: EnqueueActor): PermissionDecision {
  if (!isStatusAllowed(actor.status)) {
    return { allowed: false, reason: "الحساب غير نشط." };
  }
  if (!roleSatisfies(actor.role, ["admin"])) {
    return { allowed: false, reason: "لوحة الطوابير متاحة للمسؤولين فقط." };
  }
  return { allowed: true };
}
