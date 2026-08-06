import { ROLE_TIER } from "@/lib/auth/roles";
import type { UserRole } from "@/lib/types/database";
import type { KnowledgeObject, KnowledgeVisibility } from "./model";

/**
 * صلاحيات مركز المعرفة — **وحدة نقية**.
 *
 * ## لماذا المصفوفة في الكود لا في القاعدة
 *
 * القواعد ثابتة ويحكمها منطق، وقراءتها من جدول في كل فحص بتضيف رحلة
 * شبكة لكل عملية. الجدول (`knowledge_permission_grants`) موجود
 * **للاستثناءات فقط**: منح فرد صلاحية أعلى على مشروع بعينه.
 *
 * ## لماذا هرمية لا قوائم
 *
 * الأدوار في المنصة هرمية أصلًا (`ROLE_TIER`). تعريف كل إجراء بأقل
 * رتبة تقدر عليه معناه إن أي دور جديد بيندمج تلقائيًا — بدل مراجعة
 * كل إجراء عند إضافة دور.
 */

/** الإجراءات على المعرفة. */
export const KNOWLEDGE_ACTIONS = [
  "read",
  "create",
  "update",
  "delete",
  "review",
  "rollback",
  "export",
  "manage_permissions",
] as const;

export type KnowledgeAction = (typeof KNOWLEDGE_ACTIONS)[number];

export const ACTION_LABELS: Record<KnowledgeAction, string> = {
  read: "قراءة",
  create: "إضافة",
  update: "تعديل",
  delete: "حذف",
  review: "مراجعة واعتماد",
  rollback: "الرجوع لإصدار سابق",
  export: "تصدير",
  manage_permissions: "إدارة الصلاحيات",
};

/**
 * أقل رتبة مطلوبة لكل إجراء.
 *
 * `member` (منفّذ) = ٠ · `supervisor` (مشرف) = ١ ·
 * `admin` (مسؤول) = ٢ · `owner` (مسؤول النظام) = ٣
 *
 * القراءة والإضافة متاحتان للجميع: منع المنفّذ من إضافة معرفة كان
 * هيحوّل المركز لمخزن يملأه المديرون — وهو عكس الغرض منه.
 *
 * الحذف والرجوع للمسؤول: الاتنين بيمسحوا شغل حد تاني. والمراجعة
 * للمشرف لأنها اعتماد لا إنشاء.
 */
const MIN_TIER: Record<KnowledgeAction, number> = {
  read: ROLE_TIER.member,
  create: ROLE_TIER.member,
  update: ROLE_TIER.member,
  export: ROLE_TIER.member,
  review: ROLE_TIER.supervisor,
  delete: ROLE_TIER.admin,
  rollback: ROLE_TIER.admin,
  manage_permissions: ROLE_TIER.owner,
};

export interface PermissionContext {
  role: UserRole;
  profileId: string;
  /** استثناءات ممنوحة من `knowledge_permission_grants`. */
  grants?: KnowledgeAction[];
}

export type PermissionVerdict =
  | { allowed: true; reason: string }
  | { allowed: false; reason: string };

/**
 * هل يملك هذا المستخدم صلاحية هذا الإجراء؟
 *
 * @param object الكائن المستهدف — اختياري، لأن `create` مالهاش هدف بعد.
 */
export function can(
  action: KnowledgeAction,
  ctx: PermissionContext,
  object?: Pick<KnowledgeObject, "ownerId" | "visibility" | "createdBy">
): PermissionVerdict {
  // المنح الصريح يغلب الرتبة: هو استثناء موثَّق بقرار إنسان.
  if (ctx.grants?.includes(action)) {
    return { allowed: true, reason: "منح صريح على هذا المشروع." };
  }

  const tier = ROLE_TIER[ctx.role];

  // الخصوصية تُفحص قبل الرتبة: معرفة خاصة تخصّ صاحبها، ورتبة أعلى
  // ماتديش حق الاطّلاع عليها. الاستثناء الوحيد مسؤول النظام — لأن
  // مسؤولية الحوكمة عنده، وحجب البيانات عنه بيمنع التدقيق.
  if (object && object.visibility === "private") {
    const isOwner = object.ownerId === ctx.profileId || object.createdBy === ctx.profileId;
    if (!isOwner && tier < ROLE_TIER.owner) {
      return { allowed: false, reason: "معرفة خاصة — لصاحبها فقط." };
    }
  }

  // صاحب الكائن يقدر يعدّله ويحذفه مهما كانت رتبته: منعه من التراجع
  // عن إضافته كان بيخلّي كل غلطة تحتاج مسؤولًا.
  if (object && (action === "update" || action === "delete")) {
    const isOwner = object.ownerId === ctx.profileId || object.createdBy === ctx.profileId;
    if (isOwner) return { allowed: true, reason: "صاحب المعرفة." };
  }

  if (tier >= MIN_TIER[action]) {
    return { allowed: true, reason: `الرتبة كافية لإجراء «${ACTION_LABELS[action]}».` };
  }

  return {
    allowed: false,
    reason: `إجراء «${ACTION_LABELS[action]}» يحتاج رتبة أعلى.`,
  };
}

/** كل ما يقدر عليه هذا الدور — تستخدمها الواجهة لإخفاء ما لا يُتاح. */
export function allowedActions(ctx: PermissionContext): KnowledgeAction[] {
  return KNOWLEDGE_ACTIONS.filter((action) => can(action, ctx).allowed);
}

/**
 * يفلتر المعرفة حسب ما يحق لهذا المستخدم رؤيته.
 *
 * **الفلترة هنا طبقة ثانية لا وحيدة**: أمان مستوى الصف في القاعدة هو
 * الحاجز الأول. التكرار مقصود — خطأ في استعلام واحد مايجوزش يكشف
 * معرفة خاصة.
 */
export function visibleTo<T extends Pick<KnowledgeObject, "ownerId" | "visibility" | "createdBy">>(
  objects: T[],
  ctx: PermissionContext
): T[] {
  return objects.filter((object) => can("read", ctx, object).allowed);
}

/** وصف مقروء لسياسة الظهور. */
export const VISIBILITY_LABELS: Record<KnowledgeVisibility, string> = {
  project: "المشروع",
  workspace: "مساحة العمل",
  private: "خاصة",
};
