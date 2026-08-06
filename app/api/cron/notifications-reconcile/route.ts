import { NextResponse, type NextRequest } from "next/server";
import { reconcileNotifications } from "@/lib/notifications/reconcile-service";
import { runEscalationScan } from "@/lib/automation/service";

/**
 * نقطة تشغيل توفيق الإشعارات — نفس نمط الحماية بالضبط اللي في باقي
 * الـ Cron Routes (Bearer Token أو ?token=). هذا هو المصدر الوحيد
 * المسموح له باستدعاء reconcileNotifications() — القراءة (الجرس/صفحة
 * التاريخ) بقت Read-Only بالكامل عشان نمنع Feedback Loop مع اشتراك
 * Realtime (راجع notifications-actions.ts للتفاصيل).
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

  const result = await reconcileNotifications();
  // فحص التصعيد التلقائي على نفس دورة الـ Cron (best-effort — لا يكسر التوفيق).
  let escalation = { escalated: 0, riskTasks: 0 };
  try {
    escalation = await runEscalationScan();
  } catch (err) {
    console.error("[Automation] escalation scan failed:", err instanceof Error ? err.message : err);
  }
  return NextResponse.json({ ok: true, ...result, escalation });
}
