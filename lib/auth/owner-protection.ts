import type { SupabaseClient } from "@supabase/supabase-js";
import type { UserRole, UserStatus } from "@/lib/types/database";

/**
 * حماية مسؤول النظام (owner) — Enterprise IAM Critical Fix.
 *
 * القاعدة: صاحب دور owner لا يمكن أبدًا أن يصبح locked/inactive/suspended/
 * pending/deleted. حالته دائمًا active. أي انحراف في قاعدة البيانات (مثلاً
 * قفل تلقائي بعد محاولات فاشلة) يُصحَّح تلقائيًا. الوحدة دي بتجمع:
 *  - دوال نقية (بدون I/O) للفحص المنطقي.
 *  - دالة heal بتصلّح أي انحراف عبر service client.
 */

/** هل الدور ده محميّ (owner)؟ */
export function isProtectedOwnerRole(role: UserRole | string | null | undefined): boolean {
  return role === "owner";
}

/**
 * هل تغيير حالة صاحب الدور ده لـ nextStatus ممنوع؟
 * owner ممنوع لأي حالة غير active.
 */
export function isForbiddenOwnerStatusChange(
  role: UserRole | string | null | undefined,
  nextStatus: UserStatus
): boolean {
  return isProtectedOwnerRole(role) && nextStatus !== "active";
}

/** هل يجب قفل هذا المستخدم بعد فشل الدخول؟ owner لا يُقفل أبدًا. */
export function shouldLockUser(
  role: UserRole | string | null | undefined,
  lockDecision: boolean
): boolean {
  return lockDecision && !isProtectedOwnerRole(role);
}

/** رسالة الرفض عند محاولة قفل/تعطيل مسؤول النظام. */
export const OWNER_STATUS_PROTECTED_MESSAGE =
  "مسؤول النظام (Owner) لا يمكن قفله أو تعطيله أو إيقافه — حسابه محميّ دائمًا.";

/**
 * تصحيح تلقائي: أي مستخدم owner حالته مش active يرجّع active (مع تصفير
 * عدّاد الفشل و locked_at). بيُستدعى عند: تسجيل الدخول، وتحميل صفحة إدارة
 * المستخدمين. بيرجّع عدد الصفوف اللي اتصلّحت.
 *
 * ملاحظة: بياخد أي Supabase client بصلاحية كتابة (service client عادةً).
 */
export async function healOwnerStatuses(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  service: SupabaseClient<any, any, any>
): Promise<number> {
  const { data, error } = await service
    .from("profiles")
    .update({ status: "active", failed_login_count: 0, locked_at: null })
    .eq("role", "owner")
    .neq("status", "active")
    .select("id");
  if (error) return 0;
  return data?.length ?? 0;
}

/**
 * تصحيح owner واحد بعينه (لو حالته مش active). بيرجّع true لو حصل تصحيح.
 */
export async function healSingleOwner(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  service: SupabaseClient<any, any, any>,
  userId: string
): Promise<boolean> {
  const { data, error } = await service
    .from("profiles")
    .update({ status: "active", failed_login_count: 0, locked_at: null })
    .eq("id", userId)
    .eq("role", "owner")
    .neq("status", "active")
    .select("id");
  if (error) return false;
  return (data?.length ?? 0) > 0;
}
