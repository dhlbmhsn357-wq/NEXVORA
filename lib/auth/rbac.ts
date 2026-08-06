import { createClient } from "@/lib/supabase/server";
import { roleSatisfies, isStatusAllowed, statusBlockMessage } from "@/lib/auth/roles";
import type { UserRole, UserStatus } from "@/lib/types/database";

/**
 * طبقة RBAC على مستوى Server Actions (Enterprise IAM).
 *
 * السياسات (RLS) في قاعدة البيانات تبقى كما هي: "أي مستخدم مسجّل دخول
 * له صلاحية". السبب: RLS بترجع "لا شيء" بشكل صامت عند الرفض، وده
 * تجربة مستخدم سيئة. الأفضل نفحص الدور في Server Action ونرجّع رسالة
 * واضحة، ونسيب RLS كطبقة أمان أخيرة تمنع الوصول لأي حد مش مسجّل دخول.
 *
 * منذ migration 0059:
 *  - الفحص هرمي (lib/auth/roles.ts): أقل رتبة في allowed هي المطلوبة،
 *    فأي دور أعلى بيعدّي تلقائيًا — كده الـ ~120 موضع اللي بينادوا
 *    بمصفوفات ثابتة قديمة (["owner","admin"] إلخ) شغّالين كما هم،
 *    ودور supervisor الجديد اندمج من غير تعديلهم.
 *  - حالة الحساب بتتفحص هنا مركزيًا: غير active (locked/inactive/
 *    suspended/pending/deleted) = مرفوض من كل العمليات فورًا.
 */
export interface RequireRoleResult {
  ok: boolean;
  userId?: string;
  role?: UserRole;
  message?: string;
}

/**
 * يتحقق من أن المستخدم الحالي عنده دور يحقق (هرميًا) الأدوار المسموحة
 * وأن حسابه نشط. لو مش محقق: يرجّع {ok:false, message}.
 */
export async function requireRole(allowed: UserRole[]): Promise<RequireRoleResult> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return { ok: false, message: "غير مسجّل دخول." };
  }

  const { data: profile } = await supabase
    .from("profiles")
    .select("role, status")
    .eq("id", user.id)
    .maybeSingle();

  const role = (profile?.role as UserRole | undefined) ?? "member";
  const status = (profile?.status as UserStatus | undefined) ?? "active";

  if (!isStatusAllowed(status)) {
    return { ok: false, userId: user.id, role, message: statusBlockMessage(status) };
  }

  if (!roleSatisfies(role, allowed)) {
    return {
      ok: false,
      userId: user.id,
      role,
      message: "ماعندكش صلاحية للعملية دي. تواصل مع مسؤول النظام.",
    };
  }

  return { ok: true, userId: user.id, role };
}

/**
 * اختصار للحالة الأكثر شيوعًا: العملية دي محتاجة owner أو admin
 * (مش supervisor/member). بتُستخدم في: الأرشفة، الحذف، وتعديلات
 * Settings الحساسة.
 */
export function requireAdmin(): Promise<RequireRoleResult> {
  return requireRole(["owner", "admin"]);
}

/** عمليات إدارة المستخدمين الحساسة — مسؤول النظام (owner) فقط. */
export function requireSystemAdmin(): Promise<RequireRoleResult> {
  return requireRole(["owner"]);
}
