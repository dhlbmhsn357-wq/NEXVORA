import { NextResponse, type NextRequest } from "next/server";
import { createServiceClient } from "@/lib/supabase/service";
import {
  uploadSupportAttachment,
  getSupportAttachmentUrl,
  ALLOWED_MIME_TYPES,
  MAX_ATTACHMENT_BYTES,
} from "@/lib/storage/support-attachments";
import { checkRateLimit, extractClientIp } from "@/lib/rate-limit/rate-limiter";
import { logSupportEvent } from "@/lib/support/observability";

const RATE_LIMIT_PER_WIDGET_PER_MINUTE = 10;
const RATE_LIMIT_WINDOW_SECONDS = 60;

/**
 * API عام (بدون تسجيل دخول) لرفع صورة مرفقة في محادثة الدعم — صور بس،
 * حد أقصى 5 ميجا، نطاق الوصول محصور بـ widget_key زي باقي الـ API العام.
 */
export async function POST(request: NextRequest) {
  const supabase = createServiceClient();
  const formData = await request.formData().catch(() => null);

  const widgetKey = formData?.get("widgetKey");
  const file = formData?.get("file");

  if (typeof widgetKey !== "string" || !widgetKey) {
    return NextResponse.json({ ok: false, error: "widgetKey مطلوب." }, { status: 400 });
  }
  if (!(file instanceof File)) {
    return NextResponse.json({ ok: false, error: "ملف مطلوب." }, { status: 400 });
  }

  const { data: project } = await supabase
    .from("projects")
    .select("id, archived_at")
    .eq("widget_key", widgetKey)
    .maybeSingle();

  if (!project || project.archived_at) {
    return NextResponse.json({ ok: false, error: "Widget غير صالح." }, { status: 404 });
  }

  const clientIp = extractClientIp(request.headers);
  const [widgetLimit, ipLimit] = await Promise.all([
    checkRateLimit(supabase, {
      scope: "support_upload_widget",
      identifier: widgetKey,
      limit: RATE_LIMIT_PER_WIDGET_PER_MINUTE,
      windowSeconds: RATE_LIMIT_WINDOW_SECONDS,
    }),
    checkRateLimit(supabase, {
      scope: "support_upload_ip",
      identifier: clientIp,
      limit: RATE_LIMIT_PER_WIDGET_PER_MINUTE,
      windowSeconds: RATE_LIMIT_WINDOW_SECONDS,
    }),
  ]);

  if (!widgetLimit.allowed || !ipLimit.allowed) {
    return NextResponse.json({ ok: false, error: "محاولات كتير أوي، استنى شوية." }, { status: 429 });
  }

  if (!ALLOWED_MIME_TYPES.includes(file.type)) {
    return NextResponse.json({ ok: false, error: "الصيغة مش مدعومة — صور بس (PNG/JPEG/WEBP/GIF)." }, { status: 400 });
  }
  if (file.size > MAX_ATTACHMENT_BYTES) {
    return NextResponse.json({ ok: false, error: "الملف أكبر من 5 ميجا." }, { status: 400 });
  }

  try {
    const buffer = await file.arrayBuffer();
    const path = await uploadSupportAttachment(supabase, widgetKey, buffer, file.type);
    const previewUrl = await getSupportAttachmentUrl(supabase, path);

    return NextResponse.json({ ok: true, path, previewUrl });
  } catch (err) {
    console.error("[SupportUploadAPI] Unexpected failure:", err);
    await logSupportEvent(supabase, {
      eventType: "widget_error",
      projectId: project.id,
      success: false,
      message: err instanceof Error ? err.message : "فشل رفع مرفق.",
    });
    return NextResponse.json({ ok: false, error: "فشل رفع الملف — حاول تاني." }, { status: 500 });
  }
}
