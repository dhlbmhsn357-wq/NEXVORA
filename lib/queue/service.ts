import { createHash } from "node:crypto";
import type { SupabaseClient } from "@supabase/supabase-js";
import { createServiceClient } from "@/lib/supabase/service";
import { requireJobHandler, getJobHandler } from "./registry";
import { assertTransition, canCancel, canPause, canResume } from "./state-machine";
import { decideRetry } from "./retry-policy";
import { decideAdmission } from "./priority";
import { QUEUE_EVENTS, eventDedupeKey, type QueueEventName } from "./events";
import type { EnqueueInput, JobLogLevel, JobRow, JobStatus } from "./types";

/**
 * خدمة الطوابير — الطبقة الوحيدة التي تلمس قاعدة البيانات.
 *
 * كل قرار هنا مفوَّض لوحدة نقية (`state-machine` · `retry-policy` ·
 * `priority`)، فالملف ده تنسيق وكتابة لا منطق. الفصل مقصود: المنطق
 * يُختبر بلا قاعدة بيانات، والتنسيق يبقى بسيطًا بما يكفي للمراجعة
 * بالعين.
 */

type DB = SupabaseClient;

function db(client?: DB): DB {
  return client ?? createServiceClient();
}

/** بصمة مستقرة لأي حمولة — ترتيب المفاتيح ثابت فلا تتغيّر البصمة بلا سبب. */
export function hashPayload(value: unknown): string {
  return createHash("sha256").update(stableStringify(value)).digest("hex");
}

function stableStringify(value: unknown): string {
  if (value === null || typeof value !== "object") return JSON.stringify(value) ?? "null";
  if (Array.isArray(value)) return `[${value.map(stableStringify).join(",")}]`;
  const entries = Object.entries(value as Record<string, unknown>)
    .filter(([, v]) => v !== undefined)
    .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0));
  return `{${entries.map(([k, v]) => `${JSON.stringify(k)}:${stableStringify(v)}`).join(",")}}`;
}

// ============================================================
// الأحداث والسجلات
// ============================================================

/**
 * ينشر حدثًا في `platform_events` القائم.
 *
 * الفشل هنا **لا يُسقط المهمة**: نشر حدث فاشل مزعج، لكن إسقاط مهمة
 * نجحت بسبب فشل النشر أسوأ بكثير. الخطأ يُسجَّل ولا يُرمى.
 */
async function publishEvent(
  client: DB,
  event: QueueEventName,
  job: Pick<JobRow, "id" | "project_id">,
  payload: Record<string, unknown>,
  attempt?: number
): Promise<void> {
  const { error } = await client.from("platform_events").insert({
    event_type: event,
    project_id: job.project_id,
    dedupe_key: eventDedupeKey(event, job.id, attempt),
    payload,
  });
  // 23505 = تكرار المفتاح، وهو السلوك المقصود من `dedupe_key` لا خطأ.
  if (error && error.code !== "23505") {
    console.error(`[queue] فشل نشر الحدث ${event}:`, error.message);
  }
}

async function recordTransition(
  client: DB,
  jobId: string,
  from: JobStatus | null,
  to: JobStatus,
  extra: { reason?: string; actorId?: string | null; workerId?: string | null } = {}
): Promise<void> {
  await client.from("job_events").insert({
    job_id: jobId,
    event_type: `transition.${from ?? "new"}.${to}`,
    from_status: from,
    to_status: to,
    reason: extra.reason ?? null,
    actor_id: extra.actorId ?? null,
    worker_id: extra.workerId ?? null,
  });
}

export async function logJob(
  jobId: string,
  level: JobLogLevel,
  message: string,
  context: Record<string, unknown> = {},
  attempt?: number,
  client?: DB
): Promise<void> {
  await db(client).from("job_logs").insert({
    job_id: jobId,
    level,
    message,
    context,
    attempt: attempt ?? null,
  });
}

// ============================================================
// الإدراج
// ============================================================

export type EnqueueResult =
  | { status: "created"; job: JobRow }
  | { status: "deduplicated"; job: JobRow }
  | { status: "idempotent_replay"; job: JobRow }
  | { status: "rejected"; reason: string };

/**
 * يدرج مهمة جديدة — نقطة الدخول الوحيدة للطابور.
 *
 * ترتيب الفحوص مقصود ومهم:
 *
 * ١. **Idempotency أولًا** — إعادة الطلب بعد فشل شبكي لازم ترجّع نفس
 *    النتيجة قبل أي فحص تاني، حتى لو الطابور ممتلئ دلوقتي. رفض إعادة
 *    محاولة لعملية **نجحت بالفعل** خطأ صريح.
 * ٢. **الضغط العكسي** — قبل إسقاط التكرار، عشان مانحسبش الطابور مرتين.
 * ٣. **إسقاط التكرار** — آخر حاجز قبل الكتابة.
 */
export async function enqueue(input: EnqueueInput, client?: DB): Promise<EnqueueResult> {
  const supabase = db(client);
  const handler = requireJobHandler(input.type);

  // ١) Idempotency
  if (input.idempotencyKey) {
    const requestHash = hashPayload({ type: input.type, payload: input.payload ?? {} });
    const { data: existing } = await supabase
      .from("job_idempotency_keys")
      .select("key, request_hash, job_id")
      .eq("key", input.idempotencyKey)
      .maybeSingle();

    if (existing) {
      // نفس المفتاح بمدخل مختلف = خطأ عميل صريح، لا تنفيذ صامت.
      if (existing.request_hash !== requestHash) {
        return {
          status: "rejected",
          reason: "مفتاح Idempotency مستخدم بالفعل بمدخل مختلف.",
        };
      }
      if (existing.job_id) {
        const replay = await getJob(existing.job_id, supabase);
        if (replay) return { status: "idempotent_replay", job: replay };
      }
    }
  }

  // ٢+٣) الضغط العكسي وإسقاط التكرار — **بالتوازي**.
  //
  // الفحصان مستقلان تمامًا، وتسلسلهما كان بيضيف رحلة شبكة كاملة بلا
  // سبب. القياس على القاعدة الحقيقية أظهر إن زمن العملية شبه كله رحلات
  // شبكة لا عمل قاعدة بيانات — فتقليل عددها هو التحسين الوحيد المؤثّر.
  const priority = input.priority ?? handler.defaultPriority;
  const dedupeHash =
    input.dedupeHash ??
    (handler.dedupeHash ? handler.dedupeHash(input.payload as never) : null);

  const [depthResult, aliveResult] = await Promise.all([
    supabase
      .from("jobs")
      .select("id", { count: "exact", head: true })
      .in("status", ["pending", "queued", "waiting", "retrying"]),
    dedupeHash
      ? supabase
          .from("jobs")
          .select("*")
          .eq("dedupe_hash", dedupeHash)
          .in("status", ["pending", "queued", "waiting", "running", "retrying", "paused"])
          .maybeSingle()
      : Promise.resolve({ data: null }),
  ]);

  const admission = decideAdmission(depthResult.count ?? 0, priority);
  if (!admission.admit) return { status: "rejected", reason: admission.reason };

  if (aliveResult.data) return { status: "deduplicated", job: aliveResult.data as JobRow };

  const lockKey =
    input.lockKey ?? (handler.lockKey ? handler.lockKey(input.payload as never) : null);

  // مؤجَّلة تدخل `waiting` لا `queued` — التمييز هو ما يخلّي المشغّل
  // يعرف إن الطابور الطويل نصفه مش جاهز أصلًا.
  const isDeferred = !!input.scheduledFor && input.scheduledFor.getTime() > Date.now();

  const { data: created, error } = await supabase
    .from("jobs")
    .insert({
      type: input.type,
      status: isDeferred ? "waiting" : "queued",
      priority,
      project_id: input.projectId ?? null,
      created_by: input.createdBy ?? null,
      payload: input.payload ?? {},
      max_attempts: input.maxAttempts ?? handler.maxAttempts,
      lock_key: lockKey,
      idempotency_key: input.idempotencyKey ?? null,
      dedupe_hash: dedupeHash,
      trace_id: input.traceId ?? null,
      scheduled_for: input.scheduledFor?.toISOString() ?? null,
      metadata: input.metadata ?? {},
    })
    .select("*")
    .single();

  if (error || !created) {
    return { status: "rejected", reason: error?.message ?? "فشل إنشاء المهمة." };
  }

  const job = created as JobRow;

  // الكتابات التالية للإنشاء كلها مستقلة عن بعضها — بالتوازي.
  await Promise.all([
    input.idempotencyKey
      ? supabase.from("job_idempotency_keys").upsert({
          key: input.idempotencyKey,
          user_id: input.createdBy ?? null,
          request_hash: hashPayload({ type: input.type, payload: input.payload ?? {} }),
          job_id: job.id,
        })
      : Promise.resolve(),
    recordTransition(supabase, job.id, null, job.status, { actorId: input.createdBy }),
    publishEvent(supabase, QUEUE_EVENTS.JobCreated, job, {
      jobId: job.id,
      jobType: job.type,
      projectId: job.project_id,
      traceId: job.trace_id,
      priority: job.priority,
      createdBy: job.created_by,
    }),
  ]);

  return { status: "created", job };
}

// ============================================================
// القراءة
// ============================================================

export async function getJob(jobId: string, client?: DB): Promise<JobRow | null> {
  const { data } = await db(client).from("jobs").select("*").eq("id", jobId).maybeSingle();
  return (data as JobRow) ?? null;
}

export async function listJobs(
  filter: {
    projectId?: string;
    status?: JobStatus[];
    type?: string;
    limit?: number;
    offset?: number;
  } = {},
  client?: DB
): Promise<JobRow[]> {
  let query = db(client)
    .from("jobs")
    .select("*")
    .order("created_at", { ascending: false })
    .range(filter.offset ?? 0, (filter.offset ?? 0) + (filter.limit ?? 50) - 1);

  if (filter.projectId) query = query.eq("project_id", filter.projectId);
  if (filter.type) query = query.eq("type", filter.type);
  if (filter.status?.length) query = query.in("status", filter.status);

  const { data } = await query;
  return (data as JobRow[]) ?? [];
}

// ============================================================
// المطالبة والتنفيذ (جانب العامل)
// ============================================================

/** يسحب المهمة التالية ذرّيًا عبر `claim_next_job`. */
export async function claimNextJob(
  workerKey: string,
  types: string[],
  client?: DB
): Promise<JobRow | null> {
  if (types.length === 0) return null;
  const supabase = db(client);

  const { data, error } = await supabase.rpc("claim_next_job", {
    p_worker_id: workerKey,
    p_types: types,
  });

  if (error) {
    console.error("[queue] فشل سحب مهمة:", error.message);
    return null;
  }

  const job = (Array.isArray(data) ? data[0] : data) as JobRow | undefined;
  if (!job) return null;

  await Promise.all([
    recordTransition(supabase, job.id, "queued", "running", { workerId: workerKey }),
    publishEvent(
      supabase,
      QUEUE_EVENTS.JobStarted,
      job,
      {
        jobId: job.id,
        jobType: job.type,
        projectId: job.project_id,
        traceId: job.trace_id,
        workerId: workerKey,
        attempt: job.attempts,
        queueTimeMs: job.queue_time_ms,
      },
      job.attempts
    ),
  ]);

  return job;
}

export async function heartbeatJob(jobId: string, client?: DB): Promise<void> {
  await db(client)
    .from("jobs")
    .update({ heartbeat_at: new Date().toISOString() })
    .eq("id", jobId)
    .eq("status", "running");
}

export async function reportProgress(
  jobId: string,
  percent: number,
  message?: string,
  client?: DB
): Promise<void> {
  const clamped = Math.max(0, Math.min(100, Math.round(percent)));
  await db(client)
    .from("jobs")
    .update({
      progress: clamped,
      progress_message: message ?? null,
      heartbeat_at: new Date().toISOString(),
    })
    .eq("id", jobId)
    .eq("status", "running");
}

/** يحفظ نقطة التوقّف — أساس الاستئناف. */
export async function saveCheckpoint(
  jobId: string,
  checkpoint: Record<string, unknown>,
  client?: DB
): Promise<void> {
  await db(client)
    .from("jobs")
    .update({ checkpoint, heartbeat_at: new Date().toISOString() })
    .eq("id", jobId)
    .eq("status", "running");
}

/** هل طُلب إلغاء هذه المهمة؟ يُفحص بين الخطوات. */
export async function isJobCanceled(jobId: string, client?: DB): Promise<boolean> {
  const { data } = await db(client).from("jobs").select("status").eq("id", jobId).maybeSingle();
  return data?.status === "canceled";
}

async function releaseLock(client: DB, job: JobRow): Promise<void> {
  if (!job.lock_key) return;
  await client.from("job_locks").delete().eq("lock_key", job.lock_key).eq("job_id", job.id);
}

export async function completeJob(
  jobId: string,
  result: Record<string, unknown> | null,
  options: { costUsd?: number; workerId?: string } = {},
  client?: DB
): Promise<void> {
  const supabase = db(client);
  const job = await getJob(jobId, supabase);
  if (!job) return;

  assertTransition(job.status, "completed");

  const { data: updated } = await supabase
    .from("jobs")
    .update({
      status: "completed",
      result,
      progress: 100,
      finished_at: new Date().toISOString(),
      estimated_cost_usd: options.costUsd ?? null,
      error_message: null,
      error_stack: null,
    })
    .eq("id", jobId)
    .select("*")
    .single();

  await Promise.all([
    releaseLock(supabase, job),
    recordTransition(supabase, jobId, job.status, "completed", { workerId: options.workerId }),
    publishEvent(supabase, QUEUE_EVENTS.JobCompleted, job, {
      jobId,
      jobType: job.type,
      projectId: job.project_id,
      traceId: job.trace_id,
      executionTimeMs: (updated as JobRow | null)?.execution_time_ms ?? null,
      costUsd: options.costUsd ?? null,
    }),
  ]);
}

/**
 * يعالج فشل مهمة: يقرّر إعادة المحاولة أو النقل للرسائل الميتة.
 *
 * القرار كله في `decideRetry` — الملف ده بينفّذه بس.
 */
export async function failJob(
  jobId: string,
  error: unknown,
  options: { workerId?: string; isTimeout?: boolean } = {},
  client?: DB
): Promise<void> {
  const supabase = db(client);
  const job = await getJob(jobId, supabase);
  if (!job) return;

  const message = error instanceof Error ? error.message : String(error);
  const stack = error instanceof Error ? (error.stack ?? null) : null;

  const decision = decideRetry({
    error,
    attemptsMade: job.attempts,
    maxAttempts: job.max_attempts,
    now: new Date(),
  });

  await Promise.all([
    releaseLock(supabase, job),
    logJob(jobId, "error", message, { stack }, job.attempts, supabase),
  ]);

  if (decision.action === "retry" && decision.retryAt) {
    assertTransition(job.status, "retrying");
    await supabase
      .from("jobs")
      .update({
        status: "queued", // تعود للطابور مباشرة، والتأخير عبر `available_at`
        worker_id: null,
        error_message: message,
        error_stack: stack,
        error_class: decision.failureClass,
        retry_at: decision.retryAt.toISOString(),
        available_at: decision.retryAt.toISOString(),
      })
      .eq("id", jobId);

    await recordTransition(supabase, jobId, job.status, "retrying", {
      reason: decision.reason,
      workerId: options.workerId,
    });
    await publishEvent(
      supabase,
      QUEUE_EVENTS.JobRetrying,
      job,
      {
        jobId,
        jobType: job.type,
        projectId: job.project_id,
        traceId: job.trace_id,
        attempt: job.attempts + 1,
        retryAt: decision.retryAt.toISOString(),
        delayMs: decision.delayMs,
      },
      job.attempts
    );
    return;
  }

  // استُنفدت المحاولات أو الخطأ دائم ← فشل نهائي ثم رسائل ميتة
  const finalStatus: JobStatus = options.isTimeout ? "timeout" : "failed";
  assertTransition(job.status, finalStatus);

  await supabase
    .from("jobs")
    .update({
      status: finalStatus,
      worker_id: null,
      error_message: message,
      error_stack: stack,
      error_class: decision.failureClass,
      finished_at: new Date().toISOString(),
    })
    .eq("id", jobId);

  await recordTransition(supabase, jobId, job.status, finalStatus, {
    reason: decision.reason,
    workerId: options.workerId,
  });
  await publishEvent(supabase, QUEUE_EVENTS.JobFailed, job, {
    jobId,
    jobType: job.type,
    projectId: job.project_id,
    traceId: job.trace_id,
    attempt: job.attempts,
    errorMessage: message,
    errorClass: decision.failureClass,
    willRetry: false,
  });

  await moveToDeadLetter(jobId, message, decision.failureClass, supabase);
}

/**
 * ينقل المهمة إلى طابور الرسائل الميتة.
 *
 * **لا تُحذف أبدًا.** الطابور الصامت الممتلئ بالفشل أسوأ حالة ممكنة:
 * نظام يبدو سليمًا وهو لا ينجز شيئًا.
 */
export async function moveToDeadLetter(
  jobId: string,
  finalError: string,
  errorClass: JobRow["error_class"],
  client?: DB
): Promise<void> {
  const supabase = db(client);
  const job = await getJob(jobId, supabase);
  if (!job) return;

  await supabase.from("job_dead_letters").upsert(
    {
      job_id: job.id,
      job_type: job.type,
      project_id: job.project_id,
      final_error: finalError,
      error_class: errorClass,
      attempts: job.attempts,
      payload: job.payload,
    },
    { onConflict: "job_id" }
  );

  await supabase.from("jobs").update({ status: "dead_letter" }).eq("id", job.id);
  await recordTransition(supabase, job.id, job.status, "dead_letter", { reason: finalError });
  await publishEvent(supabase, QUEUE_EVENTS.JobDeadLettered, job, {
    jobId: job.id,
    jobType: job.type,
    projectId: job.project_id,
    traceId: job.trace_id,
    attempts: job.attempts,
    finalError,
  });
}

/** يعيد إدراج مهمة من الرسائل الميتة بعد إصلاح سببها. */
export async function requeueFromDeadLetter(
  jobId: string,
  actorId: string,
  client?: DB
): Promise<EnqueueResult> {
  const supabase = db(client);
  const job = await getJob(jobId, supabase);
  if (!job) return { status: "rejected", reason: "المهمة غير موجودة." };
  if (job.status !== "dead_letter") {
    return { status: "rejected", reason: "المهمة مش في طابور الرسائل الميتة." };
  }

  // مهمة جديدة لا إحياء للقديمة: التاريخ يبقى محفوظًا كاملًا، والفشل
  // القديم يفضل قابلًا للمراجعة.
  const result = await enqueue(
    {
      type: job.type,
      payload: job.payload,
      priority: job.priority,
      projectId: job.project_id,
      createdBy: actorId,
      traceId: job.trace_id,
      metadata: { ...job.metadata, requeued_from: job.id },
    },
    supabase
  );

  if (result.status === "created") {
    await supabase
      .from("job_dead_letters")
      .update({
        reviewed_at: new Date().toISOString(),
        reviewed_by: actorId,
        resolution: "requeued",
        requeued_job_id: result.job.id,
      })
      .eq("job_id", job.id);
  }

  return result;
}

// ============================================================
// تحكّم المستخدم
// ============================================================

export async function cancelJob(
  jobId: string,
  actorId: string | null,
  client?: DB
): Promise<{ ok: boolean; message?: string }> {
  const supabase = db(client);
  const job = await getJob(jobId, supabase);
  if (!job) return { ok: false, message: "المهمة غير موجودة." };
  if (!canCancel(job.status)) return { ok: false, message: "المهمة انتهت بالفعل." };

  await supabase
    .from("jobs")
    .update({ status: "canceled", canceled_at: new Date().toISOString(), worker_id: null })
    .eq("id", jobId);

  await Promise.all([
    releaseLock(supabase, job),
    recordTransition(supabase, jobId, job.status, "canceled", { actorId }),
    publishEvent(supabase, QUEUE_EVENTS.JobCanceled, job, {
      jobId,
      jobType: job.type,
      projectId: job.project_id,
      traceId: job.trace_id,
      canceledBy: actorId,
      progressAtCancel: job.progress,
    }),
  ]);

  return { ok: true };
}

export async function pauseJob(
  jobId: string,
  actorId: string | null,
  client?: DB
): Promise<{ ok: boolean; message?: string }> {
  const supabase = db(client);
  const job = await getJob(jobId, supabase);
  if (!job) return { ok: false, message: "المهمة غير موجودة." };
  if (!canPause(job.status)) return { ok: false, message: "لا يمكن إيقاف المهمة في حالتها الحالية." };

  await supabase.from("jobs").update({ status: "paused" }).eq("id", jobId);
  await recordTransition(supabase, jobId, job.status, "paused", { actorId });
  return { ok: true };
}

export async function resumeJob(
  jobId: string,
  actorId: string | null,
  client?: DB
): Promise<{ ok: boolean; message?: string }> {
  const supabase = db(client);
  const job = await getJob(jobId, supabase);
  if (!job) return { ok: false, message: "المهمة غير موجودة." };
  if (!canResume(job.status)) return { ok: false, message: "المهمة مش موقوفة." };

  await supabase
    .from("jobs")
    .update({ status: "queued", available_at: new Date().toISOString() })
    .eq("id", jobId);
  await recordTransition(supabase, jobId, job.status, "queued", {
    actorId,
    reason: "استئناف يدوي",
  });
  return { ok: true };
}

// ============================================================
// العمال
// ============================================================

export async function registerWorker(
  input: {
    workerKey: string;
    workerType: string;
    handledTypes: string[];
    concurrency: number;
    hostname?: string;
    version?: string;
  },
  client?: DB
): Promise<void> {
  const supabase = db(client);
  await supabase.from("queue_workers").upsert(
    {
      worker_key: input.workerKey,
      worker_type: input.workerType,
      handled_types: input.handledTypes,
      concurrency: input.concurrency,
      status: "idle",
      active_jobs: 0,
      hostname: input.hostname ?? null,
      version: input.version ?? null,
      started_at: new Date().toISOString(),
      heartbeat_at: new Date().toISOString(),
      stopped_at: null,
    },
    { onConflict: "worker_key" }
  );

  await supabase.from("platform_events").insert({
    event_type: QUEUE_EVENTS.WorkerStarted,
    dedupe_key: `${QUEUE_EVENTS.WorkerStarted}:${input.workerKey}:${Date.now()}`,
    payload: {
      workerKey: input.workerKey,
      workerType: input.workerType,
      handledTypes: input.handledTypes,
    },
  });
}

export async function workerHeartbeat(
  workerKey: string,
  stats: {
    status?: "idle" | "busy" | "draining" | "unhealthy";
    activeJobs?: number;
    cpuPercent?: number;
    memoryMb?: number;
    jobsProcessed?: number;
    jobsFailed?: number;
    lastError?: string | null;
  } = {},
  client?: DB
): Promise<void> {
  const update: Record<string, unknown> = { heartbeat_at: new Date().toISOString() };
  if (stats.status) update.status = stats.status;
  if (stats.activeJobs !== undefined) update.active_jobs = stats.activeJobs;
  if (stats.cpuPercent !== undefined) update.cpu_percent = stats.cpuPercent;
  if (stats.memoryMb !== undefined) update.memory_mb = stats.memoryMb;
  if (stats.jobsProcessed !== undefined) update.jobs_processed = stats.jobsProcessed;
  if (stats.jobsFailed !== undefined) update.jobs_failed = stats.jobsFailed;
  if (stats.lastError !== undefined) update.last_error = stats.lastError;

  await db(client).from("queue_workers").update(update).eq("worker_key", workerKey);
}

export async function stopWorker(workerKey: string, reason?: string, client?: DB): Promise<void> {
  const supabase = db(client);
  await supabase
    .from("queue_workers")
    .update({ status: "stopped", stopped_at: new Date().toISOString(), last_error: reason ?? null })
    .eq("worker_key", workerKey);

  await supabase.from("platform_events").insert({
    event_type: QUEUE_EVENTS.WorkerStopped,
    dedupe_key: `${QUEUE_EVENTS.WorkerStopped}:${workerKey}:${Date.now()}`,
    payload: { workerKey, reason: reason ?? null },
  });
}

// ============================================================
// الصيانة
// ============================================================

/** يستعيد المهام العالقة ويرقّي المجدولة — يناديها المجدوِل دوريًا. */
export async function runMaintenance(
  client?: DB
): Promise<{ recovered: number; promoted: number }> {
  const supabase = db(client);
  const [recovered, promoted] = await Promise.all([
    supabase.rpc("recover_stuck_jobs", { p_heartbeat_timeout_seconds: 180 }),
    supabase.rpc("promote_scheduled_jobs"),
  ]);

  if (recovered.error) console.error("[queue] فشل استعادة المهام العالقة:", recovered.error.message);
  if (promoted.error) console.error("[queue] فشل ترقية المهام المجدولة:", promoted.error.message);

  return {
    recovered: typeof recovered.data === "number" ? recovered.data : 0,
    promoted: typeof promoted.data === "number" ? promoted.data : 0,
  };
}

/** يتحقّق أن نوع المهمة مسجّل قبل عرضه أو إدراجه. */
export function isKnownJobType(type: string): boolean {
  return getJobHandler(type) !== undefined;
}
