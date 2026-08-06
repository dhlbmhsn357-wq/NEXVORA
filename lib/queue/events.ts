import type { JobPriority, JobStatus } from "./types";

/**
 * نظام أحداث الطوابير — وحدة نقية (الأسماء والحمولات فقط).
 *
 * النشر يمرّ عبر `platform_events` القائم (ترحيل ٠٠٦٣)، فالوحدة دي
 * بتعرّف **المفردات** لا آلية النقل. الفصل مقصود: تغيير وسيلة النشر
 * لاحقًا (ناقل خارجي مثلًا) ما يلزمش تغيير أي مُصدِر حدث.
 *
 * قاعدة حاكمة: **المهمة تنشر ما حدث، ولا تستدعي من يهمّه الأمر.**
 * إشعار المستخدم مشترك في `JobCompleted`، ولا يُنادى مباشرة من العامل.
 */

export const QUEUE_EVENTS = {
  JobCreated: "queue.job.created",
  JobStarted: "queue.job.started",
  JobProgress: "queue.job.progress",
  JobCompleted: "queue.job.completed",
  JobFailed: "queue.job.failed",
  JobCanceled: "queue.job.canceled",
  JobRetrying: "queue.job.retrying",
  JobDeadLettered: "queue.job.dead_lettered",

  WorkerStarted: "queue.worker.started",
  WorkerStopped: "queue.worker.stopped",
  WorkerFailed: "queue.worker.failed",

  QueueEmpty: "queue.state.empty",
  QueueOverloaded: "queue.state.overloaded",
} as const;

export type QueueEventName = (typeof QUEUE_EVENTS)[keyof typeof QUEUE_EVENTS];

interface BaseJobEvent {
  jobId: string;
  jobType: string;
  projectId: string | null;
  traceId: string | null;
}

export interface JobCreatedPayload extends BaseJobEvent {
  priority: JobPriority;
  createdBy: string | null;
}

export interface JobStartedPayload extends BaseJobEvent {
  workerId: string;
  attempt: number;
  queueTimeMs: number | null;
}

export interface JobProgressPayload extends BaseJobEvent {
  progress: number;
  message: string | null;
}

export interface JobCompletedPayload extends BaseJobEvent {
  executionTimeMs: number | null;
  costUsd: number | null;
}

export interface JobFailedPayload extends BaseJobEvent {
  attempt: number;
  errorMessage: string | null;
  errorClass: string | null;
  willRetry: boolean;
}

export interface JobCanceledPayload extends BaseJobEvent {
  canceledBy: string | null;
  progressAtCancel: number;
}

export interface JobRetryingPayload extends BaseJobEvent {
  attempt: number;
  retryAt: string;
  delayMs: number;
}

export interface JobDeadLetteredPayload extends BaseJobEvent {
  attempts: number;
  finalError: string | null;
}

export interface WorkerEventPayload {
  workerKey: string;
  workerType: string;
  handledTypes: string[];
  reason?: string;
}

export interface QueueStatePayload {
  depth: number;
  oldestWaitingMs: number | null;
}

/** ربط اسم الحدث بحمولته — يمنع نشر حمولة لا تطابق نوع الحدث. */
export interface QueueEventMap {
  [QUEUE_EVENTS.JobCreated]: JobCreatedPayload;
  [QUEUE_EVENTS.JobStarted]: JobStartedPayload;
  [QUEUE_EVENTS.JobProgress]: JobProgressPayload;
  [QUEUE_EVENTS.JobCompleted]: JobCompletedPayload;
  [QUEUE_EVENTS.JobFailed]: JobFailedPayload;
  [QUEUE_EVENTS.JobCanceled]: JobCanceledPayload;
  [QUEUE_EVENTS.JobRetrying]: JobRetryingPayload;
  [QUEUE_EVENTS.JobDeadLettered]: JobDeadLetteredPayload;
  [QUEUE_EVENTS.WorkerStarted]: WorkerEventPayload;
  [QUEUE_EVENTS.WorkerStopped]: WorkerEventPayload;
  [QUEUE_EVENTS.WorkerFailed]: WorkerEventPayload;
  [QUEUE_EVENTS.QueueEmpty]: QueueStatePayload;
  [QUEUE_EVENTS.QueueOverloaded]: QueueStatePayload;
}

/**
 * الحدث المقابل لكل انتقال حالة.
 *
 * وجود الخريطة دي بيضمن إن كل انتقال يُنشر — النسيان هنا معناه مرحلة
 * تابعة لا تنطلق أبدًا، وهو فشل صامت بامتياز.
 */
export function eventForTransition(to: JobStatus): QueueEventName | null {
  switch (to) {
    case "queued":
      return QUEUE_EVENTS.JobCreated;
    case "running":
      return QUEUE_EVENTS.JobStarted;
    case "completed":
      return QUEUE_EVENTS.JobCompleted;
    case "failed":
    case "timeout":
      return QUEUE_EVENTS.JobFailed;
    case "canceled":
      return QUEUE_EVENTS.JobCanceled;
    case "retrying":
      return QUEUE_EVENTS.JobRetrying;
    case "dead_letter":
      return QUEUE_EVENTS.JobDeadLettered;
    // `pending` و`waiting` و`paused` حالات داخلية لا تستحق حدثًا عامًا
    default:
      return null;
  }
}

/**
 * مفتاح منع التكرار للحدث.
 *
 * `platform_events.dedupe_key` فريد، فالمفتاح ده بيمنع نشر نفس الحدث
 * مرتين لو أعاد العامل المحاولة بعد سقوطه في منتصف الكتابة.
 */
export function eventDedupeKey(event: QueueEventName, jobId: string, attempt?: number): string {
  return attempt === undefined ? `${event}:${jobId}` : `${event}:${jobId}:${attempt}`;
}
