import { NextResponse, type NextRequest } from "next/server";
import { sweepAllProjects } from "@/lib/production-monitoring/sweep";

export const maxDuration = 260;

/**
 * نقطة تشغيل المسح اليومي لكل المشاريع — نفس نمط الحماية بالضبط اللي
 * في app/api/cron/whatsapp-reminders/route.ts (Bearer Token أو ?token=).
 *   • Vercel Cron (مرة واحدة يوميًا — راجع vercel.json)
 *   • أي مؤقّت خارجي (curl مع CRON_SECRET) لو محتاج تكرار أعلى
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
    return NextResponse.json({ ok: false, error: "CRON_SECRET غير مضبوط في متغيّرات البيئة." }, { status: 500 });
  }

  const authz = request.headers.get("authorization");
  const bearer = authz?.startsWith("Bearer ") ? authz.slice(7) : null;
  const qs = new URL(request.url).searchParams.get("token");
  if (bearer !== secret && qs !== secret) {
    return NextResponse.json({ ok: false, error: "unauthorized" }, { status: 401 });
  }

  const result = await sweepAllProjects();
  return NextResponse.json({ ok: true, ...result });
}
