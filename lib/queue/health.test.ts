import { describe, it, expect } from "vitest";
import {
  HEALTH_THRESHOLDS,
  assessQueue,
  assessSystem,
  assessWorker,
  failureRate,
  queueDepth,
  type QueueSnapshot,
  type WorkerSnapshot,
} from "./health";

const healthyQueue: QueueSnapshot = {
  countsByStatus: { queued: 3, running: 1, completed: 100 },
  oldestWaitingMs: 5_000,
  completedRecently: 100,
  failedRecently: 1,
  deadLetterCount: 0,
};

const liveWorker: WorkerSnapshot = {
  workerKey: "w1",
  workerType: "system",
  status: "idle",
  heartbeatAgeMs: 5_000,
  activeJobs: 0,
  concurrency: 5,
};

describe("عمق الطابور", () => {
  it("يعدّ المنتظرة فقط لا الجاري تنفيذها", () => {
    // المهمة اللي بتشتغل مش منتظرة — إدخالها بيخفي الازدحام الحقيقي.
    expect(queueDepth({ pending: 1, queued: 2, waiting: 3, retrying: 4, running: 99 })).toBe(10);
  });

  it("الحالات النهائية لا تُحسب", () => {
    expect(queueDepth({ completed: 500, failed: 50, canceled: 10 })).toBe(0);
  });
});

describe("نسبة الفشل", () => {
  it("تُحسب من الإجمالي", () => {
    expect(failureRate(90, 10)).toBeCloseTo(0.1);
  });

  it("null بلا أي عيّنة", () => {
    // الصفر هنا كذب: "صفر فشل من صفر مهمة" يبدو صحّة ممتازة وهو
    // في الحقيقة لا معلومة.
    expect(failureRate(0, 0)).toBeNull();
  });

  it("واحد صحيح عند فشل كل شيء", () => {
    expect(failureRate(0, 10)).toBe(1);
  });
});

describe("تقييم الطابور", () => {
  it("الطابور السليم بلا ملاحظات", () => {
    const report = assessQueue(healthyQueue);
    expect(report.level).toBe("healthy");
    expect(report.issues).toHaveLength(0);
  });

  it("الازدحام يتدهور", () => {
    const report = assessQueue({
      ...healthyQueue,
      countsByStatus: { queued: HEALTH_THRESHOLDS.queueDepthWarning },
    });
    expect(report.level).toBe("degraded");
    expect(report.issues.some((i) => i.code === "queue_depth")).toBe(true);
  });

  it("التحميل الكامل حرج", () => {
    const report = assessQueue({
      ...healthyQueue,
      countsByStatus: { queued: HEALTH_THRESHOLDS.queueDepthCritical },
    });
    expect(report.level).toBe("critical");
  });

  it("المهمة المنتظرة من ساعة حالة حرجة", () => {
    const report = assessQueue({
      ...healthyQueue,
      oldestWaitingMs: HEALTH_THRESHOLDS.oldestWaitingCriticalMs,
    });
    expect(report.level).toBe("critical");
    expect(report.issues.some((i) => i.code === "stale_queue")).toBe(true);
  });

  it("نسبة الفشل العالية حرجة", () => {
    const report = assessQueue({ ...healthyQueue, completedRecently: 10, failedRecently: 10 });
    expect(report.level).toBe("critical");
    expect(report.issues.some((i) => i.code === "failure_rate")).toBe(true);
  });

  it("أي رسالة ميتة تستحق ملاحظة", () => {
    // الطابور الصامت الممتلئ بالفشل نظام يبدو سليمًا وهو لا ينجز شيئًا.
    const report = assessQueue({ ...healthyQueue, deadLetterCount: 1 });
    expect(report.level).toBe("degraded");
    expect(report.issues.some((i) => i.code === "dead_letters")).toBe(true);
  });

  it("الأسوأ يغلب عند تعدّد المشاكل", () => {
    const report = assessQueue({
      ...healthyQueue,
      deadLetterCount: 5, // متدهور
      countsByStatus: { queued: HEALTH_THRESHOLDS.queueDepthCritical }, // حرج
    });
    expect(report.level).toBe("critical");
    expect(report.issues.length).toBeGreaterThanOrEqual(2);
  });
});

describe("تقييم العامل", () => {
  it("العامل الحيّ بلا ملاحظات", () => {
    expect(assessWorker(liveWorker)).toBeNull();
  });

  it("النبضة المتأخرة تدهور", () => {
    const issue = assessWorker({
      ...liveWorker,
      heartbeatAgeMs: HEALTH_THRESHOLDS.workerHeartbeatWarningMs,
    });
    expect(issue?.level).toBe("degraded");
  });

  it("النبضة المفقودة حرجة", () => {
    const issue = assessWorker({
      ...liveWorker,
      heartbeatAgeMs: HEALTH_THRESHOLDS.workerHeartbeatCriticalMs,
    });
    expect(issue?.level).toBe("critical");
    expect(issue?.code).toBe("worker_dead");
  });

  it("المتوقّف عمدًا ليس عطلًا", () => {
    const issue = assessWorker({
      ...liveWorker,
      status: "stopped",
      heartbeatAgeMs: 999_999,
    });
    expect(issue).toBeNull();
  });
});

describe("التقييم الكلي", () => {
  it("طابور فيه شغل بلا عامل حيّ = توقّف كامل لا تدهور", () => {
    // كل مقياس منفرد يبدو مقبولًا هنا، والنظم الساذجة بتعرضها تحذيرًا
    // أصفر. الحقيقة إن مفيش حاجة هتتنفّذ أبدًا.
    const report = assessSystem({ ...healthyQueue, countsByStatus: { queued: 5 } }, []);
    expect(report.level).toBe("critical");
    expect(report.issues.some((i) => i.code === "no_live_workers")).toBe(true);
  });

  it("طابور فاضي بلا عمال ليس عطلًا", () => {
    const report = assessSystem(
      { ...healthyQueue, countsByStatus: { completed: 10 }, deadLetterCount: 0 },
      []
    );
    expect(report.issues.some((i) => i.code === "no_live_workers")).toBe(false);
  });

  it("العامل الميت لا يُحتسب حيًّا", () => {
    const dead: WorkerSnapshot = {
      ...liveWorker,
      heartbeatAgeMs: HEALTH_THRESHOLDS.workerHeartbeatCriticalMs + 1,
    };
    const report = assessSystem({ ...healthyQueue, countsByStatus: { queued: 5 } }, [dead]);
    expect(report.issues.some((i) => i.code === "no_live_workers")).toBe(true);
  });

  it("النظام السليم بعامل حيّ", () => {
    const report = assessSystem(healthyQueue, [liveWorker]);
    expect(report.level).toBe("healthy");
  });
});
