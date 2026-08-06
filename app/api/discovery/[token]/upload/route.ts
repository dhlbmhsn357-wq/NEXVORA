import { NextResponse, type NextRequest } from "next/server";
import { createServiceClient } from "@/lib/supabase/service";
import { loadUsableLink } from "@/lib/discovery-portal/link-service";
import { uploadDiscoveryFile, HARD_MAX_UPLOAD_BYTES } from "@/lib/storage/discovery-uploads";
import { DEFAULT_UPLOAD_ACCEPT, DEFAULT_MAX_FILE_MB, getQuestionTypeMeta } from "@/lib/discovery-templates/field-types";
import { checkRateLimit, extractClientIp } from "@/lib/rate-limit/rate-limiter";
import type { DiscoveryQuestion } from "@/lib/types/database";

const RATE_LIMIT = 20;
const WINDOW = 60;

/**
 * رفع ملف عام لسؤال اكتشاف من نوع رفع — النطاق محصور بالـ token، والتحقق
 * من النوع/الحجم يتم من إعدادات السؤال في الخادم (مش من العميل).
 */
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ token: string }> }
) {
  const { token } = await params;
  const supabase = createServiceClient();

  const ip = extractClientIp(request.headers);
  const [tokenLimit, ipLimit] = await Promise.all([
    checkRateLimit(supabase, { scope: "discovery_upload_token", identifier: token, limit: RATE_LIMIT, windowSeconds: WINDOW }),
    checkRateLimit(supabase, { scope: "discovery_upload_ip", identifier: ip, limit: RATE_LIMIT, windowSeconds: WINDOW }),
  ]);
  if (!tokenLimit.allowed || !ipLimit.allowed) {
    return NextResponse.json({ ok: false, error: "محاولات كتير، استنى شوية." }, { status: 429 });
  }

  const now = Date.now();
  const result = await loadUsableLink(supabase, token, now);
  if (!result.ok) {
    return NextResponse.json({ ok: false, error: "الرابط غير متاح.", state: result.state }, { status: 410 });
  }
  const { link } = result;

  const formData = await request.formData().catch(() => null);
  const questionId = formData?.get("questionId");
  const file = formData?.get("file");

  if (typeof questionId !== "string" || !questionId) {
    return NextResponse.json({ ok: false, error: "بيانات ناقصة." }, { status: 400 });
  }
  if (!(file instanceof File)) {
    return NextResponse.json({ ok: false, error: "لم يتم اختيار ملف." }, { status: 400 });
  }

  // نجيب السؤال من الخادم للتحقق الموثوق (نوعه وقواعده) وأنه من نفس القالب
  const { data: questionRow } = await supabase
    .from("discovery_questions")
    .select("id, type, validation, template_id")
    .eq("id", questionId)
    .maybeSingle();

  const question = questionRow as Pick<
    DiscoveryQuestion,
    "id" | "type" | "validation" | "template_id"
  > | null;

  if (!question || (link.template_id && question.template_id !== link.template_id)) {
    return NextResponse.json({ ok: false, error: "سؤال غير صالح." }, { status: 400 });
  }
  if (!getQuestionTypeMeta(question.type).isUpload) {
    return NextResponse.json({ ok: false, error: "هذا السؤال لا يقبل ملفات." }, { status: 400 });
  }

  const allowed =
    question.validation?.allowedFileTypes && question.validation.allowedFileTypes.length > 0
      ? question.validation.allowedFileTypes.map((s) => s.toLowerCase())
      : DEFAULT_UPLOAD_ACCEPT[question.type] ?? [];
  const maxMb = question.validation?.maxFileSizeMb ?? DEFAULT_MAX_FILE_MB;
  const maxBytes = Math.min(maxMb * 1024 * 1024, HARD_MAX_UPLOAD_BYTES);

  if (file.size > maxBytes) {
    return NextResponse.json(
      { ok: false, error: `حجم الملف أكبر من الحد المسموح (${Math.round(maxBytes / (1024 * 1024))} ميجا).` },
      { status: 400 }
    );
  }

  const ext = (file.name.split(".").pop() ?? "").toLowerCase();
  if (allowed.length > 0 && ext && !allowed.includes(ext)) {
    return NextResponse.json(
      { ok: false, error: `نوع الملف غير مسموح. المسموح: ${allowed.join("، ")}.` },
      { status: 400 }
    );
  }

  try {
    const buffer = await file.arrayBuffer();
    const path = await uploadDiscoveryFile(supabase, link.project_id, question.id, buffer, file.type, ext);
    await supabase
      .from("discovery_form_links")
      .update({ last_activity_at: new Date(now).toISOString() })
      .eq("id", link.id);
    return NextResponse.json({
      ok: true,
      file: { path, name: file.name, size: file.size, type: file.type },
    });
  } catch (e) {
    return NextResponse.json(
      { ok: false, error: e instanceof Error ? e.message : "فشل رفع الملف." },
      { status: 500 }
    );
  }
}
