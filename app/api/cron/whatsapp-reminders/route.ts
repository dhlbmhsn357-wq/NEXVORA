import { NextResponse, type NextRequest } from "next/server";
import { runReminderSweep } from "@/lib/whatsapp/reminder-engine";

/**
 * نقطة تشغيل مسح التذكيرات — مصمّمة لتُستدعى من:
 *   • Vercel Cron (أضف الإدخال في vercel.json لاحقًا إذا رغبت)
 *   • أي مؤقّت خارجي (curl مع CRON_SECRET)
 *
 * الحماية: إما Bearer token (نفس اللي Vercel Cron بيبعت) أو
 *   ?token=<CRON_SECRET>. لو CRON_SECRET مش مضبوط، نرفض الطلب.
 */
export async function POST(request: NextRequest) {
  return handle(request);
}
export async function GET(request: NextRequest) {
  return handle(request);
}

async function handle(request: NextRequest) {
  const secret = process.env.CRON_SECRET;
  if (!secret) {
    return NextResponse.json(
      { ok: false, error: "CRON_SECRET غير مضبوط في متغيّرات البيئة." },
      { status: 500 }
    );
  }

  const authz = request.headers.get("authorization");
  const bearer = authz?.startsWith("Bearer ") ? authz.slice(7) : null;
  const qs = new URL(request.url).searchParams.get("token");
  if (bearer !== secret && qs !== secret) {
    return NextResponse.json({ ok: false, error: "unauthorized" }, { status: 401 });
  }

  const host =
    request.headers.get("x-forwarded-host") ?? request.headers.get("host") ?? "";
  const proto = request.headers.get("x-forwarded-proto") ?? "https";
  const publicBaseUrl = host ? `${proto}://${host}` : "";

  const result = await runReminderSweep(publicBaseUrl);
  return NextResponse.json({ ok: true, ...result });
}
