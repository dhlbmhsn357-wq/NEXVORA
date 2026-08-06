import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

export async function GET(request: Request) {
  const { searchParams, origin } = new URL(request.url);
  const code = searchParams.get("code");
  const next = searchParams.get("next") ?? "/dashboard";

  if (code) {
    const supabase = await createClient();
    const { data, error } = await supabase.auth.exchangeCodeForSession(code);
    if (!error) {
      if (data.user) {
        await supabase.from("audit_log").insert({
          actor_id: data.user.id,
          entity_type: "profile",
          entity_id: data.user.id,
          action: "login",
          // بعد إزالة Google/Magic Link، المسار الوحيد اللي بيمر من هنا هو استعادة كلمة المرور.
          changes: { method: next.includes("reset-password") ? "password_recovery" : (data.user.app_metadata?.provider ?? "email") },
        });
      }
      return NextResponse.redirect(`${origin}${next}`);
    }
  }

  // فشل تبادل الرمز — إعادة توجيه لصفحة الدخول مع رسالة خطأ
  return NextResponse.redirect(`${origin}/login?error=auth_callback_failed`);
}
