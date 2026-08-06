import { NextResponse, type NextRequest } from "next/server";
import { after } from "next/server";
import { createServiceClient } from "@/lib/supabase/service";
import { loadUsableLink } from "@/lib/discovery-portal/link-service";
import { upsertSessionForm } from "@/lib/discovery-portal/session-service";
import { getTemplateQuestions } from "@/lib/discovery-templates/queries";
import { buildQuestionsSnapshot } from "@/lib/discovery-templates/snapshot";
import { checkRateLimit, extractClientIp } from "@/lib/rate-limit/rate-limiter";
import { ProjectBrainSyncService } from "@/lib/brain/sync-service";
import { runDiscoveryAnalysisJob } from "@/lib/discovery-analysis/job-runner";
import { advanceProjectStage } from "@/lib/projects/advance-stage";
import { captureGenerationFeedback } from "@/lib/discovery-generator/feedback-service";

const RATE_LIMIT = 10;
const WINDOW = 60;

// الرد بيرجع فورًا، لكن after() بيكمّل Discovery Analysis في نفس الـ
// invocation في الخلفية (حتى محاولتين × 110 ثانية + Brain sync). لازم
// وقت تنفيذ أطول من افتراضي المنصّة عشان ما يتقفلش قبل ما يخلص.
// (110s per attempt: راجع TASK_TIMEOUT_MS في lib/ai/service.ts)
export const maxDuration = 260;

/**
 * تسليم نهائي عام لنموذج الاكتشاف — يقفل الفورم، يحدّث حالة الرابط إلى
 * submitted، يسجّل في سجل التدقيق، ويشغّل مزامنة Project Brain في الخلفية.
 */
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ token: string }> }
) {
  const { token } = await params;
  const supabase = createServiceClient();

  const ip = extractClientIp(request.headers);
  const [tokenLimit, ipLimit] = await Promise.all([
    checkRateLimit(supabase, { scope: "discovery_submit_token", identifier: token, limit: RATE_LIMIT, windowSeconds: WINDOW }),
    checkRateLimit(supabase, { scope: "discovery_submit_ip", identifier: ip, limit: RATE_LIMIT, windowSeconds: WINDOW }),
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
  const nowIso = new Date(now).toISOString();
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
    status: "submitted",
    submittedAt: nowIso,
  });
  if (error) {
    return NextResponse.json({ ok: false, error: "تعذّر إرسال النموذج." }, { status: 500 });
  }

  await Promise.all([
    supabase
      .from("discovery_form_links")
      .update({ status: "submitted", submitted_at: nowIso, last_activity_at: nowIso })
      .eq("id", link.id),
    supabase
      .from("projects")
      .update({ discovery_template_id: link.template_id })
      .eq("id", link.project_id)
      .is("discovery_template_id", null),
    advanceProjectStage(supabase, link.project_id, "discovery_meeting"),
    supabase.from("audit_log").insert({
      actor_id: null,
      entity_type: "discovery_link",
      entity_id: link.id,
      action: "update",
      changes: { event: "submitted", project_id: link.project_id },
    }),
  ]);

  // مزامنة Project Brain في الخلفية — فشلها ما يمنعش نجاح التسليم
  after(async () => {
    const sync = await ProjectBrainSyncService.sync(link.project_id, "discovery_form_updated");
    if (sync.status === "error") {
      console.error(`[DiscoveryPortal] Brain sync failed for project ${link.project_id}: ${sync.message}`);
    }
  });

  // التقاط feedback حلقة التعلّم + تحديث استخدام القالب — فشله لا يمنع التسليم
  if (link.template_id) {
    const feedbackTemplateId = link.template_id;
    after(async () => {
      try {
        await captureGenerationFeedback(supabase, {
          templateId: feedbackTemplateId,
          projectId: link.project_id,
          questions,
          answers: answers as Record<string, unknown>,
        });
      } catch (err) {
        console.error(`[DiscoveryGenerator] feedback capture failed for project ${link.project_id}:`, err instanceof Error ? err.message : err);
      }
    });
  }

  // Discovery Analysis (Phase 4A) — يشتغل مستقلًا في الخلفية، فشله برضه ما يمنعش نجاح التسليم
  after(async () => {
    try {
      await runDiscoveryAnalysisJob(link.project_id, { actorId: null });
    } catch (err) {
      console.error(
        `[DiscoveryAnalysis] job failed for project ${link.project_id}:`,
        err instanceof Error ? err.message : err
      );
    }
  });

  return NextResponse.json({ ok: true });
}
