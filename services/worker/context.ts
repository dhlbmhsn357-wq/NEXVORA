import type { SupabaseClient } from "@supabase/supabase-js";
import {
  heartbeatJob,
  isJobCanceled,
  logJob,
  reportProgress,
  saveCheckpoint,
} from "@/lib/queue/service";
import type { JobContext, JobLogLevel, JobRow } from "@/lib/queue/types";

/**
 * يبني السياق المُمرَّر لمعالج المهمة.
 *
 * ده العقد الوحيد اللي بيشوفه كاتب العامل الجديد — فكل ما فيه لازم
 * يبقى بسيطًا وآمنًا بلا معرفة بالطابور نفسه.
 */
export function buildJobContext(
  job: JobRow,
  client: SupabaseClient,
  controller: AbortController
): JobContext {
  // ذاكرة قصيرة لنتيجة فحص الإلغاء: المعالج ممكن يفحص بين كل خطوتين،
  // وفحص كل مرة يعني استعلامًا لكل خطوة. ثانيتان كافيتان لإيقاف سريع
  // بلا إغراق قاعدة البيانات.
  let lastCancelCheck = 0;
  let lastCancelValue = false;

  return {
    jobId: job.id,
    type: job.type,
    payload: job.payload,
    attempt: job.attempts,
    projectId: job.project_id,
    traceId: job.trace_id,
    checkpoint: job.checkpoint,
    signal: controller.signal,

    async reportProgress(percent: number, message?: string) {
      await reportProgress(job.id, percent, message, client);
    },

    async saveCheckpoint(checkpoint: Record<string, unknown>) {
      await saveCheckpoint(job.id, checkpoint, client);
    },

    async log(level: JobLogLevel, message: string, context?: Record<string, unknown>) {
      await logJob(job.id, level, message, context ?? {}, job.attempts, client);
    },

    async isCanceled() {
      const now = Date.now();
      if (now - lastCancelCheck < 2_000) return lastCancelValue;

      lastCancelCheck = now;
      lastCancelValue = await isJobCanceled(job.id, client);

      // الإلغاء بيرفع الإشارة كمان، فأي نداء بيدعم AbortSignal بيتوقف
      // فورًا من غير ما يستنى المعالج يفحص بنفسه.
      if (lastCancelValue && !controller.signal.aborted) controller.abort();
      return lastCancelValue;
    },
  };
}

/** نبضة دورية طول ما المهمة شغّالة — الحارس ضد المهام العالقة. */
export function startHeartbeat(
  jobId: string,
  client: SupabaseClient,
  intervalMs: number
): () => void {
  const timer = setInterval(() => {
    void heartbeatJob(jobId, client).catch((err) => {
      console.error(`[worker] فشلت نبضة المهمة ${jobId}:`, err);
    });
  }, intervalMs);

  return () => clearInterval(timer);
}
