"use server";

import { headers } from "next/headers";
import { createServiceClient } from "@/lib/supabase/service";
import { checkSupabaseEnvConsistency } from "@/lib/supabase/env-check";
import { probeSupabaseGateway } from "@/lib/supabase/gateway-probe";
import { validatePasswordStrength } from "@/lib/auth/password-policy";
import { recordAuthEvent } from "@/lib/auth/audit";

export interface SetupActionResult {
  ok: boolean;
  message?: string;
}

/**
 * حالة بوابة الإعداد الأولي.
 *
 * `unknown` حالة مستقلة عن قصد ومش مدموجة في `needed`: العجز عن التحقق
 * **مش** دليل على إن المنصة فاضية.
 */
export type SetupGate =
  | { status: "needed" }
  | { status: "already_configured" }
  | { status: "unknown"; reason: string };

/**
 * هل المنصة لسه محتاجة إعداد أولي (مفيش أي مسؤول نظام)؟
 *
 * الدالة دي **تفشل مغلقة**. النسخة السابقة كانت بتتجاهل خطأ الاستعلام
 * وتقرا `count` الفاضية كصفر، يعني أي عطل لحظي — مفتاح خدمة غلط، متغيّر
 * بيئة بيشاور على مشروع تاني، انقطاع شبكة — كان بيتحوّل لـ "مفيش مسؤولين،
 * اعرض صفحة الإنشاء". وده مش خلل عرض: نفس الدالة هي اللي بتحرس تنفيذ
 * الإنشاء، فكان ممكن حد ينشئ حساب مسؤول أثناء العطل ده.
 *
 * القاعدة دلوقتي: مانقولش "محتاج إعداد" غير لما نتأكد فعليًا إن العدد صفر.
 */
export async function checkSetupGate(): Promise<SetupGate> {
  // تطابق متغيّرات البيئة أولًا: لو المفاتيح بتشاور على مشروعين مختلفين
  // فإحنا بنقرا قاعدة بيانات غير اللي فيها بياناتك، والعدد الصفري هيبقى
  // صحيحًا تقنيًا وكارثيًا عمليًا.
  const envCheck = checkSupabaseEnvConsistency();
  if (!envCheck.ok) {
    return { status: "unknown", reason: envCheck.message ?? "متغيّرات Supabase غير متطابقة." };
  }

  // إنشاء الـ client بيرمي لو المتغيّرات ناقصة — لازم نمسك الرمية دي
  // ونحوّلها لـ `unknown`، لأن انهيار الصفحة بيدي المستخدم صفحة خطأ
  // عامة بدل ما يعرف إن الإعداد ناقص.
  let service;
  try {
    service = createServiceClient();
  } catch (err) {
    return {
      status: "unknown",
      reason: describeFailure(err) || "تعذّر تهيئة الاتصال بقاعدة البيانات.",
    };
  }

  const { count, error } = await service
    .from("profiles")
    .select("id", { count: "exact", head: true })
    .eq("role", "owner")
    .neq("status", "deleted");

  if (error) {
    // خطأ فاضي المحتوى معناه إن الرد جه من البوّابة مش من قاعدة البيانات
    // (قاعدة البيانات دايمًا بتبعت code/details). في الحالة دي بنسأل عن
    // كود حالة HTTP بنفسنا — من غيره المستخدم بيشوف `{"message":""}`
    // وهي معلومة مش بتوصّله لحاجة.
    let reason = describeFailure(error);
    if (!reason) reason = await probeGatewayStatus();
    console.error(`[Setup] تعذّر التحقق من وجود مسؤول نظام: ${reason}`);
    return { status: "unknown", reason };
  }
  if (count === null || count === undefined) {
    return { status: "unknown", reason: "الاستعلام نجح لكنه لم يُرجع عددًا." };
  }

  return count === 0 ? { status: "needed" } : { status: "already_configured" };
}

/**
 * يبني سببًا مقروءًا من أي شكل خطأ.
 *
 * لازم مايرجّعش نص فاضي أبدًا: صندوق سبب فاضي في الواجهة أسوأ من عدم
 * عرضه أصلًا — المستخدم بيشوف إن فيه عطل من غير أي خيط يمسكه. أخطاء
 * supabase-js أحيانًا بتيجي بـ `message` فاضية والمعلومة الحقيقية في
 * `code` أو `details` أو `hint`.
 */
function describeFailure(err: unknown): string {
  if (!err) return "";
  if (typeof err === "string") return err.trim();

  const e = err as { message?: string; code?: string; details?: string; hint?: string };
  const parts = [e.message, e.code ? `code=${e.code}` : "", e.details, e.hint]
    .map((p) => (typeof p === "string" ? p.trim() : ""))
    .filter((p) => p.length > 0);

  if (parts.length > 0) return parts.join(" — ");

  return "";
}

/**
 * بيسأل بوّابة Supabase مباشرة عن كود حالة HTTP.
 *
 * بيتنادى بس لما الخطأ يرجع فاضي تمامًا — وde في حد ذاته دليل: قاعدة
 * البيانات لما بترفض طلب بترجّع `code` و`details`، فالفراغ معناه إن الرد
 * جه من البوّابة قبل ما يوصل للقاعدة أصلًا (تجاوز حدود الاستخدام، نفاد
 * ميزانية الإدخال/الإخراج، أو المشروع متوقف).
 *
 * بمهلة قصيرة: إحنا بالفعل على مسار فشل، وطول الانتظار هنا بيتحوّل مباشرة
 * لبطء في الصفحة اللي المستخدم مستنيها.
 */
async function probeGatewayStatus(): Promise<string> {
  const probe = await probeSupabaseGateway();
  return probe.summary;
}

/**
 * الإعداد الأولي للمنصة — بيتنفّذ مرة واحدة فقط: إنشاء أول مسؤول نظام
 * (owner). محمي بإعادة فحص عدم وجود owner لحظة التنفيذ (منع سباق/إعادة
 * استخدام الصفحة)، وقوة كلمة المرور، وتأكيدها. بيسجّل setup_completed
 * في الـ Audit. الصفحة مش هتظهر تاني إلا لو قاعدة البيانات اتصفّرت.
 */
export async function completeInitialSetup(input: {
  fullName: string;
  email: string;
  password: string;
  confirmPassword: string;
}): Promise<SetupActionResult> {
  const fullName = input.fullName.trim();
  const email = input.email.trim().toLowerCase();

  if (!fullName || fullName.length < 3) return { ok: false, message: "أدخل الاسم الكامل (3 أحرف على الأقل)." };
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return { ok: false, message: "أدخل إيميل شركة صالح." };
  if (input.password !== input.confirmPassword) return { ok: false, message: "كلمتا المرور غير متطابقتين." };

  const policy = validatePasswordStrength(input.password);
  if (!policy.ok) return { ok: false, message: policy.issues.join(" ") };

  // إعادة الفحص لحظة التنفيذ — الحماية الفعلية ضد إعادة استخدام الصفحة.
  // لازم تكون `needed` بالظبط: `unknown` معناها إننا معرفناش نتحقق، وإنشاء
  // مسؤول نظام على أساس شك هو بالظبط الخطر اللي بنقفله هنا.
  const gate = await checkSetupGate();
  if (gate.status === "already_configured") {
    return { ok: false, message: "المنصة مُهيّأة بالفعل — مسؤول النظام موجود. سجّل الدخول عادي." };
  }
  if (gate.status === "unknown") {
    return {
      ok: false,
      message: `تعذّر التحقق من حالة المنصة، ومن غير تحقق مش هننشئ مسؤول نظام. السبب: ${gate.reason}`,
    };
  }

  const service = createServiceClient();
  const { data: created, error } = await service.auth.admin.createUser({
    email,
    password: input.password,
    email_confirm: true,
    user_metadata: { full_name: fullName },
  });

  if (error || !created.user) {
    return { ok: false, message: `فشل إنشاء الحساب: ${error?.message ?? "سبب غير معروف"}` };
  }

  // الـ trigger (handle_new_user) أنشأ صف profiles — نرقّيه لمسؤول نظام نشط.
  const { error: profileError } = await service
    .from("profiles")
    .update({ role: "owner", status: "active", full_name: fullName })
    .eq("id", created.user.id);
  if (profileError) {
    return { ok: false, message: `اتعمل الحساب لكن فشل ضبط الدور: ${profileError.message}` };
  }

  const h = await headers();
  await recordAuthEvent({
    actorId: created.user.id,
    targetUserId: created.user.id,
    action: "setup_completed",
    details: {
      email,
      ip: h.get("x-forwarded-for")?.split(",")[0].trim() ?? null,
      user_agent: h.get("user-agent"),
    },
  });

  return { ok: true };
}
