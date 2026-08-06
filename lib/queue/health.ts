import type { JobStatus, WorkerStatus } from "./types";

/**
 * تقييم صحة الطابور والعمال — وحدة نقية.
 *
 * القرارات هنا هي ما يفرّق بين «النظام مشغول» و«النظام واقف». وهذا
 * التمييز بالذات هو ما غاب في عطل ٢٧ يوليو: كل المؤشرات بدت طبيعية
 * بينما مهام معلّقة تستنزف الموارد بلا نهاية.
 */

/** العتبات — مشتقّة مباشرة من الحدود المُعلَنة في وثيقة التصميم. */
export const HEALTH_THRESHOLDS = {
  /** عمق الطابور الذي يبدأ عنده التحذير. */
  queueDepthWarning: 500,
  queueDepthCritical: 2_000,
  /** أقدم مهمة منتظرة. */
  oldestWaitingWarningMs: 15 * 60 * 1000,
  oldestWaitingCriticalMs: 60 * 60 * 1000,
  /** نسبة الفشل خلال نافذة قصيرة. */
  failureRateWarning: 0.1,
  failureRateCritical: 0.3,
  /** نبضة العامل. */
  workerHeartbeatWarningMs: 90_000,
  workerHeartbeatCriticalMs: 180_000,
} as const;

export type HealthLevel = "healthy" | "degraded" | "critical";

export interface HealthIssue {
  level: HealthLevel;
  code: string;
  message: string;
}

export interface QueueSnapshot {
  countsByStatus: Partial<Record<JobStatus, number>>;
  oldestWaitingMs: number | null;
  completedRecently: number;
  failedRecently: number;
  deadLetterCount: number;
}

export interface WorkerSnapshot {
  workerKey: string;
  workerType: string;
  status: WorkerStatus;
  heartbeatAgeMs: number;
  activeJobs: number;
  concurrency: number;
}

export interface HealthReport {
  level: HealthLevel;
  issues: HealthIssue[];
  queueDepth: number;
  failureRate: number | null;
}

function worst(a: HealthLevel, b: HealthLevel): HealthLevel {
  const rank: Record<HealthLevel, number> = { healthy: 0, degraded: 1, critical: 2 };
  return rank[a] >= rank[b] ? a : b;
}

/** عمق الطابور = المهام الحيّة المنتظرة (بدون الجاري تنفيذها). */
export function queueDepth(counts: Partial<Record<JobStatus, number>>): number {
  return (
    (counts.pending ?? 0) + (counts.queued ?? 0) + (counts.waiting ?? 0) + (counts.retrying ?? 0)
  );
}

/**
 * نسبة الفشل خلال النافذة.
 *
 * `null` عند غياب أي عيّنة — الصفر هنا كذب: «صفر فشل من صفر مهمة»
 * يبدو صحّة ممتازة وهو في الحقيقة لا معلومة.
 */
export function failureRate(completed: number, failed: number): number | null {
  const total = completed + failed;
  if (total === 0) return null;
  return failed / total;
}

export function assessQueue(snapshot: QueueSnapshot): HealthReport {
  const issues: HealthIssue[] = [];
  let level: HealthLevel = "healthy";

  const depth = queueDepth(snapshot.countsByStatus);
  if (depth >= HEALTH_THRESHOLDS.queueDepthCritical) {
    issues.push({
      level: "critical",
      code: "queue_depth",
      message: `الطابور محمّل بالكامل (${depth} مهمة منتظرة).`,
    });
    level = worst(level, "critical");
  } else if (depth >= HEALTH_THRESHOLDS.queueDepthWarning) {
    issues.push({
      level: "degraded",
      code: "queue_depth",
      message: `الطابور مزدحم (${depth} مهمة منتظرة).`,
    });
    level = worst(level, "degraded");
  }

  if (snapshot.oldestWaitingMs !== null) {
    const minutes = Math.round(snapshot.oldestWaitingMs / 60_000);
    if (snapshot.oldestWaitingMs >= HEALTH_THRESHOLDS.oldestWaitingCriticalMs) {
      issues.push({
        level: "critical",
        code: "stale_queue",
        message: `فيه مهمة منتظرة من ${minutes} دقيقة — يرجّح إن مفيش عامل شغّال.`,
      });
      level = worst(level, "critical");
    } else if (snapshot.oldestWaitingMs >= HEALTH_THRESHOLDS.oldestWaitingWarningMs) {
      issues.push({
        level: "degraded",
        code: "stale_queue",
        message: `أقدم مهمة منتظرة من ${minutes} دقيقة.`,
      });
      level = worst(level, "degraded");
    }
  }

  const rate = failureRate(snapshot.completedRecently, snapshot.failedRecently);
  if (rate !== null) {
    const percent = Math.round(rate * 100);
    if (rate >= HEALTH_THRESHOLDS.failureRateCritical) {
      issues.push({
        level: "critical",
        code: "failure_rate",
        message: `نسبة الفشل ${percent}٪ — فيه عطل منهجي مش حالات فردية.`,
      });
      level = worst(level, "critical");
    } else if (rate >= HEALTH_THRESHOLDS.failureRateWarning) {
      issues.push({
        level: "degraded",
        code: "failure_rate",
        message: `نسبة الفشل ${percent}٪.`,
      });
      level = worst(level, "degraded");
    }
  }

  // أي دخول للرسائل الميتة يستحق الانتباه — الطابور الصامت الممتلئ
  // بالفشل نظام يبدو سليمًا وهو لا ينجز شيئًا.
  if (snapshot.deadLetterCount > 0) {
    issues.push({
      level: "degraded",
      code: "dead_letters",
      message: `${snapshot.deadLetterCount} مهمة في طابور الرسائل الميتة محتاجة مراجعة.`,
    });
    level = worst(level, "degraded");
  }

  return { level, issues, queueDepth: depth, failureRate: rate };
}

export function assessWorker(worker: WorkerSnapshot): HealthIssue | null {
  if (worker.status === "stopped") return null; // متوقّف عمدًا، لا عطل

  if (worker.heartbeatAgeMs >= HEALTH_THRESHOLDS.workerHeartbeatCriticalMs) {
    return {
      level: "critical",
      code: "worker_dead",
      message: `العامل ${worker.workerKey} مابيبعتش نبضة من ${Math.round(worker.heartbeatAgeMs / 1000)} ثانية.`,
    };
  }
  if (worker.heartbeatAgeMs >= HEALTH_THRESHOLDS.workerHeartbeatWarningMs) {
    return {
      level: "degraded",
      code: "worker_lagging",
      message: `نبضة العامل ${worker.workerKey} متأخرة.`,
    };
  }
  if (worker.status === "unhealthy") {
    return {
      level: "degraded",
      code: "worker_unhealthy",
      message: `العامل ${worker.workerKey} أبلغ عن حالة غير صحّية.`,
    };
  }
  return null;
}

/**
 * الحكم الكلي.
 *
 * **حالة خاصة مهمة:** طابور فيه شغل بلا أي عامل حيّ ليست «تدهورًا» بل
 * توقّفًا كاملًا — لا شيء سيُنفَّذ أبدًا. النظم الساذجة تُظهر هذه
 * الحالة كتحذير أصفر لأن كل مقياس منفرد يبدو مقبولًا.
 */
export function assessSystem(queue: QueueSnapshot, workers: WorkerSnapshot[]): HealthReport {
  const report = assessQueue(queue);
  const issues = [...report.issues];
  let level = report.level;

  for (const worker of workers) {
    const issue = assessWorker(worker);
    if (issue) {
      issues.push(issue);
      level = worst(level, issue.level);
    }
  }

  const liveWorkers = workers.filter(
    (w) => w.status !== "stopped" && w.heartbeatAgeMs < HEALTH_THRESHOLDS.workerHeartbeatCriticalMs
  );

  if (liveWorkers.length === 0 && report.queueDepth > 0) {
    issues.push({
      level: "critical",
      code: "no_live_workers",
      message: `${report.queueDepth} مهمة منتظرة ومفيش أي عامل حيّ — مفيش حاجة هتتنفّذ.`,
    });
    level = "critical";
  }

  return { ...report, level, issues };
}
