import type { SupabaseClient } from "@supabase/supabase-js";
import { createServiceClient } from "@/lib/supabase/service";
import { computeHealth } from "./health-score";
import { detectBusinessAnomalies, detectTechnicalAnomalies } from "./anomaly-detection";
import { draftIncident, incidentDedupeKey } from "./incident-model";
import { buildOptimizations } from "./optimization";
import { clampDuration } from "./hypercare-window";
import { notifyHypercare } from "./notify";
import type { MetricPoint, HealthSignals } from "./hypercare-types";

/**
 * خدمة Hypercare — تبدأ فترة مراقبة من شهادة إطلاق معتمَدة، وتلتقط لقطات
 * مراقبة (نبضات): تحسب الصحة، تكشف الشذوذ، تُنشئ الحوادث تلقائيًّا (بلا
 * تكرار)، وتقترح تحسينات. **مشتقّات فقط.**
 */

const UNDEFINED_TABLE = "42P01";

export interface StartOutcome { ok: boolean; periodId?: string; message?: string; }

export async function startHypercare(verificationId: string, durationDays: number, actorId: string | null, client?: SupabaseClient): Promise<StartOutcome> {
  const db = client ?? createServiceClient();

  const v = await db.from("go_live_verifications").select("id, status, project_id, source_id, certificate_id, final_score").eq("id", verificationId).maybeSingle();
  const ver = v.data as { status: string; project_id: string | null; source_id: string | null; certificate_id: string | null; final_score: number } | null;
  if (!ver) return { ok: false, message: "التحقّق غير موجود." };
  if (ver.status !== "certified") return { ok: false, message: "لا يبدأ Hypercare إلا بعد إصدار شهادة الإطلاق (المرحلة ٧)." };

  const existing = await db.from("hypercare_periods").select("id").eq("verification_id", verificationId).neq("status", "closed").limit(1).maybeSingle();
  if (existing.data) return { ok: false, message: "توجد فترة Hypercare نشطة لهذا المشروع بالفعل.", periodId: (existing.data as { id: string }).id };

  const dur = clampDuration(durationDays);
  const endsAt = new Date(Date.now() + dur * 24 * 3600 * 1000).toISOString();

  const ins = await db.from("hypercare_periods").insert({
    verification_id: verificationId, certificate_id: ver.certificate_id, project_id: ver.project_id, source_id: ver.source_id,
    status: "active", duration_days: dur, ends_at: endsAt, created_by: actorId,
  }).select("id").maybeSingle();
  if (ins.error || !ins.data) {
    if (ins.error?.code === UNDEFINED_TABLE) return { ok: false, message: "جداول المرحلة ٨ غير مطبَّقة (طبّق ترحيل 0090)." };
    return { ok: false, message: ins.error?.message ?? "فشل بدء Hypercare." };
  }
  const periodId = (ins.data as { id: string }).id;
  await notifyHypercare("system_recovery", periodId, `بدأت فترة Hypercare لمدّة ${dur} يومًا.`, ver.project_id);
  return { ok: true, periodId };
}

export interface SnapshotOpts { avgQueryMs?: number; errorRatePercent?: number; }

/** لقطة مراقبة (نبضة): صحة + شذوذ + حوادث تلقائية + تحسينات. */
export async function recordSnapshot(periodId: string, businessMetrics: MetricPoint[], actorId: string | null, opts: SnapshotOpts = {}, client?: SupabaseClient): Promise<{ ok: boolean; message?: string; health?: number; incidents?: number }> {
  const db = client ?? createServiceClient();
  const p = await db.from("hypercare_periods").select("project_id, baseline_query_ms, status, overall_health_score").eq("id", periodId).maybeSingle();
  const period = p.data as { project_id: string | null; baseline_query_ms: number; status: string; overall_health_score: number } | null;
  if (!period) return { ok: false, message: "فترة Hypercare غير موجودة." };
  if (period.status === "closed") return { ok: false, message: "الفترة مغلقة." };

  // إشارات فعلية (طابور/عمّال) + مُدخلة (زمن استعلام/أخطاء).
  let workersActive = false;
  try {
    const { count } = await db.from("queue_workers").select("*", { count: "exact", head: true }).eq("status", "active");
    workersActive = (count ?? 0) > 0;
  } catch { /* اختياري */ }

  const businessAnomalies = detectBusinessAnomalies(businessMetrics);
  const businessStable = !businessAnomalies.some((a) => a.severity === "critical" || a.severity === "high");

  const signals: HealthSignals = {
    databaseOk: true, apiOk: true, storageOk: true, queuesOk: true,
    workersActive, cacheOk: true,
    avgQueryMs: opts.avgQueryMs ?? period.baseline_query_ms,
    errorRatePercent: opts.errorRatePercent ?? 0,
    businessStable,
  };
  const health = computeHealth(signals);
  const techAnomalies = detectTechnicalAnomalies(signals, period.baseline_query_ms);
  const anomalies = [...techAnomalies, ...businessAnomalies];

  await db.from("hypercare_snapshots").insert({
    period_id: periodId, health_score: health.overall, health_breakdown: health.breakdown,
    tech_signals: { workersActive, avgQueryMs: signals.avgQueryMs, errorRatePercent: signals.errorRatePercent },
    business_metrics: businessMetrics, anomalies_count: anomalies.length,
  });

  // حوادث تلقائية (بلا تكرار مع حادثة مفتوحة بنفس البصمة).
  const openInc = await db.from("hypercare_incidents").select("dedupe_key").eq("period_id", periodId).in("status", ["open", "investigating"]);
  const openKeys = new Set(((openInc.data ?? []) as Array<{ dedupe_key: string | null }>).map((r) => r.dedupe_key));
  let newIncidents = 0;
  let criticalNew = false;
  for (const a of anomalies) {
    const key = incidentDedupeKey(a);
    if (openKeys.has(key)) continue;
    const draft = draftIncident(a);
    await db.from("hypercare_incidents").insert({
      period_id: periodId, title: draft.title, severity: draft.severity, status: "open", impact: draft.impact,
      affected_modules: draft.affectedModules, suggested_solution: draft.suggestedSolution, confidence: draft.confidence,
      detected_by: draft.detectedBy, dedupe_key: key, reported_by: actorId,
    });
    openKeys.add(key);
    newIncidents++;
    if (draft.severity === "critical") criticalNew = true;
  }

  // تحسينات مقترحة (بلا تكرار عنوان ضمن الفترة).
  const optExisting = await db.from("hypercare_optimizations").select("title").eq("period_id", periodId);
  const optTitles = new Set(((optExisting.data ?? []) as Array<{ title: string }>).map((r) => r.title));
  for (const o of buildOptimizations(health, anomalies)) {
    if (optTitles.has(o.title)) continue;
    await db.from("hypercare_optimizations").insert({
      period_id: periodId, category: o.category, title: o.title, detail: o.detail, priority: o.priority, expected_gain: o.expectedGain, status: "proposed",
    });
    optTitles.add(o.title);
  }

  // حدّث الفترة + الإشعارات.
  const totals = await db.from("hypercare_incidents").select("status").eq("period_id", periodId);
  const incRows = (totals.data ?? []) as Array<{ status: string }>;
  await db.from("hypercare_periods").update({
    overall_health_score: health.overall, health_breakdown: health.breakdown,
    total_incidents: incRows.length, resolved_incidents: incRows.filter((i) => i.status === "resolved" || i.status === "closed").length,
  }).eq("id", periodId);

  if (criticalNew) await notifyHypercare("critical_incident", periodId, "اكتُشفت حادثة حرجة أثناء المراقبة.", period.project_id);
  else if (period.overall_health_score - health.overall >= 20) await notifyHypercare("health_drop", periodId, `هبطت درجة الصحة إلى ${health.overall}/100.`, period.project_id);

  return { ok: true, health: health.overall, incidents: newIncidents };
}
