"use server";

import { revalidatePath } from "next/cache";
import { createClient as createSupabaseClient } from "@supabase/supabase-js";
import { createClient } from "@/lib/supabase/server";
import { createServiceClient } from "@/lib/supabase/service";
import { requireRole } from "@/lib/auth/rbac";
import { ALL_ROLES } from "@/lib/auth/roles";
import { validatePasswordStrength } from "@/lib/auth/password-policy";
import { recordAuthEvent } from "@/lib/auth/audit";

/**
 * إدارة الملف الشخصي الذاتي (Self-service) — Enterprise IAM.
 * أي مستخدم مسجّل دخول (بما فيهم owner) يقدر يعدّل: الاسم، الصورة، البريد،
 * كلمة المرور، وإنهاء الجلسات الأخرى. لا يقدر يحذف نفسه (مفيش حذف هنا).
 * كل كلمات المرور بتتكتب في Supabase Auth (مصدر الحقيقة) — مفيش تخزين
 * كلمة مرور في state أو أعمدة مخصّصة.
 */

const ACCOUNT_PATH = "/dashboard/account";
type ActionResult = { ok: boolean; message?: string };

/** يرجّع المستخدم الحالي (مع البريد) لو مسجّل دخول وحسابه نشط. */
async function currentUser(): Promise<{ id: string; email: string } | null> {
  const auth = await requireRole([...ALL_ROLES]);
  if (!auth.ok || !auth.userId) return null;
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return null;
  return { id: user.id, email: user.email ?? "" };
}

/** تحقّق من كلمة المرور الحالية عبر client مؤقت (بدون المساس بجلسة الكوكيز). */
async function verifyCurrentPassword(email: string, currentPassword: string): Promise<boolean> {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!url || !anonKey || !email) return false;
  const ephemeral = createSupabaseClient(url, anonKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
  const { error } = await ephemeral.auth.signInWithPassword({ email, password: currentPassword });
  return !error;
}

/** تعديل الاسم الكامل. */
export async function updateOwnName(fullName: string): Promise<ActionResult> {
  const user = await currentUser();
  if (!user) return { ok: false, message: "غير مسجّل دخول." };

  const name = fullName.trim();
  if (name.length < 2) return { ok: false, message: "أدخل اسمًا صالحًا (حرفين على الأقل)." };

  const service = createServiceClient();
  const { error } = await service.from("profiles").update({ full_name: name }).eq("id", user.id);
  if (error) return { ok: false, message: error.message };
  await service.auth.admin.updateUserById(user.id, { user_metadata: { full_name: name } });

  await recordAuthEvent({ actorId: user.id, targetUserId: user.id, action: "user_updated", details: { field: "full_name" } });
  revalidatePath(ACCOUNT_PATH);
  return { ok: true };
}

/** رفع/تغيير صورة الحساب — يرفع الملف عبر service client لـ bucket «avatars». */
export async function updateOwnAvatar(formData: FormData): Promise<ActionResult> {
  const user = await currentUser();
  if (!user) return { ok: false, message: "غير مسجّل دخول." };

  const file = formData.get("file");
  if (!(file instanceof File) || file.size === 0) return { ok: false, message: "اختر ملف صورة." };
  if (!file.type.startsWith("image/")) return { ok: false, message: "الملف لازم يكون صورة." };
  if (file.size > 3 * 1024 * 1024) return { ok: false, message: "أقصى حجم للصورة 3 ميجابايت." };

  const service = createServiceClient();
  const ext = (file.name.split(".").pop() || "png").toLowerCase().replace(/[^a-z0-9]/g, "") || "png";
  const path = `${user.id}/avatar.${ext}`;
  const bytes = new Uint8Array(await file.arrayBuffer());

  const { error: uploadError } = await service.storage
    .from("avatars")
    .upload(path, bytes, { contentType: file.type, upsert: true });
  if (uploadError) {
    const notReady = /bucket|not found|does not exist/i.test(uploadError.message);
    return {
      ok: false,
      message: notReady
        ? "مخزن الصور (avatars) غير مُهيّأ بعد — طبّق migration 0066 أو أنشئ bucket باسم avatars."
        : `فشل رفع الصورة: ${uploadError.message}`,
    };
  }

  const { data: pub } = service.storage.from("avatars").getPublicUrl(path);
  // كسر الكاش عشان الصورة الجديدة تظهر فورًا.
  const avatarUrl = `${pub.publicUrl}?v=${bytes.byteLength}`;
  const { error } = await service.from("profiles").update({ avatar_url: avatarUrl }).eq("id", user.id);
  if (error) return { ok: false, message: error.message };
  await service.auth.admin.updateUserById(user.id, { user_metadata: { avatar_url: avatarUrl } });

  await recordAuthEvent({ actorId: user.id, targetUserId: user.id, action: "user_updated", details: { field: "avatar_url" } });
  revalidatePath(ACCOUNT_PATH);
  return { ok: true };
}

/** تغيير كلمة المرور الذاتية (مع تأكيد كلمة المرور الحالية + سياسة القوة). */
export async function changeOwnPassword(currentPassword: string, newPassword: string): Promise<ActionResult> {
  const user = await currentUser();
  if (!user) return { ok: false, message: "غير مسجّل دخول." };

  const policy = validatePasswordStrength(newPassword);
  if (!policy.ok) return { ok: false, message: policy.issues.join(" ") };

  const verified = await verifyCurrentPassword(user.email, currentPassword);
  if (!verified) return { ok: false, message: "كلمة المرور الحالية غير صحيحة." };

  const service = createServiceClient();
  const { error } = await service.auth.admin.updateUserById(user.id, { password: newPassword });
  if (error) return { ok: false, message: error.message };
  // تصفير عدّاد الفشل عشان مايفضلش أثر لأي محاولات سابقة.
  await service.from("profiles").update({ failed_login_count: 0 }).eq("id", user.id);

  await recordAuthEvent({ actorId: user.id, targetUserId: user.id, action: "password_changed", details: { by: "self" } });
  return { ok: true };
}

/** تغيير البريد الذاتي (مع تأكيد كلمة المرور الحالية). */
export async function changeOwnEmail(newEmail: string, currentPassword: string): Promise<ActionResult> {
  const user = await currentUser();
  if (!user) return { ok: false, message: "غير مسجّل دخول." };

  const email = newEmail.trim().toLowerCase();
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return { ok: false, message: "أدخل إيميل صالح." };
  if (email === user.email.toLowerCase()) return { ok: false, message: "ده نفس بريدك الحالي." };

  const verified = await verifyCurrentPassword(user.email, currentPassword);
  if (!verified) return { ok: false, message: "كلمة المرور الحالية غير صحيحة." };

  const service = createServiceClient();
  const { error } = await service.auth.admin.updateUserById(user.id, { email, email_confirm: true });
  if (error) return { ok: false, message: error.message };
  await service.from("profiles").update({ email }).eq("id", user.id);

  await recordAuthEvent({ actorId: user.id, targetUserId: user.id, action: "email_changed", details: { new_email: email, by: "self" } });
  revalidatePath(ACCOUNT_PATH);
  return { ok: true };
}

/** إنهاء الجلسات على الأجهزة الأخرى (إدارة الجلسات). الجلسة الحالية تفضل. */
export async function signOutOtherSessions(): Promise<ActionResult> {
  const user = await currentUser();
  if (!user) return { ok: false, message: "غير مسجّل دخول." };

  const supabase = await createClient();
  const { error } = await supabase.auth.signOut({ scope: "others" });
  if (error) return { ok: false, message: error.message };

  await recordAuthEvent({ actorId: user.id, targetUserId: user.id, action: "logout", details: { scope: "others" } });
  return { ok: true };
}
