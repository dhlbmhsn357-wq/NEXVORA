import type { SupabaseClient } from "@supabase/supabase-js";
import { createServiceClient } from "@/lib/supabase/service";
import { AIService } from "@/lib/ai/service";
import { AITaskType } from "@/lib/ai/types";
import { buildReviewVerdictPrompt, type ReviewIncidentInput } from "@/lib/ai/prompts/production-monitoring-review";
import { validateReviewVerdicts } from "@/lib/ai/validation/production-monitoring-review";
import { computeOverallFixScore, incidentsNeedingNewFixPrompts } from "./review-scoring";
import { generateFixPromptsForIncident, getFixPromptsForIncident } from "./fix-prompt-service";
import { getBrainForDownstreamGeneration, formatBrainV2ForPrompt } from "@/lib/brain-v2/downstream-context";
import type { MonitoringIncident, MonitoringReviewReport } from "@/lib/types/database";

const MAX_SUMMARY_CHARS = 2000;
function truncate(text: string, max: number): string {
  return text.length > max ? `${text.slice(0, max)}\n[...تم اختصار الباقي...]` : text;
}

export type RunReviewResult = { status: "success"; reportId: string; overallFixScore: number | null } | { status: "error"; message: string };

/**
 * "هل الإصلاح نجح فعلًا؟" — بيقارن الحوادث المفتوحة/المُعلَّمة بأدلة
 * الفحص الأحدث + سياق Engineering QA/PRD/Brain/التوصيات، وبيولّد حكمًا
 * لكل حادثة (AI) + درجة إجمالية محسوبة بالكود. لو الدرجة أقل من 100،
 * بيطلب تلقائيًا جولة Fix Prompts جديدة للحوادث الناقصة — مفيش تكرار
 * لمنطق التوليد، بيعيد استخدام fix-prompt-service.ts مباشرة.
 */
export async function runReviewVerdict(projectId: string, actorId: string | null = null): Promise<RunReviewResult> {
  const supabase: SupabaseClient = createServiceClient();

  const { data: incidentsRaw } = await supabase
    .from("monitoring_incidents")
    .select("*")
    .eq("project_id", projectId)
    .neq("status", "resolved")
    .order("severity");
  const incidents = (incidentsRaw as MonitoringIncident[] | null) ?? [];
  if (incidents.length === 0) return { status: "error", message: "لا توجد حوادث مفتوحة تحتاج مراجعة بعد الإصلاح." };

  const incidentInputs: ReviewIncidentInput[] = await Promise.all(
    incidents.map(async (i) => {
      const prompts = await getFixPromptsForIncident(supabase, i.id);
      const summary = prompts.map((p) => `- [${p.area}] ${p.content.title}`).join("\n");
      return { id: i.id, title: i.title, root_cause: i.root_cause, fix_prompts_summary: summary };
    })
  );

  const { data: latestCheck } = await supabase
    .from("monitoring_checks")
    .select("overall_status, health_score, performance_score, response_time_ms, console_error_count, is_regression, generated_at")
    .eq("project_id", projectId)
    .eq("status", "ready")
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  const latestCheckSummary = latestCheck
    ? `الحالة العامة: ${latestCheck.overall_status}, درجة الصحة: ${latestCheck.health_score}, درجة الأداء: ${latestCheck.performance_score}, زمن الاستجابة: ${latestCheck.response_time_ms}ms, أخطاء Console: ${latestCheck.console_error_count}, تراجع مكتشف: ${latestCheck.is_regression ? "نعم" : "لا"}`
    : "(لا يوجد فحص حديث)";

  const [{ data: cert }, { data: prd }, brain, { data: acceptedRecs }] = await Promise.all([
    supabase.from("engineering_certificates").select("certification_status, overall_score").eq("project_id", projectId).order("generated_at", { ascending: false }).limit(1).maybeSingle(),
    supabase.from("prd").select("overview, problem_statement").eq("project_id", projectId).maybeSingle(),
    getBrainForDownstreamGeneration(supabase, projectId),
    supabase.from("project_recommendations").select("category, recommendation").eq("project_id", projectId).eq("status", "accepted").limit(10),
  ]);

  const prompt = buildReviewVerdictPrompt({
    incidents: incidentInputs,
    latestCheckSummary,
    engineeringQaSummary: cert ? `الاعتماد: ${cert.certification_status}, الدرجة: ${cert.overall_score ?? "غير متاحة"}` : null,
    prdSummary: prd ? truncate(`${prd.overview}\n${prd.problem_statement}`, MAX_SUMMARY_CHARS) : null,
    brainSummary: brain ? truncate(formatBrainV2ForPrompt(brain.content), MAX_SUMMARY_CHARS) : null,
    acceptedRecommendationsSummary: acceptedRecs && acceptedRecs.length > 0 ? acceptedRecs.map((r) => `- [${r.category}] ${r.recommendation}`).join("\n") : null,
  });

  const response = await AIService.execute(AITaskType.PRODUCTION_MONITORING_REVIEW_VERDICT, prompt, { projectId, actorId: actorId ?? undefined });
  if (!response.success) return { status: "error", message: response.error?.message ?? "فشل استدعاء AI." };

  const validIncidentIds = new Set(incidents.map((i) => i.id));
  const validation = validateReviewVerdicts(response.output, validIncidentIds);
  if (!validation.ok) return { status: "error", message: validation.reason };

  const overallFixScore = computeOverallFixScore(validation.data);

  const { data: report, error } = await supabase
    .from("monitoring_review_reports")
    .insert({
      check_id: null,
      project_id: projectId,
      verdicts: validation.data,
      overall_fix_score: overallFixScore,
      requested_by: actorId,
    })
    .select("id")
    .single();
  if (error || !report) return { status: "error", message: `فشل حفظ تقرير المراجعة: ${error?.message ?? "سبب غير معروف"}` };

  // "solved_completely" بس بتتعلّم Resolved تلقائيًا — أي حكم تاني يفضل مفتوح لحد ما PM يقرر.
  const solvedIds = validation.data.filter((v) => v.verdict === "solved_completely").map((v) => v.incident_id);
  if (solvedIds.length > 0) {
    await supabase.from("monitoring_incidents").update({ status: "resolved", resolved_at: new Date().toISOString() }).in("id", solvedIds);
  }

  if ((overallFixScore ?? 0) < 100) {
    const needIds = incidentsNeedingNewFixPrompts(validation.data);
    for (const incidentId of needIds) {
      await generateFixPromptsForIncident(incidentId, actorId);
    }
  }

  return { status: "success", reportId: report.id, overallFixScore };
}

export async function getLatestReviewReport(supabase: SupabaseClient, projectId: string): Promise<MonitoringReviewReport | null> {
  const { data } = await supabase.from("monitoring_review_reports").select("*").eq("project_id", projectId).order("generated_at", { ascending: false }).limit(1).maybeSingle();
  return (data as MonitoringReviewReport | null) ?? null;
}
