import { NextResponse, type NextRequest } from "next/server";
import { createServiceClient } from "@/lib/supabase/service";
import { checkRateLimit, extractClientIp } from "@/lib/rate-limit/rate-limiter";
import { proposeSupportFeedbackChange } from "@/lib/brain-v2/support-feedback-integration";

const RATE_LIMIT_PER_IP_PER_MINUTE = 10;
const RATE_LIMIT_WINDOW_SECONDS = 60;

/**
 * API عام (بدون تسجيل دخول) لتقييم رضا العميل بعد إغلاق طلب دعم —
 * 👍/👎 بس، مرة واحدة لكل طلب (أي محاولة تانية بتتجاهل بهدوء).
 */
export async function POST(request: NextRequest) {
  const supabase = createServiceClient();
  const body = await request.json().catch(() => null);

  const requestId = typeof body?.requestId === "string" ? body.requestId : null;
  const rating = body?.rating;

  if (!requestId || (rating !== 1 && rating !== -1)) {
    return NextResponse.json({ ok: false, error: "بيانات غير صالحة." }, { status: 400 });
  }

  const clientIp = extractClientIp(request.headers);
  const limit = await checkRateLimit(supabase, {
    scope: "support_rate_ip",
    identifier: clientIp,
    limit: RATE_LIMIT_PER_IP_PER_MINUTE,
    windowSeconds: RATE_LIMIT_WINDOW_SECONDS,
  });
  if (!limit.allowed) {
    return NextResponse.json({ ok: false, error: "محاولات كتير أوي." }, { status: 429 });
  }

  // يسمح بالتقييم مرة واحدة بس لكل طلب — لو already rated، يتجاهل بهدوء
  const { data: existing } = await supabase
    .from("support_requests")
    .select("id, project_id, satisfaction_rating")
    .eq("id", requestId)
    .maybeSingle();

  if (!existing) {
    return NextResponse.json({ ok: false, error: "الطلب غير موجود." }, { status: 404 });
  }
  if (existing.satisfaction_rating !== null) {
    return NextResponse.json({ ok: true });
  }

  await supabase
    .from("support_requests")
    .update({ satisfaction_rating: rating, satisfaction_rated_at: new Date().toISOString() })
    .eq("id", requestId);

  if (rating === -1) {
    try {
      await proposeSupportFeedbackChange(existing.project_id, requestId);
    } catch (err) {
      console.error(`[Support] proposeSupportFeedbackChange threw for request ${requestId}:`, err);
    }
  }

  return NextResponse.json({ ok: true });
}
