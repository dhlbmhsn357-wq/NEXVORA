import { createServiceClient } from "@/lib/supabase/service";
import { ProductionValidationEngine } from "./generation-service";
import type { StageRunContext, StageRunResult } from "@/lib/engineering-qa/stage-registry";
import type { ValidationSession } from "@/lib/types/database";

const IN_PROGRESS_SUMMARY =
  "جلسة Production Validation شغّالة في الخلفية — بتنفّذ رحلات مستخدم حقيقية بمتصفح Chromium فعلي على رابط Staging، ثم فحوصات Responsive/Accessibility. افتح تفاصيل هذه المرحلة لمتابعة التقدم أو لتشغيل الخطوات يدويًا.";

/**
 * الجسر الوحيد بين Engineering QA Engine (Phase 12.1) وProduction
 * Validation Engine (Phase 4) — نفس نمط lib/static-review/eqa-bridge.ts
 * بالظبط. مُوصَّل بمفتاح "functional_audit" (أقرب مطابقة دلالية:
 * اختبار إن كل شيء بيشتغل فعليًا) — وبيغطي داخليًا أيضًا ما كان
 * مخطط له كـ ui_ux_audit/regression_testing/production_certification
 * (Responsive+Accessibility، اكتشاف Flaky Tests، وDeployment Gate) —
 * قرار توثّق أسبابه في التقرير الختامي.
 */
export async function runFunctionalAuditStage(context: StageRunContext): Promise<StageRunResult> {
  const supabase = createServiceClient();

  const { data: existing } = await supabase
    .from("validation_sessions")
    .select("*")
    .eq("engineering_stage_id", context.stageId)
    .maybeSingle();

  if (!existing) {
    const result = await ProductionValidationEngine.startSession(context.projectId, undefined, {
      engineeringReviewId: context.reviewId,
      engineeringStageId: context.stageId,
    });
    if (result.status === "error") {
      throw new Error(result.message);
    }
    if (result.status === "started") {
      await ProductionValidationEngine.runInitCore(result.sessionId);
    }
    return { score: null, summary: IN_PROGRESS_SUMMARY, findingsJson: [], recommendationsJson: [], inProgress: true };
  }

  const session = existing as ValidationSession;

  if (session.status === "generating") {
    return { score: null, summary: IN_PROGRESS_SUMMARY, findingsJson: [], recommendationsJson: [], inProgress: true };
  }

  if (session.status === "failed") {
    throw new Error(session.last_error ?? "فشلت جلسة Production Validation لسبب غير معروف.");
  }

  const { data: findings } = await supabase.from("validation_findings").select("*").eq("validation_session_id", session.id);
  const topFindings = (findings ?? []).filter((f) => f.severity === "critical" || f.severity === "high").slice(0, 20);

  return {
    score: session.score_summary?.overall_score ?? null,
    summary: `Production Validation اكتملت — ${session.journeys_passed}/${session.journeys_generated} رحلة نجحت، ${(findings ?? []).length} Finding. ${
      session.production_ready ? "✅ Production Ready" : "⛔ Not Ready"
    } — ${session.production_ready_reason}`,
    findingsJson: topFindings,
    recommendationsJson: [],
    inProgress: false,
  };
}
