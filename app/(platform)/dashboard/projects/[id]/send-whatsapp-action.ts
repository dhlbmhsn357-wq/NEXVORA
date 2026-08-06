"use server";

import { revalidatePath } from "next/cache";
import { headers } from "next/headers";
import { createClient } from "@/lib/supabase/server";
import { requireAdmin } from "@/lib/auth/rbac";
import {
  sendDiscoveryLinkOverWhatsApp,
  prepareManualWhatsAppMessage,
} from "@/lib/whatsapp/communication-service";

/**
 * يستنبط عنوان الموقع العام من الـ request headers — بيتضبط تلقائيًا
 * على أي بيئة (Vercel/محلي) بدون متغيّر بيئة إضافي.
 */
async function getPublicBaseUrl(): Promise<string> {
  const h = await headers();
  const host = h.get("x-forwarded-host") ?? h.get("host");
  const proto = h.get("x-forwarded-proto") ?? "https";
  if (host) return `${proto}://${host}`;
  return process.env.NEXT_PUBLIC_APP_URL ?? "";
}

/**
 * تجهيز رسالة دعوة الاكتشاف لإرسال يدوي عبر WhatsApp — للمسؤولين فقط.
 * يعيد استخدام الرابط الحالي إن كان صالحًا، ويولّد رابطًا جديدًا إن كان
 * منتهيًا/ملغى، يسجّل الرسالة، ويرجّع رابط wa.me جاهز بالنص عشان يُفتح
 * في تبويب واتساب والمستخدم يضغط "إرسال" بنفسه (بدون أي مزوّد/API خارجي).
 */
export async function sendDiscoveryWhatsApp(
  projectId: string
): Promise<{ ok: boolean; message?: string; regenerated?: boolean; waUrl?: string }> {
  const auth = await requireAdmin();
  if (!auth.ok) return { ok: false, message: auth.message };

  const publicBaseUrl = await getPublicBaseUrl();

  const supabase = await createClient();
  // تحقّق سريع من الوصول (المستخدم مسجّل دخول ويصل للمشروع عبر RLS القائمة)
  const { data: project } = await supabase
    .from("projects")
    .select("id")
    .eq("id", projectId)
    .maybeSingle();
  if (!project) return { ok: false, message: "المشروع غير موجود." };

  const result = await prepareManualWhatsAppMessage({
    projectId,
    actorId: auth.userId ?? null,
    publicBaseUrl,
  });

  revalidatePath(`/dashboard/projects/${projectId}`);
  if (!result.ok) return { ok: false, message: result.message };
  return { ok: true, regenerated: result.regenerated, waUrl: result.waUrl };
}

/**
 * إعادة محاولة إرسال رسالة فشلت — يستخدم نفس القالب والغرض والرقم،
 * لكن يولّد صف جديد (retry_count += 1) عشان يحافظ على سجل السبب الأول.
 */
export async function retryWhatsAppMessage(
  messageId: string
): Promise<{ ok: boolean; message?: string }> {
  const auth = await requireAdmin();
  if (!auth.ok) return { ok: false, message: auth.message };

  const publicBaseUrl = await getPublicBaseUrl();
  const supabase = await createClient();

  const { data: original } = await supabase
    .from("whatsapp_messages")
    .select("id, project_id, purpose, reminder_index, retry_count")
    .eq("id", messageId)
    .maybeSingle();
  if (!original || !original.project_id) {
    return { ok: false, message: "الرسالة غير موجودة." };
  }

  const result = await sendDiscoveryLinkOverWhatsApp({
    projectId: original.project_id,
    actorId: auth.userId ?? null,
    reminderIndex: original.reminder_index,
    overridePurpose: original.purpose,
    publicBaseUrl,
  });

  // نعلّم الأصلي كمُقرّ به لتصريف إشعار الفشل
  await supabase
    .from("whatsapp_messages")
    .update({
      acknowledged_at: new Date().toISOString(),
      retry_count: (original.retry_count ?? 0) + 1,
    })
    .eq("id", messageId);

  revalidatePath(`/dashboard/projects/${original.project_id}`);
  return result.ok ? { ok: true } : { ok: false, message: result.message };
}

/** إخفاء إشعار فشل رسالة بدون إعادة محاولة. */
export async function acknowledgeWhatsAppFailure(
  messageId: string
): Promise<{ ok: boolean; message?: string }> {
  const auth = await requireAdmin();
  if (!auth.ok) return { ok: false, message: auth.message };

  const supabase = await createClient();
  const { error } = await supabase
    .from("whatsapp_messages")
    .update({ acknowledged_at: new Date().toISOString() })
    .eq("id", messageId);
  if (error) return { ok: false, message: error.message };
  return { ok: true };
}
