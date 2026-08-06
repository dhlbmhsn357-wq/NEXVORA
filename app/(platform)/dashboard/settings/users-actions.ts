"use server";

import { revalidatePath } from "next/cache";
import { requireAdmin, requireSystemAdmin } from "@/lib/auth/rbac";
import { createServiceClient } from "@/lib/supabase/service";
import { validatePasswordStrength } from "@/lib/auth/password-policy";
import { recordAuthEvent } from "@/lib/auth/audit";
import { ROLE_TIER } from "@/lib/auth/roles";
import {
  isForbiddenOwnerStatusChange,
  OWNER_STATUS_PROTECTED_MESSAGE,
} from "@/lib/auth/owner-protection";
import type { UserRole, UserStatus } from "@/lib/types/database";

/**
 * إدارة المستخدمين الداخلية (Enterprise IAM) — إنشاء/تعطيل/قفل/حذف/
 * إعادة تعيين كلمة مرور/تغيير إيميل/تغيير دور + عرض سجل النشاط.
 * لا تسجيل ذاتي: الحسابات بتتعمل من هنا فقط بواسطة مسؤول النظام.
 * كل عملية بتتسجّل في audit_log.
 */

type ActionResult = { ok: boolean; message?: string };

const SETTINGS_PATH = "/dashboard/settings";

/** حارس "آخر مسؤول نظام نشط": ممنوع حذفه/تعطيله/تخفيضه. */
async function isLastActiveOwner(userId: string): Promise<boolean> {
  const service = createServiceClient();
  const { data: target } = await service.from("profiles").select("role, status").eq("id", userId).maybeSingle();
  if (!target || target.role !== "owner") return false;
  const { count } = await service
    .from("profiles")
    .select("id", { count: "exact", head: true })
    .eq("role", "owner")
    .eq("status", "active");
  return (count ?? 0) <= 1;
}

/** إنشاء مستخدم جديد (مسؤول النظام فقط). */
export async function createManagedUser(input: {
  fullName: string;
  email: string;
  password: string;
  role: UserRole;
}): Promise<ActionResult> {
  const auth = await requireSystemAdmin();
  if (!auth.ok) return { ok: false, message: auth.message };

  const fullName = input.fullName.trim();
  const email = input.email.trim().toLowerCase();
  if (!fullName) return { ok: false, message: "أدخل الاسم الكامل." };
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return { ok: false, message: "أدخل إيميل صالح." };

  const policy = validatePasswordStrength(input.password);
  if (!policy.ok) return { ok: false, message: policy.issues.join(" ") };

  const service = createServiceClient();
  const { data: created, error } = await service.auth.admin.createUser({
    email,
    password: input.password,
    email_confirm: true,
    user_metadata: { full_name: fullName },
  });
  if (error || !created.user) return { ok: false, message: `فشل الإنشاء: ${error?.message ?? "سبب غير معروف"}` };

  const { error: profileError } = await service
    .from("profiles")
    .update({ role: input.role, status: "active", full_name: fullName })
    .eq("id", created.user.id);
  if (profileError) return { ok: false, message: `اتعمل الحساب لكن فشل ضبط الدور: ${profileError.message}` };

  await recordAuthEvent({
    actorId: auth.userId!,
    targetUserId: created.user.id,
    action: "user_created",
    details: { email, role: input.role },
  });
  revalidatePath(SETTINGS_PATH);
  return { ok: true };
}

/** تغيير حالة مستخدم: قفل/فتح/تعطيل/تفعيل/إيقاف. */
export async function setUserStatus(userId: string, status: Exclude<UserStatus, "deleted">): Promise<ActionResult> {
  const auth = await requireAdmin();
  if (!auth.ok) return { ok: false, message: auth.message };
  if (auth.userId === userId && status !== "active") {
    return { ok: false, message: "مش هينفع تغيّر حالة حسابك بنفسك." };
  }

  const service = createServiceClient();

  // حماية مسؤول النظام: أي owner (مش آخر واحد بس) ممنوع يتقفل/يتعطّل/يتوقف.
  const { data: target } = await service.from("profiles").select("role").eq("id", userId).maybeSingle();
  if (isForbiddenOwnerStatusChange(target?.role as UserRole | undefined, status)) {
    return { ok: false, message: OWNER_STATUS_PROTECTED_MESSAGE };
  }
  if (status !== "active" && (await isLastActiveOwner(userId))) {
    return { ok: false, message: "ده آخر مسؤول نظام نشط — عيّن مسؤول نظام تاني الأول." };
  }
  const { error } = await service
    .from("profiles")
    .update({
      status,
      ...(status === "locked" ? { locked_at: new Date().toISOString() } : {}),
      ...(status === "active" ? { locked_at: null, failed_login_count: 0 } : {}),
    })
    .eq("id", userId);
  if (error) return { ok: false, message: error.message };

  const actionByStatus = {
    locked: "user_locked",
    active: "user_reactivated",
    inactive: "user_deactivated",
    suspended: "user_suspended",
    pending: "user_updated",
  } as const;
  await recordAuthEvent({
    actorId: auth.userId!,
    targetUserId: userId,
    action: actionByStatus[status],
    details: { new_status: status },
  });
  revalidatePath(SETTINGS_PATH);
  return { ok: true };
}

/** حذف مستخدم (soft delete + منع دخول نهائي). مسؤول النظام فقط. */
export async function deleteManagedUser(userId: string): Promise<ActionResult> {
  const auth = await requireSystemAdmin();
  if (!auth.ok) return { ok: false, message: auth.message };
  if (auth.userId === userId) return { ok: false, message: "مش هينفع تحذف حسابك بنفسك." };
  if (await isLastActiveOwner(userId)) {
    return { ok: false, message: "ده آخر مسؤول نظام نشط — عيّن مسؤول نظام تاني الأول." };
  }

  const service = createServiceClient();
  // soft delete: بنحافظ على صف profiles (سجلات audit/العلاقات القديمة بتفضل سليمة)
  // وبنمنع الدخول نهائيًا بحظر المستخدم في Supabase Auth.
  const { error } = await service.from("profiles").update({ status: "deleted" }).eq("id", userId);
  if (error) return { ok: false, message: error.message };
  await service.auth.admin.updateUserById(userId, { ban_duration: "876000h" });

  await recordAuthEvent({ actorId: auth.userId!, targetUserId: userId, action: "user_deleted" });
  revalidatePath(SETTINGS_PATH);
  return { ok: true };
}

/** إعادة تعيين كلمة مرور مستخدم (مسؤول النظام فقط). */
export async function adminResetPassword(userId: string, newPassword: string): Promise<ActionResult> {
  const auth = await requireSystemAdmin();
  if (!auth.ok) return { ok: false, message: auth.message };

  const policy = validatePasswordStrength(newPassword);
  if (!policy.ok) return { ok: false, message: policy.issues.join(" ") };

  const service = createServiceClient();
  const { error } = await service.auth.admin.updateUserById(userId, { password: newPassword });
  if (error) return { ok: false, message: error.message };

  await recordAuthEvent({ actorId: auth.userId!, targetUserId: userId, action: "password_reset", details: { by: "admin" } });
  revalidatePath(SETTINGS_PATH);
  return { ok: true };
}

/** تغيير إيميل مستخدم (مسؤول النظام فقط). */
export async function changeUserEmail(userId: string, newEmail: string): Promise<ActionResult> {
  const auth = await requireSystemAdmin();
  if (!auth.ok) return { ok: false, message: auth.message };

  const email = newEmail.trim().toLowerCase();
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return { ok: false, message: "أدخل إيميل صالح." };

  const service = createServiceClient();
  const { error } = await service.auth.admin.updateUserById(userId, { email, email_confirm: true });
  if (error) return { ok: false, message: error.message };
  await service.from("profiles").update({ email }).eq("id", userId);

  await recordAuthEvent({ actorId: auth.userId!, targetUserId: userId, action: "email_changed", details: { new_email: email } });
  revalidatePath(SETTINGS_PATH);
  return { ok: true };
}

/** ترقية/تخفيض دور مستخدم — بيحل محل updateUserRole القديم مع Audit. */
export async function changeUserRole(userId: string, role: UserRole): Promise<ActionResult> {
  const auth = await requireAdmin();
  if (!auth.ok) return { ok: false, message: auth.message };

  // admin مش هيقدر يرقّي حد لأعلى من رتبته (owner فقط يعمل owners).
  if (ROLE_TIER[role] >= ROLE_TIER[auth.role!] && auth.role !== "owner") {
    return { ok: false, message: "مش مسموح ترقّي حد لرتبة مساوية أو أعلى من رتبتك." };
  }
  if (role !== "owner" && (await isLastActiveOwner(userId))) {
    return { ok: false, message: "ممنوع تخفيض آخر مسؤول نظام نشط — عيّن مسؤول نظام تاني الأول." };
  }

  const service = createServiceClient();
  const { data: before } = await service.from("profiles").select("role").eq("id", userId).maybeSingle();
  const { error } = await service.from("profiles").update({ role }).eq("id", userId);
  if (error) return { ok: false, message: error.message };

  await recordAuthEvent({
    actorId: auth.userId!,
    targetUserId: userId,
    action: "role_change",
    details: { old_role: before?.role ?? null, new_role: role },
  });
  revalidatePath(SETTINGS_PATH);
  return { ok: true };
}

export interface UserAuditRow {
  id: string;
  action: string;
  actor_id: string | null;
  changes: Record<string, unknown> | null;
  created_at: string;
}

/** سجل نشاط مستخدم (آخر 30 حدث IAM يخصّه). */
export async function getUserAuditHistory(userId: string): Promise<{ ok: boolean; events: UserAuditRow[]; message?: string }> {
  const auth = await requireAdmin();
  if (!auth.ok) return { ok: false, events: [], message: auth.message };

  const service = createServiceClient();
  const { data } = await service
    .from("audit_log")
    .select("id, action, actor_id, changes, created_at")
    .eq("entity_type", "profile")
    .eq("entity_id", userId)
    .order("created_at", { ascending: false })
    .limit(30);
  return { ok: true, events: (data ?? []) as UserAuditRow[] };
}
