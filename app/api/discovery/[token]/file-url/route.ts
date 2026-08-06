import { NextResponse, type NextRequest } from "next/server";
import { createServiceClient } from "@/lib/supabase/service";
import { loadUsableLink } from "@/lib/discovery-portal/link-service";
import { getDiscoveryFileUrl } from "@/lib/storage/discovery-uploads";

/**
 * Signed URL مؤقت لعرض/تنزيل ملف مرفوع داخل البوابة العامة — مقيّد بأن
 * المسار يخص مشروع نفس الرابط (يمنع الوصول لملفات مشروع آخر).
 */
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ token: string }> }
) {
  const { token } = await params;
  const supabase = createServiceClient();

  const now = Date.now();
  const result = await loadUsableLink(supabase, token, now);
  if (!result.ok) {
    return NextResponse.json({ ok: false, error: "الرابط غير متاح." }, { status: 410 });
  }
  const { link } = result;

  const body = await request.json().catch(() => null);
  const path = body?.path;
  if (typeof path !== "string" || !path.startsWith(`${link.project_id}/`)) {
    return NextResponse.json({ ok: false, error: "مسار غير صالح." }, { status: 400 });
  }

  const url = await getDiscoveryFileUrl(supabase, path);
  return url
    ? NextResponse.json({ ok: true, url })
    : NextResponse.json({ ok: false, error: "تعذّر فتح الملف." }, { status: 404 });
}
