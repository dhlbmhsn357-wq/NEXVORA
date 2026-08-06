import { NextResponse, type NextRequest } from "next/server";
import { createServiceClient } from "@/lib/supabase/service";
import { loadUsableLink } from "@/lib/discovery-portal/link-service";
import { upsertSessionForm } from "@/lib/discovery-portal/session-service";
import { getTemplateQuestions } from "@/lib/discovery-templates/queries";
import { buildQuestionsSnapshot } from "@/lib/discovery-templates/snapshot";
import { checkRateLimit, extractClientIp } from "@/lib/rate-limit/rate-limiter";

const RATE_LIMIT = 40;
const WINDOW = 60;

/**
 * حفظ تلقائي عام (بلا تسجيل دخول) لإجابات نموذج الاكتشاف — يُخزَّن كمسودّة.
 * النطاق محصور بالـ token فقط، والوصول عبر Service Role Client.
 */
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ token: string }> }
) {
  const { token } = await params;
  const supabase = createServiceClient();

  const ip = extractClientIp(request.headers);
  const [tokenLimit, ipLimit] = await Promise.all([
    checkRateLimit(supabase, { scope: "discovery_autosave_token", identifier: token, limit: RATE_LIMIT, windowSeconds: WINDOW }),
    checkRateLimit(supabase, { scope: "discovery_autosave_ip", identifier: ip, limit: RATE_LIMIT, windowSeconds: WINDOW }),
  ]);
  if (!tokenLimit.allowed || !ipLimit.allowed) {
    return NextResponse.json({ ok: false, error: "محاولات كتير، استنى شوية." }, { status: 429 });
  }

  const body = await request.json().catch(() => null);
  const answers = body?.answers;
  if (typeof answers !== "object" || answers === null || Array.isArray(answers)) {
    return NextResponse.json({ ok: false, error: "بيانات غير صالحة." }, { status: 400 });
  }

  const now = Date.now();
  const result = await loadUsableLink(supabase, token, now);
  if (!result.ok) {
    return NextResponse.json({ ok: false, error: "الرابط غير متاح.", state: result.state }, { status: 410 });
  }
  const { link } = result;

  const questions = link.template_id ? await getTemplateQuestions(supabase, link.template_id) : [];
  const snapshot = buildQuestionsSnapshot(questions);

  const { error } = await upsertSessionForm(supabase, {
    linkId: link.id,
    projectId: link.project_id,
    templateId: link.template_id,
    answers,
    snapshot,
    status: "draft",
  });
  if (error) {
    return NextResponse.json({ ok: false, error: "تعذّر الحفظ." }, { status: 500 });
  }

  // نقل الحالة إلى in_progress عند أول إجابة، وتحديث آخر نشاط
  const nextStatus = link.status === "submitted" ? link.status : "in_progress";
  await supabase
    .from("discovery_form_links")
    .update({ status: nextStatus, last_activity_at: new Date(now).toISOString() })
    .eq("id", link.id);

  return NextResponse.json({ ok: true });
}
