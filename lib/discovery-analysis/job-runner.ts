import type { SupabaseClient } from "@supabase/supabase-js";
import { createServiceClient } from "@/lib/supabase/service";
import { DiscoveryAnalysisAgent, type DiscoveryAnalysisRunResult } from "./agent";
import { createBrainDraftFromAnalysis } from "@/lib/brain-v2/service";
import { runMeetingPreparationJob } from "@/lib/meeting-prep/service";
import { notifyBrainChanged } from "@/lib/knowledge-sync/resync-engine";
import { friendlyAiErrorMessage } from "@/lib/ai/error-messages";

export interface RunJobOptions {
  actorId?: string | null;
  /** لو أُعطي: أعِد استخدام هذا الصف بدل إنشاء جديد (لإعادة المحاولة). */
  reuseJobId?: string | null;
}

export interface RunJobOutcome {
  jobId: string;
  status: "completed" | "failed";
}

/**
 * Job Runner لتحليل الاكتشاف. مسؤولياته الوحيدة:
 *  1. إنشاء (أو إعادة استخدام) صف discovery_analyses بحالة pending.
 *  2. النقل إلى running قبل استدعاء الـ Agent.
 *  3. النقل إلى completed مع النتيجة + الـ metadata، أو failed مع سبب.
 *  4. زيادة رقم الإصدار عند نجاح تحليل جديد لنفس المشروع.
 *
 * يعمل عبر Service Client دائمًا لأنه بيُشغَّل من after() ومن الـ cron والـ actions.
 */
export async function runDiscoveryAnalysisJob(
  projectId: string,
  options: RunJobOptions = {}
): Promise<RunJobOutcome> {
  const supabase = createServiceClient();
  const actorId = options.actorId ?? null;

  // 1) صف الوظيفة (إعادة استخدام أو إنشاء جديد)
  let jobId: string;
  if (options.reuseJobId) {
    jobId = options.reuseJobId;
    await supabase
      .from("discovery_analyses")
      .update({
        status: "pending",
        started_at: null,
        finished_at: null,
        execution_ms: null,
        error_code: null,
        error_message: null,
      })
      .eq("id", jobId);
  } else {
    const { data: created, error: insertErr } = await supabase
      .from("discovery_analyses")
      .insert({
        project_id: projectId,
        status: "pending",
        created_by: actorId,
      })
      .select("id")
      .single();
    if (insertErr || !created) {
      throw new Error(insertErr?.message ?? "تعذّر إنشاء وظيفة التحليل.");
    }
    jobId = created.id;
  }

  // 2) → running
  const startedAt = new Date();
  await supabase
    .from("discovery_analyses")
    .update({ status: "running", started_at: startedAt.toISOString() })
    .eq("id", jobId);

  // 3) نفّذ (AIService داخلي فيه retry + logging)
  let result: DiscoveryAnalysisRunResult;
  try {
    result = await DiscoveryAnalysisAgent.run(supabase, projectId, actorId);
  } catch (err) {
    const message = err instanceof Error ? err.message : "خطأ غير متوقع.";
    await markFailed(supabase, jobId, startedAt, "UNEXPECTED", message);
    return { jobId, status: "failed" };
  }

  if (result.status === "insufficient_data") {
    await markFailed(supabase, jobId, startedAt, "INSUFFICIENT_DATA", result.message);
    return { jobId, status: "failed" };
  }
  if (result.status === "error") {
    await markFailed(
      supabase,
      jobId,
      startedAt,
      result.code,
      friendlyAiErrorMessage(result.code, result.message),
      result.metadata
    );
    return { jobId, status: "failed" };
  }

  // 4) success — رقم إصدار جديد لهذا المشروع
  const { data: versionRow } = await supabase
    .from("discovery_analyses")
    .select("version")
    .eq("project_id", projectId)
    .eq("status", "completed")
    .order("version", { ascending: false })
    .limit(1)
    .maybeSingle();
  const nextVersion = ((versionRow?.version as number | undefined) ?? 0) + 1;

  const finishedAt = new Date();
  const execMs = finishedAt.getTime() - startedAt.getTime();

  await supabase
    .from("discovery_analyses")
    .update({
      status: "completed",
      finished_at: finishedAt.toISOString(),
      execution_ms: execMs,
      output: result.data,
      version: nextVersion,
      provider: result.metadata.provider ?? null,
      model: result.metadata.model ?? null,
      input_tokens: result.metadata.input_tokens ?? null,
      output_tokens: result.metadata.output_tokens ?? null,
      total_tokens: result.metadata.total_tokens ?? null,
      estimated_cost_usd: result.metadata.estimated_cost_usd ?? null,
      discovery_version_hash: result.metadata.discovery_version_hash ?? null,
      discovery_form_id: result.metadata.discovery_form_id ?? null,
      error_code: null,
      error_message: null,
    })
    .eq("id", jobId);

  // Phase 4B — تحديث Brain Draft تلقائيًا من التحليل. فشله ما يمنعش نجاح
  // التحليل نفسه (سجّل الخطأ فقط، والـ PM يقدر يعيده يدويًا).
  //
  // الوضع هنا **دمج إضافي** عن قصد: التحليل بيتشغّل تلقائيًا مع كل جلسة
  // اكتشاف جديدة تتسلّم، والاستبدال الكامل كان معناه إن الجلسة التانية
  // تمسح تعديلات الـ PM اليدوية والتوصيات المعتمدة اللي اتكتبت في الـ Brain.
  try {
    const brainResult = await createBrainDraftFromAnalysis(
      projectId,
      jobId,
      result.data,
      actorId,
      { mode: "merge", sourceLabel: "تحليل جلسات الاكتشاف", sourceType: "discovery_session" }
    );
    if (!brainResult.ok) {
      console.error(
        `[BrainV2] draft build failed for project ${projectId}: ${brainResult.message}`
      );
    }
  } catch (err) {
    console.error(
      `[BrainV2] draft build threw for project ${projectId}:`,
      err instanceof Error ? err.message : err
    );
  }

  // Phase X — تجهيز اجتماع الاكتشاف تلقائيًا بعد نجاح التحليل (وبعد محاولة
  // بناء Brain Draft فوق). فشله ما يمنعش نجاح التحليل نفسه، والـ PM يقدر
  // يعيد التوليد يدويًا من تبويب Meeting Preparation.
  try {
    const prepResult = await runMeetingPreparationJob(projectId, {
      actorId,
      basedOnAnalysisId: jobId,
    });
    if (!prepResult.ok) {
      console.error(
        `[MeetingPrep] generation failed for project ${projectId}: ${prepResult.message}`
      );
    }
  } catch (err) {
    console.error(
      `[MeetingPrep] generation threw for project ${projectId}:`,
      err instanceof Error ? err.message : err
    );
  }

  // Live Knowledge Sync — لو Brain Draft اتبنى فوق فعليًا وفيه مشتقات
  // (PRD/Prototype Prompt/...) عندها محتوى بالفعل من قبل، ولو المزامنة
  // التلقائية مفعّلة في الإعدادات، أعد توليدها في الخلفية. no-op تمامًا
  // لو الإعداد معطّل (الافتراضي) أو مفيش مشتقات اتولّدت أصلًا.
  try {
    await notifyBrainChanged(projectId, actorId);
  } catch (err) {
    console.error(
      `[KnowledgeSync] notifyBrainChanged threw for project ${projectId}:`,
      err instanceof Error ? err.message : err
    );
  }

  return { jobId, status: "completed" };
}

async function markFailed(
  supabase: SupabaseClient,
  jobId: string,
  startedAt: Date,
  code: string,
  message: string,
  metadata?: Record<string, unknown>
): Promise<void> {
  const finishedAt = new Date();
  const execMs = finishedAt.getTime() - startedAt.getTime();
  const meta = metadata ?? {};
  await supabase
    .from("discovery_analyses")
    .update({
      status: "failed",
      finished_at: finishedAt.toISOString(),
      execution_ms: execMs,
      error_code: code,
      error_message: message,
      provider: (meta.provider as string | null) ?? null,
      model: (meta.model as string | null) ?? null,
      input_tokens: (meta.input_tokens as number | null) ?? null,
      output_tokens: (meta.output_tokens as number | null) ?? null,
      total_tokens: (meta.total_tokens as number | null) ?? null,
      estimated_cost_usd: (meta.estimated_cost_usd as number | null) ?? null,
      discovery_version_hash: (meta.discovery_version_hash as string | null) ?? null,
      discovery_form_id: (meta.discovery_form_id as string | null) ?? null,
    })
    .eq("id", jobId);
}

/**
 * أقصى عمر شرعي لتحليل "قيد التنفيذ": أطول مسار حقيقي = انتظار محوّل
 * الطابور (≤ 300ث) + رجوع للمسار المباشر (≤ 110ث × محاولتين) ≈ 9 دقايق.
 * أي صف running/pending أقدم من كده = العملية اللي كانت بتنفّذه ماتت
 * (إعادة نشر Worker/سيرفر غالبًا) والحالة اتجمّدت — من غير التعافي ده
 * كان المشروع بيتقفل للأبد: الحالة عالقة والـ retry مرفوض.
 */
const STALE_RUN_MS = 12 * 60_000;

/**
 * إعادة تشغيل آخر عملية تحليل (retry). لو موجود صف "قيد التنفيذ" حاليًا
 * لنفس المشروع → يرفض عشان مايبقاش فيه اتنين شغالين مع بعض — إلا لو
 * الصف ده عالق (أقدم من STALE_RUN_MS): بيتفكّ تلقائيًّا كـ failed
 * وبيبدأ تحليل جديد.
 */
export async function retryDiscoveryAnalysis(
  projectId: string,
  actorId: string | null
): Promise<{ ok: true; jobId: string; status: string } | { ok: false; message: string }> {
  const supabase = createServiceClient();
  const { data: latest } = await supabase
    .from("discovery_analyses")
    .select("id, status, started_at, created_at")
    .eq("project_id", projectId)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (latest && (latest.status === "pending" || latest.status === "running")) {
    const anchor = (latest.started_at as string | null) ?? (latest.created_at as string);
    const ageMs = Date.now() - new Date(anchor).getTime();
    if (ageMs < STALE_RUN_MS) {
      return { ok: false, message: "فيه تحليل قيد التنفيذ حاليًا لنفس المشروع." };
    }
    // تنفيذ عالق — العملية اللي بدأته ماتت. فُكّه وكمّل بتحليل جديد.
    await markFailed(
      supabase,
      latest.id as string,
      new Date(anchor),
      "STALE_RUN",
      "انقطع التنفيذ (غالبًا بسبب إعادة تشغيل الخادم) — اتفكّ تلقائيًّا وبدأ تحليل جديد."
    );
  }

  try {
    const outcome = await runDiscoveryAnalysisJob(projectId, { actorId });
    return { ok: true, jobId: outcome.jobId, status: outcome.status };
  } catch (err) {
    return { ok: false, message: err instanceof Error ? err.message : "فشل غير متوقع." };
  }
}
