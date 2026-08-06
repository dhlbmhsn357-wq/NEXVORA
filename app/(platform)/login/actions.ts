"use server";

import { headers } from "next/headers";
import { createClient } from "@/lib/supabase/server";
import { createServiceClient } from "@/lib/supabase/service";
import { evaluateLoginAttempt, LOGIN_WINDOW_MS } from "@/lib/auth/lockout";
import { isStatusAllowed, statusBlockMessage } from "@/lib/auth/roles";
import { recordAuthEvent } from "@/lib/auth/audit";
import { isProtectedOwnerRole, shouldLockUser, healSingleOwner } from "@/lib/auth/owner-protection";
import type { UserRole, UserStatus } from "@/lib/types/database";

export interface LoginActionResult {
  ok: boolean;
  message?: string;
}

async function getRequestMeta(): Promise<{ ip: string | null; userAgent: string | null }> {
  const h = await headers();
  const forwarded = h.get("x-forwarded-for");
  return {
    ip: forwarded ? forwarded.split(",")[0].trim() : (h.get("x-real-ip") ?? null),
    userAgent: h.get("user-agent"),
  };
}

/**
 * تسجيل الدخول المؤسسي (Enterprise IAM) — email/password فقط.
 * الترتيب: throttle/قفل (login_attempts) ← حالة الحساب ← كلمة المرور ←
 * تحديث last_login/العدّادات ← Audit. كل محاولة بتتسجّل نجاحًا أو فشلًا.
 */
export async function loginAction(email: string, password: string): Promise<LoginActionResult> {
  const normalizedEmail = email.trim().toLowerCase();
  if (!normalizedEmail || !password) return { ok: false, message: "أدخل الإيميل وكلمة المرور." };

  const service = createServiceClient();
  const { ip, userAgent } = await getRequestMeta();
  const windowStart = new Date(Date.now() - LOGIN_WINDOW_MS).toISOString();

  // 1) Rate limiting + قرار القفل (نقي في lib/auth/lockout.ts)
  const { data: attempts } = await service
    .from("login_attempts")
    .select("success")
    .eq("email", normalizedEmail)
    .gte("created_at", windowStart);
  const attemptsInWindow = attempts?.length ?? 0;
  const failedInWindow = (attempts ?? []).filter((a) => !a.success).length;
  const decision = evaluateLoginAttempt(attemptsInWindow, failedInWindow);

  async function logAttempt(success: boolean): Promise<void> {
    await service.from("login_attempts").insert({ email: normalizedEmail, ip, user_agent: userAgent, success });
  }

  if (decision.blocked) {
    await logAttempt(false);
    return { ok: false, message: decision.message };
  }

  // 2) حالة الحساب قبل فحص كلمة المرور (locked/inactive/... = رفض فوري)
  // نجيب أول صف (limit 1) بدل maybeSingle عشان صف profiles مكرر (لو حصل)
  // ما يخلّيش الفحص يرجّع null بصمت ويتخطّى حماية الحالة.
  const { data: profileRows } = await service
    .from("profiles")
    .select("id, status, role")
    .ilike("email", normalizedEmail)
    .order("created_at", { ascending: true })
    .limit(1);
  const profile = profileRows?.[0] ?? null;
  const isOwner = isProtectedOwnerRole(profile?.role as UserRole | undefined);

  // حماية مسؤول النظام: لو owner حالته مش active (انحراف/قفل تلقائي سابق)،
  // نصلّحها تلقائيًا ونكمّل لفحص كلمة المرور بدل ما نمنعه — فمستحيل يتقفل خارج.
  if (profile && isOwner && !isStatusAllowed(profile.status as UserStatus)) {
    await healSingleOwner(service, profile.id);
    await recordAuthEvent({
      actorId: null,
      targetUserId: profile.id,
      action: "user_unlocked",
      details: { reason: "owner_auto_heal", previous_status: profile.status, ip, user_agent: userAgent },
    });
  } else if (profile && !isStatusAllowed(profile.status as UserStatus)) {
    await logAttempt(false);
    await recordAuthEvent({
      actorId: null,
      targetUserId: profile.id,
      action: "failed_login",
      details: { reason: "status_blocked", status: profile.status, ip, user_agent: userAgent },
    });
    return { ok: false, message: statusBlockMessage(profile.status as UserStatus) };
  }

  // 3) فحص كلمة المرور — server client عشان الجلسة تتكتب في الكوكيز
  const supabase = await createClient();
  const { data, error } = await supabase.auth.signInWithPassword({ email: normalizedEmail, password });

  if (error || !data.user) {
    await logAttempt(false);
    if (profile) {
      const newCount = failedInWindow + 1;
      // مسؤول النظام (owner) لا يُقفل أبدًا — حتى لو تعدّى حدّ المحاولات.
      const lock = shouldLockUser(profile.role as UserRole | undefined, decision.shouldLockAfterFailure);
      await service
        .from("profiles")
        .update({
          failed_login_count: newCount,
          ...(lock ? { status: "locked", locked_at: new Date().toISOString() } : {}),
        })
        .eq("id", profile.id);
      await recordAuthEvent({
        actorId: null,
        targetUserId: profile.id,
        action: lock ? "user_locked" : "failed_login",
        details: { reason: "bad_credentials", failed_in_window: newCount, is_owner: isOwner, ip, user_agent: userAgent },
      });
      if (lock) {
        return { ok: false, message: "الحساب اتقفل بسبب محاولات فاشلة متكررة. تواصل مع مسؤول النظام." };
      }
    } else {
      await recordAuthEvent({
        actorId: null,
        targetUserId: null,
        action: "failed_login",
        details: { reason: "unknown_email", email: normalizedEmail, ip, user_agent: userAgent },
      });
    }
    return { ok: false, message: "الإيميل أو كلمة المرور غير صحيحة." };
  }

  // 4) نجاح: سجّل، صفّر عدّاد الفشل، حدّث آخر دخول
  await logAttempt(true);
  await service
    .from("profiles")
    .update({ failed_login_count: 0, last_login_at: new Date().toISOString() })
    .eq("id", data.user.id);
  await recordAuthEvent({
    actorId: data.user.id,
    targetUserId: data.user.id,
    action: "login",
    details: { method: "password", ip, user_agent: userAgent },
  });

  return { ok: true };
}

/** تسجيل خروج مع Audit — بيُستدعى من user-menu قبل signOut المحلي. */
export async function logoutAction(): Promise<void> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (user) {
    const { ip, userAgent } = await getRequestMeta();
    await recordAuthEvent({
      actorId: user.id,
      targetUserId: user.id,
      action: "logout",
      details: { ip, user_agent: userAgent },
    });
  }
  await supabase.auth.signOut();
}
