import type { SupabaseClient } from "@supabase/supabase-js";
import { createServiceClient } from "@/lib/supabase/service";
import { AITaskType } from "@/lib/ai/types";
import { executeAIWithRateLimitWait } from "@/lib/ai/execute-with-rate-limit-wait";
import { buildIncidentAnalysisPrompt } from "@/lib/ai/prompts/production-monitoring";
import { validateIncidentAnalysis } from "@/lib/ai/validation/production-monitoring";
import { maskSecrets } from "@/lib/security-review/masking";
import { generateCandidatesFromChecks, type MonitoringCandidate } from "./candidates";
import { computeHealthScore, computePerformanceScore, computeOverallStatus } from "./scoring";
import { detectRegression } from "./regression";
import { refreshInfraServiceStatus } from "./infra-signals";
import { getLatestReviewReport } from "./review-service";
import type { InfraServiceStatus, MonitoringCheck, MonitoringCheckTrigger, MonitoringFixPrompt, MonitoringIncident, MonitoringIncidentEventType } from "@/lib/types/database";

const AI_BUDGET_MS = 170_000;
const HEALTH_CHECK_TIME_BUDGET_MS = 60_000;
const STALE_LOCK_MS = 10 * 60_000;

export type RunCheckResult = { status: "started"; checkId: string } | { status: "already_running" } | { status: "error"; message: string };

async function logEvent(
  supabase: SupabaseClient,
  incidentId: string,
  projectId: string,
  eventType: MonitoringIncidentEventType,
  detail: string,
  actorId?: string
): Promise<void> {
  await supabase.from("monitoring_incident_events").insert({ incident_id: incidentId, project_id: projectId, event_type: eventType, detail, actor_id: actorId ?? null });
}

/**
 * Production Monitoring Engine (Phase 5) — مراقبة مستمرة (يومية عبر
 * Vercel Cron + يدوية) بعد النشر، منفصلة تمامًا عن دورة حياة مراجعة
 * Engineering QA (مرة واحدة قبل التسليم). فحوصات خفيفة Read-Only
 * حقيقية (Playwright، بس بدون أي تفاعل هدّام) + إثراء AI للحوادث
 * الحقيقية المكتشفة آليًا (مش اختراع وجود مشاكل).
 */
export class ProductionMonitoringEngine {
  static async runCheck(projectId: string, triggeredBy: MonitoringCheckTrigger): Promise<RunCheckResult> {
    const supabase = createServiceClient();

    const { data: project } = await supabase.from("projects").select("production_url, staging_url").eq("id", projectId).maybeSingle();
    const targetUrl = project?.production_url?.trim() || project?.staging_url?.trim();
    if (!targetUrl) {
      return { status: "error", message: "لازم تحدد رابط Production أو Staging للمشروع أولاً قبل تشغيل فحص المراقبة." };
    }

    const { data: active } = await supabase.from("monitoring_checks").select("id, updated_at").eq("project_id", projectId).eq("status", "running").maybeSingle();
    if (active) {
      const isStale = Date.now() - new Date(active.updated_at).getTime() > STALE_LOCK_MS;
      if (!isStale) return { status: "already_running" };
      await supabase.from("monitoring_checks").update({ status: "failed", last_error: "توقّف الفحص من غير سبب واضح (تجاوز الوقت المسموح)." }).eq("id", active.id);
    }

    const { data: check, error } = await supabase
      .from("monitoring_checks")
      .insert({ project_id: projectId, target_url: targetUrl, status: "running", triggered_by: triggeredBy })
      .select("id")
      .single();

    if (error || !check) {
      return { status: "error", message: `فشل إنشاء الفحص: ${error?.message ?? "سبب غير معروف"}` };
    }
    return { status: "started", checkId: check.id };
  }

  /** جوهر تنفيذ الفحص — بيتنادى من جوّه after() بعد claim الـ Lock مباشرة. */
  static async runCheckCore(checkId: string): Promise<void> {
    const supabase = createServiceClient();

    try {
      const { data: checkRow } = await supabase.from("monitoring_checks").select("*").eq("id", checkId).maybeSingle();
      if (!checkRow) return;
      const check = checkRow as MonitoringCheck;

      // اكتشاف صفحات حقيقي متكرر (BFS، لغاية 20 صفحة) عبر زاحف مخصّص
      // لـ Production Monitoring — Import ديناميكي عمدًا (راجع تحذير
      // check-runner.ts وsite-crawler.ts).
      const { discoverSitePages } = await import("./site-crawler");
      const { runHealthCheck } = await import("./check-runner");

      let urlsToCheck = [check.target_url];
      try {
        urlsToCheck = await discoverSitePages(check.target_url);
      } catch {
        // فشل الزحف مش سبب لإفشال الفحص كله — نكتفي بفحص الرابط الأساسي.
      }

      const results = await runHealthCheck(urlsToCheck, HEALTH_CHECK_TIME_BUDGET_MS);

      const firstResult = results[0];
      const overallStatus = computeOverallStatus(results);
      const performanceScore = computePerformanceScore(results);

      const candidates = generateCandidatesFromChecks(results);
      if (candidates.length > 0) {
        await analyzeAndUpsertIncidents(supabase, check.project_id, checkId, candidates);
      }

      // إشارات بنية تحتية حقيقية (Supabase) أو "غير مُهيَّأ" بوضوح — فشلها مايوقفش الفحص.
      try {
        await refreshInfraServiceStatus(supabase, check.project_id);
      } catch (err) {
        console.error(`[ProductionMonitoring] Infra signal refresh failed for project ${check.project_id}:`, err);
      }

      const { data: openIncidents } = await supabase.from("monitoring_incidents").select("severity").eq("project_id", check.project_id).eq("status", "open");
      const healthScore = computeHealthScore((openIncidents ?? []).map((i) => i.severity));

      const { data: previousCheck } = await supabase
        .from("monitoring_checks")
        .select("id, health_score")
        .eq("project_id", check.project_id)
        .eq("status", "ready")
        .neq("id", checkId)
        .order("created_at", { ascending: false })
        .limit(1)
        .maybeSingle();
      const regression = detectRegression(healthScore, previousCheck?.health_score ?? null);

      await supabase
        .from("monitoring_checks")
        .update({
          status: "ready",
          overall_status: overallStatus,
          http_status: firstResult?.httpStatus ?? null,
          response_time_ms: firstResult?.responseTimeMs ?? null,
          page_load_time_ms: firstResult?.pageLoadTimeMs ?? null,
          lcp_ms: firstResult?.lcpMs ?? null,
          cls: firstResult?.cls ?? null,
          console_error_count: results.reduce((sum, r) => sum + r.consoleErrors.length, 0),
          health_score: healthScore,
          performance_score: performanceScore,
          is_regression: regression.isRegression,
          previous_check_id: previousCheck?.id ?? null,
          checked_pages: results.map((r) => r.url),
          generated_at: new Date().toISOString(),
          last_error: null,
        })
        .eq("id", checkId);
    } catch (err) {
      console.error(`[ProductionMonitoring] Unexpected check failure ${checkId}:`, err);
      await supabase
        .from("monitoring_checks")
        .update({ status: "failed", last_error: err instanceof Error ? err.message : "حدث خطأ غير متوقع أثناء الفحص." })
        .eq("id", checkId);
    }
  }

  static async acknowledgeIncident(incidentId: string, actorId?: string): Promise<void> {
    const supabase = createServiceClient();
    const { data: incident } = await supabase.from("monitoring_incidents").select("project_id, status").eq("id", incidentId).maybeSingle();
    if (!incident || incident.status !== "open") return;
    await supabase.from("monitoring_incidents").update({ status: "acknowledged" }).eq("id", incidentId);
    await logEvent(supabase, incidentId, incident.project_id, "acknowledged", "تم الإقرار بالحادثة.", actorId);
  }

  static async resolveIncident(incidentId: string, actorId?: string): Promise<void> {
    const supabase = createServiceClient();
    const { data: incident } = await supabase.from("monitoring_incidents").select("project_id, status").eq("id", incidentId).maybeSingle();
    if (!incident || incident.status === "resolved") return;
    await supabase.from("monitoring_incidents").update({ status: "resolved", resolved_at: new Date().toISOString() }).eq("id", incidentId);
    await logEvent(supabase, incidentId, incident.project_id, "resolved", "تم إغلاق الحادثة.", actorId);
  }

  /**
   * "ترقية لحادثة" — الحلقة الحقيقية Support → Production Monitoring،
   * لكن بقرار بشري صريح (PM/admin) عمدًا، مش تلقائي: بلاغ عميل غير
   * مُتحقَّق منه ما ينفعش يتحول لحادثة رسمية بلا مراجعة (خطر False
   * Positives). لو التذكرة اتترقّت قبل كده، بيرجّع نفس الحادثة الموجودة.
   */
  static async promoteSupportTicketToIncident(
    supportRequestId: string,
    actorId: string | null = null
  ): Promise<{ status: "success"; incidentId: string } | { status: "error"; message: string }> {
    const supabase = createServiceClient();

    const { data: existing } = await supabase.from("monitoring_incidents").select("id").eq("support_request_id", supportRequestId).maybeSingle();
    if (existing) return { status: "success", incidentId: existing.id };

    const { data: request } = await supabase
      .from("support_requests")
      .select("project_id, request_type, structured_summary, ai_diagnosis")
      .eq("id", supportRequestId)
      .maybeSingle();
    if (!request) return { status: "error", message: "تذكرة الدعم غير موجودة." };

    const summary = (request.structured_summary as { problem_description?: string; priority?: string } | null) ?? {};
    const diagnosis = (request.ai_diagnosis as { probable_cause?: string; suggested_fix?: string } | null) ?? {};
    const incidentKey = `support-${supportRequestId}`;

    const { data: created, error } = await supabase
      .from("monitoring_incidents")
      .insert({
        project_id: request.project_id,
        incident_key: incidentKey,
        category: "availability",
        severity: summary.priority === "critical" ? "critical" : summary.priority === "high" ? "high" : "medium",
        status: "open",
        title: `بلاغ عميل: ${request.request_type}`,
        description: summary.problem_description ?? "",
        root_cause: diagnosis.probable_cause ?? "",
        permanent_solution: diagnosis.suggested_fix ?? "",
        source: "support_ticket",
        support_request_id: supportRequestId,
      })
      .select("id")
      .single();
    if (error || !created) return { status: "error", message: error?.message ?? "فشل إنشاء الحادثة." };

    await logEvent(supabase, created.id, request.project_id, "detected", "تمت الترقية يدويًا من تذكرة دعم.", actorId ?? undefined);
    return { status: "success", incidentId: created.id };
  }

  static async getState(projectId: string) {
    const supabase = createServiceClient();
    const [checks, incidents, infraStatus, latestReviewReport] = await Promise.all([
      supabase.from("monitoring_checks").select("*").eq("project_id", projectId).order("created_at", { ascending: false }).limit(30).then((r) => (r.data ?? []) as MonitoringCheck[]),
      supabase.from("monitoring_incidents").select("*").eq("project_id", projectId).order("last_seen_at", { ascending: false }).then((r) => (r.data ?? []) as MonitoringIncident[]),
      supabase.from("infra_service_status").select("*").eq("project_id", projectId).then((r) => (r.data ?? []) as InfraServiceStatus[]),
      getLatestReviewReport(supabase, projectId),
    ]);
    const currentCheck = checks[0] ?? null;

    const openIncidentIds = incidents.filter((i) => i.status !== "resolved").map((i) => i.id);
    const [{ data: events }, { data: fixPromptsRaw }] = await Promise.all([
      openIncidentIds.length > 0
        ? supabase.from("monitoring_incident_events").select("*").in("incident_id", openIncidentIds).order("created_at", { ascending: false }).limit(50)
        : Promise.resolve({ data: [] }),
      openIncidentIds.length > 0
        ? supabase.from("monitoring_fix_prompts").select("*").in("incident_id", openIncidentIds).eq("status", "pending").order("order_index")
        : Promise.resolve({ data: [] }),
    ]);

    return {
      checks,
      currentCheck,
      incidents,
      events: events ?? [],
      infraStatus,
      latestReviewReport,
      fixPrompts: (fixPromptsRaw ?? []) as MonitoringFixPrompt[],
    };
  }
}

/** يبني مرشحين + يستدعي AI للإثراء + Upsert للحوادث (Auto Grouping ضد الحوادث المفتوحة). */
async function analyzeAndUpsertIncidents(
  supabase: SupabaseClient,
  projectId: string,
  checkId: string,
  candidates: MonitoringCandidate[]
): Promise<void> {
  const { data: pastIncidents } = await supabase
    .from("monitoring_incidents")
    .select("title, category, root_cause")
    .eq("project_id", projectId)
    .order("last_seen_at", { ascending: false })
    .limit(20);

  const response = await executeAIWithRateLimitWait(
    AITaskType.PRODUCTION_MONITORING_INCIDENT_ANALYSIS,
    buildIncidentAnalysisPrompt(JSON.stringify(candidates).slice(0, 40_000), JSON.stringify(pastIncidents ?? [])),
    { projectId },
    AI_BUDGET_MS
  );

  if (!response.success) {
    console.error(`[ProductionMonitoring] Incident analysis failed for project ${projectId}: ${response.error?.message}`);
    return;
  }

  const validation = validateIncidentAnalysis(response.output);
  if (!validation.ok) {
    console.error(`[ProductionMonitoring] Incident analysis validation failed for project ${projectId}: ${validation.reason}`);
    return;
  }

  for (const incident of validation.data) {
    const { data: existing } = await supabase
      .from("monitoring_incidents")
      .select("id, occurrence_count")
      .eq("project_id", projectId)
      .eq("incident_key", incident.incident_key)
      .neq("status", "resolved")
      .maybeSingle();

    if (existing) {
      await supabase
        .from("monitoring_incidents")
        .update({ occurrence_count: existing.occurrence_count + 1, last_seen_at: new Date().toISOString(), last_check_id: checkId })
        .eq("id", existing.id);
      await logEvent(supabase, existing.id, projectId, "reoccurred", `تكرر نفس الحادثة (${existing.occurrence_count + 1} مرة).`);
      continue;
    }

    const similarIncident =
      incident.similar_past_incident_index !== null ? (pastIncidents ?? [])[incident.similar_past_incident_index] : null;

    const { data: created } = await supabase
      .from("monitoring_incidents")
      .insert({
        project_id: projectId,
        first_check_id: checkId,
        last_check_id: checkId,
        incident_key: incident.incident_key,
        category: incident.category,
        severity: incident.severity,
        title: incident.title,
        description: maskSecrets(incident.description),
        root_cause: maskSecrets(incident.root_cause),
        confidence_score: incident.confidence_score,
        patch_proposal: maskSecrets(incident.patch_proposal),
        refactoring_proposal: maskSecrets(incident.refactoring_proposal),
        performance_proposal: maskSecrets(incident.performance_proposal),
        security_proposal: maskSecrets(incident.security_proposal),
        ux_proposal: maskSecrets(incident.ux_proposal),
        similarity_reason: similarIncident ? incident.similarity_reason : "",
        affected_components: incident.affected_components,
        risk_level: incident.risk_level,
        workaround: maskSecrets(incident.workaround),
        permanent_solution: maskSecrets(incident.permanent_solution),
        estimated_fix_time_hours: incident.estimated_fix_time_hours,
        priority: incident.priority,
        affected_users_estimate: incident.affected_users_estimate,
      })
      .select("id")
      .single();

    if (created) {
      await logEvent(supabase, created.id, projectId, "detected", "تم اكتشاف الحادثة تلقائيًا من فحص مراقبة حقيقي.");
    }
  }
}
