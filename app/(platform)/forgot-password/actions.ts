"use server";

import { headers } from "next/headers";
import { createClient } from "@/lib/supabase/server";
import { createServiceClient } from "@/lib/supabase/service";
import { recordAuthEvent } from "@/lib/auth/audit";

/**
 * طلب استعادة كلمة المرور — عبر إيميل Supabase المدمج
 * (resetPasswordForEmail): رابط لمرة واحدة بينتهي تلقائيًا، وSupabase
 * بيطبّق rate limiting على الإرسال من ناحيته.
 * أمان: الرد ثابت دايمًا (نجاح) — مانكشفش هل الإيميل موجود ولا لأ.
 */
export async function requestPasswordReset(email: string, origin: string): Promise<{ ok: boolean }> {
  const normalizedEmail = email.trim().toLowerCase();
  if (!normalizedEmail) return { ok: true };

  const supabase = await createClient();
  // رابط نظيف بدون query params — عشان يطابق الـ Redirect URLs allowlist في
  // Supabase (رابط فيه ?next= مكانش بيطابق فيرجع للـ Site URL/صفحة الدخول).
  // صفحة reset-password نفسها بتبادل الـ code وتعرض فورم كلمة السر الجديدة.
  await supabase.auth.resetPasswordForEmail(normalizedEmail, {
    redirectTo: `${origin}/auth/reset-password`,
  });

  // Audit (لو المستخدم موجود فعلًا) — بدون تسريب النتيجة للواجهة.
  const service = createServiceClient();
  const { data: profile } = await service
    .from("profiles")
    .select("id")
    .ilike("email", normalizedEmail)
    .maybeSingle();
  if (profile) {
    const h = await headers();
    await recordAuthEvent({
      actorId: null,
      targetUserId: profile.id,
      action: "password_reset",
      details: {
        stage: "requested",
        ip: h.get("x-forwarded-for")?.split(",")[0].trim() ?? null,
        user_agent: h.get("user-agent"),
      },
    });
  }

  return { ok: true };
}

/** تسجيل إتمام تغيير كلمة المرور بعد الاستعادة (audit فقط). */
export async function recordPasswordChanged(): Promise<void> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return;
  const h = await headers();
  await recordAuthEvent({
    actorId: user.id,
    targetUserId: user.id,
    action: "password_changed",
    details: {
      stage: "recovery_completed",
      ip: h.get("x-forwarded-for")?.split(",")[0].trim() ?? null,
      user_agent: h.get("user-agent"),
    },
  });
}
